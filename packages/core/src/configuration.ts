import type {
  CoachingConfigurationStatus,
  CoachingRelationshipStatus,
} from "@fitbud/contracts";

/** Configuration is only editable for coaching-ready relationships. */
export function canEditCoachingConfiguration(
  relationshipStatus: CoachingRelationshipStatus,
): boolean {
  return relationshipStatus === "coaching_ready";
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
