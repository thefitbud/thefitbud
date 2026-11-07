import { and, eq } from "drizzle-orm";
import type { TrainerCategories } from "@fitbud/contracts";
import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  isWithinQuietHours,
  localTimeHhMm,
} from "@fitbud/core";
import type { Db } from "../db/client.js";
import {
  coachingRelationships,
  deviceTokens,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  users,
} from "../db/schema.js";
import { createId, nowIso } from "../lib/crypto.js";
import { writeStructuredLog } from "../lib/log.js";
import {
  routingPayloadForNotification,
  sendPushToDevice,
  type PushProviderMode,
} from "../lib/push-provider.js";
import { errorLogFields } from "./reminders.js";
import { parseTrainerCategoriesJson } from "./trainer-categories.js";

export type InboxNotificationType =
  | "relationship_ended"
  | "reactivation_requested"
  | "trainer_note_shared"
  | "plan_published"
  | "trainer_ask_coach"
  | "coach_answered"
  | "trainer_meal_times_changed"
  | "activity_nudge"
  | "checkin_reviewed"
  | "trainer_checkin_submitted"
  | "trainer_intake_submitted"
  | "coach_log_updated";

export async function storeInboxNotification(
  db: Db,
  input: {
    recipientUserId: string;
    relationshipId: string;
    notificationType: InboxNotificationType;
    domainEntityId: string;
    dedupeKey: string;
    domainEntityType?:
      | "coaching_relationship"
      | "checkin"
      | "meal_assignment"
      | "workout_assignment";
    /**
     * Groups events about one entry so the sender can merge repeats (Z6-19:
     * the coach-edited log's id, merged within 10 minutes). Null when unset.
     */
    mergeGroup?: string;
  },
): Promise<StoredInboxNotification> {
  const now = nowIso();
  // The database reports a dedupe-key collision (no row returned); no driver error text is parsed.
  // Any other failure still throws.
  const inserted = await db
    .insert(notifications)
    .values({
      id: createId(),
      recipientUserId: input.recipientUserId,
      coachingRelationshipId: input.relationshipId,
      notificationType: input.notificationType as (typeof notifications.$inferInsert)["notificationType"],
      domainEntityType: input.domainEntityType ?? "coaching_relationship",
      domainEntityId: input.domainEntityId,
      state: "delivered",
      dedupeKey: input.dedupeKey,
      createdAt: now,
      readAt: null,
      openedAt: null,
      priority: 10,
      mergeGroup: input.mergeGroup ?? null,
      payloadJson: null,
      expiresAt: null,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return inserted[0]
    ? { inserted: true, notificationId: inserted[0].id }
    : { inserted: false };
}

export type StoredInboxNotification =
  | { inserted: true; notificationId: string }
  | { inserted: false };

/** Trainer inbox types that are pushed, with the trainer category toggle that gates each. */
const TRAINER_PUSH_CATEGORY: Readonly<Record<string, keyof TrainerCategories>> = {
  trainer_ask_coach: "askCoach",
  trainer_meal_times_changed: "mealTimesChanged",
  trainer_checkin_submitted: "checkinSubmitted",
  trainer_intake_submitted: "intakeSubmitted",
};

export type TrainerPushConfig = {
  pushProviderMode: PushProviderMode;
  /** Optional Expo access token (Worker secret). Never logged. */
  expoAccessToken?: string;
};

/**
 * Pushes a stored trainer inbox event to the recipient's active devices.
 * Call only when `storeInboxNotification` reported `inserted: true`.
 *
 * Never throws: a push failure must not fail the request that stored the event.
 * At-most-once (D-W3-8): the notification insert is the only trigger, so a
 * retried request dedupes and sends nothing. Each device's delivery row carries
 * its attempt marker before the provider call and the marker is never cleared,
 * so a failed outcome write cannot cause a resend. Stored only (no deferral)
 * when push is off, the category is off, or inside quiet hours.
 */
export async function pushTrainerInboxEvent(
  db: Db,
  notificationId: string,
  config: TrainerPushConfig,
  now = nowIso(),
): Promise<void> {
  await pushInboxEvent(db, notificationId, config, now, {
    logScope: "trainer_inbox",
    pushesType: (type) => TRAINER_PUSH_CATEGORY[type] !== undefined,
    allowedByPreferences: (type, prefs) => {
      const category = TRAINER_PUSH_CATEGORY[type];
      return Boolean(
        category &&
          parseTrainerCategoriesJson(prefs?.trainerCategoriesJson ?? "[]")[category],
      );
    },
  });
}

/**
 * Pushes a stored `coach_log_updated` event to the trainee (Z6-19, R5). The
 * delivery rules are the trainer push's (at-most-once, active relationship
 * only, push on/off, quiet hours with no deferral, never throws); the gate is
 * the trainee's "Coach updates to my logs" setting (`coach_log_updates`, on by
 * default) instead of a trainer category. Any other type is not pushed here.
 * Call only when `storeInboxNotification` reported `inserted: true`.
 */
export async function pushTraineeCoachLogEvent(
  db: Db,
  notificationId: string,
  config: TrainerPushConfig,
  now = nowIso(),
): Promise<void> {
  await pushInboxEvent(db, notificationId, config, now, {
    logScope: "coach_log",
    pushesType: (type) => type === "coach_log_updated",
    allowedByPreferences: (_type, prefs) => prefs?.coachLogUpdates ?? true,
  });
}

type InboxPushPolicy = {
  logScope: "trainer_inbox" | "coach_log";
  /** Which stored types this sender pushes at all. */
  pushesType: (type: string) => boolean;
  /** The recipient's per-type setting (checked after push on/off). */
  allowedByPreferences: (
    type: string,
    prefs: typeof notificationPreferences.$inferSelect | undefined,
  ) => boolean;
};

async function pushInboxEvent(
  db: Db,
  notificationId: string,
  config: TrainerPushConfig,
  now: string,
  policy: InboxPushPolicy,
): Promise<void> {
  try {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);
    if (!notification) return;
    if (!policy.pushesType(notification.notificationType)) return;

    // One push attempt per notification: any earlier delivery row means it already ran.
    const [earlier] = await db
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, notification.id))
      .limit(1);
    if (earlier) return;

    if (notification.coachingRelationshipId) {
      const [relationship] = await db
        .select({ status: coachingRelationships.status })
        .from(coachingRelationships)
        .where(eq(coachingRelationships.id, notification.coachingRelationshipId))
        .limit(1);
      if (relationship?.status !== "active") return;
    }

    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, notification.recipientUserId))
      .limit(1);
    if (prefs && !prefs.pushEnabled) return;
    if (!policy.allowedByPreferences(notification.notificationType, prefs)) return;

    const [user] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, notification.recipientUserId))
      .limit(1);
    // No `?? "12:00"` here any more (CU17): `localTimeHhMm` now throws for a
    // zone it cannot resolve instead of returning `null`, so the fallback was
    // dead for that case — and while it lived it decided a push from a
    // fabricated noon. The throw is contained by `pushTrainerInboxEvent`'s
    // documented never-throws boundary and reported by `logPushError`, so the
    // outcome is "no inbox push, one warn line naming the zone" rather than a
    // push sent on a wrong local time.
    const localTime = localTimeHhMm(now, user?.timezone ?? "UTC");
    if (localTime === null) return;
    if (
      isWithinQuietHours({
        localTimeHhMm: localTime,
        quietHoursStart: prefs?.quietHoursStart ?? DEFAULT_QUIET_HOURS_START,
        quietHoursEnd: prefs?.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END,
      })
    ) {
      return;
    }

    const tokens = await db
      .select()
      .from(deviceTokens)
      .where(
        and(
          eq(deviceTokens.userId, notification.recipientUserId),
          eq(deviceTokens.status, "active"),
        ),
      );

    const payload = routingPayloadForNotification({
      notificationId: notification.id,
      notificationType: notification.notificationType,
      domainEntityType: notification.domainEntityType,
      domainEntityId: notification.domainEntityId,
      createdAt: notification.createdAt,
    });

    for (const token of tokens) {
      const deliveryId = createId();
      try {
        // Mark the attempt before the provider call. If this write fails, nothing was sent.
        await db.insert(notificationDeliveries).values({
          id: deliveryId,
          notificationId: notification.id,
          deviceTokenId: token.id,
          channel: "push",
          providerStatus: "queued",
          providerMessageId: null,
          failureCategory: null,
          attemptNumber: 1,
          attemptStartedAt: now,
          acceptedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        const result = await sendPushToDevice({
          mode: config.pushProviderMode,
          deviceToken: token.token,
          payload,
          expoAccessToken: config.expoAccessToken,
        });
        if (!result.ok && result.failureCategory === "DeviceNotRegistered") {
          await db
            .update(deviceTokens)
            .set({ status: "revoked", updatedAt: now })
            .where(and(eq(deviceTokens.id, token.id), eq(deviceTokens.status, "active")));
        }
        await db
          .update(notificationDeliveries)
          .set(
            result.ok
              ? {
                  providerStatus: "accepted",
                  providerMessageId: result.providerMessageId,
                  acceptedAt: now,
                  updatedAt: now,
                }
              : { providerStatus: "failed", failureCategory: result.failureCategory, updatedAt: now },
          )
          .where(eq(notificationDeliveries.id, deliveryId));
      } catch (error) {
        logPushError(`${policy.logScope}.device`, error);
      }
    }
  } catch (error) {
    logPushError(`${policy.logScope}.push`, error);
  }
}

function logPushError(operation: string, error: unknown): void {
  writeStructuredLog({
    level: "warn",
    message: "inbox_notify.push_error",
    operation,
    ...errorLogFields(error),
  });
}
