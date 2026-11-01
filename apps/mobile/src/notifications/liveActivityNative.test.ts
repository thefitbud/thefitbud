import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
}));

import type { LiveActivityNativeModule } from "../../modules/live-activity";
import { DEMO_LIVE_ACTIVITY, reduceLiveActivity, type LiveActivityState } from "./liveActivity";
import {
  createLiveActivityDemo,
  createLiveActivityModuleAccess,
  createLiveActivityNative,
  isLiveActivityPlatform,
  toNativeContentState,
} from "./liveActivityNative";

function fakeModule(overrides: Partial<LiveActivityNativeModule> = {}) {
  return {
    isSupported: vi.fn(() => true),
    start: vi.fn(async () => "activity-1"),
    update: vi.fn(async () => undefined),
    end: vi.fn(async () => undefined),
    restState: vi.fn(() => ({ running: true, restEndsAt: null as number | null })),
    ...overrides,
  } satisfies LiveActivityNativeModule;
}

const WORKOUT = { workoutName: "Lower body A", openUrl: "fitbud://workout/asg-1" };

const LOGGED: LiveActivityState = reduceLiveActivity(
  { ...DEMO_LIVE_ACTIVITY, kilograms: 25, reps: 9 },
  { type: "log_set" },
);

describe("toNativeContentState", () => {
  it("maps every field exactly", () => {
    expect(toNativeContentState({ exerciseName: "Romanian deadlift", state: LOGGED })).toEqual({
      exerciseName: "Romanian deadlift",
      setIndex: 3,
      setCount: 3,
      kilograms: 22.5,
      reps: 10,
      planKilograms: 22.5,
      planReps: 10,
      lastKilograms: 25,
      lastReps: 9,
      loggedLine: "Set 2 logged · 25 kg × 9",
      finished: false,
      restEndsAt: null,
      restSeconds: null,
    });
  });

  it("keeps every numeric field in its own slot (all values distinct)", () => {
    const state: LiveActivityState = {
      kilograms: 27.5,
      reps: 8,
      planKg: 30,
      planReps: 6,
      setIndex: 2,
      setCount: 4,
      lastKg: 25,
      lastReps: 7,
      loggedSet: { setIndex: 1, kilograms: 25, reps: 7 },
      finished: true,
    };
    expect(toNativeContentState({ exerciseName: "Bench press", state })).toEqual({
      exerciseName: "Bench press",
      setIndex: 2,
      setCount: 4,
      kilograms: 27.5,
      reps: 8,
      planKilograms: 30,
      planReps: 6,
      lastKilograms: 25,
      lastReps: 7,
      loggedLine: "Set 1 logged · 25 kg × 7",
      finished: true,
      restEndsAt: null,
      restSeconds: null,
    });
  });

  it("sends a null logged line before any set is logged", () => {
    const state = toNativeContentState({ exerciseName: "Squat", state: DEMO_LIVE_ACTIVITY });
    expect(state.loggedLine).toBeNull();
    expect(Object.keys(state).sort()).toEqual(
      [
        "exerciseName",
        "setIndex",
        "setCount",
        "kilograms",
        "reps",
        "planKilograms",
        "planReps",
        "lastKilograms",
        "lastReps",
        "loggedLine",
        "finished",
        "restEndsAt",
        "restSeconds",
      ].sort(),
    );
  });
});

describe("rest and unknown Last mapping (LA1c)", () => {
  it("sends rest fields and null Last when unknown", () => {
    const state = {
      ...DEMO_LIVE_ACTIVITY,
      lastKnown: false,
      restEndsAt: 1_792_000_090_000,
      restSeconds: 90,
    };
    expect(toNativeContentState({ exerciseName: "Squat", state })).toMatchObject({
      lastKilograms: null,
      lastReps: null,
      restEndsAt: 1_792_000_090_000,
      restSeconds: 90,
    });
  });

  it("never sends rest on a finished state", () => {
    const state = { ...DEMO_LIVE_ACTIVITY, finished: true, restEndsAt: 1, restSeconds: 90 };
    expect(toNativeContentState({ exerciseName: "Squat", state })).toMatchObject({
      restEndsAt: null,
      restSeconds: null,
    });
  });

  it("hasRest reads the running activity and never throws", () => {
    const mod = fakeModule({ restState: vi.fn(() => ({ running: true, restEndsAt: 5 })) });
    const native = createLiveActivityNative({ platformOS: "ios", loadModule: () => mod });
    expect(native.hasRest()).toBe(true);
    vi.mocked(mod.restState).mockReturnValue({ running: true, restEndsAt: null });
    expect(native.hasRest()).toBe(false);
    vi.mocked(mod.restState).mockReturnValue({ running: false, restEndsAt: null });
    expect(native.hasRest()).toBeNull();
    const warn = vi.fn();
    const throwing = createLiveActivityNative({
      platformOS: "ios",
      loadModule: () =>
        fakeModule({
          restState: vi.fn(() => {
            throw new TypeError("x");
          }),
        }),
      warn,
    });
    expect(throwing.hasRest()).toBeNull();
    expect(warn).toHaveBeenCalledWith("[liveActivity] restState failed: TypeError");
    expect(createLiveActivityNative({ platformOS: "web", loadModule: () => mod }).hasRest()).toBeNull();
  });

  it("reports nothing about rest on Android, where there is no Skip to tap", () => {
    // The Android module answers `running` alone (LA3c adds the countdown and
    // its Skip, D-W3-3). `false` would mean the trainee skipped the rest on the
    // activity, and the workout screen would clear a countdown still running,
    // so Android answers null however the notification reads, never false.
    for (const running of [true, false]) {
      const mod = fakeModule({ restState: vi.fn(() => ({ running })) });
      const android = createLiveActivityNative({
        platformOS: "android",
        loadModule: () => mod,
      });
      expect(android.hasRest(), `running: ${running}`).toBeNull();
      expect(mod.restState).not.toHaveBeenCalled();
    }
  });
});

describe("createLiveActivityNative on iOS", () => {
  it("starts, updates and ends through the module with mapped state", async () => {
    const mod = fakeModule();
    const native = createLiveActivityNative({ platformOS: "ios", loadModule: () => mod });
    const content = { exerciseName: "Romanian deadlift", state: LOGGED };

    expect(await native.start(WORKOUT, content)).toBe("activity-1");
    await native.update(content);
    await native.end({ exerciseName: "Romanian deadlift", state: { ...LOGGED, finished: true } });

    const mapped = toNativeContentState(content);
    expect(mod.start).toHaveBeenCalledWith(WORKOUT, mapped);
    expect(mod.update).toHaveBeenCalledWith(mapped);
    expect(mod.end).toHaveBeenCalledWith({ ...mapped, finished: true });
  });

  it("ends with null when no final state is given", async () => {
    const mod = fakeModule();
    const native = createLiveActivityNative({ platformOS: "ios", loadModule: () => mod });
    await native.end();
    expect(mod.end).toHaveBeenCalledWith(null);
  });

  it("makes no start/update/end call when unsupported", async () => {
    const mod = fakeModule({ isSupported: vi.fn(() => false) });
    const native = createLiveActivityNative({ platformOS: "ios", loadModule: () => mod });
    const content = { exerciseName: "Squat", state: DEMO_LIVE_ACTIVITY };

    expect(native.isSupported()).toBe(false);
    expect(await native.start(WORKOUT, content)).toBeNull();
    await native.update(content);
    await native.end(content);
    expect(mod.start).not.toHaveBeenCalled();
    expect(mod.update).not.toHaveBeenCalled();
    expect(mod.end).not.toHaveBeenCalled();
  });

  it("does nothing when the build has no module", async () => {
    const native = createLiveActivityNative({ platformOS: "ios", loadModule: () => null });
    expect(native.isSupported()).toBe(false);
    expect(await native.start(WORKOUT, { exerciseName: "Squat", state: DEMO_LIVE_ACTIVITY })).toBeNull();
  });

  it("never throws; warns with the error name only", async () => {
    const secret = new TypeError("Romanian deadlift 25 kg for asg-1");
    const warn = vi.fn();
    const mod = fakeModule({
      start: vi.fn(async () => {
        throw secret;
      }),
      update: vi.fn(async () => {
        throw secret;
      }),
      end: vi.fn(async () => {
        throw secret;
      }),
    });
    const native = createLiveActivityNative({ platformOS: "ios", loadModule: () => mod, warn });
    const content = { exerciseName: "Romanian deadlift", state: LOGGED };

    await expect(native.start(WORKOUT, content)).resolves.toBeNull();
    await expect(native.update(content)).resolves.toBeUndefined();
    await expect(native.end(content)).resolves.toBeUndefined();

    expect(warn.mock.calls).toEqual([
      ["[liveActivity] start failed: TypeError"],
      ["[liveActivity] update failed: TypeError"],
      ["[liveActivity] end failed: TypeError"],
    ]);
  });

  it("treats a throwing isSupported or loader as unsupported", async () => {
    const warn = vi.fn();
    const throwing = fakeModule({
      isSupported: vi.fn(() => {
        throw new RangeError("x");
      }),
    });
    const a = createLiveActivityNative({ platformOS: "ios", loadModule: () => throwing, warn });
    expect(a.isSupported()).toBe(false);
    expect(throwing.start).not.toHaveBeenCalled();

    const b = createLiveActivityNative({
      platformOS: "ios",
      loadModule: () => {
        throw new Error("missing");
      },
      warn,
    });
    await expect(b.start(WORKOUT, { exerciseName: "Squat", state: DEMO_LIVE_ACTIVITY })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith("[liveActivity] isSupported failed: RangeError");
    expect(warn).toHaveBeenCalledWith("[liveActivity] load failed: Error");
  });
});

describe("createLiveActivityNative on Android (LA3)", () => {
  it("starts, updates and ends through the same module with mapped state", async () => {
    const mod = fakeModule();
    const native = createLiveActivityNative({ platformOS: "android", loadModule: () => mod });
    const content = { exerciseName: "Romanian deadlift", state: LOGGED };

    expect(native.isSupported()).toBe(true);
    expect(await native.start(WORKOUT, content)).toBe("activity-1");
    await native.update(content);
    await native.end({ exerciseName: "Romanian deadlift", state: { ...LOGGED, finished: true } });

    const mapped = toNativeContentState(content);
    expect(mod.start).toHaveBeenCalledWith(WORKOUT, mapped);
    expect(mod.update).toHaveBeenCalledWith(mapped);
    expect(mod.end).toHaveBeenCalledWith({ ...mapped, finished: true });
  });

  it("is a no-op when notifications are off", async () => {
    // The Android module's isSupported is notificationsEnabled(): off, or the
    // workout channel blocked, means no notification and no call.
    const mod = fakeModule({ isSupported: vi.fn(() => false) });
    const native = createLiveActivityNative({ platformOS: "android", loadModule: () => mod });
    const content = { exerciseName: "Squat", state: DEMO_LIVE_ACTIVITY };

    expect(native.isSupported()).toBe(false);
    expect(await native.start(WORKOUT, content)).toBeNull();
    await native.update(content);
    await native.end(content);
    expect(mod.start).not.toHaveBeenCalled();
    expect(mod.update).not.toHaveBeenCalled();
    expect(mod.end).not.toHaveBeenCalled();
  });

  it("is a no-op, and never throws, in a build without the module", async () => {
    const warn = vi.fn();
    const native = createLiveActivityNative({
      platformOS: "android",
      loadModule: () => {
        throw new Error("missing");
      },
      warn,
    });
    expect(native.isSupported()).toBe(false);
    expect(await native.start(WORKOUT, { exerciseName: "Squat", state: DEMO_LIVE_ACTIVITY })).toBeNull();
    await expect(native.update({ exerciseName: "Squat", state: DEMO_LIVE_ACTIVITY })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[liveActivity] load failed: Error");
  });
});

describe("createLiveActivityNative on web", () => {
  it("never loads the module and makes no calls", async () => {
    const mod = fakeModule();
    const loadModule = vi.fn(() => mod);
    const native = createLiveActivityNative({ platformOS: "web", loadModule });
    const content = { exerciseName: "Squat", state: DEMO_LIVE_ACTIVITY };

    expect(native.isSupported()).toBe(false);
    expect(await native.start(WORKOUT, content)).toBeNull();
    await native.update(content);
    await native.end(content);

    expect(loadModule).not.toHaveBeenCalled();
    expect(mod.isSupported).not.toHaveBeenCalled();
    expect(mod.start).not.toHaveBeenCalled();
    expect(mod.update).not.toHaveBeenCalled();
    expect(mod.end).not.toHaveBeenCalled();
  });
});

describe("the shared module handle (LA3b)", () => {
  it("is the native platforms, and nothing else", () => {
    expect(isLiveActivityPlatform("ios")).toBe(true);
    expect(isLiveActivityPlatform("android")).toBe(true);
    expect(isLiveActivityPlatform("web")).toBe(false);
    expect(isLiveActivityPlatform("windows")).toBe(false);
  });

  it("loads once per handle on both native platforms", () => {
    for (const platformOS of ["ios", "android"]) {
      const mod = fakeModule();
      const loadModule = vi.fn(() => mod);
      const access = createLiveActivityModuleAccess({ platformOS, loadModule });
      expect(access.get()).toBe(mod);
      expect(access.get()).toBe(mod);
      expect(access.supported()).toBe(mod);
      expect(loadModule).toHaveBeenCalledTimes(1);
    }
  });

  it("never loads off those platforms, and keeps the rows readable when unsupported", () => {
    const loadModule = vi.fn(() => fakeModule());
    expect(createLiveActivityModuleAccess({ platformOS: "web", loadModule }).get()).toBeNull();
    expect(loadModule).not.toHaveBeenCalled();

    // Notifications off (Android) or Live Activities off (iOS): the drain still
    // reads the rows a button already wrote, so no logged set is lost.
    const mod = fakeModule({ isSupported: vi.fn(() => false) });
    const access = createLiveActivityModuleAccess({
      platformOS: "android",
      loadModule: () => mod,
    });
    expect(access.get()).toBe(mod);
    expect(access.supported()).toBeNull();
  });

  it("warns once with the error name, and retries a failed load", () => {
    const warn = vi.fn();
    const mod = fakeModule();
    let fail = true;
    const loadModule = vi.fn(() => {
      if (fail) throw new TypeError("Romanian deadlift 25 kg");
      return mod;
    });
    const access = createLiveActivityModuleAccess({ platformOS: "android", loadModule, warn });

    expect(access.get()).toBeNull();
    expect(access.supported()).toBeNull();
    // Only a successful load is cached: a failure is not final for the life of
    // the app, or a row already written could never be drained.
    fail = false;
    expect(access.get()).toBe(mod);
    expect(access.get()).toBe(mod);
    expect(loadModule).toHaveBeenCalledTimes(3);
    // One warning, however many drains run: nothing but the error name.
    expect(warn.mock.calls).toEqual([["[liveActivity] load failed: TypeError"]]);
  });
});

describe("createLiveActivityDemo", () => {
  it("starts the demo, logs a set on update and ends finished", async () => {
    const mod = fakeModule();
    const demo = createLiveActivityDemo(
      createLiveActivityNative({ platformOS: "ios", loadModule: () => mod }),
    );
    await demo.start();
    await demo.update();
    await demo.end();
    expect(vi.mocked(mod.start).mock.calls[0]?.[1]).toMatchObject({ setIndex: 2, loggedLine: null });
    expect(vi.mocked(mod.update).mock.calls[0]?.[0]).toMatchObject({
      setIndex: 3,
      loggedLine: "Set 2 logged · 22.5 kg × 10",
    });
    expect(vi.mocked(mod.end).mock.calls[0]?.[0]).toMatchObject({ finished: true });
  });
});
