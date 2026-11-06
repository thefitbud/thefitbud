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
  /** Called for every food amount capped at the 100-unit contract limit. */
  onClamp?: (clamp: QuantityClamp) => void;
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

/** Contract max for a calculated item's quantityScaled: 100 units of the chosen serving. */
export const MAX_QUANTITY_SCALED = NUTRIENT_SCALE * 100;

/** An amount the generator had to shrink to fit the 100-unit contract limit. */
export type QuantityClamp = {
  slug: string;
  requestedGrams: number;
  servingLabel: string;
  requestedUnits: number;
  cappedUnits: number;
};

/**
 * Grams → library snapshot.
 * Household choice never uses a serving the library marks plausible = 0.
 * The first plausible household serving that divides evenly (within 6%) wins;
 * otherwise the plausible default stays, so the gram amount is unchanged.
 * An implausible default falls back to the gram serving, or the next plausible serving.
 * With `metricUnit` (the template amount is written as "100 g" / "100 ml"), a plausible
 * serving in that unit replaces the default, so an amount no household serving divides
 * stays in the unit the instruction text uses.
 */
export function foodByGrams(
  lib: DemoLibraryIndex,
  slug: string,
  grams: number,
  onClamp?: (clamp: QuantityClamp) => void,
  metricUnit?: "g" | "ml",
) {
  const entry = lib.foods[slug];
  if (!entry) throw new Error(`Demo seed: food ${slug} not loaded`);
  const implausible = new Set(entry.implausibleServingIds);
  const servings = entry.item.servings.filter((s) => s.conversionScaled != null);
  if (servings.length === 0) throw new Error(`Demo seed: food ${slug} has no servings`);
  // conversionScaled is grams per serving × NUTRIENT_SCALE (1 egg = 70_000_000).
  const gramsOf = (conversionScaled: number) => conversionScaled / NUTRIENT_SCALE;
  const plausible = servings.filter((s) => !implausible.has(s.id));
  if (plausible.length === 0) throw new Error(`Demo seed: food ${slug} has no plausible serving`);
  let best = plausible.find((s) => s.id === entry.defaultServingId);
  if (!best) {
    // The library default is plausible = 0. Use the gram serving, else the next plausible one.
    best = plausible.find((s) => s.unit === "g") ?? plausible[0]!;
  }
  const metric = metricUnit ? plausible.find((s) => s.unit === metricUnit) : undefined;
  if (metric) best = metric;
  let bestQty = grams / gramsOf(best.conversionScaled!);
  for (const serving of servings) {
    if (serving.unit === "g" || implausible.has(serving.id)) continue;
    const qty = grams / gramsOf(serving.conversionScaled!);
    const rounded = Math.round(qty * 2) / 2;
    if (rounded >= 0.5 && rounded <= 6 && Math.abs(qty - rounded) / qty < 0.06) {
      best = serving;
      bestQty = rounded;
      break;
    }
  }
  // The plan contract (and the plan editor) allow at most 100 units of the chosen
  // serving, so on a 1 g/unit serving the item tops out at 100 g. Callers that pass
  // onClamp hear every cap: plan generation records it, and deviation logging throws.
  const wanted = Math.max(1, Math.round(bestQty * NUTRIENT_SCALE));
  const qtyScaled = Math.min(MAX_QUANTITY_SCALED, wanted);
  if (qtyScaled < wanted) {
    onClamp?.({
      slug,
      requestedGrams: grams,
      servingLabel: best.label,
      requestedUnits: wanted / NUTRIENT_SCALE,
      cappedUnits: qtyScaled / NUTRIENT_SCALE,
    });
  }
  return foodSnapshotFromLibrary(entry.item, best.id, qtyScaled);
}

/** "100 g" → "g", "250 ml" → "ml"; household labels ("1 katori") → undefined. */
function metricLabelUnit(label: string): "g" | "ml" | undefined {
  const match = /^\d+(?:\.\d+)? (g|ml)$/.exec(label);
  return match ? (match[1] as "g" | "ml") : undefined;
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
        foodByGrams(
          lib,
          item.slug,
          Math.max(5, Math.round((item.grams * scale) / 5) * 5),
          opts.onClamp,
          metricLabelUnit(item.label),
        ),
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
