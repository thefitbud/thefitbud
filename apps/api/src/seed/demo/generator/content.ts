/**
 * Turns catalogue templates into PlanContent with honest library snapshots.
 * Existing personas keep the fixed meal-prescription / workout-day ids that
 * history overlays and E2E depend on.
 */
import { NUTRIENT_SCALE, type PlanContent } from "@fitbud/contracts";
import { foodSnapshotFromLibrary } from "@fitbud/core";
import { demoUuid } from "../ids.js";
import { MEAL_PRESCRIPTION_IDS, WORKOUT_DAY_IDS, type DemoLibraryIndex } from "../personas.js";
import { dietTemplate, type DietTemplate } from "./templates/diets.js";
import { workoutTemplate, type WorkoutTemplate } from "./templates/workouts.js";

/** Natural training weekdays per program (0 = Sunday). */
export const TEMPLATE_WEEKDAYS: Record<string, number[]> = {
  W01: [1, 3, 5],
  W02: [1, 2, 4, 6],
  W03: [1, 2, 3, 4, 5, 6],
  W04: [1, 2, 4, 6],
  W05: [1, 2, 4, 6],
  W06: [1, 3, 5],
  W07: [1, 3, 5],
  W08: [2, 4, 6],
  W09: [1, 2, 4, 6],
  W10: [1, 3, 5],
  W11: [1, 3, 5],
  W12: [1, 2, 4, 6],
};

const FIXED_WORKOUT_IDS = [
  WORKOUT_DAY_IDS.monday,
  WORKOUT_DAY_IDS.tuesday,
  WORKOUT_DAY_IDS.thursday,
  WORKOUT_DAY_IDS.saturday,
];

export type ContentOptions = {
  workout: string | null;
  diet: string | null;
  /** Multiplies every food gram amount (rounded to 5 g). */
  dietScale?: number;
  /** Multiplies every planned load (strength block 2 heavier, deload lighter). */
  loadScale?: number;
  /** Force these weekdays (existing personas: Mon/Tue/Thu/Sat). */
  weekdays?: number[];
  /** Use the shared fixed ids so overlays and E2E keep working. */
  fixedIds?: boolean;
  /** Id namespace for non-fixed ids (persona + version key). */
  idKey: string;
  /** Per-persona estimated working loads (kg) keyed by exercise slug. */
  loads?: Record<string, number>;
  /** Overrides meal local times by meal type. */
  mealTimes?: Partial<Record<string, string>>;
};

function bottomReps(reps: string): number | null {
  const match = /^(\d+)/.exec(reps.trim());
  if (!match) return null;
  if (/\b(s|min|m)\b/.test(reps) && !/\/(leg|side|arm)/.test(reps)) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 100 ? value : null;
}

function loadLabelFor(slug: string, loads: Record<string, number> | undefined, scale: number): string {
  const base = loads?.[slug];
  if (base == null) {
    if (/push-up|plank|pull-up|chin-up|dead-bug|bird-dog|bridge|squat-baithak|dand|mountain|burpee|jacks|stretch|pose|walk|jog|run|bike|sprint|skipping|surya|leg-raise|crunch|twist|hip-lift|scapular|inverted|lunge$/.test(slug)) {
      return "Bodyweight";
    }
    return "Moderate";
  }
  const kg = Math.round((base * scale) / 2.5) * 2.5;
  return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)} kg`;
}

export function workoutDaysFor(
  lib: DemoLibraryIndex,
  template: WorkoutTemplate,
  opts: ContentOptions,
): PlanContent["workoutDays"] {
  const weekdays = opts.weekdays ?? TEMPLATE_WEEKDAYS[template.code] ?? [1, 3, 5];
  return weekdays.map((weekday, index) => {
    const day = template.days[index % template.days.length]!;
    const dayId =
      opts.fixedIds && index < FIXED_WORKOUT_IDS.length
        ? FIXED_WORKOUT_IDS[index]!
        : demoUuid("workout-day", opts.idKey, String(index + 1));
    const repeat = index >= template.days.length;
    return {
      id: dayId,
      order: index + 1,
      name: repeat ? `${day.name} (repeat)` : day.name,
      weekday,
      required: true,
      instructions: `${template.title}. Leave 1–2 reps in reserve unless the RPE says otherwise.`,
      exercises: day.exercises.map((exercise, exIndex) => {
        const libraryExercise = lib.exercises[exercise.slug];
        if (!libraryExercise) throw new Error(`Demo seed: exercise ${exercise.slug} not loaded`);
        const key = `${opts.idKey}-${index + 1}-${exIndex + 1}`;
        const reps = bottomReps(exercise.reps);
        const loadLabel = loadLabelFor(exercise.slug, opts.loads, opts.loadScale ?? 1);
        return {
          id: demoUuid("plan-exercise", key),
          order: exIndex + 1,
          name: libraryExercise.name,
          instructions: `Progression: ${exercise.progression}.`,
          primaryMuscles: [],
          secondaryMuscles: [],
          equipment: [],
          difficulty: null,
          setTargets: Array.from({ length: exercise.sets }, (_, setIndex) => ({
            id: demoUuid("set-target", `${key}-${setIndex + 1}`),
            order: setIndex + 1,
            reps,
            loadLabel,
            rpe: exercise.rpe,
            restSeconds: exercise.restSeconds,
            notes: reps === null || exercise.reps !== String(reps) ? exercise.reps : null,
          })),
          sourceExerciseLibraryItemId: libraryExercise.id,
        };
      }),
    };
  });
}

/** Grams → library snapshot, preferring a household serving that divides evenly. */
export function foodByGrams(lib: DemoLibraryIndex, slug: string, grams: number) {
  const entry = lib.foods[slug];
  if (!entry) throw new Error(`Demo seed: food ${slug} not loaded`);
  const servings = entry.item.servings.filter((s) => s.conversionScaled != null);
  // conversionScaled is grams per serving × NUTRIENT_SCALE (1 egg = 70_000_000).
  const gramsOf = (conversionScaled: number) => conversionScaled / NUTRIENT_SCALE;
  let best = servings.find((s) => s.id === entry.defaultServingId) ?? servings[0]!;
  let bestQty = grams / gramsOf(best.conversionScaled!);
  for (const serving of servings) {
    if (serving.unit === "g") continue;
    const qty = grams / gramsOf(serving.conversionScaled!);
    const rounded = Math.round(qty * 2) / 2;
    if (rounded >= 0.5 && rounded <= 6 && Math.abs(qty - rounded) / qty < 0.06) {
      best = serving;
      bestQty = rounded;
      break;
    }
  }
  const qtyScaled = Math.max(1, Math.round(bestQty * NUTRIENT_SCALE));
  return foodSnapshotFromLibrary(entry.item, best.id, qtyScaled);
}

export function mealPrescriptionsFor(
  lib: DemoLibraryIndex,
  template: DietTemplate,
  opts: ContentOptions,
): PlanContent["mealPrescriptions"] {
  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  let snackSeen = 0;
  const scale = opts.dietScale ?? 1;
  return template.meals.map((meal, index) => {
    let id: string;
    if (opts.fixedIds && meal.mealType !== "snack") {
      id = MEAL_PRESCRIPTION_IDS[meal.mealType];
    } else if (opts.fixedIds && snackSeen === 0) {
      snackSeen += 1;
      id = MEAL_PRESCRIPTION_IDS.snack;
    } else {
      id = demoUuid("meal-rx", opts.idKey, String(index + 1));
    }
    return {
      id,
      order: index + 1,
      name: meal.name,
      mealType: meal.mealType,
      applicableWeekdays: everyDay,
      localTime: opts.mealTimes?.[meal.mealType] ?? meal.localTime,
      scheduleHint: null,
      instructions: meal.items.map((item) => item.label).join(" · "),
      photoRequired: false,
      required: meal.mealType !== "snack",
      items: meal.items.map((item) =>
        foodByGrams(lib, item.slug, Math.max(5, Math.round((item.grams * scale) / 5) * 5)),
      ),
    };
  });
}

export function buildTemplateContent(lib: DemoLibraryIndex, opts: ContentOptions): PlanContent {
  return {
    workoutDays: opts.workout ? workoutDaysFor(lib, workoutTemplate(opts.workout), opts) : [],
    mealPrescriptions: opts.diet ? mealPrescriptionsFor(lib, dietTemplate(opts.diet), opts) : [],
  };
}

export function dayKcal(content: PlanContent): { kcal: number; protein: number } {
  let kcal = 0;
  let protein = 0;
  for (const meal of content.mealPrescriptions) {
    for (const item of meal.items ?? []) {
      kcal += (item.calculated.energyKcalScaled ?? 0) / NUTRIENT_SCALE;
      protein += (item.calculated.proteinScaled ?? 0) / NUTRIENT_SCALE;
    }
  }
  return { kcal, protein };
}
