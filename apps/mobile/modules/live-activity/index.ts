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

/** The running activity's rest, read back when the app becomes active. */
export type NativeRestState = {
  running: boolean;
  restEndsAt?: number | null;
};

/**
 * One row the lock-screen "Log set" button appended to the App Group (LA2).
 * The widget writes these four values and nothing else; an unreadable row
 * comes back with an empty name or set index 0.
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
   * Lock-screen rows waiting to be drained into the sync outbox (LA2).
   * Optional: a dev build made before LA2 has no such function, and the
   * drain then does nothing.
   */
  readOutbox?(): NativeOutboxRead;
  /** Drops the first `count` rows (the drained ones); returns how many went. */
  removeOutbox?(count: number): number;
};

export function loadLiveActivityModule(): LiveActivityNativeModule | null {
  return requireOptionalNativeModule<LiveActivityNativeModule>("LiveActivity");
}
