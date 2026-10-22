import { and, eq } from "drizzle-orm";
import { nextReminderStateAfterIgnore } from "@fitbud/core";
import type { Db } from "../db/client.js";
import { coachingRelationships, notifications, reminderStates } from "../db/schema.js";
import { createId, nowIso } from "../lib/crypto.js";

/**
 * Records one unanswered reminder (no open/log within 2 h) for backoff state.
 * At 5 consecutive ignores → paused mode + `reminders_paused` inbox notification.
 */
export async function recordUnansweredReminderIgnore(
  db: Db,
  input: {
    traineeUserId: string;
    coachingRelationshipId: string;
    now?: string;
  },
): Promise<void> {
  const now = input.now ?? nowIso();
  const [existing] = await db
    .select()
    .from(reminderStates)
    .where(eq(reminderStates.traineeUserId, input.traineeUserId))
    .limit(1);

  const next = nextReminderStateAfterIgnore({
    consecutiveIgnores: existing?.consecutiveIgnores ?? 0,
    mode: (existing?.mode ?? "normal") as
      | "normal"
      | "self_logger"
      | "soft_ignorer"
      | "paused"
      | "push_failed",
    nowIso: now,
  });

  if (existing) {
    await db
      .update(reminderStates)
      .set({
        consecutiveIgnores: next.consecutiveIgnores,
        mode: next.mode,
        pausedUntil: next.pausedUntil,
        lastEvaluatedAt: now,
        updatedAt: now,
      })
      .where(eq(reminderStates.traineeUserId, input.traineeUserId));
  } else {
    await db.insert(reminderStates).values({
      traineeUserId: input.traineeUserId,
      consecutiveIgnores: next.consecutiveIgnores,
      mode: next.mode,
      pausedUntil: next.pausedUntil,
      lastEvaluatedAt: now,
      updatedAt: now,
    });
  }

  if (!next.emitRemindersPaused) return;

  const dedupeKey = `reminders_paused:${input.traineeUserId}:${now.slice(0, 10)}`;
  try {
    await db.insert(notifications).values({
      id: createId(),
      recipientUserId: input.traineeUserId,
      coachingRelationshipId: input.coachingRelationshipId,
      notificationType: "reminders_paused",
      domainEntityType: "coaching_relationship",
      domainEntityId: input.coachingRelationshipId,
      state: "delivered",
      dedupeKey,
      createdAt: now,
      readAt: null,
      openedAt: null,
      priority: 10,
      mergeGroup: null,
      payloadJson: null,
      expiresAt: null,
    });
  } catch {
    // deduped
  }
}

export async function findActiveRelationshipForTrainee(
  db: Db,
  traineeUserId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: coachingRelationships.id })
    .from(coachingRelationships)
    .where(
      and(
        eq(coachingRelationships.traineeUserId, traineeUserId),
        eq(coachingRelationships.status, "active"),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}
