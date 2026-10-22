import { describe, expect, it } from "vitest";
import {
  adherenceWindowStart,
  deriveAdherenceState,
  isQualifyingAdherenceObservation,
} from "./adherence.js";
import { deriveAge } from "./profile.js";

describe("deriveAdherenceState", () => {
  it("uses open exception, then missing activity, then on track for active clients", () => {
    expect(
      deriveAdherenceState({
        onboardingStatus: "active",
        hasOpenAdherenceException: true,
        hasQualifyingActivity: true,
      }),
    ).toBe("needs_attention");
    expect(
      deriveAdherenceState({
        onboardingStatus: "active",
        hasOpenAdherenceException: false,
        hasQualifyingActivity: false,
      }),
    ).toBe("no_recent_data");
    expect(
      deriveAdherenceState({
        onboardingStatus: "active",
        hasOpenAdherenceException: false,
        hasQualifyingActivity: true,
      }),
    ).toBe("on_track");
  });

  it("is not available before active coaching and after the relationship ends", () => {
    for (const onboardingStatus of [
      "invited",
      "onboarding_pending",
      "onboarding_submitted",
      "coaching_ready",
      "ended",
    ] as const) {
      expect(
        deriveAdherenceState({
          onboardingStatus,
          hasOpenAdherenceException: true,
          hasQualifyingActivity: true,
        }),
      ).toBe("not_available");
    }
  });
});

describe("qualifying adherence activity", () => {
  const today = "2026-10-07";

  it("covers the trailing 14 civil dates including today", () => {
    expect(adherenceWindowStart(today)).toBe("2026-09-24");
    expect(
      isQualifyingAdherenceObservation({
        kind: "checkin",
        status: "submitted",
        localDate: "2026-09-24",
        today,
      }),
    ).toBe(true);
    expect(
      isQualifyingAdherenceObservation({
        kind: "checkin",
        status: "submitted",
        localDate: "2026-09-23",
        today,
      }),
    ).toBe(false);
  });

  it("counts completed, modified, and skipped workouts only", () => {
    for (const status of ["completed", "modified", "skipped"]) {
      expect(
        isQualifyingAdherenceObservation({
          kind: "workout_execution",
          status,
          localDate: today,
          today,
        }),
      ).toBe(true);
    }
    expect(
      isQualifyingAdherenceObservation({
        kind: "workout_execution",
        status: "started",
        localDate: today,
        today,
      }),
    ).toBe(false);
    expect(
      isQualifyingAdherenceObservation({
        kind: "workout_execution",
        status: "paused",
        localDate: today,
        today,
      }),
    ).toBe(false);
  });

  it("counts a meal-compliance row and only a submitted check-in", () => {
    expect(
      isQualifyingAdherenceObservation({
        kind: "meal_compliance",
        status: "confirmed",
        localDate: today,
        today,
      }),
    ).toBe(true);
    expect(
      isQualifyingAdherenceObservation({
        kind: "checkin",
        status: "submitted",
        localDate: today,
        today,
      }),
    ).toBe(true);
    expect(
      isQualifyingAdherenceObservation({
        kind: "checkin",
        status: "draft",
        localDate: today,
        today,
      }),
    ).toBe(false);
  });
});

describe("deriveAge", () => {
  it("returns completed years and rejects a future birth date", () => {
    expect(deriveAge("1990-05-15", "2026-10-07")).toBe(36);
    expect(deriveAge("1990-10-08", "2026-10-07")).toBe(35);
    expect(deriveAge("2026-10-08", "2026-10-07")).toBeNull();
    expect(deriveAge("1899-01-01", "2026-10-07")).toBeNull();
    expect(deriveAge(null, "2026-10-07")).toBeNull();
  });
});
