import type {
  CoachingConfigurationStatus,
  OnboardingStatus,
} from "@fitbud/contracts";
import { isPastOnboardingReview } from "./onboarding.js";

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

/** Whether a primary goal string is acceptable for configure/activate. */
export function hasPrimaryGoal(primaryGoal: string | null | undefined): boolean {
  return typeof primaryGoal === "string" && primaryGoal.trim().length > 0;
}
