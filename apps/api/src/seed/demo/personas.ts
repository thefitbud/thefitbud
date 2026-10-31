/** Persona definitions and v2 library index for demo seed (T24). */
import type { AdherenceState } from "@fitbud/contracts";
import type { FoodLibraryItem, PlanContent } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { foodSnapshotFromLibrary } from "@fitbud/core";
import type { SqlJsCompatDatabase } from "../../test-support/memory-db.js";
import { demoUuid } from "./ids.js";
import { DEMO_ACCOUNTS, type DemoAccountSpec } from "./spec.js";
import { DIET_TEMPLATE_SLUGS } from "./generator/templates/diets.js";
import { WORKOUT_TEMPLATE_SLUGS } from "./generator/templates/workouts.js";

export const DEMO_ANITA_PENDING_INVITE_TOKEN =
  "fitbud-demo-anita-invite-pending";

export const DEMO_LIBRARY_FOOD_SLUGS = [
  "chapati-roti",
  "idli",
  "sambar",
  "oatmeal-cooked-with-water",
  "scrambled-egg",
  "rice-boiled-parboiled",
] as const;

export const DEMO_LIBRARY_EXERCISE_SLUGS = [
  "push-up",
  "bench-press-barbell",
  "dumbbell-shoulder-press",
  "barbell-curl",
  "goblet-squat",
  "romanian-deadlift-barbell",
  "dumbbell-step-ups",
  "leg-press",
  "lying-leg-curls",
  "calf-raise-bodyweight",
  "back-squat-barbell",
] as const;

export type DemoLibraryFood = {
  id: string;
  slug: string;
  defaultServingId: string;
  item: FoodLibraryItem;
  /** Servings the library flags plausible = 0 (e.g. odd INDB recipe portions). */
  implausibleServingIds: string[];
};

export type DemoLibraryExercise = {
  id: string;
  slug: string;
  name: string;
};

/** Restaurant / swap dishes used for realistic meal deviations. */
export const DEMO_DEVIATION_FOOD_SLUGS = [
  "butter-chicken",
  "naan",
  "vegetable-biryani",
  "plain-dosa",
  "vegetable-samosa",
  "mutton-biryani",
] as const;

export type DemoLibraryIndex = {
  foods: Record<string, DemoLibraryFood>;
  exercises: Record<string, DemoLibraryExercise>;
};

/** Every slug the seed resolves (base personas + template catalogue + deviations). */
export function demoLibrarySlugs(): { foods: string[]; exercises: string[] } {
  return {
    foods: [
      ...new Set<string>([
        ...DEMO_LIBRARY_FOOD_SLUGS,
        ...DIET_TEMPLATE_SLUGS,
        ...DEMO_DEVIATION_FOOD_SLUGS,
      ]),
    ],
    exercises: [
      ...new Set<string>([...DEMO_LIBRARY_EXERCISE_SLUGS, ...WORKOUT_TEMPLATE_SLUGS]),
    ],
  };
}

export type DemoPersonaKey =
  | "main_trainer"
  | "second_trainer"
  | "invite_pending"
  | "onboarding_incomplete"
  | "awaiting_review"
  | "active_on_track"
  | "slipping"
  | "acknowledged"
  | "reminders_paused"
  | "notifications_off"
  | "ended"
  | "reactivation_pending"
  | "dubai_meal_times"
  | "attention_hole"
  | "food_deviations"
  | "dual_role"
  | "first_run";

export type DemoPersonaSpec = {
  key: DemoPersonaKey;
  account: DemoAccountSpec;
  adherence?: AdherenceState;
  historyDays?: number;
  coachingActive?: boolean;
};

export const DEMO_PERSONAS: DemoPersonaSpec[] = DEMO_ACCOUNTS.map((account) => ({
  key: account.state as DemoPersonaKey,
  account,
  adherence: adherenceForState(account.state as DemoPersonaKey),
  historyDays: account.role === "trainee" ? 28 : undefined,
  coachingActive: !["onboarding_incomplete", "awaiting_review"].includes(
    account.state,
  ),
}));

function adherenceForState(state: DemoPersonaKey): AdherenceState | undefined {
  switch (state) {
    case "active_on_track":
    case "food_deviations":
      return "on_track";
    case "slipping":
    case "acknowledged":
    case "attention_hole":
      return "needs_attention";
    case "reminders_paused":
      return "no_recent_data";
    case "onboarding_incomplete":
    case "awaiting_review":
      return "not_available";
    default:
      return undefined;
  }
}

export function personaByEmail(email: string): DemoPersonaSpec | undefined {
  return DEMO_PERSONAS.find((p) => p.account.email === email);
}

export function loadDemoLibraryIndex(
  sqlite: Pick<SqlJsCompatDatabase, "exec">,
): DemoLibraryIndex {
  const slugs = demoLibrarySlugs();
  const foods = {} as DemoLibraryIndex["foods"];
  for (const slug of slugs.foods) {
    const rows = sqlite.exec(
      `SELECT id, slug, default_serving_id, name, classification, nutrition_basis,
        energy_kcal_scaled, protein_grams_scaled, carbs_grams_scaled, fat_grams_scaled,
        created_at, updated_at
       FROM food_library_items
       WHERE slug = '${slug.replace(/'/g, "''")}' AND ownership = 'global' AND status = 'active'
       LIMIT 1`,
    );
    const head = rows[0]?.values[0] as unknown[] | undefined;
    if (!head) {
      throw new Error(`Demo seed: missing library food slug "${slug}"`);
    }
    const foodId = String(head[0]);
    const defaultServingId = String(head[2]);
    const servingRows = sqlite.exec(
      `SELECT id, label, unit, conversion_scaled, plausible FROM food_library_servings
       WHERE food_library_item_id = '${foodId.replace(/'/g, "''")}' ORDER BY sort_order`,
    );
    const servings = (servingRows[0]?.values ?? []).map((row) => ({
      id: String(row[0]),
      label: String(row[1]),
      unit: String(row[2]),
      conversionScaled: row[3] as number,
    }));
    if (servings.length === 0) {
      throw new Error(`Demo seed: food "${slug}" has no servings`);
    }
    const implausibleServingIds = (servingRows[0]?.values ?? [])
      .filter((row) => Number(row[4]) === 0)
      .map((row) => String(row[0]));
    const item: FoodLibraryItem = {
      id: foodId,
      ownership: "global",
      trainerUserId: null,
      name: String(head[3]),
      cuisineRegion: "indian",
      classification: String(head[4]) as FoodLibraryItem["classification"],
      basis: String(head[5]) as FoodLibraryItem["basis"],
      energyKcalScaled: head[6] as number,
      proteinScaled: head[7] as number,
      carbsScaled: head[8] as number,
      fatScaled: head[9] as number,
      servings,
      notes: null,
      description: null,
      status: "active",
      createdAt: String(head[10]),
      updatedAt: String(head[11]),
    };
    foods[slug] = {
      id: foodId,
      slug,
      defaultServingId,
      item,
      implausibleServingIds,
    };
  }

  const exercises = {} as DemoLibraryIndex["exercises"];
  for (const slug of slugs.exercises) {
    const rows = sqlite.exec(
      `SELECT id, slug, name FROM exercise_library_items
       WHERE slug = '${slug.replace(/'/g, "''")}' AND ownership = 'global' AND status = 'active' LIMIT 1`,
    );
    const row = rows[0]?.values[0];
    if (!row) {
      throw new Error(`Demo seed: missing library exercise slug "${slug}"`);
    }
    exercises[slug] = {
      id: String(row[0]),
      slug: String(row[1]),
      name: String(row[2]),
    };
  }

  return { foods, exercises };
}

/** SQL subquery for a global food id by slug (wrangler path without TS index). */
export function foodIdSql(slug: string): string {
  return `(SELECT id FROM food_library_items WHERE slug='${slug.replace(/'/g, "''")}' AND ownership='global' AND status='active' LIMIT 1)`;
}

export function exerciseIdSql(slug: string): string {
  return `(SELECT id FROM exercise_library_items WHERE slug='${slug.replace(/'/g, "''")}' AND ownership='global' AND status='active' LIMIT 1)`;
}

const MEAL_PRESCRIPTION_IDS = {
  breakfast: demoUuid("meal-rx", "breakfast"),
  lunch: demoUuid("meal-rx", "lunch"),
  dinner: demoUuid("meal-rx", "dinner"),
  snack: demoUuid("meal-rx", "snack"),
};

const WORKOUT_DAY_IDS = {
  monday: demoUuid("workout-day", "upper-a"),
  tuesday: demoUuid("workout-day", "lower-a"),
  thursday: demoUuid("workout-day", "upper-b"),
  saturday: demoUuid("workout-day", "lower-b"),
} as const;

const WORKOUT_DAY_ID = WORKOUT_DAY_IDS.monday;

/** Demo prescriptions: ~1,850 kcal and ~110 g protein per day (fat-loss shape). */
export function buildStandardPlanContent(
  lib: DemoLibraryIndex,
  variant: "v1" | "v2" = "v2",
): PlanContent {
  const food = (slug: (typeof DEMO_LIBRARY_FOOD_SLUGS)[number], servings: number) => {
    const entry = lib.foods[slug]!;
    return foodSnapshotFromLibrary(
      entry.item,
      entry.defaultServingId,
      Math.round(servings * NUTRIENT_SCALE),
    );
  };
  const ex = (slug: (typeof DEMO_LIBRARY_EXERCISE_SLUGS)[number]) =>
    lib.exercises[slug]!;
  const exercise = (
    key: string,
    order: number,
    libraryEx: DemoLibraryExercise,
    opts: {
      sets: number;
      reps: number;
      loadLabel?: string | null;
      restSeconds?: number | null;
      instructions?: string | null;
      name?: string;
    },
  ) => ({
    id: demoUuid("plan-exercise", key),
    order,
    name: opts.name ?? libraryEx.name,
    instructions: opts.instructions ?? null,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: [],
    difficulty: null,
    setTargets: Array.from({ length: opts.sets }, (_, i) => ({
      id: demoUuid("set-target", `${key}-${i + 1}`),
      order: i + 1,
      reps: opts.reps,
      loadLabel: opts.loadLabel ?? null,
      rpe: null,
      restSeconds: opts.restSeconds ?? null,
    })),
    sourceExerciseLibraryItemId: libraryEx.id,
  });
  const breakfastItems =
    variant === "v1"
      ? [food("oatmeal-cooked-with-water", 1), food("scrambled-egg", 2)]
      : [food("scrambled-egg", 2), food("chapati-roti", 3)];
  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  // Mockup week: Upper A / Lower A / Rest / Upper B / Rest / Lower B / Rest
  // Lower body B = 6 exercises × 3 sets = 18 sets (TR-10 / TR-10b).
  return {
    workoutDays: [
      {
        id: WORKOUT_DAY_IDS.monday,
        order: 1,
        name: "Upper body A",
        weekday: 1,
        required: true,
        instructions: "Push focus. Leave 1–2 reps in reserve.",
        exercises: [
          exercise("upper-a-bench", 1, ex("bench-press-barbell"), {
            sets: 3,
            reps: 8,
            loadLabel: "40 kg",
            restSeconds: 90,
          }),
          exercise("upper-a-ohp", 2, ex("dumbbell-shoulder-press"), {
            sets: 3,
            reps: 10,
            loadLabel: "12 kg",
            restSeconds: 75,
          }),
          exercise("upper-a-pushup", 3, ex("push-up"), {
            sets: 3,
            reps: 12,
            loadLabel: "Bodyweight",
            restSeconds: 60,
          }),
          exercise("upper-a-curl", 4, ex("barbell-curl"), {
            sets: 3,
            reps: 12,
            loadLabel: "15 kg",
            restSeconds: 60,
          }),
        ],
      },
      {
        id: WORKOUT_DAY_IDS.tuesday,
        order: 2,
        name: "Lower body A",
        weekday: 2,
        required: true,
        instructions: null,
        exercises: [
          exercise("lower-a-squat", 1, ex("back-squat-barbell"), {
            sets: 3,
            reps: 8,
            loadLabel: "50 kg",
            restSeconds: 120,
          }),
          exercise("lower-a-rdl", 2, ex("romanian-deadlift-barbell"), {
            sets: 3,
            reps: 10,
            loadLabel: "40 kg",
            restSeconds: 90,
          }),
          exercise("lower-a-legpress", 3, ex("leg-press"), {
            sets: 3,
            reps: 12,
            loadLabel: "80 kg",
            restSeconds: 90,
          }),
          exercise("lower-a-curl", 4, ex("lying-leg-curls"), {
            sets: 3,
            reps: 12,
            loadLabel: "25 kg",
            restSeconds: 60,
          }),
        ],
      },
      {
        id: WORKOUT_DAY_IDS.thursday,
        order: 3,
        name: "Upper body B",
        weekday: 4,
        required: true,
        instructions: null,
        exercises: [
          exercise("upper-b-pushup", 1, ex("push-up"), {
            sets: 3,
            reps: 12,
            loadLabel: "Bodyweight",
            restSeconds: 60,
          }),
          exercise("upper-b-ohp", 2, ex("dumbbell-shoulder-press"), {
            sets: 3,
            reps: 10,
            loadLabel: "10 kg",
            restSeconds: 75,
          }),
          exercise("upper-b-curl", 3, ex("barbell-curl"), {
            sets: 3,
            reps: 12,
            loadLabel: "12 kg",
            restSeconds: 60,
          }),
        ],
      },
      {
        id: WORKOUT_DAY_IDS.saturday,
        order: 4,
        name: "Lower body B",
        weekday: 6,
        required: true,
        instructions:
          "Keep two reps in reserve on every set this week. Slow on the way down.",
        exercises: [
          exercise("lower-b-goblet", 1, ex("goblet-squat"), {
            sets: 3,
            reps: 12,
            loadLabel: "14 kg",
            restSeconds: 90,
            instructions: "Sit between your heels, chest up.",
          }),
          exercise("lower-b-rdl", 2, ex("romanian-deadlift-barbell"), {
            sets: 3,
            reps: 10,
            loadLabel: "20 kg",
            restSeconds: 90,
            instructions: "Soft knees, push the hips back.",
            name: "Romanian deadlift",
          }),
          exercise("lower-b-stepups", 3, ex("dumbbell-step-ups"), {
            sets: 3,
            reps: 10,
            loadLabel: "Bodyweight",
            restSeconds: 60,
            instructions:
              "Replaces walking lunges until your knee settles.",
            name: "Step-ups",
          }),
          exercise("lower-b-legpress", 4, ex("leg-press"), {
            sets: 3,
            reps: 12,
            loadLabel: "70 kg",
            restSeconds: 90,
          }),
          exercise("lower-b-curl", 5, ex("lying-leg-curls"), {
            sets: 3,
            reps: 12,
            loadLabel: "20 kg",
            restSeconds: 60,
          }),
          exercise("lower-b-calf", 6, ex("calf-raise-bodyweight"), {
            sets: 3,
            reps: 15,
            loadLabel: "Bodyweight",
            restSeconds: 45,
          }),
        ],
      },
    ],
    mealPrescriptions: [
      {
        id: MEAL_PRESCRIPTION_IDS.breakfast,
        order: 1,
        name: "Breakfast",
        mealType: "breakfast",
        applicableWeekdays: everyDay,
        localTime: "08:00",
        scheduleHint: null,
        instructions: null,
        photoRequired: false,
        required: true,
        items: breakfastItems,
      },
      {
        id: MEAL_PRESCRIPTION_IDS.lunch,
        order: 2,
        name: "Lunch",
        mealType: "lunch",
        applicableWeekdays: everyDay,
        localTime: "13:00",
        scheduleHint: null,
        instructions: null,
        photoRequired: false,
        required: true,
        items: [
          food("rice-boiled-parboiled", 0.7),
        ],
      },
      {
        id: MEAL_PRESCRIPTION_IDS.dinner,
        order: 3,
        name: "Dinner",
        mealType: "dinner",
        applicableWeekdays: everyDay,
        localTime: "20:00",
        scheduleHint: null,
        instructions: null,
        photoRequired: false,
        required: true,
        items: [
          food("chapati-roti", 2),
        ],
      },
      {
        id: MEAL_PRESCRIPTION_IDS.snack,
        order: 4,
        name: "Snack",
        mealType: "snack",
        applicableWeekdays: everyDay,
        localTime: "17:00",
        scheduleHint: null,
        instructions: null,
        photoRequired: false,
        required: false,
        items: [],
      },
    ],
  };
}

/** Pinned to the global form version. Do not insert a second global version. */
export const DEMO_CHECKIN_FORM_VERSION_ID =
  "c1000001-0000-4000-8000-000000000011";

export { MEAL_PRESCRIPTION_IDS, WORKOUT_DAY_ID, WORKOUT_DAY_IDS };
