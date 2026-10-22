/** In-app model of mockups 27, 27b, 27c, and 27-android. No rest timer. */

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
  return `Set ${state.setIndex} of ${state.setCount} · Last: ${formatKg(state.lastKg)} kg × ${state.lastReps}`;
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
