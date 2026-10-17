import { and, eq, gte } from "drizzle-orm";
import { mealPrescriptionSchema } from "@fitbud/contracts";
import { formatLocalDate } from "@fitbud/core";
import type { Db } from "../db/client.js";
import {
  coachingRelationships,
  mealAssignments,
  mealCompliance,
  mealTimeOverrides,
  users,
} from "../db/schema.js";
import { storeInboxNotification } from "./inbox-notify.js";

const TRAINER_MEAL_TIMES_MERGE_MS = 15 * 60 * 1000;

function trainerMealTimesDedupeKey(relationshipId: string, nowIso: string): string {
  const bucket = Math.floor(Date.parse(nowIso) / TRAINER_MEAL_TIMES_MERGE_MS);
  return `trainer_meal_times_changed:${relationshipId}:${bucket}`;
}

export async function notifyTrainerMealTimesChanged(
  db: Db,
  input: { relationshipId: string; trainerUserId: string; now: string },
): Promise<void> {
  await storeInboxNotification(db, {
    recipientUserId: input.trainerUserId,
    relationshipId: input.relationshipId,
    notificationType: "trainer_meal_times_changed",
    domainEntityId: input.relationshipId,
    dedupeKey: trainerMealTimesDedupeKey(input.relationshipId, input.now),
  });
}

function slotKeyForPrescription(json: string): string | null {
  try {
    const parsed = mealPrescriptionSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    return parsed.data.mealType ?? parsed.data.name.toLowerCase().replace(/\s+/g, "_");
  } catch {
    return null;
  }
}

/**
 * Applies overrides to unlogged meal assignments from today onward (P-MEAL reschedule).
 */
export async function recomputeMealAssignmentTimes(
  db: Db,
  input: { relationshipId: string; now: string },
): Promise<number> {
  const [rel] = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, input.relationshipId))
    .limit(1);
  if (!rel) return 0;

  const [trainee] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, rel.traineeUserId))
    .limit(1);
  const timeZone = trainee?.timezone ?? "UTC";
  const today = formatLocalDate(new Date(input.now), timeZone);

  const overrides = await db
    .select()
    .from(mealTimeOverrides)
    .where(eq(mealTimeOverrides.relationshipId, input.relationshipId));
  const overrideBySlot = new Map(
    overrides.map((row) => [row.slotKey, row.time]),
  );
  if (overrideBySlot.size === 0) return 0;

  const assignments = await db
    .select()
    .from(mealAssignments)
    .where(
      and(
        eq(mealAssignments.coachingRelationshipId, input.relationshipId),
        eq(mealAssignments.scheduleStatus, "scheduled"),
        gte(mealAssignments.localDate, today),
      ),
    )
    .limit(100);

  let updated = 0;
  for (const assignment of assignments) {
    const hasCompliance = await db
      .select({ id: mealCompliance.id })
      .from(mealCompliance)
      .where(eq(mealCompliance.assignmentId, assignment.id))
      .limit(1);
    if (hasCompliance[0]) continue;

    const slotKey = slotKeyForPrescription(assignment.mealPrescriptionJson);
    const overrideTime = slotKey ? overrideBySlot.get(slotKey) : undefined;
    if (!overrideTime) continue;

    const parsed = mealPrescriptionSchema.safeParse(
      JSON.parse(assignment.mealPrescriptionJson),
    );
    if (!parsed.success) continue;
    if (parsed.data.localTime === overrideTime) continue;

    const nextJson = JSON.stringify({
      ...parsed.data,
      localTime: overrideTime,
    });
    await db
      .update(mealAssignments)
      .set({
        mealPrescriptionJson: nextJson,
        updatedAt: input.now,
      })
      .where(eq(mealAssignments.id, assignment.id));
    updated += 1;
  }
  return updated;
}

export async function applyMealTimeOverrideUpdate(
  db: Db,
  input: {
    relationshipId: string;
    trainerUserId: string;
    now: string;
  },
): Promise<{ assignmentsUpdated: number }> {
  const assignmentsUpdated = await recomputeMealAssignmentTimes(db, {
    relationshipId: input.relationshipId,
    now: input.now,
  });
  await notifyTrainerMealTimesChanged(db, {
    relationshipId: input.relationshipId,
    trainerUserId: input.trainerUserId,
    now: input.now,
  });
  return { assignmentsUpdated };
}
