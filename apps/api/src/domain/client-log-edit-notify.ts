/**
 * Tells the coach that a client changed a meal log (Z14-11, D-W14-23).
 *
 * Only the client's own edit or removal notifies (never a coach edit, and not a
 * photo-only change). The event is one `trainer_client_log_edited` inbox row
 * per entry per 10 minutes, then pushed through the existing trainer path
 * (`pushEnabled`, the `clientLogEdits` category and quiet hours respected;
 * at-most-once):
 *
 * - The first change in a 10-minute bucket inserts the row and pushes once.
 * - A later change in the same bucket rewrites that row's payload (it keeps the
 *   first "from" values and takes the latest "to" values and action) and marks
 *   it unread again. It sends no second push. A removal after an edit in the
 *   bucket turns the row into the removed copy.
 * - With the category off, nothing is stored and nothing is pushed.
 *
 * Runs after the change commits and never throws: a failure is logged (names
 * and codes only, never meal content) and the trainee's request goes on.
 */
import { and, eq } from "drizzle-orm";
import {
  NUTRIENT_SCALE,
  clientLogEditPayloadSchema,
  type ClientLogEditPayload,
} from "@fitbud/contracts";
import type { Db } from "../db/client.js";
import { notificationPreferences, notifications } from "../db/schema.js";
import { writeStructuredLog } from "../lib/log.js";
import { errorLogFields } from "./reminders.js";
import {
  pushTrainerInboxEvent,
  storeInboxNotification,
  type TrainerPushConfig,
} from "./inbox-notify.js";
import { parseTrainerCategoriesJson } from "./trainer-categories.js";

/** One notification per entry per this window (D-W14-23 d). */
export const CLIENT_LOG_EDIT_BUCKET_MS = 10 * 60 * 1000;

export function clientLogEditDedupeKey(entryId: string, serverNow: string): string {
  const bucket = Math.floor(Date.parse(serverNow) / CLIENT_LOG_EDIT_BUCKET_MS);
  return `trainer_client_log_edited:${entryId}:${bucket}`;
}

/** The parts of a meal entry the change summary reads. */
export type MealEntryValues = {
  outcome: string;
  deviationKind: string | null;
  notes: string | null;
  itemsJson: string | null;
  kcalScaled: number | null;
};

export function wholeKcal(kcalScaled: number | null): number | null {
  return kcalScaled == null ? null : Math.round(kcalScaled / NUTRIENT_SCALE);
}

/** What changed between two versions of one entry, in the order the copy lists it. */
export function changedMealFields(
  before: MealEntryValues,
  after: MealEntryValues,
): ClientLogEditPayload["fields"] {
  const fields: ClientLogEditPayload["fields"] = [];
  if (before.outcome !== after.outcome || before.deviationKind !== after.deviationKind) {
    fields.push("outcome");
  }
  const itemsChanged =
    before.itemsJson !== after.itemsJson || before.kcalScaled !== after.kcalScaled;
  if (itemsChanged || before.deviationKind !== after.deviationKind) {
    if (after.deviationKind === "portion_adjustment") fields.push("portion");
    else if (after.deviationKind === "restaurant") fields.push("kcal");
    else if (after.deviationKind === "logged_foods") fields.push("foods");
    else if (itemsChanged) fields.push("kcal");
  }
  if (before.notes !== after.notes) fields.push("note");
  return fields;
}

export type ClientLogEditEvent = {
  relationshipId: string;
  trainerUserId: string;
  entryId: string;
  action: "edited" | "removed";
  mealName: string;
  /** The meal's own day, so a late offline edit names the right day. */
  mealDate: string;
  before: MealEntryValues;
  /** Null for a removal. */
  after: MealEntryValues | null;
  /** Server time of the change (the bucket and the stored order use it). */
  now: string;
};

function knownDeviationKind(kind: string | null): ClientLogEditPayload["fromDeviationKind"] {
  return kind === "portion_adjustment" || kind === "restaurant" || kind === "logged_foods"
    ? kind
    : null;
}

export function eventPayload(event: ClientLogEditEvent): ClientLogEditPayload {
  return {
    entryId: event.entryId,
    action: event.action,
    mealName: event.mealName,
    mealDate: event.mealDate,
    fromKcal: wholeKcal(event.before.kcalScaled),
    toKcal: event.after ? wholeKcal(event.after.kcalScaled) : null,
    fromOutcome: event.before.outcome,
    toOutcome: event.after ? event.after.outcome : null,
    fromDeviationKind: knownDeviationKind(event.before.deviationKind),
    fields: event.after ? changedMealFields(event.before, event.after) : [],
  };
}

/** Folds a later change in the bucket into the stored payload (first `from`, latest `to`). */
export function mergeClientLogEditPayload(
  stored: ClientLogEditPayload,
  later: ClientLogEditPayload,
): ClientLogEditPayload {
  const fields = [...new Set([...stored.fields, ...later.fields])];
  return {
    ...later,
    fromKcal: stored.fromKcal,
    fromOutcome: stored.fromOutcome,
    // Keeps the first kind, like fromKcal (an old row without the field stays without it).
    fromDeviationKind: stored.fromDeviationKind,
    fields: later.action === "removed" ? [] : fields,
  };
}

function parseStoredPayload(json: string | null): ClientLogEditPayload | null {
  if (!json) return null;
  try {
    const parsed = clientLogEditPayloadSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function notifyTrainerClientLogEdited(
  db: Db,
  event: ClientLogEditEvent,
  push?: TrainerPushConfig,
): Promise<void> {
  try {
    const [prefs] = await db
      .select({ trainerCategoriesJson: notificationPreferences.trainerCategoriesJson })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, event.trainerUserId))
      .limit(1);
    if (!parseTrainerCategoriesJson(prefs?.trainerCategoriesJson ?? "[]").clientLogEdits) {
      return;
    }

    const payload = eventPayload(event);
    const dedupeKey = clientLogEditDedupeKey(event.entryId, event.now);
    const stored = await storeInboxNotification(db, {
      recipientUserId: event.trainerUserId,
      relationshipId: event.relationshipId,
      notificationType: "trainer_client_log_edited",
      domainEntityId: event.relationshipId,
      dedupeKey,
      payloadJson: JSON.stringify(payload),
    });
    if (stored.inserted) {
      if (push) await pushTrainerInboxEvent(db, stored.notificationId, push, event.now);
      return;
    }

    // Second change inside the bucket: keep the row, update it, no second push.
    const [existing] = await db
      .select({ id: notifications.id, payloadJson: notifications.payloadJson })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientUserId, event.trainerUserId),
          eq(notifications.dedupeKey, dedupeKey),
        ),
      )
      .limit(1);
    if (!existing) return;
    const first = parseStoredPayload(existing.payloadJson);
    await db
      .update(notifications)
      .set({
        payloadJson: JSON.stringify(first ? mergeClientLogEditPayload(first, payload) : payload),
        state: "delivered",
        readAt: null,
        openedAt: null,
      })
      .where(eq(notifications.id, existing.id));
  } catch (error) {
    writeStructuredLog({
      level: "warn",
      message: "client_log_edit_notify.failed",
      operation: "notify_trainer_client_log_edited",
      ...errorLogFields(error),
    });
  }
}
