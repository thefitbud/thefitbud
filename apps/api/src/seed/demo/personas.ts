/** Persona definitions and v2 library index for demo seed (T24). */
import type { AdherenceState } from "@fitbud/contracts";
import type { FoodLibraryItem, PlanContent } from "@fitbud/contracts";
import {
  foodSnapshotFromLibrary,
  GLOBAL_CHECKIN_FORM_VERSION_ID,
} from "@fitbud/core";
import type { SqlJsCompatDatabase } from "../../test-support/memory-db.js";
import { demoUuid } from "./ids.js";
import { DEMO_ACCOUNTS, type DemoAccountSpec } from "./spec.js";

export const DEMO_ANITA_PENDING_INVITE_TOKEN =
  "fitbud-demo-anita-invite-pending";

export const DEMO_LIBRARY_FOOD_SLUGS = [
  "chapati-roti",
  "poha",
  "idli",
  "sambar",
  "oatmeal-cooked-with-water",
] as const;

export const DEMO_LIBRARY_EXERCISE_SLUGS = [
  "push-up",
  "back-squat-barbell",
] as const;

export type DemoLibraryFood = {
  id: string;
  slug: string;
  defaultServingId: string;
  item: FoodLibraryItem;
};

export type DemoLibraryExercise = {
  id: string;
  slug: string;
  name: string;
};

export type DemoLibraryIndex = {
  foods: Record<(typeof DEMO_LIBRARY_FOOD_SLUGS)[number], DemoLibraryFood>;
  exercises: Record<
    (typeof DEMO_LIBRARY_EXERCISE_SLUGS)[number],
    DemoLibraryExercise
  >;
};

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
  | "food_deviations"
  | "dual_role";

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
  const foods = {} as DemoLibraryIndex["foods"];
  for (const slug of DEMO_LIBRARY_FOOD_SLUGS) {
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
      `SELECT id, label, unit, conversion_scaled FROM food_library_servings
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
    };
  }

  const exercises = {} as DemoLibraryIndex["exercises"];
  for (const slug of DEMO_LIBRARY_EXERCISE_SLUGS) {
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

const WORKOUT_DAY_ID = demoUuid("workout-day", "strength");

export function buildStandardPlanContent(
  lib: DemoLibraryIndex,
  variant: "v1" | "v2" = "v2",
): PlanContent {
  const breakfastFood =
    variant === "v1"
      ? lib.foods["oatmeal-cooked-with-water"]
      : lib.foods["chapati-roti"];
  const lunchFood = lib.foods.poha;
  const breakfastItem = foodSnapshotFromLibrary(
    breakfastFood.item,
    breakfastFood.defaultServingId,
    100_000_000,
  );
  const lunchItem = foodSnapshotFromLibrary(
    lunchFood.item,
    lunchFood.defaultServingId,
    100_000_000,
  );
  const exercise = lib.exercises["push-up"];
  return {
    workoutDays: [
      {
        id: WORKOUT_DAY_ID,
        order: 1,
        name: "Strength",
        weekday: 1,
        required: true,
        exercises: [
          {
            id: demoUuid("plan-exercise", "push-up"),
            order: 1,
            name: exercise.name,
            instructions: null,
            primaryMuscles: [],
            secondaryMuscles: [],
            equipment: [],
            difficulty: null,
            setTargets: [
              {
                id: demoUuid("set-target", "push-up-1"),
                order: 1,
                reps: 10,
                loadLabel: null,
                rpe: null,
              },
            ],
            sourceExerciseLibraryItemId: exercise.id,
          },
        ],
      },
    ],
    mealPrescriptions: [
      {
        id: MEAL_PRESCRIPTION_IDS.breakfast,
        order: 1,
        name: "Breakfast",
        mealType: "breakfast",
        applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        localTime: "08:00",
        scheduleHint: null,
        instructions: null,
        photoRequired: false,
        required: true,
        items: [breakfastItem],
      },
      {
        id: MEAL_PRESCRIPTION_IDS.lunch,
        order: 2,
        name: "Lunch",
        mealType: "lunch",
        applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        localTime: "13:00",
        scheduleHint: null,
        instructions: null,
        photoRequired: false,
        required: true,
        items: [lunchItem],
      },
      {
        id: MEAL_PRESCRIPTION_IDS.dinner,
        order: 3,
        name: "Dinner",
        mealType: "dinner",
        applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        localTime: "20:00",
        scheduleHint: null,
        instructions: null,
        photoRequired: false,
        required: true,
        items: [lunchItem],
      },
      {
        id: MEAL_PRESCRIPTION_IDS.snack,
        order: 4,
        name: "Snack",
        mealType: "snack",
        applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
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

export const DEMO_CHECKIN_FORM_VERSION_ID = GLOBAL_CHECKIN_FORM_VERSION_ID;

export { MEAL_PRESCRIPTION_IDS, WORKOUT_DAY_ID };
