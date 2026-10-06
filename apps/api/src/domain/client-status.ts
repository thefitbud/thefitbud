import { eq, inArray } from "drizzle-orm";
import type { OnboardingStatus } from "@fitbud/contracts";
import { deriveClientOnboardingStatus } from "@fitbud/core";
import type { Db } from "../db/client";
import {
  coachingConfigurations,
  coachingRelationships,
  onboardingFormResponses,
  onboardingReviews,
} from "../db/schema";

type RelationshipStatusRow = {
  id: string;
  status: "active" | "ended";
};

export async function deriveOnboardingStatusForRelationships(
  db: Db,
  rows: readonly RelationshipStatusRow[],
): Promise<Map<string, OnboardingStatus>> {
  const result = new Map<string, OnboardingStatus>();
  if (rows.length === 0) return result;

  const ids = rows.map((row) => row.id);
  const [responses, reviews, configurations] = await Promise.all([
    db
      .select({
        coachingRelationshipId: onboardingFormResponses.coachingRelationshipId,
        status: onboardingFormResponses.status,
      })
      .from(onboardingFormResponses)
      .where(inArray(onboardingFormResponses.coachingRelationshipId, ids)),
    db
      .select({
        coachingRelationshipId: onboardingReviews.coachingRelationshipId,
      })
      .from(onboardingReviews)
      .where(inArray(onboardingReviews.coachingRelationshipId, ids)),
    db
      .select({
        coachingRelationshipId: coachingConfigurations.coachingRelationshipId,
        status: coachingConfigurations.status,
      })
      .from(coachingConfigurations)
      .where(inArray(coachingConfigurations.coachingRelationshipId, ids)),
  ]);

  const submitted = new Set(
    responses
      .filter((row) => row.status === "submitted")
      .map((row) => row.coachingRelationshipId),
  );
  const reviewed = new Set(reviews.map((row) => row.coachingRelationshipId));
  const activeConfiguration = new Set(
    configurations
      .filter((row) => row.status === "active")
      .map((row) => row.coachingRelationshipId),
  );

  for (const row of rows) {
    const status = deriveClientOnboardingStatus({
      relationshipStatus: row.status,
      invitationPending: false,
      hasSubmittedResponse: submitted.has(row.id),
      hasCoachingReadyReview: reviewed.has(row.id),
      hasActiveConfiguration: activeConfiguration.has(row.id),
    });
    if (status) result.set(row.id, status);
  }
  return result;
}

export async function onboardingStatusForRelationship(
  db: Db,
  row: RelationshipStatusRow,
): Promise<OnboardingStatus> {
  const statuses = await deriveOnboardingStatusForRelationships(db, [row]);
  return statuses.get(row.id) ?? "onboarding_pending";
}

export async function relationshipIdByInvitation(
  db: Db,
  invitationIds: readonly string[],
): Promise<Map<string, typeof coachingRelationships.$inferSelect>> {
  const result = new Map<string, typeof coachingRelationships.$inferSelect>();
  if (invitationIds.length === 0) return result;
  const rows = await db
    .select()
    .from(coachingRelationships)
    .where(inArray(coachingRelationships.invitationId, [...invitationIds]));
  for (const row of rows) {
    if (row.invitationId) result.set(row.invitationId, row);
  }
  return result;
}

export async function relationshipForInvitation(
  db: Db,
  invitationId: string,
) {
  const rows = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.invitationId, invitationId))
    .limit(1);
  return rows[0] ?? null;
}
