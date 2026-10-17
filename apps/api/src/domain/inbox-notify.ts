import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { notifications } from "../db/schema.js";
import { createId, nowIso } from "../lib/crypto.js";

export type InboxNotificationType =
  | "relationship_ended"
  | "reactivation_requested"
  | "trainer_note_shared"
  | "plan_published"
  | "trainer_ask_coach"
  | "coach_answered"
  | "trainer_meal_times_changed"
  | "activity_nudge";

export async function storeInboxNotification(
  db: Db,
  input: {
    recipientUserId: string;
    relationshipId: string;
    notificationType: InboxNotificationType;
    domainEntityId: string;
    dedupeKey: string;
  },
): Promise<void> {
  const now = nowIso();
  try {
    await db.insert(notifications).values({
      id: createId(),
      recipientUserId: input.recipientUserId,
      coachingRelationshipId: input.relationshipId,
      notificationType: input.notificationType as (typeof notifications.$inferInsert)["notificationType"],
      domainEntityType: "coaching_relationship",
      domainEntityId: input.domainEntityId,
      state: "delivered",
      dedupeKey: input.dedupeKey,
      createdAt: now,
      readAt: null,
      openedAt: null,
      priority: 10,
      mergeGroup: null,
      payloadJson: null,
      expiresAt: null,
    });
  } catch {
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.dedupeKey, input.dedupeKey))
      .limit(1);
    if (!existing[0]) {
      throw new Error("NOTIFICATION_DEDUPE_FAILED");
    }
  }
}
