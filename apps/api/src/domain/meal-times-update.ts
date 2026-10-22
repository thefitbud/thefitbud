import { and, eq, gte } from "drizzle-orm";
import { mealPrescriptionSchema } from "@fitbud/contracts";
import { formatLocalDate } from "@fitbud/core";
import type { Db } from "../db/client.js";
import {
  coachingRelationships,
  mealAssignments,
  mealCompliance,
  users,
} from "../db/schema.js";
import { storeInboxNotification } from "./inbox-notify.js";
import { listMergedMealTimeSlots } from "./meal-time-slots.js";

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

function readPrescription(json: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function slotKeyForPrescription(json: string): string | null {
  const raw = readPrescription(json);
  if (!raw) return null;
  if (typeof raw.mealType === "string" && raw.mealType.trim()) {
    return raw.mealType.trim();
  }
  if (typeof raw.name === "string" && raw.name.trim()) {
    return raw.name.trim().toLowerCase().replace(/\s+/g, "_");
  }
  const parsed = mealPrescriptionSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.mealType ?? parsed.data.name.toLowerCase().replace(/\s+/g, "_");
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

  const merged = await listMergedMealTimeSlots(db, input.relationshipId);
  const timeBySlot = new Map(
    merged.slots.map((slot) => [slot.slotKey, slot.overrideTime ?? slot.planTime]),
  );
  if (timeBySlot.size === 0) return 0;

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
    const overrideTime = slotKey ? timeBySlot.get(slotKey) : undefined;
    if (!overrideTime) continue;

    const raw = readPrescription(assignment.mealPrescriptionJson);
    if (!raw) continue;
    if (raw.localTime === overrideTime) continue;

    const nextJson = JSON.stringify({
      ...raw,
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
