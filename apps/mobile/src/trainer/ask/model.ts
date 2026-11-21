/**
 * TM-10 ask detail helpers: pain copy, quote, context rows, coaching subtitle.
 */
import type {
  CoachAsk,
  ExerciseExecution,
  MealAssignment,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import {
  askIssueLine,
  askMentionsPain,
  shortAgeLabel,
} from "../attention/needsYouModel";

export type AskContextRows = {
  about: string;
  loggedSoFar: string | null;
  plan: string | null;
};

export function askQuestionQuote(ask: CoachAsk): string {
  const line = askIssueLine(ask);
  if (line.startsWith("“") || line.startsWith('"')) return line;
  return `“${line.replace(/^["“]|["”]$/g, "")}”`;
}

export function askPainBanner(): string {
  return "Mentions pain. Reply soon, and suggest stopping the exercise if it’s sharp pain.";
}

/** "Fat loss · week 3 · 12 min ago" (age without the trailing "ago" from formatRelative). */
export function askSubtitle(input: {
  goalShort: string | null | undefined;
  weekNumber: number | null;
  lastAskedAt: string;
  nowMs?: number;
}): string {
  const ageMins = Math.max(
    0,
    Math.round(
      ((input.nowMs ?? Date.now()) - Date.parse(input.lastAskedAt)) / 60_000,
    ),
  );
  const age = `${shortAgeLabel(Number.isFinite(ageMins) ? ageMins : 0)} ago`;
  const week =
    input.weekNumber != null ? `week ${input.weekNumber}` : null;
  return [input.goalShort?.trim() || null, week, age].filter(Boolean).join(" · ");
}

export function coachingWeekNumber(
  startedAt: string | null | undefined,
  untilMs = Date.now(),
): number | null {
  if (!startedAt) return null;
  const elapsed = untilMs - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function setPair(load: string | null | undefined, reps: number | null | undefined): string {
  const kg = (load ?? "").replace(/\s*kg$/i, "").trim();
  if (kg && reps != null) return `${kg} × ${reps}`;
  if (kg) return kg;
  if (reps != null) return `${reps} reps`;
  return "—";
}

function loggedSetsLine(exercise: ExerciseExecution): string {
  const done = [...exercise.sets]
    .filter((s) => s.status === "completed" || s.status === "modified")
    .sort((a, b) => a.order - b.order);
  if (done.length === 0) return "—";
  return done
    .map((s) => setPair(s.actualLoadLabel ?? s.prescribedLoadLabel, s.actualReps))
    .join(" · ");
}

function planLineForExercise(
  assignment: WorkoutAssignment,
  exerciseId: string | null,
): string | null {
  const exercises = [...(assignment.workoutDay?.exercises ?? [])].sort(
    (a, b) => a.order - b.order,
  );
  const match =
    (exerciseId
      ? exercises.find((ex) => ex.id === exerciseId)
      : null) ?? exercises[0];
  if (!match) return null;
  const targets = [...match.setTargets].sort((a, b) => a.order - b.order);
  const count = targets.length;
  const reps = targets.map((t) => t.reps).filter((r): r is number => r != null);
  const load = targets[0]?.loadLabel?.replace(/\s*kg$/i, "").trim() || null;
  let setsPart: string;
  if (reps.length === 0) {
    setsPart = `${count} ${count === 1 ? "set" : "sets"}`;
  } else {
    const min = Math.min(...reps);
    const max = Math.max(...reps);
    const repPart = min === max ? `${min}` : `${min}–${max}`;
    setsPart = `${count} × ${repPart}`;
  }
  return load ? `${setsPart} · ${load} kg` : setsPart;
}

export function contextFromWorkout(input: {
  ask: CoachAsk;
  assignment: WorkoutAssignment | null;
  execution: WorkoutExecution | null;
}): AskContextRows {
  const { ask, assignment, execution } = input;
  if (!assignment) {
    return {
      about: ask.itemLabel?.trim() || labelFor("coach_ask_item_type", ask.itemType),
      loggedSoFar: null,
      plan: null,
    };
  }

  let exercise: ExerciseExecution | undefined;
  if (ask.itemType === "exercise_execution" && execution) {
    exercise = execution.exercises.find((ex) => ex.id === ask.itemId);
  }
  if (!exercise && execution) {
    exercise = [...execution.exercises].sort((a, b) => a.order - b.order)[0];
  }

  const setHint =
    exercise != null
      ? (() => {
          const pending = exercise.sets.find((s) => s.status === "pending");
          const lastDone = [...exercise.sets]
            .filter((s) => s.status === "completed" || s.status === "modified")
            .sort((a, b) => b.order - a.order)[0];
          const order = pending?.order ?? lastDone?.order;
          return order != null ? `set ${order}` : null;
        })()
      : null;

  const aboutParts = [
    exercise?.name ?? assignment.workoutDayName,
    setHint,
  ].filter(Boolean);

  return {
    about: aboutParts.join(" · "),
    loggedSoFar: exercise ? loggedSetsLine(exercise) : null,
    plan: planLineForExercise(assignment, exercise?.exerciseId ?? null),
  };
}

export function contextFromMeal(
  ask: CoachAsk,
  meal: MealAssignment | null,
): AskContextRows {
  if (!meal) {
    return {
      about: ask.itemLabel?.trim() || "Meal",
      loggedSoFar: null,
      plan: null,
    };
  }
  return {
    about: meal.mealName || ask.itemLabel || "Meal",
    loggedSoFar:
      meal.compliance?.outcome != null
        ? labelFor("meal_compliance_outcome", meal.compliance.outcome)
        : null,
    plan: meal.prescription?.name?.trim() || null,
  };
}

export function buildAskContext(input: {
  ask: CoachAsk;
  assignment: WorkoutAssignment | null;
  execution: WorkoutExecution | null;
  meal: MealAssignment | null;
}): AskContextRows {
  if (
    input.ask.itemType === "workout_assignment" ||
    input.ask.itemType === "exercise_execution"
  ) {
    return contextFromWorkout(input);
  }
  if (input.ask.itemType === "meal_assignment") {
    return contextFromMeal(input.ask, input.meal);
  }
  return {
    about:
      input.ask.itemLabel?.trim() ||
      labelFor("coach_ask_item_type", input.ask.itemType),
    loggedSoFar: null,
    plan: null,
  };
}

export { askMentionsPain };
