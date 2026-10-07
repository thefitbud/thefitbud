import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { HistoryItem } from "@fitbud/contracts";
import {
  compareHistoryItemsNewestFirst,
  isHistoryItemAfterCursor,
} from "@fitbud/core";
import type { createDb } from "../db/client";
import {
  checkinReviews,
  checkins,
  coachingConfigurations,
  exceptions,
  interventions,
  onboardingFormResponses,
  subscriptionVersions,
  mealAssignments,
  mealCompliance,
  measurements,
  mediaAssets,
  onboardingReviews,
  planVersions,
  plans,
  progressEntries,
  trainerNotes,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema";
import { buildPage } from "../lib/cursor";

type Db = ReturnType<typeof createDb>;

const SOURCE_FETCH_LIMIT = 100;

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

/**
 * Assembles a readable chronological history projection from domain tables.
 * Intentionally omits drafts, pending uploads, and note-kind intervention
 * duplicates so the list is longitudinal coaching context rather than a dump.
 */
export async function assembleRelationshipHistory(
  db: Db,
  relationshipId: string,
  options: {
    limit: number;
    cursor: { k: string; id: string } | null;
  },
): Promise<{ items: HistoryItem[]; nextCursor: string | null }> {
  const items: HistoryItem[] = [];

  const [
    onboardingRows,
    subscriptionRows,
    reviewRows,
    configRows,
    planVersionRows,
    workoutRows,
    mealRows,
    checkinRows,
    checkinReviewRows,
    measurementRows,
    progressEntryRows,
    photoRows,
    exceptionRows,
    noteRows,
    interventionRows,
  ] = await Promise.all([
    db
      .select()
      .from(onboardingFormResponses)
      .where(
        and(
          eq(onboardingFormResponses.coachingRelationshipId, relationshipId),
          eq(onboardingFormResponses.status, "submitted"),
        ),
      )
      .orderBy(desc(onboardingFormResponses.submittedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(subscriptionVersions)
      .where(eq(subscriptionVersions.coachingRelationshipId, relationshipId))
      .orderBy(desc(subscriptionVersions.createdAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(onboardingReviews)
      .where(eq(onboardingReviews.coachingRelationshipId, relationshipId))
      .orderBy(desc(onboardingReviews.createdAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(coachingConfigurations)
      .where(
        and(
          eq(coachingConfigurations.coachingRelationshipId, relationshipId),
          isNotNull(coachingConfigurations.activatedAt),
        ),
      )
      .orderBy(desc(coachingConfigurations.activatedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select({
        version: planVersions,
        planTitle: plans.title,
      })
      .from(planVersions)
      .innerJoin(plans, eq(planVersions.planId, plans.id))
      .where(
        and(
          eq(plans.coachingRelationshipId, relationshipId),
          inArray(planVersions.status, [
            "published",
            "scheduled",
            "effective",
            "superseded",
          ]),
        ),
      )
      .orderBy(desc(planVersions.updatedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select({
        execution: workoutExecutions,
        workoutDayName: workoutAssignments.workoutDayName,
        localDate: workoutAssignments.localDate,
      })
      .from(workoutExecutions)
      .innerJoin(
        workoutAssignments,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(
        and(
          eq(workoutExecutions.coachingRelationshipId, relationshipId),
          inArray(workoutExecutions.status, [
            "completed",
            "modified",
            "skipped",
          ]),
        ),
      )
      .orderBy(desc(workoutExecutions.completedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select({
        compliance: mealCompliance,
        mealName: mealAssignments.mealName,
        localDate: mealAssignments.localDate,
      })
      .from(mealCompliance)
      .innerJoin(
        mealAssignments,
        eq(mealCompliance.assignmentId, mealAssignments.id),
      )
      .where(eq(mealCompliance.coachingRelationshipId, relationshipId))
      .orderBy(desc(mealCompliance.loggedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.coachingRelationshipId, relationshipId),
          eq(checkins.recordStatus, "submitted"),
        ),
      )
      .orderBy(desc(checkins.submittedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(checkinReviews)
      .where(eq(checkinReviews.coachingRelationshipId, relationshipId))
      .orderBy(desc(checkinReviews.createdAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(measurements)
      .where(eq(measurements.coachingRelationshipId, relationshipId))
      .orderBy(desc(measurements.observedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(progressEntries)
      .where(eq(progressEntries.coachingRelationshipId, relationshipId))
      .orderBy(desc(progressEntries.observedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.coachingRelationshipId, relationshipId),
          eq(mediaAssets.status, "ready"),
          eq(mediaAssets.mediaType, "progress_photo"),
        ),
      )
      .orderBy(desc(mediaAssets.uploadedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(exceptions)
      .where(eq(exceptions.coachingRelationshipId, relationshipId))
      .orderBy(desc(exceptions.detectedAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(trainerNotes)
      .where(eq(trainerNotes.coachingRelationshipId, relationshipId))
      .orderBy(desc(trainerNotes.createdAt))
      .limit(SOURCE_FETCH_LIMIT),
    db
      .select()
      .from(interventions)
      .where(
        and(
          eq(interventions.coachingRelationshipId, relationshipId),
          ne(interventions.kind, "note"),
        ),
      )
      .orderBy(desc(interventions.createdAt))
      .limit(SOURCE_FETCH_LIMIT),
  ]);

  for (const row of onboardingRows) {
    if (!row.submittedAt) continue;
    items.push({
      id: row.id,
      kind: "onboarding_submitted",
      occurredAt: row.submittedAt,
      title: "Onboarding submitted",
      summary: "Trainee submitted the onboarding form for review.",
      sourceEntityType: "onboarding_form_response",
      sourceEntityId: row.id,
      status: row.status,
    });
  }

  for (const row of subscriptionRows) {
    items.push({
      id: row.id,
      kind: "subscription_revision",
      occurredAt: row.createdAt,
      title: `Subscription v${row.versionNumber}`,
      summary: `${row.planName} renews ${row.renewsOn} (${humanize(row.paymentFrequency)}).`,
      sourceEntityType: "subscription_version",
      sourceEntityId: row.id,
      status: String(row.versionNumber),
    });
  }

  for (const row of reviewRows) {
    items.push({
      id: row.id,
      kind: "onboarding_reviewed",
      occurredAt: row.createdAt,
      title: "Onboarding reviewed",
      summary: "Trainer marked the trainee coaching ready.",
      sourceEntityType: "onboarding_review",
      sourceEntityId: row.id,
      status: row.outcome,
    });
  }

  for (const row of configRows) {
    if (!row.activatedAt) continue;
    items.push({
      id: row.id,
      kind: "configuration_activated",
      occurredAt: row.activatedAt,
      title: "Coaching configuration activated",
      summary: row.primaryGoal
        ? `Active expectations with goal: ${row.primaryGoal}.`
        : "Active coaching expectations are in effect.",
      sourceEntityType: "coaching_configuration",
      sourceEntityId: row.id,
      status: row.status,
    });
  }

  for (const row of planVersionRows) {
    const occurredAt =
      row.version.publishedAt ??
      row.version.effectiveFrom ??
      row.version.updatedAt;
    const statusLabel = humanize(row.version.status);
    items.push({
      id: row.version.id,
      kind: "plan_version",
      occurredAt,
      title: `Plan “${row.planTitle}” v${row.version.versionNumber} ${statusLabel}`,
      summary: `Plan version ${row.version.versionNumber} is ${statusLabel}${
        row.version.creationSource === "adjustment"
          ? " (adjustment)."
          : "."
      }`,
      sourceEntityType: "plan_version",
      sourceEntityId: row.version.id,
      status: row.version.status,
    });
  }

  for (const row of workoutRows) {
    const occurredAt =
      row.execution.completedAt ?? row.execution.startedAt;
    const statusLabel = humanize(row.execution.status);
    items.push({
      id: row.execution.id,
      kind: "workout_execution",
      occurredAt,
      title: `Workout ${statusLabel}`,
      summary: `${row.workoutDayName} on ${row.localDate} was ${statusLabel}.`,
      sourceEntityType: "workout_execution",
      sourceEntityId: row.execution.id,
      status: row.execution.status,
    });
  }

  for (const row of mealRows) {
    const statusLabel = humanize(row.compliance.outcome);
    const deviation = row.compliance.deviationKind
      ? ` (${humanize(row.compliance.deviationKind)})`
      : "";
    items.push({
      id: row.compliance.id,
      kind: "meal_compliance",
      occurredAt: row.compliance.loggedAt,
      title: `Meal ${statusLabel}`,
      summary: `${row.mealName} on ${row.localDate} was ${statusLabel}${deviation}.`,
      sourceEntityType: "meal_compliance",
      sourceEntityId: row.compliance.id,
      status: row.compliance.outcome,
    });
  }

  for (const row of checkinRows) {
    if (!row.submittedAt) continue;
    items.push({
      id: row.id,
      kind: "checkin_submitted",
      occurredAt: row.submittedAt,
      title: "Check-in submitted",
      summary: `Check-in for ${row.localDate} was submitted.`,
      sourceEntityType: "checkin",
      sourceEntityId: row.id,
      status: row.recordStatus,
    });
  }

  for (const row of checkinReviewRows) {
    items.push({
      id: row.id,
      kind: "checkin_reviewed",
      occurredAt: row.createdAt,
      title: "Check-in reviewed",
      summary: `Trainer recorded review outcome: ${humanize(row.outcome)}.`,
      sourceEntityType: "checkin_review",
      sourceEntityId: row.id,
      status: row.outcome,
    });
  }

  for (const row of measurementRows) {
    items.push({
      id: row.id,
      kind: "measurement",
      occurredAt: row.observedAt,
      title: `Measurement · ${humanize(row.type)}`,
      summary: `${row.value} ${row.unit} recorded (${humanize(row.source)}).`,
      sourceEntityType: "measurement",
      sourceEntityId: row.id,
      status: null,
    });
  }

  for (const row of progressEntryRows) {
    items.push({
      id: row.id,
      kind: "progress_entry",
      occurredAt: row.observedAt,
      title: row.title?.trim() || `Progress · ${humanize(row.entryType)}`,
      summary: row.body?.trim() || `Progress entry (${humanize(row.entryType)}).`,
      sourceEntityType: "progress_entry",
      sourceEntityId: row.id,
      status: row.entryType,
    });
  }

  for (const row of photoRows) {
    const occurredAt = row.uploadedAt ?? row.createdAt;
    items.push({
      id: row.id,
      kind: "progress_photo",
      occurredAt,
      title: "Progress photo uploaded",
      summary: "A progress photo is on file for this client.",
      sourceEntityType: "media_asset",
      sourceEntityId: row.id,
      status: row.status,
    });
  }

  for (const row of exceptionRows) {
    items.push({
      id: row.id,
      kind: "exception",
      occurredAt: row.detectedAt,
      title: `Exception · ${humanize(row.type)}`,
      summary: `${row.summary} (status: ${humanize(row.status)}).`,
      sourceEntityType: "exception",
      sourceEntityId: row.id,
      status: row.status,
    });
  }

  for (const row of noteRows) {
    const preview =
      row.body.length > 160 ? `${row.body.slice(0, 157)}…` : row.body;
    items.push({
      id: row.id,
      kind: "trainer_note",
      occurredAt: row.createdAt,
      title: "Trainer note",
      summary: preview,
      sourceEntityType: "trainer_note",
      sourceEntityId: row.id,
      status: null,
    });
  }

  for (const row of interventionRows) {
    items.push({
      id: row.id,
      kind: "intervention",
      occurredAt: row.createdAt,
      title: `Intervention · ${humanize(row.kind)}`,
      summary: row.summary,
      sourceEntityType: "intervention",
      sourceEntityId: row.id,
      status: row.kind,
    });
  }

  items.sort(compareHistoryItemsNewestFirst);

  const filtered = options.cursor
    ? items.filter((item) => isHistoryItemAfterCursor(item, options.cursor!))
    : items;

  return buildPage(filtered, options.limit, (item) => item.occurredAt);
}
