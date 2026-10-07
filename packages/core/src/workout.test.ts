import { describe, expect, it } from "vitest";
import {
  deriveWorkoutAssignmentStatus,
  resolveCompletedWorkoutStatus,
  sessionWeekdaysForFrequency,
  setCompletionIsModified,
  workoutWindowForLocalDate,
} from "./index.js";

describe("workout domain", () => {
  it("derives missed after the window without qualifying execution", () => {
    expect(
      deriveWorkoutAssignmentStatus({
        nowIso: "2026-09-27T12:00:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        executionStatus: null,
      }),
    ).toBe("missed");
  });

  it("keeps assigned inside the window", () => {
    expect(
      deriveWorkoutAssignmentStatus({
        nowIso: "2026-09-26T10:00:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        executionStatus: null,
      }),
    ).toBe("assigned");
  });

  it("maps open and terminal execution statuses", () => {
    expect(
      deriveWorkoutAssignmentStatus({
        nowIso: "2026-09-27T12:00:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        executionStatus: "completed",
      }),
    ).toBe("completed");
    expect(
      deriveWorkoutAssignmentStatus({
        nowIso: "2026-09-26T10:00:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        executionStatus: "paused",
      }),
    ).toBe("paused");
  });

  it("marks set completion modified when values differ", () => {
    expect(
      setCompletionIsModified({
        prescribedReps: 5,
        prescribedLoadLabel: "60kg",
        actualReps: 5,
        actualLoadLabel: "60kg",
      }),
    ).toBe(false);
    expect(
      setCompletionIsModified({
        prescribedReps: 5,
        prescribedLoadLabel: "60kg",
        actualReps: 4,
        actualLoadLabel: "60kg",
      }),
    ).toBe(true);
  });

  it("resolves session outcome from set statuses", () => {
    expect(resolveCompletedWorkoutStatus(["completed", "completed"])).toBe(
      "completed",
    );
    expect(resolveCompletedWorkoutStatus(["completed", "skipped"])).toBe(
      "modified",
    );
  });

  it("builds Asia/Kolkata windows from local dates", () => {
    const window = workoutWindowForLocalDate({
      localDate: "2026-09-26",
      timeZone: "Asia/Kolkata",
      completionWindowHours: 24,
    });
    expect(window.windowStartsAt).toBe("2026-09-25T18:30:00.000Z");
    expect(window.windowEndsAt).toBe("2026-09-26T18:30:00.000Z");
  });

  it("selects weekday patterns for sessions per week", () => {
    expect(sessionWeekdaysForFrequency(3)).toEqual([1, 3, 5]);
  });
});
