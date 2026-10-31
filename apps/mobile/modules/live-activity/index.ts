import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * Local Expo module `LiveActivity` (ios/LiveActivityModule.swift, task LA1).
 * iOS only; `null` on Android, web, Expo Go and any build without the module.
 * Call it through src/notifications/liveActivityNative.ts, never directly.
 */

/** FitBudWorkoutAttributes (static for the activity's lifetime). */
export type NativeWorkoutAttributes = {
  workoutName: string;
  /** fitbud://workout/{assignmentId} */
  openUrl: string;
};

/** FitBudWorkoutAttributes.ContentState: same field names as the Swift struct. */
export type NativeWorkoutContentState = {
  exerciseName: string;
  setIndex: number;
  setCount: number;
  kilograms: number;
  reps: number;
  planKilograms: number;
  planReps: number;
  lastKilograms: number;
  lastReps: number;
  loggedLine: string | null;
  finished: boolean;
};

export type LiveActivityNativeModule = {
  isSupported(): boolean;
  start(
    attributes: NativeWorkoutAttributes,
    state: NativeWorkoutContentState,
  ): Promise<string | null>;
  update(state: NativeWorkoutContentState): Promise<void>;
  end(finalState?: NativeWorkoutContentState | null): Promise<void>;
};

export function loadLiveActivityModule(): LiveActivityNativeModule | null {
  return requireOptionalNativeModule<LiveActivityNativeModule>("LiveActivity");
}
