import type { RenewalState } from "@fitbud/contracts";

/** MVP upcoming window: renewal is upcoming for 1–7 days ahead in the trainer timezone. */
export const RENEWAL_UPCOMING_WINDOW_DAYS = 7;

/** Whole civil days from today until renewsOn. Negative when the date has passed. */
export function daysUntilLocalDate(today: string, target: string): number {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = target.split("-").map(Number);
  const start = Date.UTC(y1!, m1! - 1, d1!);
  const end = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((end - start) / 86_400_000);
}

export function deriveRenewalState(input: {
  today: string;
  renewsOn: string;
}): RenewalState {
  const days = daysUntilLocalDate(input.today, input.renewsOn);
  if (days < 0) return "expired";
  if (days === 0) return "due";
  if (days <= RENEWAL_UPCOMING_WINDOW_DAYS) return "upcoming";
  return "current";
}

export function isSubscriptionRenewalReminderEligible(
  state: RenewalState,
): boolean {
  return state === "upcoming" || state === "due" || state === "expired";
}

/** One reminder per relationship, renewal date, and derived state. */
export function subscriptionRenewalDedupeKey(input: {
  relationshipId: string;
  renewsOn: string;
  renewalState: RenewalState;
}): string {
  return `subscription_renewal_reminder:${input.relationshipId}:${input.renewsOn}:${input.renewalState}`;
}
