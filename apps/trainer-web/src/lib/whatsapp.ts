import type { OnboardingStatus } from "@fitbud/contracts";
import { whatsappHref } from "@fitbud/core";

export { whatsappHref };

export function whatsappDraftForClient(input: {
  name: string;
  onboardingStatus?: OnboardingStatus | null;
  inviteToken?: string | null;
}): string {
  const given = input.name.trim().split(/\s+/)[0] || "there";
  if (input.inviteToken) {
    return `Hi ${given}, here's your FitBud invite code: ${input.inviteToken}. Open the trainee app and enter it to start onboarding.`;
  }
  if (input.onboardingStatus === "invited") {
    return `Hi ${given}, please accept your FitBud invitation so we can start onboarding.`;
  }
  if (input.onboardingStatus === "onboarding_pending") {
    return `Hi ${given}, please complete your FitBud onboarding form so I can set up your coaching.`;
  }
  return `Hi ${given}`;
}

export function clientWhatsappHref(input: {
  phoneE164: string | null | undefined;
  name: string;
  onboardingStatus?: OnboardingStatus | null;
  inviteToken?: string | null;
}): string | null {
  if (!input.phoneE164) return null;
  return whatsappHref({
    phoneE164: input.phoneE164,
    draftText: whatsappDraftForClient(input),
  });
}
