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
  latestOnboardingFormVersion,
  missingRequiredOnboardingFields,
  onboardingAnswerErrors,
  parseOnboardingFormFields,
  resolveOnboardingForm,
  type ClientOnboardingFacts,
  type OnboardingAnswerField,
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
  sessionWeekdaysForFrequency,
  setCompletionIsModified,
  weekdayFromLocalDate,
} from "./workout.js";

export {
  canRecordMealCompliance,
  deriveMealAssignmentStatus,
  isTerminalMealCompliance,
  mealPhotoIntentSatisfied,
  resolveMealPhotoRequired,
} from "./meal.js";

export {
  MVP_EXCEPTION_RULE_VERSION,
  canAcknowledgeException,
  canActivateException,
  canResolveException,
  exceptionKey,
  filterNewExceptionCandidates,
  isOpenExceptionStatus,
  missedWorkoutCandidate,
  overdueCheckinCandidate,
  overdueMealCandidate,
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
