import { describe, expect, it } from "vitest";
import {
  coachingWeekNumber,
  heightFromAnswers,
  intakeRows,
  isOnboardingIncomplete,
  limitationBlock,
  onboardingChipLabel,
  onboardingSteps,
  onboardingWaitingCopy,
} from "./infoModel";

describe("client info / onboarding model", () => {
  it("flags incomplete onboarding statuses", () => {
    expect(isOnboardingIncomplete("onboarding_pending")).toBe(true);
    expect(isOnboardingIncomplete("onboarding_submitted")).toBe(true);
    expect(isOnboardingIncomplete("coaching_ready")).toBe(false);
  });

  it("builds waiting copy and steps", () => {
    const copy = onboardingWaitingCopy({
      firstName: "Vikram",
      status: "onboarding_pending",
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      possessive: "his",
      subject: "He",
    });
    expect(copy.title).toMatch(/Waiting for Vikram/);
    expect(copy.body).toMatch(/intake form/);
    expect(onboardingSteps({ status: "onboarding_pending", hasPlan: false })).toEqual([
      { id: "invite", label: "Accepted invite", done: true },
      { id: "intake", label: "Intake form", done: false },
      { id: "plan", label: "Plan assigned (on web)", done: false },
    ]);
    expect(onboardingChipLabel("onboarding_pending")).toBe("Intake not sent");
  });

  it("reads limitations and height from intake answers", () => {
    expect(
      limitationBlock({
        limitations: "Left knee: no deep lunges.",
      })?.body,
    ).toMatch(/Left knee/);
    expect(limitationBlock({ limitations: "None" })).toBeNull();
    expect(heightFromAnswers({ height: "175" })).toBe("175 cm");
    expect(
      intakeRows({
        diet: "Vegetarian · eats eggs",
        schedule: "Gym, 3 days a week",
      }),
    ).toHaveLength(2);
  });

  it("computes coaching week", () => {
    expect(
      coachingWeekNumber(
        "2026-10-01T00:00:00.000Z",
        Date.parse("2026-11-12T00:00:00.000Z"),
      ),
    ).toBe(7);
  });
});
