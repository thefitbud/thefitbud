import { describe, expect, it } from "vitest";
import {
  canAcknowledgeException,
  canActivateException,
  canResolveException,
  exceptionCountsTowardNeedsAttention,
  exceptionKey,
  filterNewExceptionCandidates,
  isOpenExceptionStatus,
  mealActivitySeverity,
  mealAdherenceCandidate,
  missedWorkoutCandidate,
  overdueCheckinCandidate,
  overdueMealCandidate,
  workoutActivitySeverity,
  workoutAdherenceCandidate,
} from "./exception.js";

describe("exception lifecycle", () => {
  it("allows Detected → Active → Acknowledged → Resolved transitions", () => {
    expect(canActivateException("detected")).toBe(true);
    expect(canActivateException("active")).toBe(false);
    expect(canAcknowledgeException("detected")).toBe(true);
    expect(canAcknowledgeException("active")).toBe(true);
    expect(canAcknowledgeException("acknowledged")).toBe(false);
    expect(canResolveException("acknowledged")).toBe(true);
    expect(canResolveException("active")).toBe(false);
    expect(isOpenExceptionStatus("resolved")).toBe(false);
  });

  it("builds deterministic candidates from derived signals", () => {
    const missed = missedWorkoutCandidate({
      assignmentId: "11111111-1111-4111-8111-111111111111",
      localDate: "2026-09-26",
      windowEndsAt: "2026-09-26T18:00:00.000Z",
    });
    expect(missed.type).toBe("missed_workout");
    expect(missed.severity).toBe("critical");
    expect(missed.sourceEntityType).toBe("workout_assignment");

    const meal = overdueMealCandidate({
      assignmentId: "22222222-2222-4222-8222-222222222222",
      localDate: "2026-09-26",
      mealName: "Breakfast",
      windowEndsAt: "2026-09-26T10:00:00.000Z",
    });
    expect(meal.type).toBe("overdue_meal");
    expect(meal.severity).toBe("critical");

    const checkin = overdueCheckinCandidate({
      checkinId: "33333333-3333-4333-8333-333333333333",
      localDate: "2026-09-26",
      windowEndsAt: "2026-09-27T18:00:00.000Z",
    });
    expect(checkin.type).toBe("overdue_checkin");
    expect(checkin.severity).toBe("attention");
  });

  it("keeps acknowledged critical and attention exceptions in the roll-up open set", () => {
    expect(isOpenExceptionStatus("acknowledged")).toBe(true);
    expect(isOpenExceptionStatus("resolved")).toBe(false);
    for (const severity of ["critical", "attention"] as const) {
      for (const status of ["detected", "active", "acknowledged"] as const) {
        expect(exceptionCountsTowardNeedsAttention({ status, severity })).toBe(
          true,
        );
      }
      expect(
        exceptionCountsTowardNeedsAttention({ status: "resolved", severity }),
      ).toBe(false);
    }
  });

  it("assigns the locked workout and meal severities without a score", () => {
    const base = {
      assignmentId: "11111111-1111-4111-8111-111111111111",
      localDate: "2026-09-26",
      windowEndsAt: "2026-09-26T18:00:00.000Z",
    };

    expect(
      workoutActivitySeverity({
        ...base,
        nowIso: "2026-09-26T19:00:00.000Z",
        executionStatus: null,
      }),
    ).toBe("critical");
    expect(
      workoutAdherenceCandidate({
        ...base,
        nowIso: "2026-09-26T19:00:00.000Z",
        executionStatus: null,
      })?.type,
    ).toBe("missed_workout");

    expect(
      workoutActivitySeverity({
        ...base,
        nowIso: "2026-09-26T12:00:00.000Z",
        executionStatus: "skipped",
      }),
    ).toBe("attention");
    expect(
      workoutAdherenceCandidate({
        ...base,
        nowIso: "2026-09-26T12:00:00.000Z",
        executionStatus: "skipped",
      })?.type,
    ).toBe("skipped_workout");

    for (const executionStatus of ["completed", "modified", "started", "paused"] as const) {
      expect(
        workoutAdherenceCandidate({
          ...base,
          nowIso: "2026-09-26T19:00:00.000Z",
          executionStatus,
        }),
      ).toBeNull();
    }

    const meal = {
      ...base,
      mealName: "Breakfast",
    };
    const unlogged = mealAdherenceCandidate({
      ...meal,
      nowIso: "2026-09-26T19:00:00.000Z",
      complianceOutcome: null,
      loggedAt: null,
      deviationKind: null,
    });
    expect(unlogged?.type).toBe("overdue_meal");
    expect(unlogged?.severity).toBe("critical");
    expect(
      mealAdherenceCandidate({
        ...meal,
        nowIso: "2026-09-26T12:00:00.000Z",
        complianceOutcome: null,
        loggedAt: null,
        deviationKind: null,
      }),
    ).toBeNull();

    const skipped = mealAdherenceCandidate({
      ...meal,
      nowIso: "2026-09-26T19:00:00.000Z",
      complianceOutcome: "skipped",
      loggedAt: "2026-09-26T20:00:00.000Z",
      deviationKind: null,
    });
    expect(skipped?.type).toBe("skipped_meal");
    expect(skipped?.severity).toBe("critical");
    expect(skipped?.details).toMatchObject({ loggedLater: true });

    expect(
      mealActivitySeverity({
        ...meal,
        nowIso: "2026-09-26T12:00:00.000Z",
        complianceOutcome: "modified",
        loggedAt: "2026-09-26T12:00:00.000Z",
        deviationKind: "restaurant",
      }),
    ).toBe("attention");
    expect(
      mealAdherenceCandidate({
        ...meal,
        nowIso: "2026-09-26T19:00:00.000Z",
        complianceOutcome: "confirmed",
        loggedAt: "2026-09-26T20:00:00.000Z",
        deviationKind: null,
      })?.type,
    ).toBe("meal_logged_later");
    expect(
      mealAdherenceCandidate({
        ...meal,
        nowIso: "2026-09-26T12:00:00.000Z",
        complianceOutcome: "confirmed",
        loggedAt: "2026-09-26T12:00:00.000Z",
        deviationKind: null,
      }),
    ).toBeNull();
  });

  it("dedupes open exceptions by type and source", () => {
    const candidate = missedWorkoutCandidate({
      assignmentId: "11111111-1111-4111-8111-111111111111",
      localDate: "2026-09-26",
      windowEndsAt: "2026-09-26T18:00:00.000Z",
    });
    const key = exceptionKey(candidate);
    expect(
      filterNewExceptionCandidates([candidate], new Set([key])),
    ).toEqual([]);
    expect(filterNewExceptionCandidates([candidate], new Set())).toEqual([
      candidate,
    ]);
  });
});
