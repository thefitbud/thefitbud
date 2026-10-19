/** In-app model of the Live Activity in mockups 27, 27b, and 27c. */

export const WEIGHT_STEP_KG = 2.5;
export const REST_SECONDS = 58;

export type LiveActivityPhase = "logging" | "rest" | "go";

export type LiveActivityState = {
  phase: LiveActivityPhase;
  kilograms: number;
  reps: number;
  restLeft: number;
  setIndex: number;
  setCount: number;
};

export type LiveActivityEvent =
  | { type: "weight"; direction: 1 | -1 }
  | { type: "reps"; direction: 1 | -1 }
  | { type: "log_set" }
  | { type: "add_rest" }
  | { type: "skip_rest" }
  | { type: "tick" };

export type LiveActivitySetLog = {
  operation: "workout.log_set";
  exerciseName: string;
  setIndex: number;
  kilograms: number;
  reps: number;
};

export const DEMO_LIVE_ACTIVITY: LiveActivityState = {
  phase: "logging",
  kilograms: 22.5,
  reps: 10,
  restLeft: REST_SECONDS,
  setIndex: 2,
  setCount: 3,
};

export function formatKg(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function stepWeight(kg: number, direction: 1 | -1): number {
  const next = Math.round((kg + direction * WEIGHT_STEP_KG) * 10) / 10;
  return next < 0 ? 0 : next;
}

export function reduceLiveActivity(
  state: LiveActivityState,
  event: LiveActivityEvent,
): LiveActivityState {
  switch (event.type) {
    case "weight":
      if (state.phase !== "logging") return state;
      return { ...state, kilograms: stepWeight(state.kilograms, event.direction) };
    case "reps":
      if (state.phase !== "logging") return state;
      return { ...state, reps: Math.max(0, state.reps + event.direction) };
    case "log_set":
      if (state.phase !== "logging") return state;
      return { ...state, phase: "rest", restLeft: REST_SECONDS };
    case "add_rest":
      if (state.phase !== "rest") return state;
      return { ...state, restLeft: state.restLeft + 30 };
    case "skip_rest":
      if (state.phase !== "rest") return state;
      return { ...state, phase: "go", restLeft: 0 };
    case "tick":
      if (state.phase !== "rest") return state;
      if (state.restLeft <= 1) return { ...state, phase: "go", restLeft: 0 };
      return { ...state, restLeft: state.restLeft - 1 };
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
