import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  coachingRelationships,
  exceptions,
  mealAssignments,
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
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(exceptions.coachingRelationshipId, input.relationshipId),
        eq(exceptions.status, "active"),
      ),
    );

  const futureDate = timestamp.slice(0, 10);
  await db
    .update(workoutAssignments)
    .set({ scheduleStatus: "superseded", updatedAt: timestamp })
    .where(
      and(
        eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
        eq(workoutAssignments.scheduleStatus, "scheduled"),
        gt(workoutAssignments.localDate, futureDate),
      ),
    );
  await db
    .update(mealAssignments)
    .set({ scheduleStatus: "superseded", updatedAt: timestamp })
    .where(
      and(
        eq(mealAssignments.coachingRelationshipId, input.relationshipId),
        eq(mealAssignments.scheduleStatus, "scheduled"),
        gt(mealAssignments.localDate, futureDate),
      ),
    );

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
}
