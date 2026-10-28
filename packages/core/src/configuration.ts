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
  checkin: { cadence: "weekly", dueWindowHours: 48, formVersionId: null },
  tracking: {
    requireBodyWeight: false,
    requireProgressPhotos: false,
    requireSessionRpe: false,
  },
};

/** Required Activate sections (D12 / D17). */
export const CONFIGURATION_SECTION_IDS = [
  "goal",
  "expectations",
  "checkins",
  "tracking",
] as const;
export type ConfigurationSectionId = (typeof CONFIGURATION_SECTION_IDS)[number];

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

/** Stored rows may still use the legacy configured value until Activate/Save changes. */
type StoredCoachingConfigurationStatus = CoachingConfigurationStatus | "configured";

/** Draft save is allowed before activation (draft or legacy configured). */
export function canSaveConfigurationDraft(
  status: StoredCoachingConfigurationStatus | null,
): boolean {
  return status === null || status === "draft" || status === "configured";
}

/**
 * @deprecated Configure is a no-op. Kept for older clients that still call it.
 */
export function canMarkConfigurationConfigured(
  status: StoredCoachingConfigurationStatus,
): boolean {
  return status === "draft" || status === "configured";
}

/** Draft (or legacy configured) → Active. */
export function canActivateConfiguration(
  status: StoredCoachingConfigurationStatus,
): boolean {
  return status === "draft" || status === "configured";
}

/** Whether a short goal is acceptable for activate. */
export function hasGoalShort(goalShort: string | null | undefined): boolean {
  return typeof goalShort === "string" && goalShort.trim().length > 0;
}

function hasValidWorkout(workout: WorkoutExpectations | null | undefined): boolean {
  return (
    !!workout &&
    Number.isInteger(workout.sessionsPerWeek) &&
    workout.sessionsPerWeek >= 1 &&
    workout.sessionsPerWeek <= 14 &&
    Number.isInteger(workout.completionWindowHours) &&
    workout.completionWindowHours >= 1 &&
    workout.completionWindowHours <= 72
  );
}

function hasValidNutrition(
  nutrition: NutritionExpectations | null | undefined,
): boolean {
  return (
    !!nutrition &&
    Number.isInteger(nutrition.mealsPerDay) &&
    nutrition.mealsPerDay >= 1 &&
    nutrition.mealsPerDay <= 8 &&
    Number.isInteger(nutrition.confirmationWindowHours) &&
    nutrition.confirmationWindowHours >= 1 &&
    nutrition.confirmationWindowHours <= 48 &&
    (nutrition.photoRequirement === "none" ||
      nutrition.photoRequirement === "selected_meals" ||
      nutrition.photoRequirement === "all_meals")
  );
}

function hasValidCheckin(
  checkin: CheckinScheduleExpectations | null | undefined,
): boolean {
  return (
    !!checkin &&
    (checkin.cadence === "weekly" ||
      checkin.cadence === "biweekly" ||
      checkin.cadence === "monthly") &&
    Number.isInteger(checkin.dueWindowHours) &&
    checkin.dueWindowHours >= 1 &&
    checkin.dueWindowHours <= 168
  );
}

function hasValidTracking(
  tracking: TrackingRequirements | null | undefined,
): boolean {
  return (
    !!tracking &&
    typeof tracking.requireBodyWeight === "boolean" &&
    typeof tracking.requireProgressPhotos === "boolean" &&
    typeof tracking.requireSessionRpe === "boolean"
  );
}

/** Sections still required before Activate (matches GET missingSections). */
export function missingConfigurationSections(input: {
  goalShort: string | null | undefined;
  workout: WorkoutExpectations | null | undefined;
  nutrition: NutritionExpectations | null | undefined;
  checkin: CheckinScheduleExpectations | null | undefined;
  tracking: TrackingRequirements | null | undefined;
}): ConfigurationSectionId[] {
  const missing: ConfigurationSectionId[] = [];
  if (!hasGoalShort(input.goalShort)) {
    missing.push("goal");
  }
  if (!hasValidWorkout(input.workout) || !hasValidNutrition(input.nutrition)) {
    missing.push("expectations");
  }
  if (!hasValidCheckin(input.checkin)) {
    missing.push("checkins");
  }
  if (!hasValidTracking(input.tracking)) {
    missing.push("tracking");
  }
  return missing;
}
