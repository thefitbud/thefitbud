import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
}));

import type { ExerciseExecution, SetExecution, WorkoutExecution } from "@fitbud/contracts";
import {
  createLiveActivityNative,
  toNativeContentState,
  type LiveActivityNative,
} from "./liveActivityNative";
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

/** Content as the session sends it: with explicit "no rest" fields. */
function sent(content: ReturnType<typeof liveActivityContentFor>) {
  return { ...content!, state: { ...content!.state, restEndsAt: null, restSeconds: null } };
}

function fakeNative() {
  return {
    isSupported: vi.fn(() => true),
    start: vi.fn<LiveActivityNative["start"]>(async () => "activity-1"),
    update: vi.fn<LiveActivityNative["update"]>(async () => true),
    end: vi.fn<LiveActivityNative["end"]>(async () => undefined),
    hasRest: vi.fn<LiveActivityNative["hasRest"]>(() => null),
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

  it("uses the previous session for a first set, else no Last", () => {
    const fresh = execution([
      exercise(RDL_ID, "Romanian deadlift", 1, [set(1, "22.5 kg", 10), set(2, "22.5 kg", 10)]),
    ]);
    const withHistory = liveActivityContentFor(fresh, { [`${RDL_ID}:1`]: "20 × 8" })!;
    expect(withHistory.state).toMatchObject({ setIndex: 1, lastKg: 20, lastReps: 8, loggedSet: null });
    expect(withHistory.state.lastKnown).toBeUndefined();
    const noHistory = liveActivityContentFor(fresh)!;
    // No previous value: "Last" is unknown, not the plan (LA1b follow-up).
    expect(noHistory.state).toMatchObject({ lastKnown: false, loggedSet: null });
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
      sent(liveActivityContentFor(ex)),
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
        restEndsAt: null,
        restSeconds: null,
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
      state: { ...sent(liveActivityContentFor(ex)).state, finished: true },
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
      return true;
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

  describe("a post the native side never took (LA3f)", () => {
    const NOW = Date.UTC(2026, 9, 19, 7, 25, 0);
    const REST = { endsAt: NOW + 90_000, seconds: 90 };

    it("posts the same content again, and stops once it is taken", async () => {
      const native = fakeNative();
      const session = createLiveActivitySession(native);
      const ex = frame27();
      await session.sync(input(ex));

      // The rest post fails: nothing on the lock screen or in the
      // notification is counting down, so the content is not deduped away.
      native.update.mockResolvedValueOnce(false);
      const logged = logNext(ex);
      await session.sync({ ...input(logged), rest: REST });
      expect(native.update).toHaveBeenCalledTimes(1);

      await session.sync({ ...input(logged), rest: REST });
      expect(native.update).toHaveBeenCalledTimes(2);
      expect(native.update.mock.calls[1]?.[0]).toEqual(native.update.mock.calls[0]?.[0]);
      expect(native.update.mock.calls[1]?.[0].state).toMatchObject({
        restEndsAt: REST.endsAt,
        restSeconds: 90,
      });

      // Taken this time: further syncs of the same content post nothing.
      await session.sync({ ...input(logged), rest: REST });
      await session.sync({ ...input(logged), rest: REST });
      expect(native.update).toHaveBeenCalledTimes(2);
    });

    it("posts content once while its first post is still in flight", async () => {
      const native = fakeNative();
      let release: (delivered: boolean) => void = () => {};
      native.update.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          }),
      );
      const session = createLiveActivitySession(native);
      const ex = frame27();
      await session.sync(input(ex));

      const logged = logNext(ex);
      const first = session.sync({ ...input(logged), rest: REST });
      void session.sync({ ...input(logged), rest: REST });
      void session.sync({ ...input(logged), rest: REST });
      await vi.waitFor(() => expect(native.update).toHaveBeenCalled());
      expect(native.update).toHaveBeenCalledTimes(1);
      release(true);
      await first;
      expect(native.update).toHaveBeenCalledTimes(1);
    });

    it("never credits an older post's result to the newer post that superseded it", async () => {
      // The trainee presses −15 while the rest post is still in flight, so an
      // older post settles under a newer, still-undelivered one. Crediting it
      // would make `restSkippedOnActivity` report a Skip for a rest the native
      // side has never been given.
      const native = fakeNative();
      const releases: Array<(delivered: boolean) => void> = [];
      native.update.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            releases.push(resolve);
          }),
      );
      const session = createLiveActivitySession(native);
      const ex = frame27();
      await session.sync(input(ex));

      const logged = logNext(ex);
      void session.sync({ ...input(logged), rest: REST });
      await vi.waitFor(() => expect(native.update).toHaveBeenCalledTimes(1));
      // The screen's −15 control: it moves `endsAt` only (ActiveWorkoutScreen).
      const shortened = { endsAt: REST.endsAt - 15_000, seconds: REST.seconds };
      void session.sync({ ...input(logged), rest: shortened });

      // Nothing has been delivered yet. A post still in flight is not a rest
      // the activity can show, so the activity's "not resting" is not a Skip.
      native.hasRest.mockReturnValue(false);
      expect(session.restSkippedOnActivity()).toBe(false);

      // The first post lands. Its result belongs to the 90 s rest it carried,
      // never to the shortened rest that replaced it and is still in flight.
      releases[0]!(true);
      await vi.waitFor(() => expect(native.update).toHaveBeenCalledTimes(2));
      expect(native.update.mock.calls[1]?.[0].state).toMatchObject({
        restEndsAt: shortened.endsAt,
      });
      expect(session.restSkippedOnActivity()).toBe(false);

      // Only once the shortened rest itself is taken does a Skip read as one.
      releases[1]!(true);
      await vi.waitFor(() => expect(session.restSkippedOnActivity()).toBe(true));
    });

    it("reads a failed rest post as its own failure, not as Skip", async () => {
      const native = fakeNative();
      const session = createLiveActivitySession(native);
      const ex = frame27();
      await session.sync(input(ex));

      native.update.mockResolvedValueOnce(false);
      const logged = logNext(ex);
      await session.sync({ ...input(logged), rest: REST });
      // The activity truthfully reports no rest: it was never given one. The
      // app's own countdown must keep running.
      native.hasRest.mockReturnValue(false);
      expect(session.restSkippedOnActivity()).toBe(false);

      // The retry lands, and from then on a real Skip still ends the rest.
      await session.sync({ ...input(logged), rest: REST });
      expect(session.restSkippedOnActivity()).toBe(true);
    });

    it("keeps an Android rest running after a failed post, then retries it (LA3c, LA3f)", async () => {
      // Through the real wrapper over the LA3c module, with no platform
      // branch anywhere: one failed update must not look like Skip rest.
      const mod = androidModule();
      const session = createLiveActivitySession(
        createLiveActivityNative({ platformOS: "android", loadModule: () => mod, warn: () => {} }),
      );
      const ex = frame27();
      await session.sync(input(ex));

      mod.update.mockRejectedValueOnce(new Error("no notification permission"));
      const logged = logNext(ex);
      await session.sync({ ...input(logged), rest: REST });
      // The notification still shows the pre-rest content, so it answers
      // "running, not resting" — which is not a skip.
      expect(mod.restState()).toEqual({ running: true });
      expect(session.restSkippedOnActivity()).toBe(false);

      await session.sync({ ...input(logged), rest: REST });
      expect(mod.update).toHaveBeenCalledTimes(2);
      expect(mod.restState()).toEqual({ running: true, restEndsAt: REST.endsAt });
      expect(session.restSkippedOnActivity()).toBe(false);

      mod.skipRest();
      expect(session.restSkippedOnActivity()).toBe(true);
    });
  });

  describe("rest (LA1c, 27c)", () => {
    const NOW = Date.UTC(2026, 9, 19, 7, 25, 0);
    const REST = { endsAt: NOW + 90_000, seconds: 90 };

    it("sends one update at rest start and one at rest end or skip", async () => {
      const native = fakeNative();
      const session = createLiveActivitySession(native);
      const ex = frame27();
      await session.sync(input(ex));

      // Logging set 2 starts the app's rest: one update carries both.
      const logged = logNext(ex);
      await session.sync({ ...input(logged), rest: REST });
      await session.sync({ ...input(logged), rest: REST }); // re-render, same rest
      expect(native.update).toHaveBeenCalledTimes(1);
      expect(native.update.mock.calls[0]?.[0].state).toMatchObject({
        setIndex: 3,
        loggedSet: { setIndex: 2 },
        restEndsAt: NOW + 90_000,
        restSeconds: 90,
      });

      // Rest ends (expiry or skip in the app): one update without rest.
      await session.sync({ ...input(logged), rest: null });
      await session.sync({ ...input(logged), rest: null });
      expect(native.update).toHaveBeenCalledTimes(2);
      expect(native.update.mock.calls[1]?.[0].state).toMatchObject({ restEndsAt: null, restSeconds: null });
    });

    it("never rests after the last set", async () => {
      const native = fakeNative();
      const session = createLiveActivitySession(native);
      let ex = execution([exercise(RDL_ID, "Romanian deadlift", 1, [set(1, "20 kg", 10), set(2, "20 kg", 10)])]);
      await session.sync(input(ex));
      ex = logNext(logNext(ex));
      await session.sync({ ...input(ex), rest: REST });
      expect(native.update.mock.calls.at(-1)?.[0].state).toMatchObject({
        finished: true,
        restEndsAt: null,
        restSeconds: null,
      });
    });

    it("reports a rest skipped on the lock screen only while the app thinks it rests", async () => {
      const native = fakeNative();
      const session = createLiveActivitySession(native);
      const ex = frame27();
      await session.sync(input(ex));
      native.hasRest.mockReturnValue(false);
      expect(session.restSkippedOnActivity()).toBe(false); // app has no rest

      await session.sync({ ...input(logNext(ex)), rest: REST });
      native.hasRest.mockReturnValue(true);
      expect(session.restSkippedOnActivity()).toBe(false); // still resting there
      native.hasRest.mockReturnValue(null);
      expect(session.restSkippedOnActivity()).toBe(false); // no activity / unsupported
      native.hasRest.mockReturnValue(false);
      expect(session.restSkippedOnActivity()).toBe(true); // Skip tapped on the activity
    });

    it("reports an Android skip, and only a skip (LA3c)", async () => {
      // Through the real wrapper over a module that answers the way LA3c's
      // Kotlin does: it reports the rest the notification is actually showing.
      // While the countdown runs, returning to the app must change nothing —
      // that is the LA3b defect, where the module could only say `running` and
      // the app read it as a skip, wiping a rest the trainee was still taking.
      const mod = androidModule();
      const session = createLiveActivitySession(
        createLiveActivityNative({ platformOS: "android", loadModule: () => mod }),
      );
      const ex = frame27();
      await session.sync(input(ex));
      await session.sync({ ...input(logNext(ex)), rest: REST });

      expect(mod.restState()).toEqual({ running: true, restEndsAt: REST.endsAt });
      expect(session.restSkippedOnActivity()).toBe(false);

      // Skip rest on the notification clears its rest; now the app ends its
      // own countdown on the next foreground.
      mod.skipRest();
      expect(mod.restState()).toEqual({ running: true });
      expect(session.restSkippedOnActivity()).toBe(true);

      // And on iOS the same signal still ends the app's rest (LA1c).
      const ios = fakeNative();
      const iosSession = createLiveActivitySession(ios);
      await iosSession.sync(input(ex));
      await iosSession.sync({ ...input(logNext(ex)), rest: REST });
      ios.hasRest.mockReturnValue(false);
      expect(iosSession.restSkippedOnActivity()).toBe(true);
    });
  });

  /**
   * The Android module as LA3 and LA3c implement it: the same call names, and
   * a restState() that answers from the state the notification was last given
   * — `restEndsAt` while the countdown is running, `running` alone once Skip
   * rest cleared it or it ran out. `skipRest()` stands in for the trainee
   * pressing that button, which is handled natively with no call into JS.
   */
  function androidModule(overrides: { isSupported?: boolean } = {}) {
    // The fixed clock these tests write rest against (REST ends 90 s later).
    const now = Date.UTC(2026, 9, 19, 7, 25, 0);
    let shown: { restEndsAt?: number | null } | null = null;
    return {
      isSupported: vi.fn(() => overrides.isSupported ?? true),
      restState: vi.fn(() => {
        if (shown === null) return { running: false };
        const endsAt = shown.restEndsAt;
        if (endsAt == null || endsAt <= now) return { running: true };
        return { running: true, restEndsAt: endsAt };
      }),
      skipRest: () => {
        if (shown) shown = { ...shown, restEndsAt: null };
      },
      start: vi.fn(async (_attributes: unknown, state: { restEndsAt?: number | null }) => {
        shown = state;
        return "1001";
      }),
      update: vi.fn(async (state: { restEndsAt?: number | null }) => {
        shown = state;
      }),
      end: vi.fn(async () => {
        shown = null;
      }),
    };
  }

  // Android reaches the native module too, since D-W2-12 and D-W3-3 put the
  // Android workout notification in the beta (LA3 native, LA3b JS). Before
  // LA3b the wrapper returned early off iOS and these calls went nowhere.
  it("drives the Android notification with the same calls and mapped state", async () => {
    const mod = androidModule();
    const loadModule = vi.fn(() => mod);
    const session = createLiveActivitySession(
      createLiveActivityNative({ platformOS: "android", loadModule }),
    );
    const ex = frame27();

    await session.sync(input(ex));
    expect(loadModule).toHaveBeenCalled();
    expect(mod.start).toHaveBeenCalledTimes(1);
    expect(mod.start).toHaveBeenCalledWith(
      { workoutName: "Lower body B", openUrl: `fitbud://?workout=${ASSIGNMENT}` },
      toNativeContentState(sent(liveActivityContentFor(ex))),
    );

    const logged = logNext(ex, { load: "25 kg", reps: 8 });
    await session.sync(input(logged));
    expect(mod.update).toHaveBeenCalledTimes(1);
    expect(mod.update).toHaveBeenCalledWith(
      toNativeContentState(sent(liveActivityContentFor(logged))),
    );

    await session.sync(input({ ...logged, status: "completed" }));
    await session.end();
    expect(mod.end).toHaveBeenCalledTimes(1);
    expect(mod.end).toHaveBeenCalledWith({
      ...toNativeContentState(sent(liveActivityContentFor(logged))),
      finished: true,
    });
    expect(mod.start).toHaveBeenCalledTimes(1);
  });

  it("makes no Android native call when notifications are off", async () => {
    // The Android module's isSupported is notificationsEnabled(): the session
    // runs its whole course and nothing is posted, and nothing throws.
    const mod = androidModule({ isSupported: false });
    const session = createLiveActivitySession(
      createLiveActivityNative({ platformOS: "android", loadModule: () => mod }),
    );
    const ex = frame27();
    await session.sync(input(ex));
    await session.sync(input(logNext(ex)));
    await session.sync(input({ ...ex, status: "completed" }));
    await session.end();
    expect(mod.start).not.toHaveBeenCalled();
    expect(mod.update).not.toHaveBeenCalled();
    expect(mod.end).not.toHaveBeenCalled();
  });

  it("makes no native call on web", async () => {
    const mod = androidModule();
    const loadModule = vi.fn(() => mod);
    const session = createLiveActivitySession(
      createLiveActivityNative({ platformOS: "web", loadModule }),
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
