import { describe, expect, it } from "vitest";
import {
  deriveRenewalState,
  isSubscriptionRenewalReminderEligible,
  subscriptionRenewalDedupeKey,
} from "./subscription.js";

describe("subscription renewal state", () => {
  it("classifies the trainer-local renewal date", () => {
    expect(
      deriveRenewalState({ today: "2026-10-01", renewsOn: "2026-10-09" }),
    ).toBe("current");
    expect(
      deriveRenewalState({ today: "2026-10-01", renewsOn: "2026-10-08" }),
    ).toBe("upcoming");
    expect(
      deriveRenewalState({ today: "2026-10-01", renewsOn: "2026-10-02" }),
    ).toBe("upcoming");
    expect(
      deriveRenewalState({ today: "2026-10-01", renewsOn: "2026-10-01" }),
    ).toBe("due");
    expect(
      deriveRenewalState({ today: "2026-10-01", renewsOn: "2026-09-30" }),
    ).toBe("expired");
  });

  it("reminds only for upcoming, due, and expired states", () => {
    expect(isSubscriptionRenewalReminderEligible("current")).toBe(false);
    expect(isSubscriptionRenewalReminderEligible("upcoming")).toBe(true);
    expect(isSubscriptionRenewalReminderEligible("due")).toBe(true);
    expect(isSubscriptionRenewalReminderEligible("expired")).toBe(true);
  });

  it("includes relationship, renewal date, and state in the dedupe key", () => {
    expect(
      subscriptionRenewalDedupeKey({
        relationshipId: "rel-1",
        renewsOn: "2026-10-08",
        renewalState: "upcoming",
      }),
    ).toBe("subscription_renewal_reminder:rel-1:2026-10-08:upcoming");
  });
});