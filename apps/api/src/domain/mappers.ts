import type {
  Checkin,
  CheckinDraftAnswers,
  CheckinReview,
  CoachingConfiguration,
  CoachingRelationship,
  ExerciseExecution,
  Invitation,
  IntakeDefinition,
  IntakeFieldDefinition,
  IntakeSubmission,
  MealAssignment,
  MealCompliance,
  MealPhotoIntent,
  MealPrescription,
  OnboardingReview,
  OnboardingStatus,
  Plan,
  PlanContent,
  PlanVersion,
  PlanVersionSummary,
  SetExecution,
  TrainerNote,
  WorkoutAssignment,
  WorkoutDay,
  WorkoutExecution,
  WorkoutExecutionSummary,
  Exception,
  ExceptionAction,
  Intervention,
  ActiveExceptionSummary,
  Measurement,
  MediaAsset,
  ProgressEntry,
  PlanTemplate,
  PlanTemplateSummary,
  ExerciseLibraryItem,
  FoodLibraryItem,
} from "@fitbud/contracts";
import {
  deriveCheckinStatus,
  deriveMealAssignmentStatus,
  deriveWorkoutAssignmentStatus,
  onboardingStatusForInvitation,
  onboardingStatusForRelationship,
} from "@fitbud/core";
import type {
  checkinReviews,
  checkinSchedules,
  checkins,
  clientInvitations,
  coachingConfigurations,
  coachingRelationships,
  exerciseExecutions,
  intakeDefinitions,
  intakeSubmissions,
  mealAssignments,
  mealCompliance,
  mediaAssets,
  measurements,
  nutritionExpectations,
  onboardingReviews,
  plans,
  planVersions,
  progressEntries,
  setExecutions,
  trackingRequirements,
  trainerNotes,
  workoutAssignments,
  workoutExecutions,
  workoutExpectations,
  exceptionActions,
  exceptions,
  interventions,
  planTemplates,
  exerciseLibraryItems,
  foodLibraryItems,
} from "../db/schema";

type InvitationRow = typeof clientInvitations.$inferSelect;
type RelationshipRow = typeof coachingRelationships.$inferSelect;
type IntakeDefinitionRow = typeof intakeDefinitions.$inferSelect;
type IntakeSubmissionRow = typeof intakeSubmissions.$inferSelect;
type OnboardingReviewRow = typeof onboardingReviews.$inferSelect;
type ConfigurationRow = typeof coachingConfigurations.$inferSelect;
type WorkoutExpectationRow = typeof workoutExpectations.$inferSelect;
type NutritionExpectationRow = typeof nutritionExpectations.$inferSelect;
type CheckinScheduleRow = typeof checkinSchedules.$inferSelect;
type TrackingRequirementRow = typeof trackingRequirements.$inferSelect;
type PlanRow = typeof plans.$inferSelect;
type PlanVersionRow = typeof planVersions.$inferSelect;
type PlanTemplateRow = typeof planTemplates.$inferSelect;
type ExerciseLibraryItemRow = typeof exerciseLibraryItems.$inferSelect;
type FoodLibraryItemRow = typeof foodLibraryItems.$inferSelect;
type WorkoutAssignmentRow = typeof workoutAssignments.$inferSelect;
type WorkoutExecutionRow = typeof workoutExecutions.$inferSelect;
type ExerciseExecutionRow = typeof exerciseExecutions.$inferSelect;
type SetExecutionRow = typeof setExecutions.$inferSelect;
type MealAssignmentRow = typeof mealAssignments.$inferSelect;
type MealComplianceRow = typeof mealCompliance.$inferSelect;
type ExceptionRow = typeof exceptions.$inferSelect;
type ExceptionActionRow = typeof exceptionActions.$inferSelect;
type InterventionRow = typeof interventions.$inferSelect;
type CheckinRow = typeof checkins.$inferSelect;
type CheckinReviewRow = typeof checkinReviews.$inferSelect;
type TrainerNoteRow = typeof trainerNotes.$inferSelect;
type MediaAssetRow = typeof mediaAssets.$inferSelect;
type MeasurementRow = typeof measurements.$inferSelect;
type ProgressEntryRow = typeof progressEntries.$inferSelect;

export function mapInvitation(row: InvitationRow): Invitation {
  const onboardingStatus: OnboardingStatus =
    row.status === "pending"
      ? (onboardingStatusForInvitation(row.status) ?? "invited")
      : row.coachingRelationshipId
        ? "onboarding_pending"
        : "invited";

  return {
    id: row.id,
    trainerUserId: row.trainerUserId,
    recipientEmail: row.recipientEmail,
    recipientDisplayName: row.recipientDisplayName,
    recipientWhatsappE164: row.recipientWhatsappE164 ?? null,
    status: row.status,
    expiresAt: row.expiresAt,
    acceptedUserId: row.acceptedUserId,
    coachingRelationshipId: row.coachingRelationshipId,
    onboardingStatus:
      row.status === "accepted" ? "onboarding_pending" : onboardingStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapInvitationWithRelationshipStatus(
  row: InvitationRow,
  relationshipStatus: RelationshipRow["status"] | null,
): Invitation {
  const base = mapInvitation(row);
  if (relationshipStatus) {
    const derived = onboardingStatusForRelationship(relationshipStatus);
    if (derived) {
      return { ...base, onboardingStatus: derived };
    }
  }
  return base;
}

export function mapRelationship(row: RelationshipRow): CoachingRelationship {
  const derived = onboardingStatusForRelationship(row.status);
  return {
    id: row.id,
    trainerUserId: row.trainerUserId,
    traineeUserId: row.traineeUserId,
    status: row.status,
    onboardingStatus: derived ?? "onboarding_pending",
    invitationId: row.invitationId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapIntakeDefinition(row: IntakeDefinitionRow): IntakeDefinition {
  const parsed = JSON.parse(row.schemaJson) as {
    fields?: IntakeFieldDefinition[];
  };
  return {
    id: row.id,
    key: row.key,
    version: row.version,
    scope: row.scope,
    fields: parsed.fields ?? [],
    createdAt: row.createdAt,
  };
}

export function mapIntakeSubmission(row: IntakeSubmissionRow): IntakeSubmission {
  const answers = JSON.parse(row.answersJson) as Record<string, string>;
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    intakeDefinitionId: row.intakeDefinitionId,
    traineeUserId: row.traineeUserId,
    status: row.status,
    answers,
    version: row.version,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapOnboardingReview(row: OnboardingReviewRow): OnboardingReview {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    intakeSubmissionId: row.intakeSubmissionId,
    trainerUserId: row.trainerUserId,
    outcome: row.outcome,
    createdAt: row.createdAt,
  };
}

export function mapCoachingConfiguration(input: {
  configuration: ConfigurationRow;
  workout: WorkoutExpectationRow;
  nutrition: NutritionExpectationRow;
  checkin: CheckinScheduleRow;
  tracking: TrackingRequirementRow;
}): CoachingConfiguration {
  const { configuration, workout, nutrition, checkin, tracking } = input;
  return {
    id: configuration.id,
    coachingRelationshipId: configuration.coachingRelationshipId,
    status: configuration.status,
    version: configuration.version,
    primaryGoal: configuration.primaryGoal,
    notes: configuration.notes,
    workout: {
      sessionsPerWeek: workout.sessionsPerWeek,
      completionWindowHours: workout.completionWindowHours,
    },
    nutrition: {
      mealsPerDay: nutrition.mealsPerDay,
      confirmationWindowHours: nutrition.confirmationWindowHours,
      photoRequirement: nutrition.photoRequirement,
    },
    checkin: {
      cadence: checkin.cadence,
      dueWindowHours: checkin.dueWindowHours,
    },
    tracking: {
      requireBodyWeight: tracking.requireBodyWeight,
      requireProgressPhotos: tracking.requireProgressPhotos,
      requireSessionRpe: tracking.requireSessionRpe,
    },
    configuredAt: configuration.configuredAt,
    activatedAt: configuration.activatedAt,
    createdAt: configuration.createdAt,
    updatedAt: configuration.updatedAt,
  };
}

export function mapPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function parsePlanContentJson(contentJson: string): PlanContent {
  return JSON.parse(contentJson) as PlanContent;
}

export function mapPlanVersion(row: PlanVersionRow): PlanVersion {
  return {
    id: row.id,
    planId: row.planId,
    versionNumber: row.versionNumber,
    status: row.status,
    recordVersion: row.recordVersion,
    content: parsePlanContentJson(row.contentJson),
    creationSource: row.creationSource,
    publishedAt: row.publishedAt,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapPlanVersionSummary(row: PlanVersionRow): PlanVersionSummary {
  return {
    id: row.id,
    planId: row.planId,
    versionNumber: row.versionNumber,
    status: row.status,
    recordVersion: row.recordVersion,
    creationSource: row.creationSource,
    publishedAt: row.publishedAt,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapPlanTemplate(row: PlanTemplateRow): PlanTemplate {
  return {
    id: row.id,
    trainerUserId: row.trainerUserId,
    title: row.title,
    templateType: row.templateType,
    content: parsePlanContentJson(row.contentJson),
    recordVersion: row.recordVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapPlanTemplateSummary(
  row: PlanTemplateRow,
): PlanTemplateSummary {
  return {
    id: row.id,
    trainerUserId: row.trainerUserId,
    title: row.title,
    templateType: row.templateType,
    recordVersion: row.recordVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapExerciseLibraryItem(
  row: ExerciseLibraryItemRow,
): ExerciseLibraryItem {
  return {
    id: row.id,
    ownership: row.ownership,
    trainerUserId: row.trainerUserId,
    name: row.name,
    instructions: row.instructions,
    defaultLoadLabel: row.defaultLoadLabel,
    defaultReps: row.defaultReps,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapFoodLibraryItem(row: FoodLibraryItemRow): FoodLibraryItem {
  return {
    id: row.id,
    ownership: row.ownership,
    trainerUserId: row.trainerUserId,
    name: row.name,
    cuisineRegion: row.cuisineRegion,
    portionLabel: row.portionLabel,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function parseWorkoutDayJson(workoutDayJson: string): WorkoutDay {
  return JSON.parse(workoutDayJson) as WorkoutDay;
}

export function mapSetExecution(row: SetExecutionRow): SetExecution {
  return {
    id: row.id,
    exerciseExecutionId: row.exerciseExecutionId,
    setTargetId: row.setTargetId,
    order: row.order,
    status: row.status,
    prescribedReps: row.prescribedReps,
    prescribedLoadLabel: row.prescribedLoadLabel,
    actualReps: row.actualReps,
    actualLoadLabel: row.actualLoadLabel,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapExerciseExecution(
  row: ExerciseExecutionRow,
  sets: SetExecutionRow[],
): ExerciseExecution {
  return {
    id: row.id,
    workoutExecutionId: row.workoutExecutionId,
    exerciseId: row.exerciseId,
    name: row.name,
    order: row.order,
    status: row.status,
    sets: sets
      .filter((set) => set.exerciseExecutionId === row.id)
      .sort((a, b) => a.order - b.order)
      .map(mapSetExecution),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapWorkoutExecutionSummary(
  row: WorkoutExecutionRow,
): WorkoutExecutionSummary {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    coachingRelationshipId: row.coachingRelationshipId,
    planVersionId: row.planVersionId,
    traineeUserId: row.traineeUserId,
    status: row.status,
    recordVersion: row.recordVersion,
    startedAt: row.startedAt,
    pausedAt: row.pausedAt,
    completedAt: row.completedAt,
    sessionRpe: row.sessionRpe,
    requireSessionRpe: row.requireSessionRpe,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapWorkoutExecution(
  row: WorkoutExecutionRow,
  exercises: ExerciseExecutionRow[],
  sets: SetExecutionRow[],
): WorkoutExecution {
  return {
    ...mapWorkoutExecutionSummary(row),
    exercises: exercises
      .filter((exercise) => exercise.workoutExecutionId === row.id)
      .sort((a, b) => a.order - b.order)
      .map((exercise) => mapExerciseExecution(exercise, sets)),
  };
}

export function mapWorkoutAssignment(
  row: WorkoutAssignmentRow,
  execution: WorkoutExecutionRow | null,
  nowIso: string,
): WorkoutAssignment {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    planId: row.planId,
    planVersionId: row.planVersionId,
    workoutDayId: row.workoutDayId,
    workoutDayName: row.workoutDayName,
    localDate: row.localDate,
    windowStartsAt: row.windowStartsAt,
    windowEndsAt: row.windowEndsAt,
    status: deriveWorkoutAssignmentStatus({
      nowIso,
      windowEndsAt: row.windowEndsAt,
      executionStatus: execution?.status ?? null,
    }),
    workoutDay: parseWorkoutDayJson(row.workoutDayJson),
    execution: execution ? mapWorkoutExecutionSummary(execution) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function parseMealPrescriptionJson(
  mealPrescriptionJson: string,
): MealPrescription {
  return JSON.parse(mealPrescriptionJson) as MealPrescription;
}

export function parseMealPhotoIntentJson(
  photoIntentJson: string | null,
): MealPhotoIntent | null {
  if (!photoIntentJson) return null;
  return JSON.parse(photoIntentJson) as MealPhotoIntent;
}

export function mapMealCompliance(row: MealComplianceRow): MealCompliance {
  const photoIntent = parseMealPhotoIntentJson(row.photoIntentJson);
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    coachingRelationshipId: row.coachingRelationshipId,
    planVersionId: row.planVersionId,
    traineeUserId: row.traineeUserId,
    outcome: row.outcome,
    recordVersion: row.recordVersion,
    loggedAt: row.loggedAt,
    deviationKind: row.deviationKind,
    notes: row.notes,
    photoRequired: row.photoRequired,
    photoIntent:
      photoIntent ??
      (row.mediaAssetId
        ? {
            notedAt: row.loggedAt,
            mediaAssetId: row.mediaAssetId,
          }
        : null),
    mediaAssetId: row.mediaAssetId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapMealAssignment(
  row: MealAssignmentRow,
  compliance: MealComplianceRow | null,
  nowIso: string,
): MealAssignment {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    planId: row.planId,
    planVersionId: row.planVersionId,
    mealPrescriptionId: row.mealPrescriptionId,
    mealName: row.mealName,
    localDate: row.localDate,
    windowStartsAt: row.windowStartsAt,
    windowEndsAt: row.windowEndsAt,
    photoRequired: row.photoRequired,
    status: deriveMealAssignmentStatus({
      nowIso,
      windowEndsAt: row.windowEndsAt,
      complianceOutcome: compliance?.outcome ?? null,
      loggedAt: compliance?.loggedAt ?? null,
    }),
    prescription: parseMealPrescriptionJson(row.mealPrescriptionJson),
    compliance: compliance ? mapMealCompliance(compliance) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function parseCheckinAnswersJson(
  answersJson: string | null,
): CheckinDraftAnswers | null {
  if (!answersJson) return null;
  return JSON.parse(answersJson) as CheckinDraftAnswers;
}

export function mapCheckinReview(row: CheckinReviewRow): CheckinReview {
  return {
    id: row.id,
    checkinId: row.checkinId,
    coachingRelationshipId: row.coachingRelationshipId,
    trainerUserId: row.trainerUserId,
    outcome: row.outcome,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapCheckin(
  row: CheckinRow,
  review: CheckinReviewRow | null,
  nowIso: string,
): Checkin {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    checkinScheduleId: row.checkinScheduleId,
    localDate: row.localDate,
    windowStartsAt: row.windowStartsAt,
    windowEndsAt: row.windowEndsAt,
    recordStatus: row.recordStatus,
    recordVersion: row.recordVersion,
    definitionVersion: row.definitionVersion,
    answers: parseCheckinAnswersJson(row.answersJson),
    submittedAt: row.submittedAt,
    status: deriveCheckinStatus({
      nowIso,
      windowStartsAt: row.windowStartsAt,
      windowEndsAt: row.windowEndsAt,
      recordStatus: row.recordStatus,
      hasReview: Boolean(review),
    }),
    review: review ? mapCheckinReview(review) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapTrainerNote(row: TrainerNoteRow): TrainerNote {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    trainerUserId: row.trainerUserId,
    checkinId: row.checkinId,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseExceptionDetailsJson(
  detailsJson: string | null,
): Record<string, unknown> | null {
  if (!detailsJson) return null;
  return JSON.parse(detailsJson) as Record<string, unknown>;
}

export function mapException(row: ExceptionRow): Exception {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    type: row.type,
    status: row.status,
    ruleVersion: row.ruleVersion,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    summary: row.summary,
    details: parseExceptionDetailsJson(row.detailsJson),
    detectedAt: row.detectedAt,
    activatedAt: row.activatedAt,
    acknowledgedAt: row.acknowledgedAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapExceptionAction(row: ExceptionActionRow): ExceptionAction {
  return {
    id: row.id,
    exceptionId: row.exceptionId,
    trainerUserId: row.trainerUserId,
    action: row.action,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export function mapIntervention(row: InterventionRow): Intervention {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    trainerUserId: row.trainerUserId,
    exceptionId: row.exceptionId,
    checkinId: row.checkinId,
    kind: row.kind,
    summary: row.summary,
    resultingPlanVersionId: row.resultingPlanVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapActiveExceptionSummary(
  row: ExceptionRow,
): ActiveExceptionSummary {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    summary: row.summary,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    detectedAt: row.detectedAt,
  };
}

/** Public media metadata only — object keys are never returned. */
export function mapMediaAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    uploaderUserId: row.uploaderUserId,
    mediaType: row.mediaType,
    status: row.status,
    contentType: row.contentType,
    byteSize: row.byteSize,
    originalFilename: row.originalFilename,
    domainEntityType: row.domainEntityType,
    domainEntityId: row.domainEntityId,
    recordVersion: row.recordVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    uploadedAt: row.uploadedAt,
  };
}

export function mapMeasurement(row: MeasurementRow): Measurement {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    traineeUserId: row.traineeUserId,
    type: row.type,
    value: row.value,
    unit: row.unit,
    observedAt: row.observedAt,
    source: row.source,
    checkinId: row.checkinId,
    mediaAssetId: row.mediaAssetId,
    recordVersion: row.recordVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapProgressEntry(row: ProgressEntryRow): ProgressEntry {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    traineeUserId: row.traineeUserId,
    entryType: row.entryType,
    title: row.title,
    body: row.body,
    observedAt: row.observedAt,
    mediaAssetId: row.mediaAssetId,
    recordVersion: row.recordVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function mapDeviceToken(row: {
  id: string;
  userId: string;
  platform: "ios" | "android" | "web";
  provider: "fcm";
  status: "active" | "revoked";
  token: string;
  installationId: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform,
    provider: row.provider,
    status: row.status,
    token: row.token,
    installationId: row.installationId,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapNotificationPreferences(row: {
  userId: string;
  pushEnabled: boolean;
  workoutReminder: boolean;
  mealReminder: boolean;
  checkinReminder: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  updatedAt: string;
}) {
  return {
    userId: row.userId,
    pushEnabled: row.pushEnabled,
    categories: {
      workoutReminder: row.workoutReminder,
      mealReminder: row.mealReminder,
      checkinReminder: row.checkinReminder,
    },
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    updatedAt: row.updatedAt,
  };
}

export function mapReminderRule(row: {
  id: string;
  coachingRelationshipId: string;
  reminderType: "workout_reminder" | "meal_reminder" | "checkin_reminder";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    reminderType: row.reminderType,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapNotification(row: {
  id: string;
  recipientUserId: string;
  coachingRelationshipId: string | null;
  notificationType: "workout_reminder" | "meal_reminder" | "checkin_reminder";
  domainEntityType: "workout_assignment" | "meal_assignment" | "checkin";
  domainEntityId: string;
  state:
    | "pending"
    | "queued"
    | "delivered"
    | "read"
    | "failed"
    | "suppressed";
  dedupeKey: string;
  createdAt: string;
  readAt: string | null;
}) {
  return {
    id: row.id,
    recipientUserId: row.recipientUserId,
    coachingRelationshipId: row.coachingRelationshipId,
    type: row.notificationType,
    notificationType: row.notificationType,
    domainEntityType: row.domainEntityType,
    domainEntityId: row.domainEntityId,
    state: row.state,
    dedupeKey: row.dedupeKey,
    createdAt: row.createdAt,
    readAt: row.readAt,
    routing: {
      notificationId: row.id,
      notificationType: row.notificationType,
      domainEntityType: row.domainEntityType,
      domainEntityId: row.domainEntityId,
      createdAt: row.createdAt,
    },
  };
}
