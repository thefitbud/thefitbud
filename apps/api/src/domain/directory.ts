import { and, asc, count, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type {
  AdherenceState,
  ClientDirectoryItem,
  OnboardingStatus,
  RenewalState,
} from "@fitbud/contracts";
import { clientDirectoryListResponseSchema } from "@fitbud/contracts";
import {
  ADHERENCE_EXCEPTION_SEVERITIES,
  ADHERENCE_OPEN_EXCEPTION_STATUSES,
  addDaysToLocalDate,
  adherenceWindowStart,
  deriveAdherenceState,
  deriveClientOnboardingStatus,
  deriveRenewalState,
  formatLocalDate,
  isQualifyingAdherenceObservation,
} from "@fitbud/core";
import type { Db } from "../db/client";
import {
  checkinReviews,
  checkins,
  clientInvitations,
  coachAsks,
  coachingConfigurations,
  coachingRelationships,
  exceptions,
  mealCompliance,
  onboardingFormResponses,
  onboardingReviews,
  planVersions,
  plans,
  subscriptionVersions,
  traineeProfiles,
  users,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema";
import { resolveClientDisplayName } from "./client-identity";
import { mapCheckin } from "./mappers";
import { buildPage } from "../lib/cursor";

type DirectoryRow = ClientDirectoryItem & { id: string };
type RenewalFilter = RenewalState | "none";

export async function loadClientDirectory(
  db: Db,
  input: {
    trainerUserId: string;
    nowIso: string;
    q?: string;
    status?: OnboardingStatus[];
    adherenceState?: AdherenceState[];
    goal?: string[];
    renewal?: RenewalFilter[];
    cursor: { k: string; id: string } | null;
    limit: number;
  },
) {
  // Z14-1: one D1 round trip. Every read is scoped by a sub-select of this
  // trainer's relationships instead of an id list from a first read, so none
  // waits for another and no IN list can outgrow D1's parameter cap.
  const trainerRelationshipIds = db
    .select({ id: coachingRelationships.id })
    .from(coachingRelationships)
    .where(eq(coachingRelationships.trainerUserId, input.trainerUserId));
  const trainerTraineeIds = db
    .select({ id: coachingRelationships.traineeUserId })
    .from(coachingRelationships)
    .where(eq(coachingRelationships.trainerUserId, input.trainerUserId));
  // The trainer's "today" depends on their zone, read in this same batch, so
  // dated adherence inputs use a range one day wider each side (every zone's
  // today is within a day of UTC's) and are trimmed exactly below.
  const utcToday = formatLocalDate(new Date(input.nowIso), "UTC");
  const wideStart = adherenceWindowStart(addDaysToLocalDate(utcToday, -1));
  const wideEnd = addDaysToLocalDate(utcToday, 1);
  const [
    relationships,
    invitations,
    trainer,
    profiles,
    configurationRows,
    checkinRows,
    planRows,
    subscriptionRows,
    onboardingResponseRows,
    onboardingReviewRows,
    openExceptionRows,
    adherenceWorkoutRows,
    adherenceMealRows,
    adherenceCheckinRows,
    openAskRows,
  ] = await db.batch([
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
    db
      .select({
        userId: traineeProfiles.userId,
        displayName: traineeProfiles.displayName,
        timezone: users.timezone,
      })
      .from(traineeProfiles)
      .innerJoin(users, eq(users.id, traineeProfiles.userId))
      .where(inArray(traineeProfiles.userId, trainerTraineeIds)),
    // Goals (active rows) and the "has active configuration" onboarding input.
    db
      .select({
        relationshipId: coachingConfigurations.coachingRelationshipId,
        status: coachingConfigurations.status,
        goalShort: coachingConfigurations.goalShort,
      })
      .from(coachingConfigurations)
      .where(inArray(coachingConfigurations.coachingRelationshipId, trainerRelationshipIds)),
    db
      .select({ checkin: checkins })
      .from(checkins)
      .leftJoin(checkinReviews, eq(checkinReviews.checkinId, checkins.id))
      .where(
        and(
          inArray(checkins.coachingRelationshipId, trainerRelationshipIds),
          eq(checkins.recordStatus, "draft"),
          isNull(checkinReviews.id),
        ),
      )
      .orderBy(asc(checkins.localDate), asc(checkins.id)),
    db
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
          inArray(plans.coachingRelationshipId, trainerRelationshipIds),
          eq(planVersions.status, "effective"),
        ),
      )
      .orderBy(desc(planVersions.effectiveFrom), desc(planVersions.versionNumber)),
    db
      .select({
        relationshipId: subscriptionVersions.coachingRelationshipId,
        renewsOn: subscriptionVersions.renewsOn,
        versionNumber: subscriptionVersions.versionNumber,
      })
      .from(subscriptionVersions)
      .where(inArray(subscriptionVersions.coachingRelationshipId, trainerRelationshipIds))
      .orderBy(desc(subscriptionVersions.versionNumber)),
    // Onboarding status inputs (as `deriveOnboardingStatusForRelationships`).
    db
      .select({
        relationshipId: onboardingFormResponses.coachingRelationshipId,
        status: onboardingFormResponses.status,
      })
      .from(onboardingFormResponses)
      .where(inArray(onboardingFormResponses.coachingRelationshipId, trainerRelationshipIds)),
    db
      .select({ relationshipId: onboardingReviews.coachingRelationshipId })
      .from(onboardingReviews)
      .where(inArray(onboardingReviews.coachingRelationshipId, trainerRelationshipIds)),
    // Stored open exceptions: the adherence input and the per-client attention
    // summary. Read as stored, never evaluated here (D-W14-8).
    db
      .select({
        relationshipId: exceptions.coachingRelationshipId,
        type: exceptions.type,
        severity: exceptions.severity,
        status: exceptions.status,
      })
      .from(exceptions)
      .where(
        and(
          inArray(exceptions.coachingRelationshipId, trainerRelationshipIds),
          inArray(exceptions.status, [...ADHERENCE_OPEN_EXCEPTION_STATUSES]),
        ),
      ),
    // Adherence inputs (as `deriveAdherenceForRelationships`), widened by a day.
    db
      .select({
        relationshipId: workoutExecutions.coachingRelationshipId,
        status: workoutExecutions.status,
        localDate: workoutAssignments.localDate,
      })
      .from(workoutExecutions)
      .innerJoin(workoutAssignments, eq(workoutExecutions.assignmentId, workoutAssignments.id))
      .where(
        and(
          inArray(workoutExecutions.coachingRelationshipId, trainerRelationshipIds),
          gte(workoutAssignments.localDate, wideStart),
          lte(workoutAssignments.localDate, wideEnd),
        ),
      ),
    db
      .select({
        relationshipId: mealCompliance.coachingRelationshipId,
        localDate: mealCompliance.localDate,
        logged: count(),
      })
      .from(mealCompliance)
      .where(
        and(
          inArray(mealCompliance.coachingRelationshipId, trainerRelationshipIds),
          gte(mealCompliance.localDate, wideStart),
          lte(mealCompliance.localDate, wideEnd),
        ),
      )
      .groupBy(mealCompliance.coachingRelationshipId, mealCompliance.localDate),
    db
      .select({
        relationshipId: checkins.coachingRelationshipId,
        recordStatus: checkins.recordStatus,
        localDate: checkins.localDate,
      })
      .from(checkins)
      .where(
        and(
          inArray(checkins.coachingRelationshipId, trainerRelationshipIds),
          gte(checkins.localDate, wideStart),
          lte(checkins.localDate, wideEnd),
        ),
      ),
    db
      .select({ relationshipId: coachAsks.relationshipId })
      .from(coachAsks)
      .where(
        and(
          inArray(coachAsks.relationshipId, trainerRelationshipIds),
          eq(coachAsks.status, "open"),
        ),
      ),
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

  // Onboarding status: same rule and inputs as deriveOnboardingStatusForRelationships.
  const submitted = new Set(
    onboardingResponseRows
      .filter((row) => row.status === "submitted")
      .map((row) => row.relationshipId),
  );
  const reviewed = new Set(onboardingReviewRows.map((row) => row.relationshipId));
  const activeConfiguration = new Set(
    configurationRows
      .filter((row) => row.status === "active")
      .map((row) => row.relationshipId),
  );
  const onboardingByRelationship = new Map<string, OnboardingStatus>();
  for (const row of relationships) {
    const status = deriveClientOnboardingStatus({
      relationshipStatus: row.status,
      invitationPending: false,
      hasSubmittedResponse: submitted.has(row.id),
      hasCoachingReadyReview: reviewed.has(row.id),
      hasActiveConfiguration: activeConfiguration.has(row.id),
    });
    if (status) onboardingByRelationship.set(row.id, status);
  }

  // Adherence: same rule and inputs as deriveAdherenceForRelationships, on the
  // exact window [start, today] in the trainer's zone.
  const adherenceStart = adherenceWindowStart(today);
  const inWindow = (localDate: string) =>
    localDate >= adherenceStart && localDate <= today;
  const severities: readonly string[] = ADHERENCE_EXCEPTION_SEVERITIES;
  const openExceptionIds = new Set(
    openExceptionRows
      .filter((row) => severities.includes(row.severity))
      .map((row) => row.relationshipId),
  );
  const qualifyingIds = new Set<string>();
  for (const row of adherenceWorkoutRows) {
    if (!inWindow(row.localDate)) continue;
    if (
      isQualifyingAdherenceObservation({
        kind: "workout_execution",
        status: row.status,
        localDate: row.localDate,
        today,
      })
    ) {
      qualifyingIds.add(row.relationshipId);
    }
  }
  for (const row of adherenceMealRows) {
    if (row.relationshipId && row.localDate && inWindow(row.localDate) && row.logged > 0) {
      qualifyingIds.add(row.relationshipId);
    }
  }
  for (const row of adherenceCheckinRows) {
    if (!inWindow(row.localDate)) continue;
    if (
      isQualifyingAdherenceObservation({
        kind: "checkin",
        status: row.recordStatus,
        localDate: row.localDate,
        today,
      })
    ) {
      qualifyingIds.add(row.relationshipId);
    }
  }
  const adherenceByRelationship = new Map<string, AdherenceState>();
  for (const row of relationships) {
    const onboardingStatus =
      onboardingByRelationship.get(row.id) ?? "onboarding_pending";
    const active = onboardingStatus === "active";
    adherenceByRelationship.set(
      row.id,
      deriveAdherenceState({
        onboardingStatus,
        hasOpenAdherenceException: active && openExceptionIds.has(row.id),
        hasQualifyingActivity: active && qualifyingIds.has(row.id),
      }),
    );
  }

  const attentionByRelationship = summarizeAttention(
    openExceptionRows,
    new Set(openAskRows.map((row) => row.relationshipId)),
  );
  const goals = configurationRows.filter((row) => row.status === "active");
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
  const renewalByRelationship = new Map<
    string,
    { renewsOn: string; renewalState: RenewalState }
  >();
  for (const row of subscriptionRows) {
    if (renewalByRelationship.has(row.relationshipId)) continue;
    renewalByRelationship.set(row.relationshipId, {
      renewsOn: row.renewsOn,
      renewalState: deriveRenewalState({ today, renewsOn: row.renewsOn }),
    });
  }

  const rows: DirectoryRow[] = [];
  for (const relationship of relationships) {
    const invitation = relationship.invitationId
      ? invitationById.get(relationship.invitationId)
      : undefined;
    // Z9-18: the trainer-set name first, so the list and its search match it.
    const displayName =
      resolveClientDisplayName(
        relationship,
        nameByUser.get(relationship.traineeUserId),
      ) ??
      invitation?.recipientDisplayName ??
      invitation?.recipientEmail ??
      "Client";
    const renewal = renewalByRelationship.get(relationship.id);
    const traineeZone =
      profiles.find((profile) => profile.userId === relationship.traineeUserId)
        ?.timezone ?? null;
    const trainerZone = trainer[0]?.timezone ?? "UTC";
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
      renewalState: renewal?.renewalState ?? null,
      renewsOn: renewal?.renewsOn ?? null,
      startedAt: relationship.startedAt,
      endedAt: relationship.endedAt ?? null,
      // Z10-21 (D-W10-8): civil dates in the trainer's zone.
      startedOn: formatLocalDate(new Date(relationship.startedAt), trainerZone),
      endedOn: relationship.endedAt
        ? formatLocalDate(new Date(relationship.endedAt), trainerZone)
        : null,
      week: coachingWeekNumber(relationship.startedAt, input.nowIso),
      city:
        traineeZone && traineeZone !== trainerZone
          ? cityLabelForTimezone(traineeZone)
          : null,
      updatedAt: relationship.updatedAt,
      attention: attentionByRelationship.get(relationship.id) ?? EMPTY_ATTENTION,
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
      renewalState: null,
      renewsOn: null,
      startedAt: null,
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
      if (input.renewal && input.renewal.length > 0) {
        const stateKey: RenewalFilter = row.renewalState ?? "none";
        if (!input.renewal.includes(stateKey)) return false;
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

  const facets = {
    status: {} as Record<string, number>,
    adherence: {} as Record<string, number>,
    renewal: {} as Record<string, number>,
  };
  for (const row of rows as DirectoryRow[]) {
    facets.status[row.status] = (facets.status[row.status] ?? 0) + 1;
    facets.adherence[row.adherenceState] =
      (facets.adherence[row.adherenceState] ?? 0) + 1;
    const renewalKey = row.renewalState ?? "none";
    facets.renewal[renewalKey] = (facets.renewal[renewalKey] ?? 0) + 1;
  }

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
      renewalState: item.renewalState,
      renewsOn: item.renewsOn,
      startedAt: item.startedAt ?? null,
      endedAt: item.endedAt ?? undefined,
      startedOn: item.startedOn ?? null,
      endedOn: item.endedOn ?? null,
      week: item.week ?? null,
      city: item.city ?? null,
      updatedAt: item.updatedAt,
      ...(item.attention ? { attention: item.attention } : {}),
    })),
    facets,
    nextCursor: page.nextCursor,
  });
}

type AttentionSummary = NonNullable<ClientDirectoryItem["attention"]>;

const EMPTY_ATTENTION: AttentionSummary = {
  needsYouCount: 0,
  notedCount: 0,
  mostSevere: null,
  hasOpenMissed: false,
  hasOpenOffPlan: false,
  hasOpenAsk: false,
};

/**
 * Per-client counts from stored open exceptions and open asks (Z14-1), so the
 * trainer app's Clients badges need no Needs you call. Same categories as the
 * attention groups: Needs you = detected or active, noted = acknowledged.
 */
function summarizeAttention(
  rows: ReadonlyArray<{ relationshipId: string; type: string; severity: string; status: string }>,
  openAsks: ReadonlySet<string>,
): Map<string, AttentionSummary> {
  const summaries = new Map<string, AttentionSummary>();
  const get = (id: string) => {
    let summary = summaries.get(id);
    if (!summary) {
      summary = { ...EMPTY_ATTENTION };
      summaries.set(id, summary);
    }
    return summary;
  };
  for (const row of rows) {
    const summary = get(row.relationshipId);
    if (row.severity === "critical") summary.mostSevere = "critical";
    else if (!summary.mostSevere) summary.mostSevere = "attention";
    if (row.status === "acknowledged") {
      summary.notedCount += 1;
      continue;
    }
    summary.needsYouCount += 1;
    if (row.type === "meal_deviation") summary.hasOpenOffPlan = true;
    else summary.hasOpenMissed = true;
  }
  for (const id of openAsks) get(id).hasOpenAsk = true;
  return summaries;
}

function coachingWeekNumber(startedAt: string, nowIso: string): number {
  const elapsed = Date.parse(nowIso) - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function cityLabelForTimezone(timeZone: string): string {
  if (timeZone === "Asia/Dubai") return "Dubai";
  const city = timeZone.split("/").pop()?.replaceAll("_", " ");
  return city && city.length > 0 ? city : timeZone;
}
