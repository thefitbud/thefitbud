import { and, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  checkins,
  coachingRelationships,
  exceptions,
  mealAssignments,
  notifications,
  planVersions,
  plans,
  reactivationRequests,
  workoutAssignments,
} from "../db/schema.js";
import { createId, nowIso } from "../lib/crypto.js";

export class RelationshipEndedError extends Error {
  readonly code = "RELATIONSHIP_ENDED" as const;
}

export async function assertRelationshipWritable(
  db: Db,
  relationshipId: string,
): Promise<typeof coachingRelationships.$inferSelect> {
  const [relationship] = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  if (!relationship) {
    throw new Error("RELATIONSHIP_NOT_FOUND");
  }
  if (relationship.status === "ended") {
    throw new RelationshipEndedError();
  }
  return relationship;
}

/** Civil date one day before `iso` (UTC calendar), used to close plan horizons. */
function previousCivilDate(iso: string): string {
  const day = iso.slice(0, 10);
  const prior = new Date(`${day}T12:00:00.000Z`);
  prior.setUTCDate(prior.getUTCDate() - 1);
  return prior.toISOString().slice(0, 10);
}

/**
 * Ends coaching: closes open exceptions, supersedes today+future workout/meal
 * assignments, removes unsubmitted check-ins from today onward, suppresses
 * pending reminders/nudges, and closes the effective plan horizon so rolling
 * replenishment cannot recreate a schedule until the trainer re-assigns.
 */
export async function endCoachingRelationship(
  db: Db,
  input: {
    relationshipId: string;
    endedByUserId: string;
    reason?: string | null;
  },
): Promise<void> {
  const timestamp = nowIso();
  await db
    .update(coachingRelationships)
    .set({
      status: "ended",
      endedAt: timestamp,
      endedByUserId: input.endedByUserId,
      endReason: input.reason ?? null,
      updatedAt: timestamp,
    })
    .where(eq(coachingRelationships.id, input.relationshipId));

  await db
    .update(exceptions)
    .set({
      status: "resolved",
      closedReason: "coaching_ended",
      // Same instant as endedAt, like the other system close (auto-resolve).
      resolvedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(exceptions.coachingRelationshipId, input.relationshipId),
        eq(exceptions.status, "active"),
      ),
    );

  const fromDate = timestamp.slice(0, 10);
  await db
    .update(workoutAssignments)
    .set({
      scheduleStatus: "superseded",
      supersededAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
        eq(workoutAssignments.scheduleStatus, "scheduled"),
        gte(workoutAssignments.localDate, fromDate),
      ),
    );
  await db
    .update(mealAssignments)
    .set({
      scheduleStatus: "superseded",
      supersededAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(mealAssignments.coachingRelationshipId, input.relationshipId),
        eq(mealAssignments.scheduleStatus, "scheduled"),
        gte(mealAssignments.localDate, fromDate),
      ),
    );

  // Draft check-ins have no schedule_status; remove future/today unsubmitted rows
  // so reminders and the trainee Today surface cannot keep them alive.
  await db
    .delete(checkins)
    .where(
      and(
        eq(checkins.coachingRelationshipId, input.relationshipId),
        eq(checkins.recordStatus, "draft"),
        gte(checkins.localDate, fromDate),
      ),
    );

  await db
    .update(notifications)
    .set({ state: "suppressed" })
    .where(
      and(
        eq(notifications.coachingRelationshipId, input.relationshipId),
        inArray(notifications.state, ["pending", "deferred", "queued"]),
      ),
    );

  // Close the effective plan horizon so replenishRollingHorizons creates nothing
  // after reactivation until the trainer assigns a plan with a new start date.
  const relationshipPlans = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.coachingRelationshipId, input.relationshipId));
  if (relationshipPlans.length > 0) {
    const planIds = relationshipPlans.map((row) => row.id);
    // Midnight UTC on the prior civil day stays on/before that day in all
    // common trainer timezones (avoids T23:59Z rolling into "today" in IST).
    const closedTo = `${previousCivilDate(timestamp)}T00:00:00.000Z`;
    await db
      .update(planVersions)
      .set({
        effectiveTo: closedTo,
        updatedAt: timestamp,
      })
      .where(
        and(
          inArray(planVersions.planId, planIds),
          eq(planVersions.status, "effective"),
        ),
      );
  }

  await db
    .update(reactivationRequests)
    .set({ status: "cancelled", resolvedAt: timestamp })
    .where(
      and(
        eq(reactivationRequests.relationshipId, input.relationshipId),
        eq(reactivationRequests.status, "pending"),
      ),
    );
}

export async function requestRelationshipReactivation(
  db: Db,
  input: {
    relationshipId: string;
    trainerUserId: string;
    intakeUpdateRequested?: boolean;
  },
): Promise<string> {
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60_000).toISOString();
  const id = createId();
  await db.insert(reactivationRequests).values({
    id,
    relationshipId: input.relationshipId,
    trainerUserId: input.trainerUserId,
    status: "pending",
    intakeUpdateRequested: Boolean(input.intakeUpdateRequested),
    expiresAt,
    createdAt: timestamp,
    resolvedAt: null,
  });
  return id;
}

export async function cancelRelationshipReactivation(
  db: Db,
  input: { relationshipId: string; trainerUserId: string },
): Promise<boolean> {
  const [relationship] = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, input.relationshipId))
    .limit(1);
  if (!relationship || relationship.trainerUserId !== input.trainerUserId) {
    return false;
  }
  const timestamp = nowIso();
  await db
    .update(reactivationRequests)
    .set({ status: "cancelled", resolvedAt: timestamp })
    .where(
      and(
        eq(reactivationRequests.relationshipId, input.relationshipId),
        eq(reactivationRequests.status, "pending"),
      ),
    );
  return true;
}

/**
 * Trainee confirms reactivation. Schedules stay empty until the trainer assigns
 * a plan (effective plan horizon remains closed; assignments stay superseded).
 */
export async function confirmRelationshipReactivation(
  db: Db,
  input: { relationshipId: string; requestId: string },
): Promise<void> {
  const timestamp = nowIso();
  await db
    .update(coachingRelationships)
    .set({
      status: "active",
      reactivatedAt: timestamp,
      endedAt: null,
      endedByUserId: null,
      endReason: null,
      updatedAt: timestamp,
    })
    .where(eq(coachingRelationships.id, input.relationshipId));
  await db
    .update(reactivationRequests)
    .set({ status: "confirmed", resolvedAt: timestamp })
    .where(eq(reactivationRequests.id, input.requestId));

  // Belt-and-suspenders: nothing scheduled from today until assign.
  const fromDate = timestamp.slice(0, 10);
  await db
    .update(workoutAssignments)
    .set({
      scheduleStatus: "superseded",
      supersededAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
        eq(workoutAssignments.scheduleStatus, "scheduled"),
        gte(workoutAssignments.localDate, fromDate),
      ),
    );
  await db
    .update(mealAssignments)
    .set({
      scheduleStatus: "superseded",
      supersededAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(mealAssignments.coachingRelationshipId, input.relationshipId),
        eq(mealAssignments.scheduleStatus, "scheduled"),
        gte(mealAssignments.localDate, fromDate),
      ),
    );
  await db
    .delete(checkins)
    .where(
      and(
        eq(checkins.coachingRelationshipId, input.relationshipId),
        eq(checkins.recordStatus, "draft"),
        gte(checkins.localDate, fromDate),
      ),
    );
}
