/**
 * In-app model of mockups 27, 27b, 27c, and 27-android. The lock-screen rest
 * timer (27c, LA1c) is two optional fields: the device counts down to
 * `restEndsAt` itself, so the app sends one update when rest starts and one
 * when it ends or is skipped.
 */

export const WEIGHT_STEP_KG = 2.5;

export type LoggedSet = {
  setIndex: number;
  kilograms: number;
  reps: number;
};

export type LiveActivityState = {
  kilograms: number;
  reps: number;
  planKg: number;
  planReps: number;
  setIndex: number;
  setCount: number;
  lastKg: number;
  lastReps: number;
  loggedSet: LoggedSet | null;
  finished: boolean;
  /**
   * False when there is no previous value for this set (a first set with no
   * history): the activity then shows no "Last". Absent means known.
   */
  lastKnown?: boolean;
  /** Rest countdown end, epoch ms (27c). Absent or null: no rest. */
  restEndsAt?: number | null;
  /** Full rest length in seconds, for the progress bar. */
  restSeconds?: number | null;
};

export type RestWindow = {
  /** Epoch ms when rest ends. */
  endsAt: number;
  /** Full rest length in seconds. */
  seconds: number;
};

export type LiveActivityEvent =
  | { type: "weight"; direction: 1 | -1 }
  | { type: "reps"; direction: 1 | -1 }
  | { type: "log_set" };

export type LiveActivitySetLog = {
  operation: "workout.log_set";
  exerciseName: string;
  setIndex: number;
  kilograms: number;
  reps: number;
};

export const DEMO_LIVE_ACTIVITY: LiveActivityState = {
  kilograms: 22.5,
  reps: 10,
  planKg: 22.5,
  planReps: 10,
  setIndex: 2,
  setCount: 3,
  lastKg: 20,
  lastReps: 10,
  loggedSet: null,
  finished: false,
};

export function formatKg(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function stepWeight(kg: number, direction: 1 | -1): number {
  const next = Math.round((kg + direction * WEIGHT_STEP_KG) * 10) / 10;
  return next < 0 ? 0 : next;
}

export function setProgressLine(state: LiveActivityState): string {
  const set = `Set ${state.setIndex} of ${state.setCount}`;
  if (state.lastKnown === false) return set;
  return `${set} · Last: ${formatKg(state.lastKg)} kg × ${state.lastReps}`;
}

/**
 * Rest after a logged set (27c). The last set of a workout has no rest: a
 * finished state never carries rest fields.
 */
export function withRest(state: LiveActivityState, rest: RestWindow | null): LiveActivityState {
  if (!rest || state.finished || rest.seconds <= 0) return clearRest(state);
  return { ...state, restEndsAt: rest.endsAt, restSeconds: rest.seconds };
}

/** Skip (in the app or on the activity) and expiry both clear rest. */
export function clearRest(state: LiveActivityState): LiveActivityState {
  return { ...state, restEndsAt: null, restSeconds: null };
}

/** True while the countdown has time left at `now` (epoch ms). */
export function restActive(state: LiveActivityState, now: number): boolean {
  return state.restEndsAt != null && state.restEndsAt > now;
}

/** Clears rest once its end has passed, as the widget view does on its own. */
export function clearExpiredRest(state: LiveActivityState, now: number): LiveActivityState {
  return state.restEndsAt != null && !restActive(state, now) ? clearRest(state) : state;
}

/** 27c: "Next 22.5 kg × 10". */
export function nextValueLine(state: LiveActivityState): string {
  return `Next ${currentValueLine(state)}`;
}

export function loggedSetLine(state: LiveActivityState): string | null {
  if (!state.loggedSet) return null;
  const row = state.loggedSet;
  return `Set ${row.setIndex} logged · ${formatKg(row.kilograms)} kg × ${row.reps}`;
}

export function currentValueLine(state: LiveActivityState): string {
  return `${formatKg(state.kilograms)} kg × ${state.reps}`;
}

export function reduceLiveActivity(
  state: LiveActivityState,
  event: LiveActivityEvent,
): LiveActivityState {
  if (state.finished && event.type !== "log_set") return state;
  switch (event.type) {
    case "weight":
      return { ...state, kilograms: stepWeight(state.kilograms, event.direction) };
    case "reps":
      return { ...state, reps: Math.max(0, state.reps + event.direction) };
    case "log_set": {
      if (state.finished) return state;
      const loggedSet: LoggedSet = {
        setIndex: state.setIndex,
        kilograms: state.kilograms,
        reps: state.reps,
      };
      const nextIndex = state.setIndex + 1;
      const finished = nextIndex > state.setCount;
      return {
        ...state,
        loggedSet,
        lastKg: state.kilograms,
        lastReps: state.reps,
        lastKnown: true,
        setIndex: finished ? state.setIndex : nextIndex,
        kilograms: state.planKg,
        reps: state.planReps,
        finished,
      };
    }
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export function setLogFromState(
  state: LiveActivityState,
  exerciseName: string,
): LiveActivitySetLog {
  return {
    operation: "workout.log_set",
    exerciseName,
    setIndex: state.setIndex,
    kilograms: state.kilograms,
    reps: state.reps,
  };
}
