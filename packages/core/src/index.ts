export {
  isRolePermittedOnSurface,
  resolveSelectedRole,
  rolesAllowedForSurface,
} from "./roles.js";

export {
  canMarkCoachingReady,
  canSaveOnboardingDraft,
  canSubmitOnboarding,
  deriveClientOnboardingStatus,
  isPastOnboardingReview,
  canTrainerReadOnboardingTemplate,
  formatOnboardingAnswer,
  isBlankOnboardingAnswer,
  latestOnboardingFormVersion,
  missingRequiredOnboardingFields,
  onboardingAnswerErrors,
  parseOnboardingFormFields,
  resolveOnboardingForm,
  type ClientOnboardingFacts,
  type OnboardingAnswerField,
  type OnboardingAnswerValue,
  type OnboardingFormCandidate,
  type OnboardingTemplateVersionCandidate,
} from "./onboarding.js";

export {
  canActivateConfiguration,
  canCreateConfigurationVersion,
  canEditCoachingConfiguration,
  canMarkConfigurationConfigured,
  canSaveConfigurationDraft,
  hasGoalShort,
} from "./configuration.js";

export {
  RENEWAL_UPCOMING_WINDOW_DAYS,
  daysUntilLocalDate,
  deriveRenewalState,
  isSubscriptionRenewalReminderEligible,
  subscriptionRenewalDedupeKey,
} from "./subscription.js";

export {
  canEditPlanVersion,
  canPromoteScheduledPlanVersion,
  canPublishPlanVersion,
  isImmutablePlanVersion,
} from "./plan.js";

export {
  copyPlanContent,
  copyPlanContentWithNewIds,
  exercisePrescriptionFromLibrary,
  inferPlanTemplateType,
  inferTemplateType,
  mealPrescriptionFromLibrary,
  planContentMatchesTemplateType,
} from "./template.js";

export {
  LibraryPrescriptionError,
  aggregateNutrients,
  calculateServingNutrients,
  displayNutrients,
  foodSnapshotFromLibrary,
  formatScaledQuantity,
  librarySourceIds,
  materializeFoodSnapshot,
  materializePlanContent,
  scaleNutrient,
  type DisplayNutrients,
} from "./nutrition.js";

export {
  checkinWindowForLocalDate,
  formatLocalDate,
  localDateTimeToUtcIso,
  mealWindowForLocalDate,
  workoutWindowForLocalDate,
} from "./timezone.js";

export {
  MVP_CHECKIN_DEFINITION_VERSION,
  canRecordCheckinReview,
  canSaveCheckinDraft,
  canSubmitCheckin,
  daysForCheckinCadence,
  deriveCheckinStatus,
  missingRequiredCheckinAnswers,
  nextCheckinLocalDate,
} from "./checkin.js";

export {
  addDaysToLocalDate,
  canCompleteWorkoutExecution,
  canMutateOpenWorkoutExecution,
  canPauseWorkoutExecution,
  canResumeWorkoutExecution,
  canSkipAssignedWorkout,
  canSkipOpenWorkoutExecution,
  canStartWorkoutAssignment,
  compareLocalDates,
  deriveWorkoutAssignmentStatus,
  eachLocalDateInclusive,
  isOpenWorkoutExecution,
  isQualifyingWorkoutExecution,
  resolveCompletedWorkoutStatus,
  setCompletionIsModified,
  weekdayFromLocalDate,
} from "./workout.js";

export {
  clipInclusiveLocalRange,
  consistencyFingerprint,
  localDatesInRange,
  mealsOnDates,
  nextCalendarWeekRange,
  nextSevenDayRange,
  planConsistencyWarnings,
  resolveAssignmentWindow,
  supersedeFromLocalDate,
  workoutScheduleSignature,
  workoutSchedulesMatch,
  workoutSessionsOnDates,
  type AssignmentWindowMode,
  type ConsistencyWarning,
  type ConsistencyWarningCode,
  type DietAdjustmentScope,
  type LocalDateRange,
} from "./schedule.js";

export {
  canRecordMealCompliance,
  deriveMealAssignmentStatus,
  isTerminalMealCompliance,
  mealPhotoIntentSatisfied,
  resolveMealPhotoRequired,
} from "./meal.js";

export {
  ADHERENCE_EXCEPTION_SEVERITIES,
  ADHERENCE_OPEN_EXCEPTION_STATUSES,
  MVP_EXCEPTION_RULE_VERSION,
  canAcknowledgeException,
  canActivateException,
  canResolveException,
  exceptionCountsTowardNeedsAttention,
  exceptionKey,
  filterNewExceptionCandidates,
  isOpenExceptionStatus,
  mealActivitySeverity,
  mealAdherenceCandidate,
  mealDeviationCandidate,
  mealLoggedLaterCandidate,
  missedWorkoutCandidate,
  overdueCheckinCandidate,
  overdueMealCandidate,
  skippedMealCandidate,
  skippedWorkoutCandidate,
  workoutActivitySeverity,
  workoutAdherenceCandidate,
  type ActivitySeverity,
  type ExceptionCandidate,
} from "./exception.js";

export {
  ALLOWED_MEDIA_CONTENT_TYPES,
  defaultUnitForMeasurementType,
  isAllowedMediaContentType,
  type AllowedMediaContentType,
} from "./progress.js";

export {
  compareHistoryItemsNewestFirst,
  isHistoryItemAfterCursor,
} from "./history.js";

export {
  OFFLINE_MUTATION_OPERATIONS,
  SYNC_CONFLICT_RULES,
  conflictRuleForEntity,
  isDuplicateMutationDelivery,
  shouldAdvanceSyncCursor,
  type OutboxMutationStatus,
} from "./sync.js";

export {
  DEFAULT_REMINDER_TYPES,
  buildSafePushPayload,
  domainEntityTypeForReminder,
  isCategoryEnabled,
  isCheckinReminderEligible,
  isMealReminderEligible,
  isWithinQuietHours,
  isWorkoutReminderEligible,
  localTimeHhMm,
  pushPayloadContainsSensitiveKeys,
  pushPayloadHasOnlySafeKeys,
  reminderDedupeKey,
  routeTargetFromPushPayload,
} from "./reminder.js";

export {
  entityTypeForRealtimeChange,
  entityTypeForRealtimeEvent,
  isAuthorizedRealtimeChannel,
} from "./realtime.js";

export { normalizeWhatsappE164, whatsappHref } from "./whatsapp.js";

export {
  ADHERENCE_WINDOW_DAYS,
  adherenceWindowStart,
  deriveAdherenceState,
  isQualifyingAdherenceObservation,
  isWithinAdherenceWindow,
  type AdherenceObservationKind,
} from "./adherence.js";

export { deriveAge } from "./profile.js";
