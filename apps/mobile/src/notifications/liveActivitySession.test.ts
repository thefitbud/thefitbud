import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
}));

import type { ExerciseExecution, SetExecution, WorkoutExecution } from "@fitbud/contracts";
import { createLiveActivityNative, type LiveActivityNative } from "./liveActivityNative";
import { parseDeepLinkUrl } from "../navigation/linking";
import {
  createLiveActivitySession,
  historyPair,
  liveActivityContentFor,
  loadKg,
  workoutOpenUrl,
} from "./liveActivitySession";

const T0 = "2026-10-19T07:00:00.000Z";
const ASSIGNMENT = "6f1d2a40-1c1e-4c55-9a0b-1b2c3d4e5f60";
const RDL_ID = "0b6c1f2e-8a3d-4f5e-9c7b-2a1d0e9f8c7b";
const SQUAT_ID = "1c7d2e3f-9b4e-4a6f-8d8c-3b2e1f0a9d8c";

function set(order: number, load: string | null, reps: number | null, done?: { load?: string; reps?: number }): SetExecution {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(order).padStart(2, "0")}`,
    exerciseExecutionId: "00000000-0000-4000-8000-00000000ee01",
    setTargetId: `00000000-0000-4000-8000-0000000000a${order}`,
    order,
    status: done ? (done.load || done.reps ? "modified" : "completed") : "pending",
    prescribedReps: reps,
    prescribedLoadLabel: load,
    actualReps: done ? (done.reps ?? reps) : null,
    actualLoadLabel: done ? (done.load ?? load) : null,
    completedAt: done ? T0 : null,
    createdAt: T0,
    updatedAt: T0,
  };
}

function exercise(id: string, name: string, order: number, sets: SetExecution[]): ExerciseExecution {
  return {
    id: `00000000-0000-4000-8000-00000000e${order}00`,
    workoutExecutionId: "00000000-0000-4000-8000-0000000000ff",
    exerciseId: id,
    name,
    order,
    status: sets.every((s) => s.status !== "pending") ? "completed" : "started",
    sets,
    createdAt: T0,
    updatedAt: T0,
  } as ExerciseExecution;
}

function execution(
  exercises: ExerciseExecution[],
  status: WorkoutExecution["status"] = "started",
): WorkoutExecution {
  return {
    id: "00000000-0000-4000-8000-0000000000ff",
    assignmentId: ASSIGNMENT,
    coachingRelationshipId: "00000000-0000-4000-8000-0000000000cc",
    planVersionId: "00000000-0000-4000-8000-0000000000dd",
    traineeUserId: "00000000-0000-4000-8000-0000000000bb",
    status,
    recordVersion: 3,
    startedAt: T0,
    pausedAt: null,
    completedAt: null,
    sessionRpe: null,
    requireSessionRpe: false,
    exercises,
  } as WorkoutExecution;
}

/** Frame 27: Romanian deadlift, set 2 of 3, last 20 kg × 10, now 22.5 kg × 10. */
function frame27(): WorkoutExecution {
  return execution([
    exercise(RDL_ID, "Romanian deadlift", 1, [
      set(1, "22.5 kg", 10, { load: "20 kg" }),
      set(2, "22.5 kg", 10),
      set(3, "22.5 kg", 10),
    ]),
    exercise(SQUAT_ID, "Goblet squat", 2, [set(1, "16 kg", 12), set(2, "16 kg", 12)]),
  ]);
}

function logNext(ex: WorkoutExecution, actual?: { load?: string; reps?: number }): WorkoutExecution {
  let done = false;
  return {
    ...ex,
    exercises: ex.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => {
        if (done || s.status !== "pending") return s;
        done = true;
        return set(s.order, s.prescribedLoadLabel, s.prescribedReps, actual ?? {});
      }),
    })),
  };
}

function fakeNative() {
  return {
    isSupported: vi.fn(() => true),
    start: vi.fn<LiveActivityNative["start"]>(async () => "activity-1"),
    update: vi.fn<LiveActivityNative["update"]>(async () => undefined),
    end: vi.fn<LiveActivityNative["end"]>(async () => undefined),
  } satisfies LiveActivityNative;
}

describe("parsing helpers", () => {
  it("reads kg from load labels; bodyweight is 0", () => {
    expect(loadKg("22.5 kg")).toBe(22.5);
    expect(loadKg("20")).toBe(20);
    expect(loadKg("Bodyweight")).toBe(0);
    expect(loadKg(null)).toBe(0);
  });

  it("reads previous-session labels", () => {
    expect(historyPair("22.5 × 10")).toEqual({ kg: 22.5, reps: 10 });
    expect(historyPair("12 reps")).toEqual({ kg: 0, reps: 12 });
    expect(historyPair("— first time")).toBeNull();
    expect(historyPair(undefined)).toBeNull();
  });

  it("opens the app without navigating, so the active workout stays on screen", () => {
    expect(workoutOpenUrl(ASSIGNMENT)).toBe(`fitbud://?workout=${ASSIGNMENT}`);
    // fitbud://workout/{id} would open the overview and unmount the screen.
    expect(parseDeepLinkUrl(workoutOpenUrl(ASSIGNMENT))).toBeNull();
    expect(parseDeepLinkUrl(`fitbud://workout/${ASSIGNMENT}`)).toMatchObject({ kind: "workout" });
  });
});

describe("liveActivityContentFor", () => {
  it("matches frame 27", () => {
    expect(liveActivityContentFor(frame27())).toEqual({
      exerciseName: "Romanian deadlift",
      state: {
        kilograms: 22.5,
        reps: 10,
        planKg: 22.5,
        planReps: 10,
        setIndex: 2,
        setCount: 3,
        lastKg: 20,
        lastReps: 10,
        loggedSet: { setIndex: 1, kilograms: 20, reps: 10 },
        finished: false,
      },
    });
  });

  it("uses the previous session for a first set, else the plan", () => {
    const fresh = execution([
      exercise(RDL_ID, "Romanian deadlift", 1, [set(1, "22.5 kg", 10), set(2, "22.5 kg", 10)]),
    ]);
    const withHistory = liveActivityContentFor(fresh, { [`${RDL_ID}:1`]: "20 × 8" })!;
    expect(withHistory.state).toMatchObject({ setIndex: 1, lastKg: 20, lastReps: 8, loggedSet: null });
    const noHistory = liveActivityContentFor(fresh)!;
    expect(noHistory.state).toMatchObject({ lastKg: 22.5, lastReps: 10, loggedSet: null });
  });

  it("moves to the next exercise and marks finished after the last set", () => {
    let ex = logNext(logNext(frame27()), { load: "25 kg", reps: 8 });
    expect(liveActivityContentFor(ex)!).toMatchObject({
      exerciseName: "Goblet squat",
      state: {
        setIndex: 1,
        setCount: 2,
        kilograms: 16,
        reps: 12,
        lastKg: 16,
        lastReps: 12,
        // The logged line carries the previous exercise's last set (set 3).
        loggedSet: { setIndex: 3, kilograms: 25, reps: 8 },
        finished: false,
      },
    });
    ex = logNext(logNext(ex, { reps: 10 }), { load: "18 kg", reps: 11 });
    expect(liveActivityContentFor(ex)).toEqual({
      exerciseName: "Goblet squat",
      state: {
        kilograms: 18,
        reps: 11,
        planKg: 16,
        planReps: 12,
        setIndex: 2,
        setCount: 2,
        lastKg: 18,
        lastReps: 11,
        loggedSet: { setIndex: 2, kilograms: 18, reps: 11 },
        finished: true,
      },
    });
  });

  it("returns null for a workout without sets", () => {
    expect(liveActivityContentFor(execution([]))).toBeNull();
  });
});

describe("createLiveActivitySession", () => {
  const input = (ex: WorkoutExecution) => ({ execution: ex, workoutName: "Lower body B", historyByKey: {} });

  it("starts once and updates per logged set with exact fields", async () => {
    const native = fakeNative();
    const session = createLiveActivitySession(native);
    let ex = frame27();
    await session.sync(input(ex));
    await session.sync(input(ex));

    expect(native.start).toHaveBeenCalledTimes(1);
    expect(native.start).toHaveBeenCalledWith(
      { workoutName: "Lower body B", openUrl: `fitbud://?workout=${ASSIGNMENT}` },
      liveActivityContentFor(ex),
    );
    expect(native.update).not.toHaveBeenCalled();

    ex = logNext(ex, { load: "25 kg", reps: 8 });
    await session.sync(input(ex));
    expect(native.update).toHaveBeenCalledTimes(1);
    expect(native.update).toHaveBeenLastCalledWith({
      exerciseName: "Romanian deadlift",
      state: {
        kilograms: 22.5,
        reps: 10,
        planKg: 22.5,
        planReps: 10,
        setIndex: 3,
        setCount: 3,
        lastKg: 25,
        lastReps: 8,
        loggedSet: { setIndex: 2, kilograms: 25, reps: 8 },
        finished: false,
      },
    });

    ex = logNext(ex);
    await session.sync(input(ex));
    expect(native.update).toHaveBeenCalledTimes(2);
    expect(native.start).toHaveBeenCalledTimes(1);
  });

  it("changes nothing on pause and resume", async () => {
    const native = fakeNative();
    const session = createLiveActivitySession(native);
    const ex = frame27();
    await session.sync(input(ex));
    await session.sync(input({ ...ex, status: "paused", pausedAt: T0 }));
    await session.sync(input({ ...ex, status: "started", pausedAt: null }));
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(native.update).not.toHaveBeenCalled();
    expect(native.end).not.toHaveBeenCalled();
  });

  it.each(["completed", "skipped"] as const)("ends with finished: true when the workout is %s", async (status) => {
    const native = fakeNative();
    const session = createLiveActivitySession(native);
    const ex = frame27();
    await session.sync(input(ex));
    await session.sync(input({ ...ex, status }));
    expect(native.end).toHaveBeenCalledTimes(1);
    await session.sync(input({ ...ex, status }));
    await session.end();

    expect(native.end).toHaveBeenCalledTimes(1);
    expect(native.end).toHaveBeenCalledWith({
      exerciseName: "Romanian deadlift",
      state: { ...liveActivityContentFor(ex)!.state, finished: true },
    });
  });

  it("ends once on unmount (leaving the workout)", async () => {
    const native = fakeNative();
    const session = createLiveActivitySession(native);
    await session.sync(input(frame27()));
    await session.end();
    await session.end();
    expect(native.end).toHaveBeenCalledTimes(1);
    expect(native.end.mock.calls[0]?.[0]?.state.finished).toBe(true);
    await session.sync(input(logNext(frame27())));
    expect(native.update).not.toHaveBeenCalled();
  });

  it("never starts for a workout that is already done", async () => {
    const native = fakeNative();
    const session = createLiveActivitySession(native);
    await session.sync(input({ ...frame27(), status: "completed" }));
    await session.end();
    expect(native.start).not.toHaveBeenCalled();
    expect(native.end).not.toHaveBeenCalled();
  });

  it("runs native calls in order so an update never overtakes its start", async () => {
    const order: string[] = [];
    let releaseStart: () => void = () => {};
    const native = fakeNative();
    native.start.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          releaseStart = () => {
            order.push("start");
            resolve("activity-1");
          };
        }),
    );
    native.update.mockImplementation(async () => {
      order.push("update");
    });
    const session = createLiveActivitySession(native);
    const ex = frame27();
    void session.sync(input(ex));
    const pending = session.sync(input(logNext(ex)));
    await vi.waitFor(() => expect(native.start).toHaveBeenCalled());
    expect(native.update).not.toHaveBeenCalled();
    releaseStart();
    await pending;
    expect(order).toEqual(["start", "update"]);
  });

  it("keeps going after a native call rejects", async () => {
    const native = fakeNative();
    native.start.mockRejectedValueOnce(new Error("boom"));
    const session = createLiveActivitySession(native);
    const ex = frame27();
    await expect(session.sync(input(ex))).resolves.toBeUndefined();
    await expect(session.sync(input(logNext(ex)))).resolves.toBeUndefined();
    expect(native.update).toHaveBeenCalledTimes(1);
  });

  it("makes no native call on Android", async () => {
    const mod = {
      isSupported: vi.fn(() => true),
      start: vi.fn(async () => "x"),
      update: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
    };
    const loadModule = vi.fn(() => mod);
    const session = createLiveActivitySession(
      createLiveActivityNative({ platformOS: "android", loadModule }),
    );
    const ex = frame27();
    await session.sync(input(ex));
    await session.sync(input(logNext(ex)));
    await session.sync(input({ ...ex, status: "completed" }));
    await session.end();
    expect(loadModule).not.toHaveBeenCalled();
    expect(mod.start).not.toHaveBeenCalled();
    expect(mod.update).not.toHaveBeenCalled();
    expect(mod.end).not.toHaveBeenCalled();
  });
});
