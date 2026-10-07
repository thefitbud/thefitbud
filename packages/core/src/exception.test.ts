import { describe, expect, it } from "vitest";
import {
  canAcknowledgeException,
  canActivateException,
  canResolveException,
  exceptionKey,
  filterNewExceptionCandidates,
  isOpenExceptionStatus,
  missedWorkoutCandidate,
  overdueCheckinCandidate,
  overdueMealCandidate,
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
    expect(missed.sourceEntityType).toBe("workout_assignment");

    const meal = overdueMealCandidate({
      assignmentId: "22222222-2222-4222-8222-222222222222",
      localDate: "2026-09-26",
      mealName: "Breakfast",
      windowEndsAt: "2026-09-26T10:00:00.000Z",
    });
    expect(meal.type).toBe("overdue_meal");

    const checkin = overdueCheckinCandidate({
      checkinId: "33333333-3333-4333-8333-333333333333",
      localDate: "2026-09-26",
      windowEndsAt: "2026-09-27T18:00:00.000Z",
    });
    expect(checkin.type).toBe("overdue_checkin");
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
