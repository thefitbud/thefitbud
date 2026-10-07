import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type {
  AdherenceState,
  ClientDirectoryItem,
  OnboardingStatus,
} from "@fitbud/contracts";
import { clientDirectoryListResponseSchema } from "@fitbud/contracts";
import { formatLocalDate } from "@fitbud/core";
import type { Db } from "../db/client";
import {
  checkinReviews,
  checkins,
  clientInvitations,
  coachingConfigurations,
  coachingRelationships,
  planVersions,
  plans,
  traineeProfiles,
  users,
} from "../db/schema";
import { deriveAdherenceForRelationships } from "./adherence";
import { deriveOnboardingStatusForRelationships } from "./client-status";
import { mapCheckin } from "./mappers";
import { buildPage } from "../lib/cursor";

type DirectoryRow = ClientDirectoryItem & { id: string };

export async function loadClientDirectory(
  db: Db,
  input: {
    trainerUserId: string;
    nowIso: string;
    q?: string;
    status?: OnboardingStatus[];
    adherenceState?: AdherenceState[];
    goal?: string[];
    cursor: { k: string; id: string } | null;
    limit: number;
  },
) {
  const [relationships, invitations, trainer] = await Promise.all([
    db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.trainerUserId, input.trainerUserId)),
    db
      .select()
      .from(clientInvitations)
      .where(
        and(
          eq(clientInvitations.trainerUserId, input.trainerUserId),
          inArray(clientInvitations.status, ["pending", "accepted"]),
        ),
      ),
    db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, input.trainerUserId))
      .limit(1),
  ]);

  const today = formatLocalDate(
    new Date(input.nowIso),
    trainer[0]?.timezone ?? "UTC",
  );
  const invitationById = new Map(invitations.map((row) => [row.id, row]));
  const relationshipInvitationIds = new Set(
    relationships
      .map((row) => row.invitationId)
      .filter((id): id is string => Boolean(id)),
  );
  const onboardingByRelationship = await deriveOnboardingStatusForRelationships(
    db,
    relationships,
  );
  const adherenceByRelationship = await deriveAdherenceForRelationships(db, {
    today,
    relationships: relationships.map((row) => ({
      id: row.id,
      onboardingStatus:
        onboardingByRelationship.get(row.id) ?? "onboarding_pending",
    })),
  });

  const relationshipIds = relationships.map((row) => row.id);
  const traineeIds = relationships.map((row) => row.traineeUserId);
  const [profiles, goals, checkinRows, planRows] = await Promise.all([
    traineeIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            userId: traineeProfiles.userId,
            displayName: traineeProfiles.displayName,
          })
          .from(traineeProfiles)
          .where(inArray(traineeProfiles.userId, traineeIds)),
    relationshipIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            relationshipId: coachingConfigurations.coachingRelationshipId,
            goalShort: coachingConfigurations.goalShort,
          })
          .from(coachingConfigurations)
          .where(
            and(
              inArray(
                coachingConfigurations.coachingRelationshipId,
                relationshipIds,
              ),
              eq(coachingConfigurations.status, "active"),
            ),
          ),
    relationshipIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            checkin: checkins,
            reviewId: checkinReviews.id,
          })
          .from(checkins)
          .leftJoin(checkinReviews, eq(checkinReviews.checkinId, checkins.id))
          .where(
            and(
              inArray(checkins.coachingRelationshipId, relationshipIds),
              eq(checkins.recordStatus, "draft"),
              isNull(checkinReviews.id),
            ),
          )
          .orderBy(asc(checkins.localDate), asc(checkins.id)),
    relationshipIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            relationshipId: plans.coachingRelationshipId,
            planId: plans.id,
            title: plans.title,
            effectiveFrom: planVersions.effectiveFrom,
            versionNumber: planVersions.versionNumber,
          })
          .from(planVersions)
          .innerJoin(plans, eq(planVersions.planId, plans.id))
          .where(
            and(
              inArray(plans.coachingRelationshipId, relationshipIds),
              eq(planVersions.status, "effective"),
            ),
          )
          .orderBy(desc(planVersions.effectiveFrom), desc(planVersions.versionNumber)),
  ]);

  const nameByUser = new Map(profiles.map((row) => [row.userId, row.displayName]));
  const goalByRelationship = new Map(
    goals.map((row) => [row.relationshipId, row.goalShort]),
  );
  const nextCheckinByRelationship = new Map<
    string,
    ClientDirectoryItem["nextCheckin"]
  >();
  for (const row of checkinRows) {
    if (nextCheckinByRelationship.has(row.checkin.coachingRelationshipId)) {
      continue;
    }
    const mapped = mapCheckin(row.checkin, null, input.nowIso);
    nextCheckinByRelationship.set(row.checkin.coachingRelationshipId, {
      id: mapped.id,
      localDate: mapped.localDate,
      status: mapped.status,
    });
  }
  const planByRelationship = new Map<
    string,
    ClientDirectoryItem["effectivePlan"]
  >();
  for (const row of planRows) {
    if (planByRelationship.has(row.relationshipId)) continue;
    planByRelationship.set(row.relationshipId, {
      id: row.planId,
      title: row.title,
      effectiveFrom: row.effectiveFrom,
    });
  }

  const rows: DirectoryRow[] = [];
  for (const relationship of relationships) {
    const invitation = relationship.invitationId
      ? invitationById.get(relationship.invitationId)
      : undefined;
    const displayName =
      nameByUser.get(relationship.traineeUserId) ??
      invitation?.recipientDisplayName ??
      invitation?.recipientEmail ??
      "Client";
    rows.push({
      id: `relationship:${relationship.id}`,
      relationshipId: relationship.id,
      invitationId: relationship.invitationId,
      traineeDisplayName: displayName,
      status: onboardingByRelationship.get(relationship.id) ?? "onboarding_pending",
      goalShort: goalByRelationship.get(relationship.id) ?? null,
      nextCheckin: nextCheckinByRelationship.get(relationship.id) ?? null,
      effectivePlan: planByRelationship.get(relationship.id) ?? null,
      adherenceState:
        adherenceByRelationship.get(relationship.id) ?? "not_available",
      updatedAt: relationship.updatedAt,
      email: invitation?.recipientEmail ?? null,
    } as DirectoryRow & { email: string | null });
  }

  for (const invitation of invitations) {
    if (invitation.status !== "pending") continue;
    if (relationshipInvitationIds.has(invitation.id)) continue;
    const displayName =
      invitation.recipientDisplayName ?? invitation.recipientEmail;
    rows.push({
      id: `invitation:${invitation.id}`,
      relationshipId: null,
      invitationId: invitation.id,
      traineeDisplayName: displayName,
      status: "invited",
      goalShort: null,
      nextCheckin: null,
      effectivePlan: null,
      adherenceState: "not_available",
      updatedAt: invitation.updatedAt,
      email: invitation.recipientEmail,
    } as DirectoryRow & { email: string | null });
  }

  const needle = input.q?.trim().toLowerCase() ?? "";
  const filtered = (rows as Array<DirectoryRow & { email: string | null }>).filter(
    (row) => {
      if (needle) {
        const name = row.traineeDisplayName.toLowerCase();
        const email = row.email?.toLowerCase() ?? "";
        if (!name.includes(needle) && !email.includes(needle)) return false;
      }
      if (input.status && input.status.length > 0 && !input.status.includes(row.status)) {
        return false;
      }
      if (
        input.adherenceState &&
        input.adherenceState.length > 0 &&
        !input.adherenceState.includes(row.adherenceState)
      ) {
        return false;
      }
      if (
        input.goal &&
        input.goal.length > 0 &&
        (row.goalShort === null || !input.goal.includes(row.goalShort))
      ) {
        return false;
      }
      if (input.cursor) {
        if (row.updatedAt > input.cursor.k) return false;
        if (row.updatedAt === input.cursor.k && row.id >= input.cursor.id) {
          return false;
        }
      }
      return true;
    },
  );

  filtered.sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) {
      return left.updatedAt < right.updatedAt ? 1 : -1;
    }
    if (left.id === right.id) return 0;
    return left.id < right.id ? 1 : -1;
  });

  const page = buildPage(filtered, input.limit, (item) => item.updatedAt);
  return clientDirectoryListResponseSchema.parse({
    items: page.items.map((item) => ({
      relationshipId: item.relationshipId,
      invitationId: item.invitationId,
      traineeDisplayName: item.traineeDisplayName,
      status: item.status,
      goalShort: item.goalShort,
      nextCheckin: item.nextCheckin,
      effectivePlan: item.effectivePlan,
      adherenceState: item.adherenceState,
      updatedAt: item.updatedAt,
    })),
    nextCursor: page.nextCursor,
  });
}
