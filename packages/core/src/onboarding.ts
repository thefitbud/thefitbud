import type { OnboardingStatus } from "@fitbud/contracts";

export type ClientOnboardingFacts = {
  /** Null when the invitation has not created a coaching relationship. */
  relationshipStatus: "active" | "ended" | null;
  invitationPending: boolean;
  hasSubmittedResponse: boolean;
  hasCoachingReadyReview: boolean;
  hasActiveConfiguration: boolean;
};

/**
 * Derived client lifecycle. Relationship rows only store active or ended.
 * invited → onboarding_pending → onboarding_submitted → coaching_ready → active → ended
 */
export function deriveClientOnboardingStatus(
  facts: ClientOnboardingFacts,
): OnboardingStatus | null {
  if (facts.relationshipStatus === null) {
    return facts.invitationPending ? "invited" : null;
  }
  if (facts.relationshipStatus === "ended") {
    return "ended";
  }
  if (!facts.hasSubmittedResponse) {
    return "onboarding_pending";
  }
  if (!facts.hasCoachingReadyReview) {
    return "onboarding_submitted";
  }
  if (!facts.hasActiveConfiguration) {
    return "coaching_ready";
  }
  return "active";
}

/** Draft saves are allowed only before a response is submitted. */
export function canSaveOnboardingDraft(status: OnboardingStatus): boolean {
  return status === "onboarding_pending";
}

/** Submit is allowed only from the pending onboarding state. */
export function canSubmitOnboarding(status: OnboardingStatus): boolean {
  return status === "onboarding_pending";
}

/** A trainer may record coaching-ready review only after submission. */
export function canMarkCoachingReady(status: OnboardingStatus): boolean {
  return status === "onboarding_submitted";
}

/** Reviewed clients and clients with an active configuration are past onboarding. */
export function isPastOnboardingReview(status: OnboardingStatus): boolean {
  return status === "coaching_ready" || status === "active";
}

export type OnboardingFormCandidate = {
  id: string;
  scope: "global" | "trainer";
  trainerUserId: string | null;
  version: number;
};

/**
 * Highest trainer-scoped version for this trainer, otherwise the highest global version.
 * The seeded global key is data, not the resolution rule.
 */
export function resolveOnboardingForm<T extends OnboardingFormCandidate>(
  forms: readonly T[],
  trainerUserId: string,
): T | null {
  const trainerForms = forms.filter(
    (form) => form.scope === "trainer" && form.trainerUserId === trainerUserId,
  );
  const pool =
    trainerForms.length > 0
      ? trainerForms
      : forms.filter(
          (form) => form.scope === "global" && form.trainerUserId == null,
        );
  if (pool.length === 0) {
    return null;
  }
  return pool.reduce((best, form) => (form.version > best.version ? form : best));
}

/**
 * Validate required onboarding answers against field definitions.
 * Returns missing field ids (empty when valid).
 */
export function missingRequiredOnboardingFields(
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
