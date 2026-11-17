import type { PlanContent, WorkoutExercise, WorkoutSetTarget } from "@fitbud/contracts";
import {
  PLAN_COMPOSITION_LIMITS,
  sortedByOrder,
  updateExercise,
} from "../plan-composition";

function newId(): string {
  return crypto.randomUUID();
}

function blankSet(order: number): WorkoutSetTarget {
  return {
    id: newId(),
    order,
    reps: null,
    loadLabel: null,
    rpe: null,
    restSeconds: null,
    notes: null,
  };
}

function withOrder(sets: WorkoutSetTarget[]): WorkoutSetTarget[] {
  return sets.map((set, index) => ({ ...set, order: index + 1 }));
}

function mapExercise(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
  map: (exercise: WorkoutExercise) => WorkoutExercise,
): PlanContent {
  return {
    ...content,
    workoutDays: content.workoutDays.map((day) => {
      if (day.id !== dayId) return day;
      return {
        ...day,
        exercises: day.exercises.map((exercise) =>
          exercise.id === exerciseId ? map(exercise) : exercise,
        ),
      };
    }),
  };
}

export type ExercisePrescription = {
  setCount: number;
  reps: number | null;
  loadLabel: string | null;
  restSeconds: number | null;
  instructions: string | null;
};

/** Apply the properties-panel values across the exercise's set targets. */
export function applyExercisePrescription(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
  next: ExercisePrescription,
): PlanContent {
  const capped = Math.max(
    1,
    Math.min(PLAN_COMPOSITION_LIMITS.setsPerExercise, Math.round(next.setCount) || 1),
  );
  let updated = mapExercise(content, dayId, exerciseId, (exercise) => {
    const existing = sortedByOrder(exercise.setTargets);
    let sets = existing.slice(0, capped);
    while (sets.length < capped) {
      sets = [...sets, blankSet(sets.length + 1)];
    }
    sets = withOrder(
      sets.map((set) => ({
        ...set,
        reps: next.reps,
        loadLabel: next.loadLabel,
        restSeconds: next.restSeconds,
      })),
    );
    return { ...exercise, setTargets: sets };
  });
  updated = updateExercise(updated, dayId, exerciseId, {
    instructions: next.instructions,
  });
  return updated;
}
