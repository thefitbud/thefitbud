import { describe, expect, it } from "vitest";
import {
  exercisePrescription,
  isWorkoutDone,
  planWeekLabel,
  weekWorkoutSummary,
  withFinishedExecution,
  workoutHeroState,
  type WorkoutHeroKind,
} from "./workoutHeroState";

const TODAY = "2026-11-14"; // a Saturday
const YESTERDAY = "2026-11-13";
const TOMORROW = "2026-11-15";

type Status =
  | "assigned"
  | "in_progress"
  | "paused"
  | "completed"
  | "modified"
  | "skipped"
  | "missed";

function day(
  localDate: string,
  status: Status,
  execution: null | {
    status: "started" | "paused" | "completed" | "modified" | "skipped";
    loggedByRole?: "trainee" | "coach";
  } = null,
) {
  return {
    localDate,
    status,
    execution: execution
      ? { loggedByRole: "trainee" as const, lastEditedByRole: null, ...execution }
      : null,
  };
}

describe("workoutHeroState: one state for Workout and Today (Z12-44)", () => {
  // The six statuses the spec names, plus skipped and coach-logged. Both tabs
  // call this one function, so a row here is what both tabs show.
  const table: Array<{
    name: string;
    input: ReturnType<typeof day> | null;
    kind: WorkoutHeroKind;
    action: ReturnType<typeof workoutHeroState>["action"];
  }> = [
    { name: "not started today", input: day(TODAY, "assigned"), kind: "not_started", action: "start" },
    { name: "in progress", input: day(TODAY, "in_progress", { status: "started" }), kind: "in_progress", action: "continue" },
    { name: "paused", input: day(TODAY, "paused", { status: "paused" }), kind: "in_progress", action: "continue" },
    { name: "done", input: day(TODAY, "completed", { status: "completed" }), kind: "done", action: "view_summary" },
    { name: "done with changes", input: day(TODAY, "modified", { status: "modified" }), kind: "done", action: "view_summary" },
    { name: "missed", input: day(YESTERDAY, "missed"), kind: "missed", action: "log_late" },
    { name: "rest (no workout)", input: null, kind: "rest", action: null },
    { name: "future (Z12-39's rule)", input: day(TOMORROW, "assigned"), kind: "future", action: null },
    { name: "skipped", input: day(TODAY, "skipped", { status: "skipped" }), kind: "skipped", action: null },
    {
      name: "coach-logged",
      input: day(TODAY, "completed", { status: "completed", loggedByRole: "coach" }),
      kind: "coach_logged",
      action: "view_workout",
    },
  ];

  for (const row of table) {
    it(`${row.name} → ${row.kind}`, () => {
      const state = workoutHeroState(row.input, TODAY);
      expect(state.kind).toBe(row.kind);
      expect(state.action).toBe(row.action);
    });
  }

  it("never offers Start or Continue on a done day whose list status lags (ISSUE-MAP #4)", () => {
    for (const lagging of ["assigned", "in_progress", "paused"] as const) {
      const state = workoutHeroState(
        day(TODAY, lagging, { status: "completed" }),
        TODAY,
      );
      expect(state.kind).toBe("done");
      expect(state.action).toBe("view_summary");
    }
  });

  it("says paused only for a paused session", () => {
    expect(workoutHeroState(day(TODAY, "paused", { status: "paused" }), TODAY).paused).toBe(true);
    expect(workoutHeroState(day(TODAY, "in_progress", { status: "started" }), TODAY).paused).toBe(false);
    expect(workoutHeroState(day(TODAY, "assigned"), TODAY).paused).toBe(false);
  });

  it("reads a past day still marked assigned as missed (late log), never as startable today", () => {
    expect(workoutHeroState(day(YESTERDAY, "assigned"), TODAY).kind).toBe("missed");
  });

  it("never reads a past optional workout that was not done as missed (as the banner)", () => {
    for (const status of ["assigned", "missed"] as const) {
      const state = workoutHeroState(
        { ...day(YESTERDAY, status), workoutDay: { required: false } },
        TODAY,
      );
      expect(state.kind).toBe("optional_past");
      expect(state.action).toBeNull();
    }
    // Done, it is done like any other; today it can still be started.
    expect(
      workoutHeroState(
        { ...day(YESTERDAY, "completed", { status: "completed" }), workoutDay: { required: false } },
        TODAY,
      ).kind,
    ).toBe("done");
    expect(
      workoutHeroState({ ...day(TODAY, "assigned"), workoutDay: { required: false } }, TODAY).action,
    ).toBe("start");
  });

  it("keeps a session started on a past day continuable", () => {
    expect(
      workoutHeroState(day(YESTERDAY, "in_progress", { status: "started" }), TODAY).kind,
    ).toBe("in_progress");
  });

  it("previews a future day even if it was started elsewhere", () => {
    expect(
      workoutHeroState(day(TOMORROW, "in_progress", { status: "started" }), TODAY).kind,
    ).toBe("future");
  });
});

describe("week dots and count from one source (ISSUE-MAP #10)", () => {
  const assignment = (
    id: string,
    localDate: string,
    status: Status,
    required = true,
  ) => ({
    id,
    localDate,
    status,
    execution: null,
    workoutDay: { required },
  });
  const weekStart = "2026-11-09"; // Monday

  it("counts the just-finished workout from a list loaded before the finish", () => {
    const stale = [
      assignment("a", "2026-11-09", "completed"),
      assignment("b", "2026-11-11", "completed"),
      assignment("c", "2026-11-14", "in_progress"),
    ];
    // The bug: the summary rendered these dots, two ticks beside "3 of 3".
    const before = weekWorkoutSummary(stale, weekStart);
    expect(before.completed).toBe(2);

    const patched = withFinishedExecution(stale, { id: "x", assignmentId: "c" });
    const after = weekWorkoutSummary(patched, weekStart);
    expect(after.completed).toBe(3);
    expect(after.total).toBe(3);
    expect(after.days.filter((d) => d.done)).toHaveLength(after.completed);
  });

  it("marks only the finished assignment of the week done, not the others", () => {
    const week = [
      assignment("a", "2026-11-09", "in_progress"),
      assignment("b", "2026-11-12", "assigned"),
      assignment("c", "2026-11-14", "in_progress"),
    ];
    const patched = withFinishedExecution(week, { id: "x", assignmentId: "b" });
    expect(patched.map((item) => item.status)).toEqual([
      "in_progress",
      "completed",
      "in_progress",
    ]);
    // What the card reads: View summary on the finished day only.
    expect(
      patched.map((item) => workoutHeroState(item, "2026-11-14").action),
    ).toEqual(["continue", "view_summary", "continue"]);
    // The input list is not mutated.
    expect(week[1]!.status).toBe("assigned");
  });

  it("leaves the list untouched when nothing needs patching", () => {
    const list = [assignment("a", "2026-11-09", "completed")];
    expect(withFinishedExecution(list, { id: "x", assignmentId: "a" })).toBe(list);
    expect(withFinishedExecution(list, { id: "x", assignmentId: "zzz" })).toBe(list);
  });

  it("counts an optional workout only when it was done, so ticks always equal the count", () => {
    const list = [
      assignment("a", "2026-11-09", "completed", false),
      assignment("b", "2026-11-10", "assigned", false),
      assignment("c", "2026-11-12", "missed"),
    ];
    const week = weekWorkoutSummary(list, weekStart);
    expect(week.total).toBe(2);
    expect(week.completed).toBe(1);
    expect(week.days.filter((d) => d.done)).toHaveLength(week.completed);
  });

  it("counts a day with two workouts once, done when both are", () => {
    const list = [
      assignment("a", "2026-11-09", "completed"),
      assignment("b", "2026-11-09", "assigned"),
    ];
    const week = weekWorkoutSummary(list, weekStart);
    expect(week.total).toBe(1);
    expect(week.completed).toBe(0);
  });

  it("ignores assignments outside the week", () => {
    const week = weekWorkoutSummary(
      [assignment("a", "2026-11-08", "completed"), assignment("b", "2026-11-16", "completed")],
      weekStart,
    );
    expect(week.total).toBe(0);
    expect(week.dates).toHaveLength(7);
    expect(week.dates[0]).toBe("2026-11-09");
  });

  it("isWorkoutDone reads the execution as well as the assignment", () => {
    expect(isWorkoutDone(day(TODAY, "in_progress", { status: "modified" }))).toBe(true);
    expect(isWorkoutDone(day(TODAY, "in_progress", { status: "started" }))).toBe(false);
  });
});

describe("planWeekLabel and exercisePrescription", () => {
  const plan = (from: string, to: string | null) =>
    ({
      plan: null,
      version: { effectiveFrom: `${from}T00:00:00.000Z`, effectiveTo: to ? `${to}T00:00:00.000Z` : null },
    }) as never;

  it("reads Week N of M from the version's start and end", () => {
    expect(planWeekLabel(plan("2026-10-26", "2027-01-17"), "2026-11-09")).toBe("Week 3 of 12");
  });

  it("drops the total when the version has no end", () => {
    expect(planWeekLabel(plan("2026-10-26", null), "2026-11-09")).toBe("Week 3");
  });

  it("is null without a plan", () => {
    expect(planWeekLabel(null, "2026-11-09")).toBeNull();
  });

  it("prints sets × reps (range) · load", () => {
    const t = (reps: number | null, loadLabel: string | null) => ({ reps, loadLabel });
    expect(exercisePrescription({ setTargets: [t(12, "16 kg"), t(12, "16 kg"), t(12, "16 kg")] })).toBe("3 × 12 · 16 kg");
    expect(exercisePrescription({ setTargets: [t(8, "40 kg"), t(10, "40 kg"), t(10, "40 kg")] })).toBe("3 × 8–10 · 40 kg");
    expect(exercisePrescription({ setTargets: [t(12, null), t(12, null)] })).toBe("2 × 12");
    expect(exercisePrescription({ setTargets: [t(null, null)] })).toBe("1 set");
  });
});
