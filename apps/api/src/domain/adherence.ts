import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { AdherenceState, OnboardingStatus } from "@fitbud/contracts";
import {
  ADHERENCE_EXCEPTION_SEVERITIES,
  ADHERENCE_OPEN_EXCEPTION_STATUSES,
  adherenceWindowStart,
  deriveAdherenceState,
  isQualifyingAdherenceObservation,
} from "@fitbud/core";
import type { Db } from "../db/client";
import {
  checkins,
  exceptions,
  mealAssignments,
  mealCompliance,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema";

/**
 * Open adherence exceptions are detected, active, or acknowledged Critical
 * or Attention rows. Acknowledgement does not by itself make the client on track.
 * Resolved exceptions stay in history and do not create needs_attention.
 */
export async function deriveAdherenceForRelationships(
  db: Db,
  input: {
    today: string;
    relationships: ReadonlyArray<{
      id: string;
      onboardingStatus: OnboardingStatus;
    }>;
  },
): Promise<Map<string, AdherenceState>> {
  const result = new Map<string, AdherenceState>();
  const activeIds = input.relationships
    .filter((row) => row.onboardingStatus === "active")
    .map((row) => row.id);

  const openExceptionIds = new Set<string>();
  const qualifyingIds = new Set<string>();

  if (activeIds.length > 0) {
    const start = adherenceWindowStart(input.today);

    const [openRows, workoutRows, mealRows, checkinRows] = await Promise.all([
      db
        .select({
          relationshipId: exceptions.coachingRelationshipId,
        })
        .from(exceptions)
        .where(
          and(
            inArray(exceptions.coachingRelationshipId, activeIds),
            inArray(exceptions.status, [...ADHERENCE_OPEN_EXCEPTION_STATUSES]),
            inArray(exceptions.severity, [...ADHERENCE_EXCEPTION_SEVERITIES]),
          ),
        ),
      db
        .select({
          relationshipId: workoutExecutions.coachingRelationshipId,
          status: workoutExecutions.status,
          localDate: workoutAssignments.localDate,
        })
        .from(workoutExecutions)
        .innerJoin(
          workoutAssignments,
          eq(workoutExecutions.assignmentId, workoutAssignments.id),
        )
        .where(
          and(
            inArray(workoutExecutions.coachingRelationshipId, activeIds),
            gte(workoutAssignments.localDate, start),
            lte(workoutAssignments.localDate, input.today),
          ),
        ),
      db
        .select({
          relationshipId: mealCompliance.coachingRelationshipId,
          outcome: mealCompliance.outcome,
          localDate: mealAssignments.localDate,
        })
        .from(mealCompliance)
        .innerJoin(
          mealAssignments,
          eq(mealCompliance.assignmentId, mealAssignments.id),
        )
        .where(
          and(
            inArray(mealCompliance.coachingRelationshipId, activeIds),
            gte(mealAssignments.localDate, start),
            lte(mealAssignments.localDate, input.today),
          ),
        ),
      db
        .select({
          relationshipId: checkins.coachingRelationshipId,
          recordStatus: checkins.recordStatus,
          localDate: checkins.localDate,
        })
        .from(checkins)
        .where(
          and(
            inArray(checkins.coachingRelationshipId, activeIds),
            gte(checkins.localDate, start),
            lte(checkins.localDate, input.today),
          ),
        ),
    ]);

    for (const row of openRows) openExceptionIds.add(row.relationshipId);
    for (const row of workoutRows) {
      if (
        isQualifyingAdherenceObservation({
          kind: "workout_execution",
          status: row.status,
          localDate: row.localDate,
          today: input.today,
        })
      ) {
        qualifyingIds.add(row.relationshipId);
      }
    }
    for (const row of mealRows) {
      if (
        isQualifyingAdherenceObservation({
          kind: "meal_compliance",
          status: row.outcome,
          localDate: row.localDate,
          today: input.today,
        })
      ) {
        qualifyingIds.add(row.relationshipId);
      }
    }
    for (const row of checkinRows) {
      if (
        isQualifyingAdherenceObservation({
          kind: "checkin",
          status: row.recordStatus,
          localDate: row.localDate,
          today: input.today,
        })
      ) {
        qualifyingIds.add(row.relationshipId);
      }
    }
  }

  for (const row of input.relationships) {
    result.set(
      row.id,
      deriveAdherenceState({
        onboardingStatus: row.onboardingStatus,
        hasOpenAdherenceException: openExceptionIds.has(row.id),
        hasQualifyingActivity: qualifyingIds.has(row.id),
      }),
    );
  }
  return result;
}
