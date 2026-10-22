import { describe, expect, it } from "vitest";
import {
  clipInclusiveLocalRange,
  consistencyFingerprint,
  mealsOnDates,
  nextCalendarWeekRange,
  nextSevenDayRange,
  planConsistencyWarnings,
  resolveAssignmentWindow,
  supersedeFromLocalDate,
  workoutSchedulesMatch,
  workoutSessionsOnDates,
} from "./schedule.js";
import { weekdayFromLocalDate } from "./workout.js";

describe("assignment windows", () => {
  it("starts next 7 days on today and does not describe plan expiry", () => {
    expect(nextSevenDayRange("2026-10-10")).toEqual({
      fromDate: "2026-10-10",
      toDate: "2026-10-16",
    });
  });

  it("uses the Monday–Sunday whose Monday is strictly after today", () => {
    expect(weekdayFromLocalDate("2026-10-10")).toBe(6);
    expect(nextCalendarWeekRange("2026-10-10")).toEqual({
      fromDate: "2026-10-12",
      toDate: "2026-10-18",
    });
    expect(weekdayFromLocalDate("2026-10-12")).toBe(1);
    expect(nextCalendarWeekRange("2026-10-12")).toEqual({
      fromDate: "2026-10-19",
      toDate: "2026-10-25",
    });
    expect(nextCalendarWeekRange("2026-10-11")).toEqual({
      fromDate: "2026-10-12",
      toDate: "2026-10-18",
    });
  });

  it("keeps a custom range inclusive", () => {
    expect(
      resolveAssignmentWindow({
        window: "custom",
        today: "2026-10-10",
        fromDate: "2026-10-12",
        toDate: "2026-10-12",
      }),
    ).toEqual({
      ok: true,
      range: { fromDate: "2026-10-12", toDate: "2026-10-12" },
    });
  });

  it("clips a horizon to the plan interval without extending it", () => {
    expect(
      clipInclusiveLocalRange(
        { fromDate: "2026-10-10", toDate: "2026-10-16" },
        { fromDate: "2026-10-12", toDate: "2026-10-14" },
      ),
    ).toEqual({ fromDate: "2026-10-12", toDate: "2026-10-14" });
    expect(
      clipInclusiveLocalRange(
        { fromDate: "2026-10-01", toDate: "2026-10-02" },
        { fromDate: "2026-10-10", toDate: null },
      ),
    ).toBeNull();
  });
});

describe("stored weekday calendars", () => {
  it("places workout sessions only on stored weekdays", () => {
    const placed = workoutSessionsOnDates(
      [
        { id: "mon", weekday: 1 },
        { id: "wed", weekday: 3 },
        { id: "legacy", weekday: null },
      ],
      ["2026-10-12", "2026-10-13", "2026-10-14"],
    );
    expect(placed.map((item) => [item.localDate, item.day.id])).toEqual([
      ["2026-10-12", "mon"],
      ["2026-10-14", "wed"],
    ]);
  });

  it("treats a weekday with no session as a rest day", () => {
    const placed = workoutSessionsOnDates(
      [{ id: "mon", weekday: 1 }],
      ["2026-10-13"],
    );
    expect(placed).toEqual([]);
  });

  it("places two sessions that share a weekday", () => {
    const placed = workoutSessionsOnDates(
      [
        { id: "am", weekday: 1 },
        { id: "pm", weekday: 1 },
      ],
      ["2026-10-12"],
    );
    expect(placed.map((item) => item.day.id)).toEqual(["am", "pm"]);
  });

  it("ignores scheduleHint and uses applicable weekdays, type, label, and time as separate fields", () => {
    const placed = mealsOnDates(
      [
        {
          id: "breakfast",
          mealType: "breakfast",
          label: "Meal 1",
          localTime: "07:30",
          scheduleHint: "every day",
          applicableWeekdays: [1, 3, 5],
        },
        {
          id: "legacy",
          scheduleHint: "Morning",
          applicableWeekdays: [],
        },
      ],
      ["2026-10-12", "2026-10-13"],
    );
    expect(placed.map((item) => [item.localDate, item.meal.id])).toEqual([
      ["2026-10-12", "breakfast"],
    ]);
  });
});

describe("replacement scope", () => {
  it("supersedes today onward from the later of today and the effective local date", () => {
    expect(
      supersedeFromLocalDate({
        scope: "today_onward",
        today: "2026-10-10",
        effectiveLocalDate: "2026-10-10",
      }),
    ).toEqual({ fromDate: "2026-10-10", toDate: null });
  });

  it("limits today only to the trainee's today", () => {
    expect(
      supersedeFromLocalDate({
        scope: "today_only",
        today: "2026-10-10",
        effectiveLocalDate: "2026-10-01",
      }),
    ).toEqual({ fromDate: "2026-10-10", toDate: "2026-10-10" });
  });
});

describe("configuration consistency", () => {
  it("warns when weekday sessions or meal slots disagree with configuration", () => {
    const warnings = planConsistencyWarnings({
      sessionsPerWeek: 3,
      mealsPerDay: 3,
      workoutDays: [{ weekday: 1 }],
      mealPrescriptions: [
        { applicableWeekdays: [1, 2, 3, 4, 5] },
        { applicableWeekdays: [1, 2, 3, 4, 5] },
      ],
    });
    expect(warnings.map((warning) => warning.code)).toEqual([
      "workout_sessions",
      "meal_slots",
    ]);
    for (const warning of warnings) {
      expect(warning.message).toContain("Adjust the plan");
      expect(warning.message).toContain("adjust the configuration");
      expect(warning.message).toContain("acknowledge the difference");
    }
    expect(consistencyFingerprint(warnings)).toBe(
      "meal_slots:3:2|workout_sessions:3:1",
    );
  });

  it("stays quiet when the stored calendar matches the expectations", () => {
    expect(
      planConsistencyWarnings({
        sessionsPerWeek: 2,
        mealsPerDay: 1,
        workoutDays: [{ weekday: 1 }, { weekday: 4 }],
        mealPrescriptions: [{ applicableWeekdays: [1, 3] }],
      }),
    ).toEqual([]);
  });

  it("treats a deep-copied workout plan as unchanged", () => {
    const source = [
      {
        weekday: 1 as number | null,
        name: "Lower",
        exercises: [
          {
            name: "Squat",
            instructions: "Brace",
            setTargets: [{ order: 1, reps: 5, loadLabel: "60kg", rpe: 7 }],
          },
        ],
      },
    ];
    expect(
      workoutSchedulesMatch(source, [
        {
          weekday: 1,
          name: "Lower",
          exercises: [
            {
              name: "Squat",
              instructions: "Brace",
              setTargets: [{ order: 1, reps: 5, loadLabel: "60kg", rpe: 7 }],
            },
          ],
        },
      ]),
    ).toBe(true);
    expect(
      workoutSchedulesMatch(source, [{ ...source[0]!, weekday: 2 }]),
    ).toBe(false);
  });
});
