import type {
  CoachingRelationshipStatus,
  InvitationStatus,
  OnboardingStatus,
} from "@fitbud/contracts";

/** Derive user-visible onboarding status for a pending invitation. */
export function onboardingStatusForInvitation(
  status: InvitationStatus,
): OnboardingStatus | null {
  if (status === "pending") {
    return "invited";
  }
  return null;
}

/** Map relationship lifecycle to user-visible onboarding status. */
export function onboardingStatusForRelationship(
  status: CoachingRelationshipStatus,
): OnboardingStatus | null {
  switch (status) {
    case "onboarding_pending":
      return "onboarding_pending";
    case "onboarding_submitted":
      return "onboarding_submitted";
    case "coaching_ready":
      return "coaching_ready";
    case "ended":
      return null;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Whether a relationship may accept a draft intake save. */
export function canSaveIntakeDraft(
  status: CoachingRelationshipStatus,
): boolean {
  return status === "onboarding_pending";
}

/** Whether a relationship may submit intake. */
export function canSubmitIntake(status: CoachingRelationshipStatus): boolean {
  return status === "onboarding_pending";
}

/** Whether a trainer may mark coaching ready from this relationship status. */
export function canMarkCoachingReady(
  status: CoachingRelationshipStatus,
): boolean {
  return status === "onboarding_submitted";
}

/**
 * Validate required intake answers against field definitions.
 * Returns missing field ids (empty when valid).
 */
export function missingRequiredIntakeFields(
  fields: ReadonlyArray<{ id: string; required: boolean }>,
  answers: Record<string, string>,
): string[] {
  return fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = answers[field.id];
      return typeof value !== "string" || value.trim().length === 0;
    })
    .map((field) => field.id);
}
