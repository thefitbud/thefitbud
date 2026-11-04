/**
 * The trainee's day (QT6): `GET /me/day/:date`, `/me/week` and a seeded workout.
 *
 * The QA personas have rest days (Wed, Fri, Sun in the sample week), so "no workout
 * today" is a valid state and is never a failure. Dated values are read from the seed
 * run's own expectations and only when they describe today (see `expectations.ts`).
 */
import { meDayResponseSchema, weekReadModelSchema, workoutAssignmentSchema } from "@fitbud/contracts";
import { describe, expect, it } from "vitest";
import { todaysExpectations } from "./expectations.js";
import { getData, localToday, run, send, stable } from "./helpers.js";
import { sessionFor, smokeHttp } from "./run-context.js";

const http = smokeHttp();

describe("GET /me/day/:date", () => {
  it.for(["ontrack", "slipping"] as const)("%s: today's day parses and matches the seed", async (key, t) => {
    const session = sessionFor(t, key);
    const today = await localToday(http, session);
    const day = await getData(http, session, `/me/day/${today}`, meDayResponseSchema);
    expect(day.date).toBe(today);
    expect(day.assignments.workouts.length).toBeLessThanOrEqual(stable.guarantees.workoutAssignmentsTodayMax);
    expect(day.assignments.meals.length).toBeGreaterThanOrEqual(stable.guarantees.mealAssignmentsTodayMin);

    const expected = todaysExpectations(run, key, today);
    if (expected) {
      // A rest day has no workout: null is a valid expectation, not a failure.
      expect(day.assignments.workouts.length).toBe(expected.workoutName === null ? 0 : 1);
      expect(day.assignments.meals.length).toBe(expected.mealNames.length);
      // Other suites may log more later in the night, never fewer than the seed.
      expect(day.logs.meals).toBeGreaterThanOrEqual(expected.loggedMealCount);
    }
  });

  it("a day with no assignments is an empty day, not an error", async (t) => {
    const session = sessionFor(t, "ontrack");
    const day = await getData(http, session, "/me/day/2000-01-01", meDayResponseSchema);
    expect(day.assignments.workouts).toEqual([]);
    expect(day.assignments.meals).toEqual([]);
  });
});

describe("GET /me/week", () => {
  /**
   * Parses the real read model (CU23, D-W3b-25). Before CU23 the route
   * answered seven hardcoded `state: "future"` days in a shape this schema
   * rejects, so both halves of this test are new ground: that the response
   * satisfies `weekReadModelSchema` at all, and that a day in the past has a
   * state derived from what the trainee was assigned and did.
   *
   * The assertion is "no past day is `future`" rather than naming one
   * completed day, because the week response alone cannot identify which past
   * day carries a completed execution — and `future` behind today is exactly
   * what the hardcoded handler returned for all seven days, so this is the
   * invariant that fails if the route ever regresses to it.
   */
  it("returns seven days that include today, with no past day left in future", async (t) => {
    const session = sessionFor(t, "ontrack");
    const today = await localToday(http, session);
    const week = await getData(http, session, "/me/week", weekReadModelSchema);
    expect(week.days.length).toBe(7);
    expect(week.days.map((d) => d.date)).toContain(today);
    const pastDays = week.days.filter((d) => d.date < today);
    for (const day of pastDays) {
      expect(day.state).not.toBe("future");
    }
    // Today is the trainee's own civil date, not UTC's: the old handler
    // derived it with `new Date().toISOString().slice(0, 10)`.
    expect(week.todayNutrition.date).toBe(today);
    // The week's planned meal slots include today's, which the seed
    // guarantees — so the counts come from rows, not from a constant.
    expect(week.meals.assigned).toBeGreaterThanOrEqual(
      stable.guarantees.mealAssignmentsTodayMin,
    );
  });

  it("rejects a malformed ?start= rather than answering nonsense dates", async (t) => {
    const session = sessionFor(t, "ontrack");
    for (const start of ["2026-11", "2026-02-30", "garbage"]) {
      const response = await send(http, session, "GET", `/me/week?start=${start}`);
      expect(response.status, start).toBe(400);
    }
  });
});

describe("the seeded loggable workout", () => {
  it.for(["slipping", "ontrack"] as const)("%s: the assignment exists and is readable", async (key, t) => {
    const loggable = run?.accounts[key]?.loggableWorkout;
    if (!loggable) t.skip("No per-run expectations on this machine (apps/api/.qa-seed/expectations.json).");
    const session = sessionFor(t, key);
    // The on-track persona logs promptly, so its loggable workout can be months old.
    // The date is read from the file and never assumed to be today.
    const assignment = await getData(
      http,
      session,
      `/workouts/assignments/${loggable!.assignmentId}`,
      workoutAssignmentSchema,
    );
    expect(assignment.id).toBe(loggable!.assignmentId);
    expect(assignment.localDate).toBe(loggable!.localDate);
    expect(assignment.workoutDayName).toBe(loggable!.workoutName);
  });
});
