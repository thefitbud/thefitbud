/**
 * The open session's reducers (Z12-45): log, correct, skip, undo, finish
 * early, discard, and what "resume after the app was closed" reads. Each one
 * is the local mirror of a server transition, so the cases assert the values
 * the API would answer with (routes/workouts.test.ts, "Z12-45").
 */
import { describe, expect, it } from "vitest";
import { workoutExecutionSchema, type WorkoutExecution } from "@fitbud/contracts";
import {
  closeActiveSession,
  getActiveSession,
  openActiveSession,
  updateActiveSession,
} from "./workout/activeSession";
import {
  exerciseDoneLine,
  exercisePlanLine,
  historySetLabel,
  loadExerciseBests,
  loadWorkoutHistory,
} from "./workoutDisplay";
import {
  currentSetId,
  discardLocally,
  findSessionSet,
  finishLocally,
  lastLoggedAt,
  logSetLocally,
  minimisedLine,
  restoreSetsLocally,
  resumeBody,
  sessionRecordSetIds,
  sessionSetCounts,
  skipSetsLocally,
  skippableSetIds,
  unloggedExercises,
} from "./workoutSession";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const START = "2026-11-14T13:00:00.000Z";
const T1 = "2026-11-14T13:21:00.000Z";
const T2 = "2026-11-14T13:22:00.000Z";

function set(id: number, exercise: number, order: number, load: string | null, reps: number) {
  return {
    id: uuid(id),
    exerciseExecutionId: uuid(exercise),
    setTargetId: uuid(id + 1000),
    order,
    status: "pending" as const,
    prescribedReps: reps,
    prescribedLoadLabel: load,
    actualReps: null,
    actualLoadLabel: null,
    completedAt: null,
    createdAt: START,
    updatedAt: START,
  };
}

/** Lower body B: Romanian deadlift 3 × 10 at 40 kg, Walking lunge 2 × 12 bodyweight. */
function session(): WorkoutExecution {
  const exercise = (id: number, order: number, name: string, sets: ReturnType<typeof set>[]) => ({
    id: uuid(id),
    workoutExecutionId: uuid(1),
    exerciseId: uuid(id + 100),
    name,
    order,
    status: "pending" as const,
    sets,
    createdAt: START,
    updatedAt: START,
  });
  return workoutExecutionSchema.parse({
    id: uuid(1),
    assignmentId: uuid(2),
    coachingRelationshipId: uuid(3),
    planVersionId: uuid(4),
    traineeUserId: uuid(5),
    status: "started",
    recordVersion: 1,
    startedAt: START,
    pausedAt: null,
    completedAt: null,
    sessionRpe: null,
    requireSessionRpe: false,
    exercises: [
      exercise(500, 1, "Romanian deadlift", [
        set(10, 500, 1, "40 kg", 10),
        set(11, 500, 2, "40 kg", 10),
        set(12, 500, 3, "40 kg", 10),
      ]),
      exercise(501, 2, "Walking lunge", [
        set(20, 501, 1, null, 12),
        set(21, 501, 2, null, 12),
      ]),
    ],
    createdAt: START,
    updatedAt: START,
  });
}

const setOf = (execution: WorkoutExecution, id: number) =>
  findSessionSet(execution, uuid(id))!.set;

describe("log and correct a set", () => {
  it("logs as planned, and marks a change as modified", () => {
    let next = logSetLocally(session(), uuid(10), { actualReps: null, actualLoadLabel: null }, T1);
    expect(setOf(next, 10)).toMatchObject({
      status: "completed",
      actualReps: 10,
      actualLoadLabel: "40 kg",
      completedAt: T1,
    });
    next = logSetLocally(next, uuid(11), { actualReps: 10, actualLoadLabel: "42.5 kg" }, T2);
    expect(setOf(next, 11)).toMatchObject({ status: "modified", actualLoadLabel: "42.5 kg" });
    // "40" typed for "40 kg" is the same load, not a change.
    next = logSetLocally(next, uuid(12), { actualReps: 10, actualLoadLabel: "40" }, T2);
    expect(setOf(next, 12).status).toBe("completed");
    expect(next.exercises[0]!.status).toBe("completed");
    expect(next.exercises[1]!.status).toBe("pending");
  });

  it("a correction replaces the values and keeps the time it was first logged", () => {
    const logged = logSetLocally(session(), uuid(10), { actualReps: 10, actualLoadLabel: "40 kg" }, T1);
    const corrected = logSetLocally(logged, uuid(10), { actualReps: 8, actualLoadLabel: "42.5 kg" }, T2);
    expect(setOf(corrected, 10)).toMatchObject({
      status: "modified",
      actualReps: 8,
      actualLoadLabel: "42.5 kg",
      completedAt: T1,
      updatedAt: T2,
    });
    expect(sessionSetCounts(corrected).done).toBe(1);
  });

  it("leaves the input untouched", () => {
    const start = session();
    logSetLocally(start, uuid(10), { actualReps: 9, actualLoadLabel: null }, T1);
    expect(setOf(start, 10).status).toBe("pending");
  });
});

describe("skip and undo", () => {
  it("skips a set and keeps nothing of what was logged", () => {
    const logged = logSetLocally(session(), uuid(10), { actualReps: 10, actualLoadLabel: "42.5 kg" }, T1);
    const skipped = skipSetsLocally(logged, [uuid(10)], T2);
    expect(setOf(skipped, 10)).toMatchObject({
      status: "skipped",
      actualReps: null,
      actualLoadLabel: null,
    });
    expect(sessionSetCounts(skipped)).toEqual({ done: 0, skipped: 1, total: 5 });
  });

  it("Skip exercise takes the sets still to do and leaves logged ones", () => {
    const logged = logSetLocally(session(), uuid(10), { actualReps: 10, actualLoadLabel: null }, T1);
    const ids = skippableSetIds(logged, uuid(500));
    expect(ids).toEqual([uuid(11), uuid(12)]);
    const skipped = skipSetsLocally(logged, ids, T2);
    expect(setOf(skipped, 10).status).toBe("completed");
    expect(skipped.exercises[0]!.status).toBe("completed");
    expect(skippableSetIds(skipped, uuid(500))).toEqual([]);
  });

  it("Undo puts the sets back exactly as they were", () => {
    const before = logSetLocally(session(), uuid(20), { actualReps: 12, actualLoadLabel: null }, T1);
    const ids = skippableSetIds(before, uuid(501));
    const previous = ids.map((id) => findSessionSet(before, id)!.set);
    const skipped = skipSetsLocally(before, ids, T2);
    expect(skipped.exercises[1]!.status).toBe("completed");
    const undone = restoreSetsLocally(skipped, previous, T2);
    expect(undone.exercises[1]!.sets).toEqual(before.exercises[1]!.sets);
    expect(undone.exercises[1]!.status).toBe("pending");
  });

  it("a skipped set can be logged after all", () => {
    const skipped = skipSetsLocally(session(), [uuid(10)], T1);
    const logged = logSetLocally(skipped, uuid(10), { actualReps: 10, actualLoadLabel: null }, T2);
    expect(setOf(logged, 10)).toMatchObject({ status: "completed", completedAt: T2 });
  });
});

describe("moving between exercises (W-03)", () => {
  it("follows the plan's order until the trainee picks a set", () => {
    const start = session();
    expect(currentSetId(start, null)).toBe(uuid(10));
    expect(currentSetId(start, uuid(21))).toBe(uuid(21));
  });

  it("after the picked set is logged, stays in that exercise, then moves down, then wraps", () => {
    let next = logSetLocally(session(), uuid(21), { actualReps: 12, actualLoadLabel: null }, T1);
    // Set 2 of the lunge is done: its set 1 is still to do.
    expect(currentSetId(next, uuid(21))).toBe(uuid(20));
    next = logSetLocally(next, uuid(20), { actualReps: 12, actualLoadLabel: null }, T1);
    // The lunge is finished and nothing is below it: back to the first open set.
    expect(currentSetId(next, uuid(20))).toBe(uuid(10));
    for (const id of [10, 11, 12]) {
      next = logSetLocally(next, uuid(id), { actualReps: 10, actualLoadLabel: null }, T1);
    }
    expect(currentSetId(next, uuid(12))).toBeNull();
  });
});

describe("finish early (W-16)", () => {
  it("lists what is not logged, by exercise, with where Go to lands", () => {
    let next = logSetLocally(session(), uuid(10), { actualReps: 10, actualLoadLabel: null }, T1);
    next = logSetLocally(next, uuid(11), { actualReps: 10, actualLoadLabel: null }, T1);
    expect(unloggedExercises(next)).toEqual([
      { exerciseExecutionId: uuid(500), name: "Romanian deadlift", detail: "Set 3", setId: uuid(12) },
      { exerciseExecutionId: uuid(501), name: "Walking lunge", detail: "2 sets", setId: uuid(20) },
    ]);
    next = skipSetsLocally(next, [uuid(20), uuid(21)], T2);
    expect(unloggedExercises(next)[1]).toMatchObject({ detail: "2 sets · skipped" });
    next = logSetLocally(next, uuid(12), { actualReps: 10, actualLoadLabel: null }, T2);
    expect(unloggedExercises(next).map((row) => row.name)).toEqual(["Walking lunge"]);
  });

  it("finishes with what is logged: unlogged sets stay unlogged, the session is closed", () => {
    const logged = logSetLocally(session(), uuid(10), { actualReps: 10, actualLoadLabel: null }, T1);
    const finished = finishLocally({ ...logged, status: "paused", pausedAt: T1 }, 7, T2);
    expect(finished).toMatchObject({
      status: "completed",
      completedAt: T2,
      pausedAt: null,
      sessionRpe: 7,
    });
    expect(setOf(finished, 11).status).toBe("pending");
    expect(sessionSetCounts(finished)).toEqual({ done: 1, skipped: 0, total: 5 });
    // A changed or skipped set makes it "modified", as the server resolves it.
    const changed = skipSetsLocally(logged, [uuid(11)], T1);
    expect(finishLocally(changed, null, T2).status).toBe("modified");
  });
});

describe("discard (W-15)", () => {
  it("records the workout as skipped", () => {
    const logged = logSetLocally(session(), uuid(10), { actualReps: 10, actualLoadLabel: null }, T1);
    expect(discardLocally(logged, T2)).toMatchObject({ status: "skipped", pausedAt: null });
  });
});

describe("resume after the app was closed (W-18)", () => {
  it("says how many sets were logged and when the last one was", () => {
    let next = logSetLocally(session(), uuid(10), { actualReps: 10, actualLoadLabel: null }, T1);
    expect(resumeBody("Lower body B", next, "Asia/Kolkata")).toBe(
      "Lower body B was in progress. 1 set was logged, the last at 6:51 pm.",
    );
    next = logSetLocally(next, uuid(11), { actualReps: 10, actualLoadLabel: null }, T2);
    expect(lastLoggedAt(next)).toBe(T2);
    expect(resumeBody("Lower body B", next, "Asia/Kolkata")).toBe(
      "Lower body B was in progress. 2 sets were logged, the last at 6:52 pm.",
    );
    expect(resumeBody("Lower body B", session(), "Asia/Kolkata")).toBe(
      "Lower body B was in progress. No sets were logged yet.",
    );
  });

  it("the session store keeps one session per relationship and never shows another's", () => {
    const execution = session();
    openActiveSession({ relationshipId: uuid(3), execution, assignment: null });
    expect(getActiveSession(uuid(3))).toMatchObject({ minimised: false, rest: null });
    expect(getActiveSession(uuid(99))).toBeNull();
    updateActiveSession(uuid(99), { minimised: true });
    expect(getActiveSession(uuid(3))!.minimised).toBe(false);
    updateActiveSession(uuid(3), { minimised: true, rest: { endsAt: 5, seconds: 90 } });
    expect(getActiveSession(uuid(3))).toMatchObject({
      minimised: true,
      rest: { endsAt: 5, seconds: 90 },
    });
    expect(minimisedLine(getActiveSession(uuid(3))!.execution)).toBe("Romanian deadlift · set 1 of 3");
    closeActiveSession(uuid(99));
    expect(getActiveSession(uuid(3))).not.toBeNull();
    closeActiveSession(uuid(3));
    expect(getActiveSession(uuid(3))).toBeNull();
  });
});

describe("personal records (W-12)", () => {
  it("marks the heaviest logged set of a lift, only when it beats the earlier best", () => {
    let next = logSetLocally(session(), uuid(10), { actualReps: 10, actualLoadLabel: "40 kg" }, T1);
    next = logSetLocally(next, uuid(11), { actualReps: 10, actualLoadLabel: "42.5 kg" }, T2);
    expect([...sessionRecordSetIds(next, { "romanian deadlift": 37.5 })]).toEqual([uuid(11)]);
    expect(sessionRecordSetIds(next, { "romanian deadlift": 42.5 }).size).toBe(0);
    // No earlier load on record: nothing to beat, so nothing is called a record.
    expect(sessionRecordSetIds(next, {}).size).toBe(0);
  });

  it("reads the earlier best from the strength read model, never from today", async () => {
    const api = {
      getStrength: async () => ({
        exercises: [
          {
            name: "Romanian  Deadlift",
            points: [
              { localDate: "2026-10-31", topLoadKg: 35, reps: 10 },
              { localDate: "2026-11-07", topLoadKg: 37.5, reps: 9 },
              { localDate: "2026-11-14", topLoadKg: 42.5, reps: 10 },
              { localDate: "2026-11-01", topLoadKg: null, reps: 12 },
            ],
          },
        ],
      }),
    };
    expect(await loadExerciseBests(api, uuid(3), "2026-11-14")).toEqual({
      "romanian deadlift": { kg: 37.5, reps: 9 },
    });
    const failing = {
      getStrength: async () => {
        throw new Error("offline");
      },
    };
    expect(await loadExerciseBests(failing, uuid(3), "2026-11-14")).toEqual({});
  });
});

describe("what the log shows", () => {
  it("plan chip, done line and history labels", () => {
    const start = session();
    expect(exercisePlanLine(start.exercises[0]!)).toBe("3 × 10 · 40 kg");
    expect(exercisePlanLine(start.exercises[1]!)).toBe("2 × 12");
    const ranged = {
      sets: start.exercises[0]!.sets.map((item, index) => ({
        ...item,
        prescribedReps: 8 + index,
      })),
    };
    expect(exercisePlanLine(ranged)).toBe("3 × 8–10 · 40 kg");
    expect(historySetLabel("42.5 kg", 10)).toBe("42.5 kg × 10");
    expect(historySetLabel(null, 12)).toBe("12 reps");
    expect(historySetLabel("RPE 7", 8)).toBe("RPE 7 × 8");
    let next = logSetLocally(start, uuid(10), { actualReps: 10, actualLoadLabel: "40 kg" }, T1);
    next = logSetLocally(next, uuid(11), { actualReps: 10, actualLoadLabel: "42.5 kg" }, T1);
    next = skipSetsLocally(next, [uuid(12), uuid(20), uuid(21)], T2);
    expect(exerciseDoneLine(next.exercises[0]!)).toBe("2 of 3 sets · best 42.5 kg × 10");
    expect(exerciseDoneLine(next.exercises[1]!)).toBe("Skipped");
  });

  it("history: the earlier finished sessions of the same workout day, newest first", async () => {
    const past = (id: number, localDate: string, status: string, dayId = uuid(6)) => ({
      id: uuid(id),
      workoutDayId: dayId,
      workoutDayName: "Lower body B",
      localDate,
      windowStartsAt: `${localDate}T01:00:00.000Z`,
      status,
      execution: { id: uuid(id + 50) },
    });
    const logged = logSetLocally(session(), uuid(10), { actualReps: 10, actualLoadLabel: "37.5 kg" }, T1);
    const read: string[] = [];
    const api = {
      listWorkoutAssignments: async () => ({
        items: [
          past(70, "2026-10-31", "completed"),
          past(71, "2026-11-07", "modified"),
          past(72, "2026-11-05", "completed", uuid(7)),
          past(73, "2026-11-10", "missed"),
        ] as never,
      }),
      getWorkoutExecution: async (id: string) => {
        read.push(id);
        return logged;
      },
    };
    const history = await loadWorkoutHistory(
      api,
      { id: uuid(2), workoutDayId: uuid(6), coachingRelationshipId: uuid(3) } as never,
      "2026-11-14",
    );
    expect(read).toEqual([uuid(121), uuid(120)]);
    expect(history.sessions.map((item) => item.localDate)).toEqual(["2026-11-07", "2026-10-31"]);
    expect(history.sessions[0]!.setsByExerciseName).toEqual({
      "romanian deadlift": [{ order: 1, label: "37.5 kg × 10", kg: 37.5 }],
    });
    expect(history.previousByKey).toEqual({ [`${uuid(600)}:1`]: "37.5 × 10" });
  });
});
