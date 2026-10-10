import type {
  CheckinScheduleExpectations,
  CoachingConfigurationStatus,
  NutritionExpectations,
  OnboardingStatus,
  TrackingRequirements,
  WorkoutExpectations,
} from "@fitbud/contracts";
import { isPastOnboardingReview } from "./onboarding.js";

/**
 * Defaults previously hardcoded on the trainer web configuration form.
 * Applied when a draft is created and a section is omitted.
 */
export const COACHING_CONFIGURATION_DEFAULTS: {
  workout: WorkoutExpectations;
  nutrition: NutritionExpectations;
  checkin: CheckinScheduleExpectations;
  tracking: TrackingRequirements;
} = {
  workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
  nutrition: {
    mealsPerDay: 3,
    confirmationWindowHours: 6,
    photoRequirement: "none",
  },
  checkin: { cadence: "weekly", dueWindowHours: 48 },
  tracking: {
    requireBodyWeight: false,
    requireProgressPhotos: false,
    requireSessionRpe: false,
  },
};

export function resolveConfigurationDraftExpectations(input: {
  workout?: WorkoutExpectations;
  nutrition?: NutritionExpectations;
  checkin?: CheckinScheduleExpectations;
  tracking?: TrackingRequirements;
  existing?: {
    workout: WorkoutExpectations;
    nutrition: NutritionExpectations;
    checkin: CheckinScheduleExpectations;
    tracking: TrackingRequirements;
  } | null;
}): {
  workout: WorkoutExpectations;
  nutrition: NutritionExpectations;
  checkin: CheckinScheduleExpectations;
  tracking: TrackingRequirements;
} {
  const defaults = COACHING_CONFIGURATION_DEFAULTS;
  const existing = input.existing ?? null;
  return {
    workout: input.workout ?? existing?.workout ?? { ...defaults.workout },
    nutrition: input.nutrition ?? existing?.nutrition ?? { ...defaults.nutrition },
    checkin: input.checkin ?? existing?.checkin ?? { ...defaults.checkin },
    tracking: input.tracking ?? existing?.tracking ?? { ...defaults.tracking },
  };
}

/** Configuration editing requires a reviewed client or an active configuration. */
export function canEditCoachingConfiguration(
  onboardingStatus: OnboardingStatus,
): boolean {
  return isPastOnboardingReview(onboardingStatus);
}

/** A new version may be opened only from the active row, with no open draft. */
export function canCreateConfigurationVersion(input: {
  hasActive: boolean;
  hasOpen: boolean;
}): boolean {
  return input.hasActive && !input.hasOpen;
}

/** Draft save is allowed before activation (draft or configured). */
export function canSaveConfigurationDraft(
  status: CoachingConfigurationStatus | null,
): boolean {
  return status === null || status === "draft" || status === "configured";
}

/** Draft → Configured when expectations are present. */
export function canMarkConfigurationConfigured(
  status: CoachingConfigurationStatus,
): boolean {
  return status === "draft";
}

/** Configured → Active. */
export function canActivateConfiguration(
  status: CoachingConfigurationStatus,
): boolean {
  return status === "configured";
}

/** Whether a short goal is acceptable for configure/activate. */
export function hasGoalShort(goalShort: string | null | undefined): boolean {
  return typeof goalShort === "string" && goalShort.trim().length > 0;
}
