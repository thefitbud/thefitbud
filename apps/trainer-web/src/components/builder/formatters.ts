import {
  NUTRIENT_SCALE,
  type MealFoodItem,
  type WorkoutExercise,
  type WorkoutSetTarget,
} from "@fitbud/contracts";
import { formatHhMmTime, formatNumber, labelFor } from "@fitbud/core";

/** Rest seconds → "2 min" / "90 s" for the properties panel and card summary. */
export function formatRestLabel(restSeconds: number | null | undefined): string {
  if (restSeconds == null || restSeconds <= 0) return "";
  if (restSeconds % 60 === 0) {
    const mins = restSeconds / 60;
    return `${formatNumber(mins)} min`;
  }
  return `${formatNumber(restSeconds)} s`;
}

/** Parse "2 min", "90 s", "120", "2m" into seconds. Empty → null. */
export function parseRestLabel(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const minMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)$/);
  if (minMatch) {
    const mins = Number(minMatch[1]);
    return Number.isFinite(mins) ? Math.round(mins * 60) : null;
  }
  const secMatch = trimmed.match(/^(\d+)\s*(s|sec|secs|second|seconds)?$/);
  if (secMatch) {
    const secs = Number(secMatch[1]);
    return Number.isFinite(secs) ? secs : null;
  }
  return null;
}

export function firstSet(exercise: WorkoutExercise): WorkoutSetTarget | null {
  return [...exercise.setTargets].sort((a, b) => a.order - b.order)[0] ?? null;
}

export function exerciseSummaryLine(exercise: WorkoutExercise): string {
  const sets = exercise.setTargets.length;
  const sample = firstSet(exercise);
  const parts: string[] = [];
  if (sets > 0 && sample?.reps != null) {
    parts.push(`${sets} sets × ${sample.reps} reps`);
  } else if (sets > 0) {
    parts.push(`${sets} ${sets === 1 ? "set" : "sets"}`);
  }
  if (sample?.loadLabel) parts.push(sample.loadLabel);
  const rest = formatRestLabel(sample?.restSeconds);
  if (rest) parts.push(`rest ${rest}`);
  return parts.join(" · ");
}

export function exerciseMetaLine(exercise: WorkoutExercise): string {
  const muscle = exercise.primaryMuscles[0]
    ? labelFor("body_part", exercise.primaryMuscles[0])
    : null;
  const equip = exercise.equipment[0]
    ? labelFor("equipment", exercise.equipment[0])
    : null;
  return [muscle, equip].filter(Boolean).join(" · ");
}

export function mealItemsLine(items: readonly MealFoodItem[]): string {
  if (items.length === 0) return "No foods yet";
  return items
    .map((item) => {
      const qty =
        item.snapshotKind === "calculated"
          ? `${item.quantityScaled / NUTRIENT_SCALE} ${item.serving.label}`
          : item.serving.label;
      return `${item.name}, ${qty}`;
    })
    .join(" · ");
}

export function mealKcal(items: readonly MealFoodItem[]): number | null {
  let total = 0;
  let any = false;
  for (const item of items) {
    const scaled = item.calculated?.energyKcalScaled;
    if (scaled == null) continue;
    any = true;
    total += scaled / NUTRIENT_SCALE;
  }
  return any ? Math.round(total) : null;
}

export function formatMealTime(localTime: string | null | undefined): string {
  if (!localTime) return "";
  return formatHhMmTime(localTime);
}
