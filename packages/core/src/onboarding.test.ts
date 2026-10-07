import { describe, expect, it } from "vitest";
import {
  canMarkCoachingReady,
  canSaveIntakeDraft,
  canSubmitIntake,
  missingRequiredIntakeFields,
  onboardingStatusForInvitation,
  onboardingStatusForRelationship,
} from "./onboarding.js";

describe("onboarding transitions", () => {
  it("maps invitation and relationship statuses", () => {
    expect(onboardingStatusForInvitation("pending")).toBe("invited");
    expect(onboardingStatusForInvitation("accepted")).toBeNull();
    expect(onboardingStatusForRelationship("onboarding_pending")).toBe(
      "onboarding_pending",
    );
    expect(onboardingStatusForRelationship("onboarding_submitted")).toBe(
      "onboarding_submitted",
    );
    expect(onboardingStatusForRelationship("coaching_ready")).toBe(
      "coaching_ready",
    );
    expect(onboardingStatusForRelationship("ended")).toBeNull();
  });

  it("gates draft, submit, and coaching-ready actions", () => {
    expect(canSaveIntakeDraft("onboarding_pending")).toBe(true);
    expect(canSaveIntakeDraft("onboarding_submitted")).toBe(false);
    expect(canSubmitIntake("onboarding_pending")).toBe(true);
    expect(canSubmitIntake("coaching_ready")).toBe(false);
    expect(canMarkCoachingReady("onboarding_submitted")).toBe(true);
    expect(canMarkCoachingReady("onboarding_pending")).toBe(false);
  });

  it("reports missing required intake fields", () => {
    const fields = [
      { id: "goals", required: true },
      { id: "schedule", required: true },
      { id: "preferences", required: false },
    ];
    expect(
      missingRequiredIntakeFields(fields, {
        goals: "Build strength",
        schedule: "  ",
      }),
    ).toEqual(["schedule"]);
    expect(
      missingRequiredIntakeFields(fields, {
        goals: "Build strength",
        schedule: "Evenings",
      }),
    ).toEqual([]);
  });
});
