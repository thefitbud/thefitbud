/**
 * In-app model of mockups 27, 27b, 27c, 27-android, and TR-15d. The lock-screen
 * rest timer (27c, LA1c) is two optional fields: the device counts down to
 * `restEndsAt` itself, so the app sends one update when rest starts and one
 * when it ends or is skipped.
 *
 * Z12-48: bodyweight never prints "0 kg"; reps never print as 0; crossing an
 * exercise prints "{done} done · Next: {next}, set 1 of {n}"; JS owns the
 * workout advance (`lastExercise: false` keeps `finished` false after the
 * last set of a non-final exercise so Swift/Android can log without ending).
 */

import { restCountdownRender } from "./restCountdown";

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
  /**
   * True when the current load is bodyweight (no kg). Absent falls back to
   * `kilograms <= 0` so a missing flag still never prints "0 kg".
   */
  bodyweight?: boolean;
  /**
   * False when more exercises remain after this one. Logging the last set of
   * this exercise must not finish the workout — JS owns the advance and will
   * push the next exercise. Absent means this is the last exercise.
   */
  lastExercise?: boolean;
  /**
   * Name of the exercise just completed when the logged line crosses into
   * this one. Drives "{prev} done · Next: {current}, set 1 of {n}".
   */
  crossedFromExercise?: string | null;
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

/**
 * Bodyweight / no-load display when there is no positive kg. A positive load
 * always prints as kg (so a weighted set just logged while crossing into a BW
 * exercise still shows kg). Never treat kg ≤ 0 as a weighted "0 kg" line.
 */
export function isBodyweightState(
  state: Pick<LiveActivityState, "kilograms" | "bodyweight">,
): boolean {
  return !(state.kilograms > 0);
}

/**
 * A positive reps count: the given value, else the plan, else null (omit).
 * Never returns 0.
 */
export function effectiveReps(reps: number, planReps: number): number | null {
  if (reps > 0) return reps;
  if (planReps > 0) return planReps;
  return null;
}

/**
 * "22.5 kg × 10", "12 reps" (bodyweight), or null when there is no positive
 * reps count to show (omit the line).
 */
export function formatLoadReps(
  kilograms: number,
  reps: number,
  opts: { bodyweight?: boolean; planReps?: number } = {},
): string | null {
  const shown = effectiveReps(reps, opts.planReps ?? 0);
  if (shown == null) return null;
  const bodyweight = opts.bodyweight === true || (!(kilograms > 0) && opts.bodyweight !== false);
  if (bodyweight) return `${shown} reps`;
  return `${formatKg(kilograms)} kg × ${shown}`;
}

export function setProgressLine(state: LiveActivityState): string {
  const set = `Set ${state.setIndex} of ${state.setCount}`;
  if (state.lastKnown === false) return set;
  const last = formatLoadReps(state.lastKg, state.lastReps, {
    bodyweight: isBodyweightState({
      kilograms: state.lastKg,
      bodyweight: state.bodyweight,
    }),
    planReps: state.planReps,
  });
  if (!last) return set;
  return `${set} · Last: ${last}`;
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

/**
 * True while the countdown has time left at `now` (epoch ms). The rule lives
 * in restCountdown.ts, shared with the Android notification's repaint (LA3d),
 * so one definition decides when a rest is over on both surfaces.
 */
export function restActive(state: LiveActivityState, now: number): boolean {
  return (
    restCountdownRender(
      {
        restEndsAt: state.restEndsAt,
        restSeconds: state.restSeconds,
        // Forwarded so this caller asks the same question the Android
        // notification does. `withRest` already clears rest on a finished
        // state, so today no stored state carries `finished` with a rest still
        // running - but leaving it out meant the shared rule was only half
        // shared, and nothing failed if the finished clamp was removed here.
        finished: state.finished,
      },
      now,
    ).kind === "resting"
  );
}

/** Clears rest once its end has passed, as the widget view does on its own. */
export function clearExpiredRest(state: LiveActivityState, now: number): LiveActivityState {
  return state.restEndsAt != null && !restActive(state, now) ? clearRest(state) : state;
}

/** 27c: "Next 22.5 kg × 10" / "Next 12 reps". */
export function nextValueLine(state: LiveActivityState): string {
  const value = currentValueLine(state);
  return value ? `Next ${value}` : "Next";
}

/**
 * "{Exercise} done · Next: {Next}, set 1 of {n}" when the logged set crossed
 * into the next exercise (Z12-48 / ISSUE-MAP #11).
 */
export function crossingExerciseLine(
  doneExercise: string,
  nextExercise: string,
  setIndex: number,
  setCount: number,
): string {
  return `${doneExercise} done · Next: ${nextExercise}, set ${setIndex} of ${setCount}`;
}

/**
 * The logged / status line on the activity. Crossing an exercise wins over a
 * plain "Set n logged" line.
 */
export function activityLoggedLine(
  exerciseName: string,
  state: LiveActivityState,
): string | null {
  if (state.crossedFromExercise) {
    return crossingExerciseLine(
      state.crossedFromExercise,
      exerciseName,
      state.setIndex,
      state.setCount,
    );
  }
  return loggedSetLine(state);
}

export function loggedSetLine(state: LiveActivityState): string | null {
  if (!state.loggedSet) return null;
  const row = state.loggedSet;
  const load = formatLoadReps(row.kilograms, row.reps, {
    bodyweight: isBodyweightState({
      kilograms: row.kilograms,
      bodyweight: state.bodyweight,
    }),
    planReps: state.planReps,
  });
  if (!load) return null;
  return `Set ${row.setIndex} logged · ${load}`;
}

export function currentValueLine(state: LiveActivityState): string {
  return (
    formatLoadReps(state.kilograms, state.reps, {
      bodyweight: isBodyweightState(state),
      planReps: state.planReps,
    }) ?? ""
  );
}

export function reduceLiveActivity(
  state: LiveActivityState,
  event: LiveActivityEvent,
): LiveActivityState {
  if (state.finished && event.type !== "log_set") return state;
  switch (event.type) {
    case "weight":
      return {
        ...state,
        kilograms: stepWeight(state.kilograms, event.direction),
        // Stepping kg means the set is no longer bodyweight.
        bodyweight: false,
      };
    case "reps":
      return { ...state, reps: Math.max(0, state.reps + event.direction) };
    case "log_set": {
      if (state.finished) return state;
      const loggedReps = effectiveReps(state.reps, state.planReps) ?? state.reps;
      const loggedSet: LoggedSet = {
        setIndex: state.setIndex,
        kilograms: state.kilograms,
        reps: loggedReps,
      };
      const nextIndex = state.setIndex + 1;
      const pastLastSet = nextIndex > state.setCount;
      // JS owns the workout advance: the last set of a non-final exercise
      // must not mark the workout finished (Z12-48). Swift/Android read
      // `moreExercisesRemain` from the same flag.
      const finished = pastLastSet && state.lastExercise !== false;
      return {
        ...state,
        loggedSet,
        lastKg: state.kilograms,
        lastReps: loggedReps,
        lastKnown: true,
        setIndex: pastLastSet ? state.setIndex : nextIndex,
        kilograms: state.planKg,
        reps: state.planReps,
        finished,
        // Crossing is owned by the session once it pushes the next exercise.
        crossedFromExercise: null,
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
    reps: effectiveReps(state.reps, state.planReps) ?? state.reps,
  };
}
