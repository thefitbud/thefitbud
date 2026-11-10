import { describe, expect, it } from "vitest";
import { coachLogDedupeKey, parseCoachLogDedupeKey } from "@fitbud/contracts";
import {
  classifyCoachLogWriteFailure,
  describeCoachLogEvent,
  workoutChangeLines,
  type WorkoutLogSnapshot,
} from "./coach-log.js";
import { isWithinCoachLogWindow } from "./log-time-bounds.js";

const before: WorkoutLogSnapshot = {
  localDate: "2026-11-02",
  workoutDayName: "Lower body A",
  status: "modified",
  performedAt: "2026-11-02T13:00:00.000Z",
  sessionRpe: 7,
  sets: [
    { id: "s1", exercise: "Back squat", order: 1, status: "completed", reps: 5, load: "60kg" },
    { id: "s2", exercise: "Back squat", order: 2, status: "modified", reps: 5, load: "62.5 kg" },
  ],
};

function row(action: "create" | "edit", after: WorkoutLogSnapshot, prev: WorkoutLogSnapshot | null) {
  return {
    action,
    entityType: "workout_execution",
    beforeJson: prev ? JSON.stringify(prev) : null,
    afterJson: JSON.stringify(after),
  };
}

describe("coach log feed lines (R4)", () => {
  it("describes a create with the actor, workout and date", () => {
    expect(describeCoachLogEvent(row("create", before, null), "Rahul Verma")).toEqual({
      type: "coach_logged",
      subtype: "Workout",
      summary: "Rahul Verma logged Lower body A for Mon 2 Nov",
    });
  });

  it("describes an edit with the first change and a count of the rest", () => {
    const after: WorkoutLogSnapshot = {
      ...before,
      sessionRpe: 8,
      sets: [
        before.sets[0]!,
        { ...before.sets[1]!, status: "skipped", reps: null, load: null },
      ],
    };
    expect(workoutChangeLines(before, after)).toEqual([
      "Back squat set 2: 5 reps at 62.5 kg → skipped",
      "Session RPE: 7 → 8",
    ]);
    expect(describeCoachLogEvent(row("edit", after, before), "Rahul Verma").summary).toBe(
      "Rahul Verma edited Lower body A for Mon 2 Nov: Back squat set 2: 5 reps at 62.5 kg → skipped (+1 more)",
    );
  });

  it("never shows raw stored text when a snapshot cannot be read", () => {
    const broken = { action: "edit", entityType: "workout_execution", beforeJson: "{", afterJson: "not json" };
    expect(describeCoachLogEvent(broken, "Rahul Verma")).toEqual({
      type: "coach_edited",
      subtype: "Log",
      summary: "Rahul Verma edited a log",
    });
  });
});

describe("R2 window (trainer log and edit)", () => {
  const now = "2026-11-05T06:00:00.000Z"; // Thu 5 Nov, 11:30 in Kolkata
  const tz = "Asia/Kolkata";

  it("accepts today back to today minus 7 days, in the trainee's timezone", () => {
    expect(isWithinCoachLogWindow({ localDates: ["2026-11-05"], instants: [now], now, timeZone: tz })).toBe(true);
    expect(isWithinCoachLogWindow({ localDates: ["2026-10-29"], instants: [], now, timeZone: tz })).toBe(true);
    expect(isWithinCoachLogWindow({ localDates: ["2026-10-28"], instants: [], now, timeZone: tz })).toBe(false);
    // 28 Oct 19:00 UTC is already 29 Oct in Kolkata.
    expect(
      isWithinCoachLogWindow({ localDates: [], instants: ["2026-10-28T19:00:00.000Z"], now, timeZone: tz }),
    ).toBe(true);
    expect(
      isWithinCoachLogWindow({ localDates: [], instants: ["2026-10-28T18:00:00.000Z"], now, timeZone: tz }),
    ).toBe(false);
  });

  it("rejects a future day or a time past the 5-minute drift", () => {
    expect(isWithinCoachLogWindow({ localDates: ["2026-11-06"], instants: [], now, timeZone: tz })).toBe(false);
    expect(
      isWithinCoachLogWindow({ localDates: [], instants: ["2026-11-05T06:04:00.000Z"], now, timeZone: tz }),
    ).toBe(true);
    expect(
      isWithinCoachLogWindow({ localDates: [], instants: ["2026-11-05T06:06:00.000Z"], now, timeZone: tz }),
    ).toBe(false);
    expect(isWithinCoachLogWindow({ localDates: [], instants: ["not a time"], now, timeZone: tz })).toBe(false);
  });
});

describe("coach log write conflicts (Z7-22)", () => {
  it("classifies a rolled-back batch as entry, version or sequence", () => {
    expect(
      classifyCoachLogWriteFailure(
        new Error("UNIQUE constraint failed: change_log.sequence"),
      ),
    ).toBe("sequence");
    expect(
      classifyCoachLogWriteFailure(
        new Error("UNIQUE constraint failed: workout_executions.assignment_id"),
      ),
    ).toBe("entry");
    expect(
      classifyCoachLogWriteFailure(
        new Error("UNIQUE constraint failed: meal_compliance.assignment_id"),
      ),
    ).toBe("entry");
    expect(
      classifyCoachLogWriteFailure(new Error("UNIQUE constraint failed: measurements.id")),
    ).toBe("entry");
    const wrapped = new Error("Failed query: update coaching_relationships", {
      cause: new Error(
        "NOT NULL constraint failed: coaching_relationships.trainer_user_id",
      ),
    });
    expect(classifyCoachLogWriteFailure(wrapped)).toBe("version");
    expect(classifyCoachLogWriteFailure(new Error("no such table: log_edit_events"))).toBeNull();
  });
});

describe("coach log dedupe key", () => {
  const eventId = "55555555-5555-4555-8555-555555555555";

  it("round-trips the action and entity", () => {
    for (const action of ["create", "edit"] as const) {
      const key = coachLogDedupeKey({ action, entityType: "workout_execution", eventId });
      expect(parseCoachLogDedupeKey(key)).toEqual({ action, entityType: "workout_execution" });
    }
  });

  it("returns null for other keys", () => {
    expect(parseCoachLogDedupeKey(`coach-ask:${eventId}`)).toBeNull();
    expect(parseCoachLogDedupeKey(`coach_log_updated:delete:workout_execution:${eventId}`)).toBeNull();
    expect(parseCoachLogDedupeKey(`coach_log_updated:edit:workout_execution:${eventId}:x`)).toBeNull();
    expect(parseCoachLogDedupeKey("coach_log_updated:edit:workout_execution:")).toBeNull();
  });
});
