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
 * JS side of the iOS Live Activity bridge (task LA1). Local updates only:
 * no push token, APNs or network.
 *
 * - iOS 16.2+ with Live Activities on: calls the local `LiveActivity` module.
 * - Android, web, older iOS, Live Activities off, or a build without the
 *   module: every call does nothing (the module is never loaded off iOS).
 * - Never throws. A native error becomes a no-op and one warning carrying
 *   only the error name (no workout data, no message text).
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
};

export type LiveActivityNativeDeps = {
  platformOS: string;
  loadModule: () => LiveActivityNativeModule | null;
  warn?: (message: string) => void;
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
    lastKilograms: state.lastKg,
    lastReps: state.lastReps,
    loggedLine: loggedSetLine(state),
    finished: state.finished,
  };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export function createLiveActivityNative(deps: LiveActivityNativeDeps): LiveActivityNative {
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  let loaded = false;
  let cached: LiveActivityNativeModule | null = null;

  function nativeModule(): LiveActivityNativeModule | null {
    if (deps.platformOS !== "ios") return null;
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

  function supportedModule(): LiveActivityNativeModule | null {
    const mod = nativeModule();
    if (!mod) return null;
    try {
      return mod.isSupported() ? mod : null;
    } catch (error) {
      warn(`[liveActivity] isSupported failed: ${errorName(error)}`);
      return null;
    }
  }

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

/** The app's instance. LA1b's liveActivitySession.ts is its only caller. */
export const liveActivityNative: LiveActivityNative = createLiveActivityNative({
  platformOS: Platform.OS,
  loadModule: loadLiveActivityModule,
});

/**
 * Debug-only device check for LA1 (dev builds only, never in release). In
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
