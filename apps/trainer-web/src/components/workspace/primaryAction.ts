import type { Checkin, OnboardingStatus } from "@fitbud/contracts";

export type WorkspacePrimaryAction = {
  label: string;
  to: string;
  kind:
    | "review_intake"
    | "configure"
    | "review_checkin"
    | "review_exception"
    | "adjust_plan"
    | "reactivate";
};

export function primaryActionFor(input: {
  relationshipId: string;
  onboardingStatus: OnboardingStatus;
  configurationActive: boolean;
  reviewCheckin: Checkin | null;
  openExceptionId: string | null;
  ended: boolean;
  reactivationPending?: boolean;
}): WorkspacePrimaryAction | null {
  const rid = input.relationshipId;
  if (input.ended) {
    if (input.reactivationPending) return null;
    return {
      kind: "reactivate",
      label: "Reactivate coaching",
      to: `#reactivate-${rid}`,
    };
  }
  if (input.onboardingStatus === "onboarding_submitted") {
    return {
      kind: "review_intake",
      label: "Review intake",
      to: `/clients/${rid}/onboarding`,
    };
  }
  if (input.onboardingStatus === "coaching_ready" && !input.configurationActive) {
    return {
      kind: "configure",
      label: "Set up coaching",
      to: `/clients/${rid}/configure`,
    };
  }
  if (input.reviewCheckin?.status === "submitted") {
    return {
      kind: "review_checkin",
      label: "Review check-in",
      to: `/clients/${rid}/check-ins/${input.reviewCheckin.id}`,
    };
  }
  if (input.openExceptionId) {
    return {
      kind: "review_exception",
      label: "Review issue",
      to: `/?exception=${input.openExceptionId}`,
    };
  }
  if (
    input.onboardingStatus === "active" ||
    input.onboardingStatus === "coaching_ready"
  ) {
    return {
      kind: "adjust_plan",
      label: "Adjust plan",
      to: `/clients/${rid}/plan`,
    };
  }
  return null;
}
