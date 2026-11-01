import { Platform } from "react-native";
import {
  loadLiveActivityModule,
  type LiveActivityNativeModule,
  type NativeWorkoutAttributes,
  type NativeWorkoutContentState,
} from "../../modules/live-activity";
import {
  DEMO_LIVE_ACTIVITY,
  loggedSetLine,
  reduceLiveActivity,
  type LiveActivityState,
} from "./liveActivity";

/**
 * JS side of the workout activity bridge (LA1 on iOS, LA3 on Android). Local
 * updates only: no push token, APNs, FCM or network.
 *
 * - iOS 16.2+ with Live Activities on: the local `LiveActivity` module shows
 *   the Live Activity.
 * - Android with notifications and the `workout` channel on: the same module
 *   name, the same calls, an ongoing notification instead (LA3).
 * - Web, older iOS, Live Activities or notifications off, or a build without
 *   the module: every call does nothing (the module is never loaded off the
 *   two native platforms, and `isSupported` decides the rest).
 * - Never throws. A native error becomes a no-op and one warning carrying
 *   only the error name (no workout data, no message text).
 *
 * The platform guard and the lazy module load live here once, in
 * `createLiveActivityModuleAccess`, and liveActivityOutbox.ts drains through
 * the same handle, so both platforms pass one guard (LA3b).
 */

export type LiveActivityWorkout = NativeWorkoutAttributes;

export type LiveActivityContent = {
  exerciseName: string;
  state: LiveActivityState;
};

export type LiveActivityNative = {
  isSupported(): boolean;
  /** Starts (or reuses) the workout activity; resolves to its id, or null. */
  start(workout: LiveActivityWorkout, content: LiveActivityContent): Promise<string | null>;
  update(content: LiveActivityContent): Promise<void>;
  end(finalContent?: LiveActivityContent): Promise<void>;
  /**
   * Whether the running activity still has rest. Null when unsupported, on
   * error, or when no activity is running. Used when the app becomes active:
   * a rest skipped on the lock screen ends the app's own rest (LA1c).
   */
  hasRest(): boolean | null;
};

export type LiveActivityModuleAccessDeps = {
  platformOS: string;
  loadModule: () => LiveActivityNativeModule | null;
  warn?: (message: string) => void;
};

export type LiveActivityNativeDeps = LiveActivityModuleAccessDeps & {
  /** An existing handle to reuse, so one app has one guard and one load. */
  access?: LiveActivityModuleAccess;
};

/**
 * The platforms that have a native `LiveActivity` module: iOS (Live Activity,
 * LA1) and Android (ongoing notification, LA3). Anywhere else the module is
 * never loaded.
 */
export function isLiveActivityPlatform(platformOS: string): boolean {
  return platformOS === "ios" || platformOS === "android";
}

/** A lazy, cached, never-throwing handle on the native module. */
export type LiveActivityModuleAccess = {
  /**
   * The module, or null off the native platforms, in a build without it, or
   * after a load error (warned once).
   */
  get(): LiveActivityNativeModule | null;
  /**
   * The module only while it can show the activity now: iOS Live Activities
   * on, or Android notifications and the `workout` channel on. Null otherwise.
   */
  supported(): LiveActivityNativeModule | null;
};

/** LiveActivityState → FitBudWorkoutAttributes.ContentState, field for field. */
export function toNativeContentState({
  exerciseName,
  state,
}: LiveActivityContent): NativeWorkoutContentState {
  return {
    exerciseName,
    setIndex: state.setIndex,
    setCount: state.setCount,
    kilograms: state.kilograms,
    reps: state.reps,
    planKilograms: state.planKg,
    planReps: state.planReps,
    lastKilograms: state.lastKnown === false ? null : state.lastKg,
    lastReps: state.lastKnown === false ? null : state.lastReps,
    loggedLine: loggedSetLine(state),
    finished: state.finished,
    restEndsAt: state.finished ? null : (state.restEndsAt ?? null),
    restSeconds: state.finished ? null : (state.restSeconds ?? null),
  };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

/**
 * The one platform guard and lazy module load for both native platforms. Used
 * by the wrapper below and by the outbox drain (LA3b): the drain takes `get()`
 * so a row written while notifications were on is still drained after they are
 * turned off, and never a lost set.
 */
export function createLiveActivityModuleAccess(
  deps: LiveActivityModuleAccessDeps,
): LiveActivityModuleAccess {
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  let loaded = false;
  let cached: LiveActivityNativeModule | null = null;

  function get(): LiveActivityNativeModule | null {
    if (!isLiveActivityPlatform(deps.platformOS)) return null;
    if (!loaded) {
      loaded = true;
      try {
        cached = deps.loadModule();
      } catch (error) {
        warn(`[liveActivity] load failed: ${errorName(error)}`);
        cached = null;
      }
    }
    return cached;
  }

  return {
    get,
    supported() {
      const mod = get();
      if (!mod) return null;
      try {
        return mod.isSupported() ? mod : null;
      } catch (error) {
        warn(`[liveActivity] isSupported failed: ${errorName(error)}`);
        return null;
      }
    },
  };
}

export function createLiveActivityNative(deps: LiveActivityNativeDeps): LiveActivityNative {
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  const access = deps.access ?? createLiveActivityModuleAccess(deps);
  const supportedModule = () => access.supported();

  return {
    isSupported() {
      return supportedModule() !== null;
    },

    async start(workout, content) {
      const mod = supportedModule();
      if (!mod) return null;
      try {
        const id = await mod.start(
          { workoutName: workout.workoutName, openUrl: workout.openUrl },
          toNativeContentState(content),
        );
        return id ?? null;
      } catch (error) {
        warn(`[liveActivity] start failed: ${errorName(error)}`);
        return null;
      }
    },

    async update(content) {
      const mod = supportedModule();
      if (!mod) return;
      try {
        await mod.update(toNativeContentState(content));
      } catch (error) {
        warn(`[liveActivity] update failed: ${errorName(error)}`);
      }
    },

    hasRest() {
      const mod = supportedModule();
      if (!mod) return null;
      try {
        const rest = mod.restState();
        if (!rest?.running) return null;
        return rest.restEndsAt != null;
      } catch (error) {
        warn(`[liveActivity] restState failed: ${errorName(error)}`);
        return null;
      }
    },

    async end(finalContent) {
      const mod = supportedModule();
      if (!mod) return;
      try {
        await mod.end(finalContent ? toNativeContentState(finalContent) : null);
      } catch (error) {
        warn(`[liveActivity] end failed: ${errorName(error)}`);
      }
    },
  };
}

/**
 * The app's handle on the native module, shared with the outbox drain so the
 * guard and the load exist once per app, not once per caller (LA3b).
 */
export const liveActivityModuleAccess: LiveActivityModuleAccess =
  createLiveActivityModuleAccess({
    platformOS: Platform.OS,
    loadModule: loadLiveActivityModule,
  });

/** The app's instance. LA1b's liveActivitySession.ts is its only caller. */
export const liveActivityNative: LiveActivityNative = createLiveActivityNative({
  platformOS: Platform.OS,
  loadModule: loadLiveActivityModule,
  access: liveActivityModuleAccess,
});

/**
 * Debug-only device check for LA1 (dev builds only, never in release). It is
 * registered when this file is first imported, which happens once LA1b's
 * workout-screen wiring (liveActivitySession.ts) is in the build. Then, in
 * React Native DevTools' console on the dev build:
 *   __fitbudLiveActivityDemo.start()   // shows the activity on the lock screen
 *   __fitbudLiveActivityDemo.update()  // logs a set: kg/reps and the logged line change
 *   __fitbudLiveActivityDemo.end()     // removes it
 */
export function createLiveActivityDemo(native: LiveActivityNative) {
  const exerciseName = "Romanian deadlift";
  let state: LiveActivityState = DEMO_LIVE_ACTIVITY;
  return {
    isSupported: () => native.isSupported(),
    start() {
      state = DEMO_LIVE_ACTIVITY;
      return native.start(
        { workoutName: "Lower body A", openUrl: "fitbud://today/self" },
        { exerciseName, state },
      );
    },
    update() {
      state = reduceLiveActivity(state, { type: "log_set" });
      return native.update({ exerciseName, state });
    },
    end() {
      return native.end({ exerciseName, state: { ...state, finished: true } });
    },
  };
}

if (typeof __DEV__ !== "undefined" && __DEV__) {
  (globalThis as { __fitbudLiveActivityDemo?: unknown }).__fitbudLiveActivityDemo =
    createLiveActivityDemo(liveActivityNative);
}
