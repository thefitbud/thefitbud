import type { WorkoutAssignment, WorkoutDay, WorkoutExercise } from "@fitbud/contracts";
import { addDaysToLocalDate, weekdayFromLocalDate } from "@fitbud/core";
import type { LiveActivityState } from "./liveActivity";

export type WorkoutPreviewPlan = {
  workoutName: string;
  exerciseName: string;
  bodyweight: boolean;
  state: LiveActivityState;
};

function parseKg(label: string | null | undefined): number | null {
  if (!label) return null;
  const match = /(\d+(?:\.\d+)?)\s*kg/i.exec(label);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Next open assignment in the window, earliest date first. */
export function nextWorkoutAssignment(
  items: readonly WorkoutAssignment[],
): WorkoutAssignment | null {
  const open = items.filter(
    (item) =>
      item.status !== "completed" &&
      item.status !== "skipped" &&
      item.status !== "missed",
  );
  open.sort((a, b) => a.localDate.localeCompare(b.localDate));
  return open[0] ?? null;
}

function planFromExercise(
  workoutName: string,
  exercise: WorkoutExercise,
): WorkoutPreviewPlan {
  const targets = [...exercise.setTargets].sort((a, b) => a.order - b.order);
  const first = targets[0];
  const kilograms = parseKg(first?.loadLabel);
  const reps = first?.reps ?? 8;
  const kg = kilograms ?? 0;
  return {
    workoutName,
    exerciseName: exercise.name,
    bodyweight: kilograms == null,
    state: {
      kilograms: kg,
      reps,
      planKg: kg,
      planReps: reps,
      setIndex: 1,
      setCount: Math.max(1, targets.length),
      lastKg: kg,
      lastReps: reps,
      loggedSet: null,
      finished: false,
    },
  };
}

export function planFromAssignment(
  assignment: WorkoutAssignment,
): WorkoutPreviewPlan | null {
  const exercises = [...assignment.workoutDay.exercises].sort(
    (a, b) => a.order - b.order,
  );
  const exercise = exercises[0];
  if (!exercise) return null;
  return planFromExercise(assignment.workoutDayName, exercise);
}

export function planFromWorkoutDay(day: WorkoutDay): WorkoutPreviewPlan | null {
  const exercises = [...day.exercises].sort((a, b) => a.order - b.order);
  const exercise = exercises[0];
  if (!exercise) return null;
  return planFromExercise(day.name, exercise);
}

/** Next plan day in the coming week that is not already finished. */
export function nextOpenPlanDay(
  days: readonly WorkoutDay[],
  today: string,
  finishedDates: ReadonlySet<string>,
): WorkoutDay | null {
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addDaysToLocalDate(today, offset);
    if (finishedDates.has(date)) continue;
    const weekday = weekdayFromLocalDate(date);
    const match = days.find((day) => day.weekday === weekday);
    if (match) return match;
  }
  return null;
}
