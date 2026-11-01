import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * Local Expo module `LiveActivity`: one module name, one call surface, two
 * implementations — ios/LiveActivityModule.swift, a Live Activity (LA1), and
 * android/.../LiveActivityModule.kt, an ongoing notification (LA3). `null` on
 * web, in Expo Go and in any build without the module.
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
  /** Null when there is no previous value: the activity shows no "Last". */
  lastKilograms: number | null;
  lastReps: number | null;
  loggedLine: string | null;
  finished: boolean;
  /** Rest countdown end, epoch ms (LA1c, frame 27c). Null: no rest. */
  restEndsAt: number | null;
  /** Full rest length in seconds, for the progress bar. */
  restSeconds: number | null;
};

/**
 * The running activity's rest, read back when the app becomes active. The
 * Android notification has no countdown yet (LA3c, D-W3-3), so there it
 * answers `running` alone.
 */
export type NativeRestState = {
  running: boolean;
  restEndsAt?: number | null;
};

/**
 * One row a "Log set" button appended outside the app: the iOS widget to the
 * shared App Group (LA2), the Android notification's button to
 * SharedPreferences (WorkoutSetStore, LA3). Either side writes these five
 * values and nothing else; an unreadable row comes back with an empty name or
 * set index 0.
 */
export type NativeOutboxRow = {
  operation: string;
  exerciseName: string;
  setIndex: number;
  kilograms: number;
  reps: number;
};

/** What `readOutbox()` returns: the rows oldest first, plus the running activity. */
export type NativeOutboxRead = {
  rows: NativeOutboxRow[];
  /** `fitbud://?workout={assignmentId}` of the running activity, when there is one. */
  openUrl?: string | null;
};

export type LiveActivityNativeModule = {
  isSupported(): boolean;
  start(
    attributes: NativeWorkoutAttributes,
    state: NativeWorkoutContentState,
  ): Promise<string | null>;
  update(state: NativeWorkoutContentState): Promise<void>;
  end(finalState?: NativeWorkoutContentState | null): Promise<void>;
  restState(): NativeRestState;
  /**
   * Rows waiting to be drained into the sync outbox: the App Group's on iOS
   * (LA2), the notification store's on Android (LA3). Optional on both: a dev
   * build made before them has no such function, and the drain then does
   * nothing.
   */
  readOutbox?(): NativeOutboxRead;
  /** Drops the first `count` rows (the drained ones); returns how many went. */
  removeOutbox?(count: number): number;
};

export function loadLiveActivityModule(): LiveActivityNativeModule | null {
  return requireOptionalNativeModule<LiveActivityNativeModule>("LiveActivity");
}
