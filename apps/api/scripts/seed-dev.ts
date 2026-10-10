/**
 * Development-only seed for the local FitBud stack.
 *
 * The script drives the real HTTP API with `AUTH_MODE=test` identities instead
 * of writing to D1, so every seeded record passes the same ownership, state
 * transition, validation, and idempotency rules as production traffic, and
 * database access stays inside apps/api.
 *
 * Re-running is safe: the script reads current state before every mutation and
 * reuses deterministic identifiers and idempotency keys, so a second run
 * converges on the same world instead of duplicating it.
 *
 * Usage:
 *   pnpm db:seed:dev                              # from the repository root
 *   pnpm --filter @fitbud/api db:seed:dev
 *   FITBUD_SEED_API_URL=http://localhost:8787 node scripts/seed-dev.ts
 *
 * Requires Node 22.6+ (native TypeScript type stripping) and refuses to run
 * against anything other than a local API.
 */

import { createHash } from "node:crypto";
import process from "node:process";

import { foodSnapshotFromLibrary } from "@fitbud/core";
import { scaleDecimal } from "@fitbud/contracts";
import type {
  AdherenceState,
  AttentionFeedResponse,
  Checkin,
  CheckinListResponse,
  ClientDirectoryListResponse,
  ClientWorkspace,
  CoachingConfiguration,
  CoachingRelationship,
  CreatePlanResponse,
  CreateUploadTargetResponse,
  ExceptionListResponse,
  ExerciseDifficulty,
  ExerciseLibraryItem,
  ExerciseLibraryListResponse,
  FoodClassification,
  FoodLibraryItem,
  FoodLibraryListResponse,
  MealType,
  NutritionBasis,
  OnboardingFieldDefinition,
  OnboardingFormResponse,
  OnboardingFormTemplateDetail,
  OnboardingFormTemplateListResponse,
  Invitation,
  InvitationListResponse,
  MealAssignment,
  MealDeviationKind,
  MealAssignmentListResponse,
  MealFoodItem,
  MealPrescription,
  MeasurementListResponse,
  PlanContent,
  PlanListResponse,
  PlanTemplate,
  PlanTemplateListResponse,
  PlanTemplateType,
  PlanVersion,
  PlanWithVersions,
  ProgressEntryListResponse,
  Role,
  ScheduleCheckinResponse,
  TrainerCheckinInboxResponse,
  TrainerNoteListResponse,
  TraineeProfile,
  WorkoutAssignment,
  WorkoutAssignmentListResponse,
  WorkoutDay,
  WorkoutExecution,
} from "@fitbud/contracts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "http://127.0.0.1:8787";

/** Only these hosts count as a developer machine. */
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1"]);

/** Namespace for derived UUIDs and idempotency keys; bump it to seed a fresh world. */
const SEED_NAMESPACE = "fitbud-seed-dev-v1";

const TRAINER_EMAIL = "coach@example.com";
const TRAINER_DISPLAY_NAME = "Coach Ramesh Kulkarni";

/** Matches the uid the trainer web sign-in form derives from the email. */
const TRAINER_UID = `trainer-${TRAINER_EMAIL}`;

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

let currentScope = "";

function setScope(scope: string): void {
  currentScope = scope;
}

function log(message: string): void {
  console.log(currentScope ? `  ${currentScope} · ${message}` : `  ${message}`);
}

function heading(message: string): void {
  setScope("");
  console.log(`\n${message}`);
}

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

function digest(...parts: string[]): string {
  return createHash("sha256")
    .update([SEED_NAMESPACE, ...parts].join("|"))
    .digest("hex");
}

/** RFC 4122 v4-shaped UUID derived from a seed so reruns reuse the same ids. */
function stableUuid(...parts: string[]): string {
  const hex = digest("uuid", ...parts);
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** Header-safe (ASCII) yet stable key, since titles may contain punctuation. */
function idempotencyKey(...parts: string[]): string {
  const readable = parts.join(":").replace(/[^\x20-\x7e]+/g, "-").slice(0, 96);
  return `${SEED_NAMESPACE}:${readable}:${digest("idem", ...parts).slice(0, 16)}`;
}

/** Stable value in [0, 1) so adherence patterns do not drift between runs. */
function roll(...parts: string[]): number {
  return Number.parseInt(digest("roll", ...parts).slice(0, 8), 16) / 0x1_0000_0000;
}

// ---------------------------------------------------------------------------
// Date helpers (UTC instants, trainee-local calendar dates)
// ---------------------------------------------------------------------------

function localDateIn(timeZone: string, offsetDays = 0): string {
  const instant = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + days));
  return [
    String(next.getUTCFullYear()),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function eachLocalDate(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return dates;
}

/** Contiguous [from, to] ranges of dates that have no assignment yet. */
function uncoveredRanges(
  from: string,
  to: string,
  covered: Set<string>,
): [string, string][] {
  const ranges: [string, string][] = [];
  let start: string | null = null;
  let previous: string | null = null;

  for (const date of eachLocalDate(from, to)) {
    if (covered.has(date)) {
      if (start && previous) ranges.push([start, previous]);
      start = null;
      previous = null;
      continue;
    }
    if (!start) start = date;
    previous = date;
  }
  if (start && previous) ranges.push([start, previous]);
  return ranges;
}

function isoDaysAgo(days: number, hourUtc = 7): string {
  const instant = new Date(Date.now() - days * 86_400_000);
  instant.setUTCHours(hourUtc, 0, 0, 0);
  return instant.toISOString();
}

// ---------------------------------------------------------------------------
// Test identity tokens (mirrors apps/api/src/auth/firebase.ts)
// ---------------------------------------------------------------------------

function createTestIdToken(uid: string, email: string): string {
  const payload = JSON.stringify({ uid, email });
  return `test.${Buffer.from(payload, "utf8").toString("base64url")}`;
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

type Actor = { token: string; role: Role; label: string };

type ApiResponse<T> = {
  status: number;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type RequestInput = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  actor: Actor;
  body?: unknown;
  idempotencyKey?: string;
};

let baseUrl = DEFAULT_BASE_URL;
let requestCount = 0;

class SeedError extends Error {}

async function call<T>(input: RequestInput): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${input.actor.token}`,
    "x-fitbud-role": input.actor.role,
    accept: "application/json",
  };
  if (input.body !== undefined) headers["content-type"] = "application/json";
  if (input.idempotencyKey) headers["idempotency-key"] = input.idempotencyKey;

  requestCount += 1;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${input.path}`, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch (cause) {
    throw new SeedError(
      `Request to the FitBud API failed: ${input.method} ${input.path} at ${baseUrl}.\n` +
        `If the API is not running, start it with: pnpm --filter @fitbud/api dev\n` +
        `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  const envelope = parsed as { data?: T; error?: { code?: string; message?: string } } | null;

  return {
    status: response.status,
    data: envelope?.data ?? null,
    errorCode: envelope?.error?.code ?? null,
    errorMessage: envelope?.error?.message ?? null,
  };
}

/** Perform a request and fail loudly unless the status is 2xx or explicitly tolerated. */
async function expectOk<T>(
  input: RequestInput,
  tolerate: string[] = [],
): Promise<ApiResponse<T>> {
  const result = await call<T>(input);
  if (result.status >= 200 && result.status < 300) return result;
  if (result.errorCode && tolerate.includes(result.errorCode)) return result;
  throw new SeedError(
    `${input.method} ${input.path} failed with ${result.status} ` +
      `${result.errorCode ?? "UNKNOWN"}: ${result.errorMessage ?? "no message"} ` +
      `(actor: ${input.actor.label})`,
  );
}

async function getData<T>(actor: Actor, path: string): Promise<T> {
  const result = await expectOk<T>({ method: "GET", path, actor });
  if (result.data === null) {
    throw new SeedError(`GET ${path} returned an empty envelope.`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Plan content builders
// ---------------------------------------------------------------------------

type SetSpec = { reps: number; loadLabel: string; rpe: number | null };
type ExerciseSpec = { name: string; instructions: string; sets: SetSpec[] };
type WorkoutDaySpec = { name: string; weekday: number; exercises: ExerciseSpec[] };
type MealItemSpec = {
  foodName: string;
  servingLabel: string;
  quantity: number;
};
type MealSpec = {
  /** Custom label, separate from meal type. */
  name: string;
  mealType: MealType;
  applicableWeekdays: number[];
  localTime: string;
  instructions: string;
  photoRequired?: boolean;
  items: MealItemSpec[];
};
type ContentSpec = { days: WorkoutDaySpec[]; meals: MealSpec[] };

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

type ExerciseIdentity = {
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: ExerciseDifficulty;
};

/** Library and snapshot identity. Set targets stay on the plan, not on the library row. */
const EXERCISE_IDENTITY: Record<string, ExerciseIdentity> = {
  "Barbell Back Squat": {
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes", "core"],
    equipment: ["barbell"],
    difficulty: "intermediate",
  },
  "Romanian Deadlift": {
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes", "lower back"],
    equipment: ["barbell"],
    difficulty: "intermediate",
  },
  "Walking Lunge": {
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    equipment: ["dumbbells"],
    difficulty: "intermediate",
  },
  "Barbell Bench Press": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    equipment: ["barbell"],
    difficulty: "intermediate",
  },
  "Standing Overhead Press": {
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps", "core"],
    equipment: ["barbell"],
    difficulty: "intermediate",
  },
  "Cable Triceps Pushdown": {
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    equipment: ["cable"],
    difficulty: "beginner",
  },
  "Lat Pulldown": {
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper back"],
    equipment: ["cable"],
    difficulty: "beginner",
  },
  "Seated Cable Row": {
    primaryMuscles: ["upper back"],
    secondaryMuscles: ["biceps", "lats"],
    equipment: ["cable"],
    difficulty: "beginner",
  },
  "Hanging Leg Raise": {
    primaryMuscles: ["core"],
    secondaryMuscles: ["hip flexors"],
    equipment: ["pull-up bar"],
    difficulty: "intermediate",
  },
  "Goblet Squat": {
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    equipment: ["dumbbell"],
    difficulty: "beginner",
  },
  "Push-Up": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "core"],
    equipment: ["bodyweight"],
    difficulty: "beginner",
  },
  "Kettlebell Swing": {
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings", "core"],
    equipment: ["kettlebell"],
    difficulty: "intermediate",
  },
  "Rowing Machine Intervals": {
    primaryMuscles: ["cardio"],
    secondaryMuscles: ["lats"],
    equipment: ["rowing machine"],
    difficulty: "intermediate",
  },
  Plank: {
    primaryMuscles: ["core"],
    secondaryMuscles: ["shoulders"],
    equipment: ["bodyweight"],
    difficulty: "beginner",
  },
  "Farmer's Carry": {
    primaryMuscles: ["grip"],
    secondaryMuscles: ["core", "traps"],
    equipment: ["dumbbells"],
    difficulty: "intermediate",
  },
  "Box Squat": {
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    equipment: ["bodyweight"],
    difficulty: "beginner",
  },
  "Incline Dumbbell Press": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["shoulders", "triceps"],
    equipment: ["dumbbell"],
    difficulty: "intermediate",
  },
  "Cable Face Pull": {
    primaryMuscles: ["rear delts"],
    secondaryMuscles: ["upper back"],
    equipment: ["cable"],
    difficulty: "beginner",
  },
  "Hip Flexor Stretch": {
    primaryMuscles: ["hip flexors"],
    secondaryMuscles: [],
    equipment: ["bodyweight"],
    difficulty: "beginner",
  },
  "Brisk Walk": {
    primaryMuscles: ["cardio"],
    secondaryMuscles: [],
    equipment: [],
    difficulty: "beginner",
  },
  "Bulgarian Split Squat": {
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    equipment: ["dumbbells", "bench"],
    difficulty: "intermediate",
  },
  "Landmine Press": {
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps"],
    equipment: ["barbell", "landmine"],
    difficulty: "beginner",
  },
};

function exerciseIdentity(name: string): ExerciseIdentity {
  const identity = EXERCISE_IDENTITY[name];
  if (!identity) {
    throw new SeedError(`Exercise "${name}" has no primary and secondary muscles.`);
  }
  return identity;
}

function buildWorkoutDays(
  seed: string,
  days: WorkoutDaySpec[],
  exerciseIdsByName: ReadonlyMap<string, string>,
): WorkoutDay[] {
  return days.map((day, dayIndex) => ({
    id: stableUuid(seed, "day", day.name),
    order: dayIndex + 1,
    name: day.name,
    weekday: day.weekday,
    exercises: day.exercises.map((exercise, exerciseIndex) => {
      const identity = exerciseIdentity(exercise.name);
      const sourceExerciseLibraryItemId = exerciseIdsByName.get(exercise.name);
      return {
        id: stableUuid(seed, "day", day.name, "exercise", exercise.name),
        order: exerciseIndex + 1,
        name: exercise.name,
        instructions: exercise.instructions,
        primaryMuscles: identity.primaryMuscles,
        secondaryMuscles: identity.secondaryMuscles,
        equipment: identity.equipment,
        difficulty: identity.difficulty,
        ...(sourceExerciseLibraryItemId ? { sourceExerciseLibraryItemId } : {}),
        setTargets: exercise.sets.map((set, setIndex) => ({
          id: stableUuid(seed, "day", day.name, "ex", exercise.name, `set${setIndex}`),
          order: setIndex + 1,
          reps: set.reps,
          loadLabel: set.loadLabel,
          rpe: set.rpe,
        })),
      };
    }),
  }));
}

function mealItemFromLibrary(
  foodsByName: ReadonlyMap<string, FoodLibraryItem>,
  item: MealItemSpec,
): MealFoodItem {
  const food = foodsByName.get(item.foodName);
  if (!food) {
    throw new SeedError(`Food library is missing "${item.foodName}".`);
  }
  const serving = food.servings.find((row) => row.label === item.servingLabel);
  if (!serving) {
    throw new SeedError(
      `Food "${item.foodName}" has no serving "${item.servingLabel}".`,
    );
  }
  return foodSnapshotFromLibrary(food, serving.id, scaleDecimal(item.quantity));
}

function buildMealPrescriptions(
  seed: string,
  meals: MealSpec[],
  foodsByName: ReadonlyMap<string, FoodLibraryItem>,
): MealPrescription[] {
  return meals.map((meal, index) => ({
    id: stableUuid(seed, "meal", meal.name),
    order: index + 1,
    name: meal.name,
    mealType: meal.mealType,
    applicableWeekdays: meal.applicableWeekdays,
    localTime: meal.localTime,
    scheduleHint: null,
    instructions: meal.instructions,
    photoRequired: meal.photoRequired ?? false,
    items: meal.items.map((item) => mealItemFromLibrary(foodsByName, item)),
  }));
}

function buildPlanContent(
  seed: string,
  spec: ContentSpec,
  foodsByName: ReadonlyMap<string, FoodLibraryItem>,
  exerciseIdsByName: ReadonlyMap<string, string>,
): PlanContent {
  return {
    workoutDays: buildWorkoutDays(seed, spec.days, exerciseIdsByName),
    mealPrescriptions: buildMealPrescriptions(seed, spec.meals, foodsByName),
  };
}

// ---------------------------------------------------------------------------
// Realistic content library
// ---------------------------------------------------------------------------

const STRENGTH_DAYS: WorkoutDaySpec[] = [
  {
    name: "Lower Body Strength",
    weekday: 1,
    exercises: [
      {
        name: "Barbell Back Squat",
        instructions: "Brace before each rep. Stop two reps shy of failure.",
        sets: [
          { reps: 6, loadLabel: "60 kg", rpe: 7 },
          { reps: 6, loadLabel: "65 kg", rpe: 8 },
          { reps: 6, loadLabel: "65 kg", rpe: 8 },
        ],
      },
      {
        name: "Romanian Deadlift",
        instructions: "Hinge from the hips and keep the bar close to the shins.",
        sets: [
          { reps: 8, loadLabel: "50 kg", rpe: 7 },
          { reps: 8, loadLabel: "55 kg", rpe: 8 },
        ],
      },
      {
        name: "Walking Lunge",
        instructions: "Ten steps per leg with a controlled descent.",
        sets: [
          { reps: 10, loadLabel: "2 x 12 kg", rpe: 7 },
          { reps: 10, loadLabel: "2 x 12 kg", rpe: 8 },
        ],
      },
    ],
  },
  {
    name: "Upper Body Push",
    weekday: 3,
    exercises: [
      {
        name: "Barbell Bench Press",
        instructions: "Elbows at forty-five degrees, brief pause on the chest.",
        sets: [
          { reps: 6, loadLabel: "45 kg", rpe: 7 },
          { reps: 6, loadLabel: "50 kg", rpe: 8 },
          { reps: 6, loadLabel: "50 kg", rpe: 8 },
        ],
      },
      {
        name: "Standing Overhead Press",
        instructions: "Squeeze the glutes and avoid leaning back.",
        sets: [
          { reps: 8, loadLabel: "30 kg", rpe: 7 },
          { reps: 8, loadLabel: "30 kg", rpe: 8 },
        ],
      },
      {
        name: "Cable Triceps Pushdown",
        instructions: "Slow negatives with a full lockout at the bottom.",
        sets: [
          { reps: 12, loadLabel: "20 kg", rpe: 8 },
          { reps: 12, loadLabel: "20 kg", rpe: 8 },
        ],
      },
    ],
  },
  {
    name: "Upper Body Pull",
    weekday: 5,
    exercises: [
      {
        name: "Lat Pulldown",
        instructions: "Drive the elbows down and keep the chest tall.",
        sets: [
          { reps: 10, loadLabel: "45 kg", rpe: 7 },
          { reps: 10, loadLabel: "50 kg", rpe: 8 },
          { reps: 10, loadLabel: "50 kg", rpe: 8 },
        ],
      },
      {
        name: "Seated Cable Row",
        instructions: "Pause for a second at the sternum.",
        sets: [
          { reps: 10, loadLabel: "45 kg", rpe: 7 },
          { reps: 10, loadLabel: "45 kg", rpe: 8 },
        ],
      },
      {
        name: "Hanging Leg Raise",
        instructions: "Control the descent, no swinging.",
        sets: [
          { reps: 10, loadLabel: "Bodyweight", rpe: 8 },
          { reps: 10, loadLabel: "Bodyweight", rpe: 8 },
        ],
      },
    ],
  },
];

const CONDITIONING_DAYS: WorkoutDaySpec[] = [
  {
    name: "Full Body Circuit",
    weekday: 1,
    exercises: [
      {
        name: "Goblet Squat",
        instructions: "Heels planted, elbows inside the knees.",
        sets: [
          { reps: 12, loadLabel: "20 kg", rpe: 7 },
          { reps: 12, loadLabel: "20 kg", rpe: 8 },
        ],
      },
      {
        name: "Push-Up",
        instructions: "Full range, stop two reps short of failure.",
        sets: [
          { reps: 12, loadLabel: "Bodyweight", rpe: 7 },
          { reps: 12, loadLabel: "Bodyweight", rpe: 8 },
        ],
      },
      {
        name: "Kettlebell Swing",
        instructions: "Hip snap rather than a squat. Breathe out at the top.",
        sets: [
          { reps: 15, loadLabel: "16 kg", rpe: 7 },
          { reps: 15, loadLabel: "16 kg", rpe: 8 },
        ],
      },
    ],
  },
  {
    name: "Intervals and Core",
    weekday: 4,
    exercises: [
      {
        name: "Rowing Machine Intervals",
        instructions: "Six rounds of 250 m hard with 90 seconds easy.",
        sets: [{ reps: 6, loadLabel: "250 m", rpe: 8 }],
      },
      {
        name: "Plank",
        instructions: "Forty-five seconds with ribs down and glutes tight.",
        sets: [
          { reps: 1, loadLabel: "45 seconds", rpe: 7 },
          { reps: 1, loadLabel: "45 seconds", rpe: 8 },
        ],
      },
      {
        name: "Farmer's Carry",
        instructions: "Thirty metres per round with tall posture.",
        sets: [
          { reps: 1, loadLabel: "2 x 24 kg", rpe: 7 },
          { reps: 1, loadLabel: "2 x 24 kg", rpe: 8 },
        ],
      },
    ],
  },
];

const LOW_IMPACT_DAYS: WorkoutDaySpec[] = [
  {
    name: "Low Impact Full Body",
    weekday: 2,
    exercises: [
      {
        name: "Box Squat",
        instructions: "Sit back to the box and stand without rocking.",
        sets: [
          { reps: 10, loadLabel: "Bodyweight", rpe: 6 },
          { reps: 10, loadLabel: "Bodyweight", rpe: 7 },
        ],
      },
      {
        name: "Incline Dumbbell Press",
        instructions: "Thirty degree bench with a slow tempo.",
        sets: [
          { reps: 10, loadLabel: "2 x 10 kg", rpe: 6 },
          { reps: 10, loadLabel: "2 x 12 kg", rpe: 7 },
        ],
      },
      {
        name: "Cable Face Pull",
        instructions: "Pull to the forehead with thumbs back.",
        sets: [
          { reps: 15, loadLabel: "15 kg", rpe: 7 },
          { reps: 15, loadLabel: "15 kg", rpe: 7 },
        ],
      },
    ],
  },
  {
    name: "Mobility and Walk",
    weekday: 6,
    exercises: [
      {
        name: "Hip Flexor Stretch",
        instructions: "Two minutes per side, breathing into the stretch.",
        sets: [
          { reps: 2, loadLabel: "2 minutes", rpe: null },
          { reps: 2, loadLabel: "2 minutes", rpe: null },
        ],
      },
      {
        name: "Brisk Walk",
        instructions: "Thirty-five minutes at a conversational pace.",
        sets: [
          { reps: 1, loadLabel: "35 minutes", rpe: 5 },
          { reps: 1, loadLabel: "10 minutes cooldown", rpe: 4 },
        ],
      },
    ],
  },
];

const HIGH_PROTEIN_MEALS: MealSpec[] = [
  {
    name: "Masala oats with egg whites",
    mealType: "breakfast",
    applicableWeekdays: EVERY_DAY,
    localTime: "07:30",
    instructions: "50 g dry oats and four egg whites, with vegetables.",
    items: [
      { foodName: "Masala Oats", servingLabel: "50 g dry", quantity: 1 },
      { foodName: "Egg Whites", servingLabel: "1 egg white", quantity: 4 },
    ],
  },
  {
    name: "Rajma, brown rice and salad",
    mealType: "lunch",
    applicableWeekdays: EVERY_DAY,
    localTime: "13:00",
    instructions: "One katori of rajma, 150 g cooked brown rice, and a salad bowl.",
    items: [
      { foodName: "Rajma", servingLabel: "1 katori", quantity: 1 },
      { foodName: "Brown Rice", servingLabel: "150 g cooked", quantity: 1 },
      { foodName: "Kheera Tamatar Salad", servingLabel: "1 bowl", quantity: 1 },
    ],
  },
  {
    name: "Grilled chicken tikka with a roti",
    mealType: "dinner",
    applicableWeekdays: EVERY_DAY,
    localTime: "20:00",
    instructions: "180 g chicken tikka and one multigrain roti.",
    photoRequired: true,
    items: [
      { foodName: "Grilled Chicken Tikka", servingLabel: "180 g", quantity: 1 },
      { foodName: "Multigrain Roti", servingLabel: "1 roti", quantity: 1 },
    ],
  },
];

const FAT_LOSS_MEALS: MealSpec[] = [
  {
    name: "Moong dal chilla with curd",
    mealType: "breakfast",
    applicableWeekdays: EVERY_DAY,
    localTime: "08:00",
    instructions: "Two chillas with 150 g low fat curd.",
    items: [
      { foodName: "Moong Dal Chilla", servingLabel: "1 chilla", quantity: 2 },
      { foodName: "Low Fat Curd", servingLabel: "150 g", quantity: 1 },
    ],
  },
  {
    name: "Paneer bhurji with multigrain roti",
    mealType: "lunch",
    applicableWeekdays: EVERY_DAY,
    localTime: "13:30",
    instructions: "150 g paneer bhurji and two multigrain rotis.",
    items: [
      { foodName: "Paneer Bhurji", servingLabel: "150 g", quantity: 1 },
      { foodName: "Multigrain Roti", servingLabel: "1 roti", quantity: 2 },
    ],
  },
  {
    name: "Roasted chana and fruit",
    mealType: "snack",
    applicableWeekdays: EVERY_DAY,
    localTime: "17:00",
    instructions: "40 g roasted chana and one medium apple.",
    items: [
      { foodName: "Roasted Chana", servingLabel: "40 g", quantity: 1 },
      { foodName: "Apple", servingLabel: "1 medium", quantity: 1 },
    ],
  },
  {
    name: "Fish curry with sauteed vegetables",
    mealType: "dinner",
    applicableWeekdays: EVERY_DAY,
    localTime: "20:30",
    instructions: "180 g fish in a light curry and two cups of vegetables.",
    items: [
      { foodName: "Fish Curry", servingLabel: "180 g fish", quantity: 1 },
      { foodName: "Sauteed Vegetables", servingLabel: "1 cup", quantity: 2 },
    ],
  },
];

const RECOVERY_MEALS: MealSpec[] = [
  {
    name: "Ragi porridge with almonds",
    mealType: "breakfast",
    applicableWeekdays: EVERY_DAY,
    localTime: "08:00",
    instructions: "40 g ragi flour cooked in 200 ml toned milk, with ten almonds.",
    items: [
      { foodName: "Ragi Flour", servingLabel: "40 g", quantity: 1 },
      { foodName: "Toned Milk", servingLabel: "200 ml", quantity: 1 },
      { foodName: "Almonds", servingLabel: "10 almonds", quantity: 1 },
    ],
  },
  {
    name: "Curd rice with dal",
    mealType: "lunch",
    applicableWeekdays: EVERY_DAY,
    localTime: "13:00",
    instructions: "One cup of curd rice and half a katori of dal tadka.",
    items: [
      { foodName: "Curd Rice", servingLabel: "1 cup", quantity: 1 },
      { foodName: "Dal Tadka", servingLabel: "1/2 katori", quantity: 1 },
    ],
  },
  {
    name: "Vegetable khichdi with salad",
    mealType: "dinner",
    applicableWeekdays: EVERY_DAY,
    localTime: "19:30",
    instructions: "One and a half cups of khichdi with a lemon-dressed salad.",
    items: [
      { foodName: "Vegetable Khichdi", servingLabel: "1 cup", quantity: 1.5 },
      { foodName: "Kheera Tamatar Salad", servingLabel: "1 bowl", quantity: 1 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Trainee specifications
// ---------------------------------------------------------------------------

type Stage =
  | "invited"
  | "onboarding_pending"
  | "onboarding_submitted"
  | "coaching_ready"
  | "active";

type AdherenceProfile = "on_track" | "needs_attention" | "no_recent_data";

type ConfigurationSpec = {
  goalShort: string;
  goalDescription: string;
  notes: string;
  sessionsPerWeek: number;
  completionWindowHours: number;
  mealsPerDay: number;
  confirmationWindowHours: number;
  photoRequirement: "none" | "selected_meals" | "all_meals";
  cadence: "weekly" | "biweekly" | "monthly";
  dueWindowHours: number;
  requireBodyWeight: boolean;
  requireProgressPhotos: boolean;
  requireSessionRpe: boolean;
};

type CheckinSpec = {
  /** Days before today for the check-in due date. */
  daysAgo: number;
  outcome: "reviewed" | "awaiting_review" | "open";
  wellbeing?: string;
  notes?: string;
  bodyWeightKg?: number;
  reviewOutcome?: "acknowledged" | "needs_follow_up" | "adjust_coaching";
  reviewNotes?: string;
};

type ProgressSpec = {
  weeks: number;
  startWeightKg: number;
  weeklyDeltaKg: number;
  waistStartCm: number;
  weeklyWaistDeltaCm: number;
  hipStartCm?: number;
  weeklyHipDeltaCm?: number;
  entries: {
    daysAgo: number;
    entryType: "note" | "milestone";
    title: string;
    body: string;
  }[];
};

type TraineeSpec = {
  key: string;
  displayName: string;
  email: string;
  timezone: string;
  stage: Stage;
  /** Which onboarding form template to pin when the invitation is created. */
  onboardingTemplate?: "global" | "trainer";
  /** Optional WhatsApp digits for the invite Message shortcut. */
  whatsapp?: string;
  intake?: Record<string, string>;
  /** Leaves intake as an unsubmitted draft (onboarding_pending clients). */
  intakeDraftOnly?: boolean;
  configuration?: ConfigurationSpec;
  planTitle?: string;
  content?: ContentSpec;
  /** Second published version, demonstrating the plan adjustment workflow. */
  adjustment?: { mode: "immediate" | "scheduled"; note: string };
  adherence?: AdherenceProfile;
  /** Leaves one session started but unfinished so in-progress state is visible. */
  sessionInProgress?: boolean;
  workoutHistoryDays?: number;
  mealHistoryDays?: number;
  checkins?: CheckinSpec[];
  progress?: ProgressSpec;
  trainerNotes?: string[];
  exceptionHandling?: "acknowledge" | "resolve" | "none";
};

const STRENGTH_CONTENT: ContentSpec = { days: STRENGTH_DAYS, meals: HIGH_PROTEIN_MEALS };
const CONDITIONING_CONTENT: ContentSpec = { days: CONDITIONING_DAYS, meals: FAT_LOSS_MEALS };
const LOW_IMPACT_CONTENT: ContentSpec = { days: LOW_IMPACT_DAYS, meals: RECOVERY_MEALS };

const STRENGTH_CONFIG: ConfigurationSpec = {
  goalShort: "Add 10 kg to the squat",
  goalDescription:
    "Add 10 kg to the squat over twelve weeks while holding body weight near 62 kg. Train three mornings a week at a commercial gym, with barbell work as the main driver.",
  notes: "Trains at a commercial gym before work. Prefers barbell work.",
  sessionsPerWeek: 3,
  completionWindowHours: 24,
  mealsPerDay: 3,
  confirmationWindowHours: 20,
  photoRequirement: "selected_meals",
  cadence: "weekly",
  dueWindowHours: 48,
  requireBodyWeight: true,
  requireProgressPhotos: false,
  requireSessionRpe: true,
};

const FAT_LOSS_CONFIG: ConfigurationSpec = {
  goalShort: "Lose 6 kg over 16 weeks",
  goalDescription:
    "Lose about 6 kg over 16 weeks without dropping strength on the main lifts. Weekday evenings are the reliable window, and travel weeks need a two-session fallback.",
  notes: "Travels for work most weeks. Needs restaurant-friendly options.",
  sessionsPerWeek: 4,
  completionWindowHours: 24,
  mealsPerDay: 4,
  confirmationWindowHours: 18,
  photoRequirement: "selected_meals",
  cadence: "weekly",
  dueWindowHours: 48,
  requireBodyWeight: true,
  requireProgressPhotos: false,
  requireSessionRpe: false,
};

const RECOVERY_CONFIG: ConfigurationSpec = {
  goalShort: "Return to full training",
  goalDescription:
    "Return to full training after a lower-back flare-up. Stay with low-impact loading, no loaded spinal flexion, and add load only after pain-free weeks.",
  notes: "Cleared by physiotherapy for low impact loading only.",
  sessionsPerWeek: 2,
  completionWindowHours: 36,
  mealsPerDay: 3,
  confirmationWindowHours: 24,
  photoRequirement: "none",
  cadence: "biweekly",
  dueWindowHours: 72,
  requireBodyWeight: true,
  requireProgressPhotos: false,
  requireSessionRpe: false,
};

const TRAINEES: TraineeSpec[] = [
  {
    key: "priya",
    displayName: "Priya Sharma",
    email: "priya.sharma@example.com",
    timezone: "Asia/Kolkata",
    stage: "active",
    intake: {
      goals: "Get stronger in the big lifts and feel less tired in the evenings.",
      relevant_history: "Trained on and off for three years. No current injuries.",
      preferences: "Barbell training, three mornings a week.",
      schedule: "Monday, Wednesday and Friday, 6:30 to 7:45 am.",
      limitations: "Mild right shoulder discomfort on overhead pressing.",
    },
    configuration: STRENGTH_CONFIG,
    planTitle: "Strength Foundation — 12 Week Build",
    content: STRENGTH_CONTENT,
    adjustment: {
      mode: "immediate",
      note: "Reworked the pull day after the week three review.",
    },
    adherence: "on_track",
    sessionInProgress: true,
    workoutHistoryDays: 21,
    mealHistoryDays: 7,
    checkins: [
      {
        daysAgo: 14,
        outcome: "reviewed",
        wellbeing: "Energy is good and I am sleeping about seven hours.",
        notes: "Squats felt heavy on Wednesday but recovered by Friday.",
        bodyWeightKg: 61.8,
        reviewOutcome: "acknowledged",
        reviewNotes: "Strong week. Keeping the current loading.",
      },
      {
        daysAgo: 7,
        outcome: "awaiting_review",
        wellbeing: "Feeling strong, slight shoulder niggle on overhead press.",
        notes: "Would like a substitute for overhead press next block.",
        bodyWeightKg: 61.4,
      },
      { daysAgo: 0, outcome: "open" },
    ],
    progress: {
      weeks: 8,
      startWeightKg: 63.4,
      weeklyDeltaKg: -0.25,
      waistStartCm: 78,
      weeklyWaistDeltaCm: -0.3,
      hipStartCm: 96,
      weeklyHipDeltaCm: -0.2,
      entries: [
        {
          daysAgo: 42,
          entryType: "note",
          title: "Baseline session",
          body: "Squat 55 kg for five felt comfortable. Starting loads set from here.",
        },
        {
          daysAgo: 21,
          entryType: "milestone",
          title: "First 65 kg squat triple",
          body: "Three clean reps at 65 kg with no form breakdown.",
        },
        {
          daysAgo: 5,
          entryType: "note",
          title: "Shoulder check",
          body: "Overhead press is irritating the right shoulder. Swapping to landmine press.",
        },
      ],
    },
    trainerNotes: [
      "Responds well to steady linear progression. Avoid adding volume too quickly.",
      "Discussed swapping overhead press for landmine press while the shoulder settles.",
    ],
    exceptionHandling: "acknowledge",
  },
  {
    key: "arjun",
    displayName: "Arjun Mehta",
    email: "arjun.mehta@example.com",
    timezone: "Asia/Kolkata",
    stage: "active",
    intake: {
      goals: "Lose weight before a family wedding in four months.",
      relevant_history: "Desk job with very little structured exercise for two years.",
      preferences: "Short sessions at the gym near the office.",
      schedule: "Weekday evenings after 7 pm. Weekends are unpredictable.",
      limitations: "Frequent work travel.",
    },
    configuration: FAT_LOSS_CONFIG,
    planTitle: "Fat Loss and Conditioning Block",
    content: CONDITIONING_CONTENT,
    adherence: "needs_attention",
    workoutHistoryDays: 21,
    mealHistoryDays: 7,
    checkins: [
      {
        daysAgo: 16,
        outcome: "reviewed",
        wellbeing: "Hard week, travelled Tuesday to Friday.",
        notes: "Ate out most nights.",
        bodyWeightKg: 91.2,
        reviewOutcome: "needs_follow_up",
        reviewNotes: "Agreed a travel-day minimum: one session and protein at each meal.",
      },
      { daysAgo: 9, outcome: "open" },
      { daysAgo: 2, outcome: "open" },
    ],
    progress: {
      weeks: 6,
      startWeightKg: 93.5,
      weeklyDeltaKg: -0.4,
      waistStartCm: 104,
      weeklyWaistDeltaCm: -0.5,
      entries: [
        {
          daysAgo: 35,
          entryType: "note",
          title: "Starting point",
          body: "Baseline measurements taken. The main constraint is travel, not motivation.",
        },
      ],
    },
    trainerNotes: ["Travel weeks are the main risk. Keep a two-session fallback ready."],
    exceptionHandling: "acknowledge",
  },
  {
    key: "neha",
    displayName: "Neha Iyer",
    email: "neha.iyer@example.com",
    timezone: "Asia/Kolkata",
    stage: "active",
    intake: {
      goals: "Build visible upper body strength and improve posture.",
      relevant_history: "Two years of yoga, new to resistance training.",
      preferences: "Machines and dumbbells to start. Prefers detailed cues.",
      schedule: "Tuesday, Thursday and Saturday mornings.",
      limitations: "None reported.",
    },
    configuration: {
      ...STRENGTH_CONFIG,
      goalShort: "Build upper-body strength",
      goalDescription:
        "Build visible upper-body strength and improve posture. Neha is new to resistance training and wants machine and dumbbell cues before barbell volume.",
    },
    planTitle: "Strength Foundation — 12 Week Build",
    content: STRENGTH_CONTENT,
    adherence: "on_track",
    workoutHistoryDays: 14,
    mealHistoryDays: 7,
    checkins: [
      {
        daysAgo: 5,
        outcome: "awaiting_review",
        wellbeing: "Really enjoying the sessions and posture already feels better.",
        notes: "Lat pulldown grip slips on the last set.",
        bodyWeightKg: 57.2,
      },
      { daysAgo: 0, outcome: "open" },
    ],
    progress: {
      weeks: 5,
      startWeightKg: 58.1,
      weeklyDeltaKg: -0.15,
      waistStartCm: 71,
      weeklyWaistDeltaCm: -0.2,
      entries: [
        {
          daysAgo: 28,
          entryType: "note",
          title: "Technique review",
          body: "Hinge pattern looks solid. Cleared to add load on the deadlift.",
        },
        {
          daysAgo: 10,
          entryType: "milestone",
          title: "First unassisted chin-up",
          body: "One clean rep from a full hang.",
        },
      ],
    },
    trainerNotes: ["Suggest lifting straps for the heavier pull sets."],
    exceptionHandling: "none",
  },
  {
    key: "rahul",
    displayName: "Rahul Verma",
    email: "rahul.verma@example.com",
    timezone: "Asia/Kolkata",
    stage: "active",
    intake: {
      goals: "Get back to training after a lower back flare-up.",
      relevant_history: "Disc irritation eighteen months ago, cleared by physiotherapy.",
      preferences: "Low impact. Wants the reasoning behind each change.",
      schedule: "Monday and Thursday evenings.",
      limitations: "No loaded spinal flexion. Avoid conventional deadlifts for now.",
    },
    configuration: RECOVERY_CONFIG,
    planTitle: "Return to Training — Low Impact",
    content: LOW_IMPACT_CONTENT,
    adjustment: {
      mode: "scheduled",
      note: "Loaded box squat progression, effective in three days.",
    },
    adherence: "on_track",
    sessionInProgress: true,
    workoutHistoryDays: 21,
    mealHistoryDays: 7,
    checkins: [
      {
        daysAgo: 12,
        outcome: "reviewed",
        wellbeing: "Back has been quiet all week with no morning stiffness.",
        notes: "Ready for a little more load.",
        bodyWeightKg: 78.9,
        reviewOutcome: "adjust_coaching",
        reviewNotes: "Scheduling a loaded box squat progression from next week.",
      },
      { daysAgo: 1, outcome: "open" },
    ],
    progress: {
      weeks: 7,
      startWeightKg: 80.6,
      weeklyDeltaKg: -0.2,
      waistStartCm: 92,
      weeklyWaistDeltaCm: -0.25,
      entries: [
        {
          daysAgo: 49,
          entryType: "note",
          title: "Return to training cleared",
          body: "Physiotherapist cleared low impact loading with no spinal flexion.",
        },
        {
          daysAgo: 14,
          entryType: "milestone",
          title: "Two pain-free weeks",
          body: "First fortnight with no back symptoms since the flare-up.",
        },
      ],
    },
    trainerNotes: ["Keep total session volume low. He tends to add extra work on his own."],
    exceptionHandling: "resolve",
  },
  {
    key: "ananya",
    displayName: "Ananya Nair",
    email: "ananya.nair@example.com",
    timezone: "Asia/Kolkata",
    stage: "active",
    intake: {
      goals: "Prepare for a first 10 km run while keeping some strength work.",
      relevant_history: "Runs casually, no structured strength training.",
      preferences: "Two strength sessions alongside her own running.",
      schedule: "Wednesday and Sunday mornings.",
      limitations: "None reported.",
    },
    configuration: FAT_LOSS_CONFIG,
    planTitle: "Fat Loss and Conditioning Block",
    content: CONDITIONING_CONTENT,
    /** Plan starts today: upcoming expectations only, nothing executed yet. */
    adherence: "needs_attention",
    workoutHistoryDays: 0,
    mealHistoryDays: 0,
    checkins: [{ daysAgo: 0, outcome: "open" }],
    progress: {
      weeks: 2,
      startWeightKg: 64.2,
      weeklyDeltaKg: -0.1,
      waistStartCm: 76,
      weeklyWaistDeltaCm: -0.1,
      entries: [
        {
          daysAgo: 3,
          entryType: "note",
          title: "Onboarding call",
          body: "Agreed two strength sessions alongside her own running schedule.",
        },
      ],
    },
    trainerNotes: ["Plan starts this week. First check-in is due at the weekend."],
    exceptionHandling: "none",
  },
  {
    key: "vikram",
    displayName: "Vikram Desai",
    email: "vikram.desai@example.com",
    timezone: "Asia/Kolkata",
    stage: "coaching_ready",
    intake: {
      goals: "General fitness and better energy through the working day.",
      relevant_history: "Played cricket until his late twenties, nothing since.",
      preferences: "Home workouts with a pair of adjustable dumbbells.",
      schedule: "Early mornings, flexible on which days.",
      limitations: "Right knee aches on deep squats.",
    },
    trainerNotes: [
      "Onboarding reviewed. Session frequency still to be agreed before configuring.",
    ],
  },
  {
    key: "sanjana",
    displayName: "Sanjana Rao",
    email: "sanjana.rao@example.com",
    timezone: "Asia/Kolkata",
    stage: "onboarding_submitted",
    intake: {
      goals: "Build a consistent training habit and improve overall strength.",
      relevant_history: "Completed a beginner programme last year, then stopped.",
      preferences: "Group-style circuits. Dislikes long sessions.",
      schedule: "Tuesday and Friday evenings, occasional Saturday.",
      limitations: "Mild asthma, needs longer warm-ups.",
    },
  },
  {
    key: "kabir",
    displayName: "Kabir Malhotra",
    email: "kabir.malhotra@example.com",
    timezone: "Asia/Kolkata",
    stage: "onboarding_pending",
    intakeDraftOnly: true,
    intake: {
      goals: "Put on some muscle, currently quite lean.",
      preferences: "Evening sessions at the university gym.",
    },
  },
  {
    key: "meera",
    displayName: "Meera Krishnan",
    email: "meera.krishnan@example.com",
    timezone: "Asia/Kolkata",
    stage: "invited",
    onboardingTemplate: "global",
  },
  {
    key: "dev",
    displayName: "Dev Patel",
    email: "dev.patel@example.com",
    timezone: "Asia/Kolkata",
    stage: "invited",
    onboardingTemplate: "trainer",
  },
  {
    key: "aisha",
    displayName: "Aisha Qureshi",
    email: "aisha.qureshi@example.com",
    timezone: "Asia/Kolkata",
    stage: "invited",
    onboardingTemplate: "trainer",
  },
  {
    key: "ishaan",
    displayName: "Ishaan Kapoor",
    email: "ishaan.kapoor@example.com",
    timezone: "Asia/Kolkata",
    stage: "active",
    onboardingTemplate: "trainer",
    intake: {
      goals: "Restart training after two quiet years and feel stronger at work.",
      relevant_history: "Played football at university. No current injuries.",
      preferences: "Three short full-body sessions. Wants the plan written down.",
      schedule: "Tuesday, Thursday and Saturday, early evening.",
      limitations: "None reported.",
      training_background: "Some experience",
    },
    configuration: {
      ...RECOVERY_CONFIG,
      goalShort: "Rebuild a training habit",
      goalDescription:
        "Rebuild a consistent three-day training habit before adding load. The first fortnight is about showing up, not chasing measurements.",
      sessionsPerWeek: 3,
      cadence: "weekly",
      dueWindowHours: 48,
    },
    planTitle: "Habit Restart — Full Body",
    content: LOW_IMPACT_CONTENT,
    adherence: "no_recent_data",
    workoutHistoryDays: 0,
    mealHistoryDays: 0,
    checkins: [{ daysAgo: -5, outcome: "open" }],
    trainerNotes: ["Plan is published. First logged sessions should start next week."],
    exceptionHandling: "none",
  },
];

// ---------------------------------------------------------------------------
// Trainer-owned templates and libraries
// ---------------------------------------------------------------------------

const TEMPLATES: { title: string; templateType: PlanTemplateType; content: ContentSpec }[] = [
  {
    title: "Upper / Lower Split — 3 Day",
    templateType: "workout",
    content: { days: STRENGTH_DAYS, meals: [] },
  },
  {
    title: "Conditioning Block — 2 Day",
    templateType: "workout",
    content: { days: CONDITIONING_DAYS, meals: [] },
  },
  {
    title: "Indian High Protein — 3 Meals",
    templateType: "nutrition",
    content: { days: [], meals: HIGH_PROTEIN_MEALS },
  },
  {
    title: "Beginner Full Body and Nutrition",
    templateType: "combined",
    content: LOW_IMPACT_CONTENT,
  },
];

const EXERCISE_LIBRARY: {
  name: string;
  instructions: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: ExerciseDifficulty;
}[] = [
  "Bulgarian Split Squat",
  "Cable Face Pull",
  "Farmer's Carry",
  "Hanging Leg Raise",
  "Landmine Press",
].map((name) => {
  const identity = exerciseIdentity(name);
  const instructions: Record<string, string> = {
    "Bulgarian Split Squat":
      "Rear foot elevated, torso slightly forward, controlled descent.",
    "Cable Face Pull":
      "Pull to the forehead with thumbs back to reach the rear delts.",
    "Farmer's Carry": "Tall posture with ribs down, thirty metres per round.",
    "Hanging Leg Raise": "Posterior pelvic tilt at the top, no swinging.",
    "Landmine Press":
      "Shoulder-friendly pressing option, half-kneeling or standing.",
  };
  return {
    name,
    instructions: instructions[name]!,
    primaryMuscles: identity.primaryMuscles,
    secondaryMuscles: identity.secondaryMuscles,
    equipment: identity.equipment,
    difficulty: identity.difficulty,
  };
});

const FOOD_LIBRARY: {
  name: string;
  classification: FoodClassification;
  basis: NutritionBasis;
  notes: string;
  description: string;
  /** Energy and macros per 100 g or per 100 ml. These are not portion totals. */
  energyKcal: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  servings: { label: string; unit: string; conversion: number }[];
}[] = [
  {
    name: "Masala Oats",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "Savory oats with vegetables. Nutrients are for the dry mix per 100 g.",
    description: "Spiced oats cooked with onion, tomato, and peas.",
    energyKcal: 389,
    proteinGrams: 13.2,
    carbsGrams: 67.7,
    fatGrams: 6.5,
    servings: [
      { label: "50 g dry", unit: "g", conversion: 50 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Egg Whites",
    classification: "generic_food",
    basis: "per_100_g",
    notes: "Cooked whites only. One white is about 33 g.",
    description: "Cooked egg whites.",
    energyKcal: 52,
    proteinGrams: 10.9,
    carbsGrams: 0.7,
    fatGrams: 0.2,
    servings: [
      { label: "1 egg white", unit: "piece", conversion: 33 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Rajma",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "Home-cooked kidney beans, moderate oil, weighed cooked.",
    description: "Kidney-bean curry.",
    energyKcal: 127,
    proteinGrams: 8.7,
    carbsGrams: 22.8,
    fatGrams: 0.5,
    servings: [
      { label: "1 katori", unit: "katori", conversion: 180 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Brown Rice",
    classification: "generic_food",
    basis: "per_100_g",
    notes: "Weighed cooked, not dry.",
    description: "Plain cooked brown rice.",
    energyKcal: 111,
    proteinGrams: 2.6,
    carbsGrams: 23,
    fatGrams: 0.9,
    servings: [
      { label: "150 g cooked", unit: "g", conversion: 150 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Kheera Tamatar Salad",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "Lemon and spice, no creamy dressing.",
    description: "Cucumber and tomato salad.",
    energyKcal: 22,
    proteinGrams: 0.9,
    carbsGrams: 4.1,
    fatGrams: 0.2,
    servings: [
      { label: "1 bowl", unit: "bowl", conversion: 150 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Grilled Chicken Tikka",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "Yoghurt marinade. Grill or air fry rather than pan fry.",
    description: "Boneless chicken tikka, yoghurt and spice marinade.",
    energyKcal: 168,
    proteinGrams: 31,
    carbsGrams: 1.5,
    fatGrams: 3.8,
    servings: [
      { label: "180 g", unit: "g", conversion: 180 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Multigrain Roti",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "One roti is about 35 g of cooked bread.",
    description: "Multigrain chapati cooked on a tawa.",
    energyKcal: 297,
    proteinGrams: 9.4,
    carbsGrams: 46,
    fatGrams: 7.5,
    servings: [
      { label: "1 roti", unit: "piece", conversion: 35 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Moong Dal Chilla",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "One chilla is about 70 g cooked.",
    description: "Savory moong-dal pancakes, lightly oiled.",
    energyKcal: 176,
    proteinGrams: 11.5,
    carbsGrams: 20,
    fatGrams: 4.2,
    servings: [
      { label: "1 chilla", unit: "piece", conversion: 70 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Low Fat Curd",
    classification: "generic_food",
    basis: "per_100_g",
    notes: "Plain, unsweetened.",
    description: "Low-fat dahi.",
    energyKcal: 63,
    proteinGrams: 5.3,
    carbsGrams: 4.7,
    fatGrams: 1.5,
    servings: [
      { label: "150 g", unit: "g", conversion: 150 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Paneer Bhurji",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "Cook with minimal oil and add vegetables.",
    description: "Scrambled paneer with onion, tomato, and spices.",
    energyKcal: 265,
    proteinGrams: 18,
    carbsGrams: 4.2,
    fatGrams: 19.5,
    servings: [
      { label: "150 g", unit: "g", conversion: 150 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Roasted Chana",
    classification: "raw_ingredient",
    basis: "per_100_g",
    notes: "Unsalted if possible.",
    description: "Dry-roasted chickpeas.",
    energyKcal: 364,
    proteinGrams: 19,
    carbsGrams: 61,
    fatGrams: 6,
    servings: [
      { label: "40 g", unit: "g", conversion: 40 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Apple",
    classification: "generic_food",
    basis: "per_100_g",
    notes: "One medium apple is about 180 g.",
    description: "Fresh apple, weighed as edible flesh.",
    energyKcal: 52,
    proteinGrams: 0.3,
    carbsGrams: 14,
    fatGrams: 0.2,
    servings: [
      { label: "1 medium", unit: "piece", conversion: 180 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Fish Curry",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "Light gravy. The serving weight is the fish.",
    description: "Home-style fish curry.",
    energyKcal: 142,
    proteinGrams: 18.5,
    carbsGrams: 3.2,
    fatGrams: 5.4,
    servings: [
      { label: "180 g fish", unit: "g", conversion: 180 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Sauteed Vegetables",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "Light oil. One cup is about 100 g cooked.",
    description: "Mixed vegetables cooked in a little oil.",
    energyKcal: 55,
    proteinGrams: 2.1,
    carbsGrams: 6.4,
    fatGrams: 2.2,
    servings: [
      { label: "1 cup", unit: "cup", conversion: 100 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Ragi Flour",
    classification: "raw_ingredient",
    basis: "per_100_g",
    notes: "Dry finger-millet flour, before it is cooked into porridge.",
    description: "Ragi flour.",
    energyKcal: 328,
    proteinGrams: 7.3,
    carbsGrams: 72,
    fatGrams: 1.3,
    servings: [
      { label: "40 g", unit: "g", conversion: 40 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Toned Milk",
    classification: "generic_food",
    basis: "per_100_ml",
    notes: "Toned milk measured by volume.",
    description: "Toned cow milk.",
    energyKcal: 58,
    proteinGrams: 3.1,
    carbsGrams: 4.7,
    fatGrams: 3.1,
    servings: [
      { label: "200 ml", unit: "ml", conversion: 200 },
      { label: "100 ml", unit: "ml", conversion: 100 },
    ],
  },
  {
    name: "Almonds",
    classification: "raw_ingredient",
    basis: "per_100_g",
    notes: "Ten almonds are about 12 g.",
    description: "Raw almonds.",
    energyKcal: 579,
    proteinGrams: 21.2,
    carbsGrams: 21.6,
    fatGrams: 49.9,
    servings: [
      { label: "10 almonds", unit: "piece", conversion: 12 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Curd Rice",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "One cup is about 200 g.",
    description: "Rice mixed with curd.",
    energyKcal: 138,
    proteinGrams: 3.6,
    carbsGrams: 22,
    fatGrams: 3.8,
    servings: [
      { label: "1 cup", unit: "cup", conversion: 200 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Dal Tadka",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "Light tadka. Half a katori is about 90 g.",
    description: "Tempered moong or toor dal.",
    energyKcal: 132,
    proteinGrams: 8.1,
    carbsGrams: 16.4,
    fatGrams: 3.6,
    servings: [
      { label: "1/2 katori", unit: "katori", conversion: 90 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Vegetable Khichdi",
    classification: "prepared_food",
    basis: "per_100_g",
    notes: "Moong and rice, light ghee. One cup is about 200 g.",
    description: "Soft vegetable khichdi.",
    energyKcal: 118,
    proteinGrams: 4.4,
    carbsGrams: 19,
    fatGrams: 2.6,
    servings: [
      { label: "1 cup", unit: "cup", conversion: 200 },
      { label: "100 g", unit: "g", conversion: 100 },
    ],
  },
  {
    name: "Chaas",
    classification: "generic_food",
    basis: "per_100_ml",
    notes: "Spiced buttermilk, unsweetened.",
    description: "Salted chaas.",
    energyKcal: 36,
    proteinGrams: 2.2,
    carbsGrams: 4.5,
    fatGrams: 0.8,
    servings: [
      { label: "1 glass", unit: "ml", conversion: 200 },
      { label: "100 ml", unit: "ml", conversion: 100 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Safety checks
// ---------------------------------------------------------------------------

function resolveBaseUrl(): string {
  const raw =
    process.env.FITBUD_SEED_API_URL?.trim() ||
    process.env.FITBUD_API_URL?.trim() ||
    DEFAULT_BASE_URL;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SeedError(`FITBUD_SEED_API_URL is not a valid URL: ${raw}`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new SeedError(
      `Refusing to seed ${url.origin}. This script is development-only and may ` +
        `only target a local API (${[...LOCAL_HOSTNAMES].join(", ")}).`,
    );
  }
  if (url.protocol !== "http:") {
    throw new SeedError(
      `Refusing to seed ${url.origin}. Local development uses http; an https ` +
        `target suggests a deployed environment.`,
    );
  }

  return url.origin;
}

async function assertLocalTestApi(): Promise<void> {
  let health: Response;
  try {
    health = await fetch(`${baseUrl}/health`);
  } catch (cause) {
    throw new SeedError(
      `The FitBud API is not reachable at ${baseUrl}.\n` +
        `Start it with: pnpm --filter @fitbud/api dev\n` +
        `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (!health.ok) {
    throw new SeedError(
      `GET ${baseUrl}/health returned ${health.status}. Expected a healthy local API.`,
    );
  }

  // A test identity token is the only credential this script can produce, so a
  // rejected token means the API is not running with AUTH_MODE=test.
  const probe = await fetch(`${baseUrl}/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      idToken: createTestIdToken(TRAINER_UID, TRAINER_EMAIL),
      timezone: "Asia/Kolkata",
    }),
  });
  if (probe.status === 401) {
    throw new SeedError(
      `The API at ${baseUrl} rejected a test identity token. Seeding requires ` +
        `AUTH_MODE=test. Check apps/api/wrangler.toml [vars] and restart the API.`,
    );
  }
  if (!probe.ok) {
    throw new SeedError(
      `POST ${baseUrl}/auth/session returned ${probe.status} while verifying test ` +
        `auth mode. Expected 200.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Onboarding workflow
// ---------------------------------------------------------------------------

type SeededClient = { spec: TraineeSpec; relationship: CoachingRelationship };

async function findInvitation(
  trainer: Actor,
  email: string,
): Promise<Invitation | undefined> {
  const list = await getData<InvitationListResponse>(trainer, "/invitations?limit=50");
  return list.items.find((item) => item.recipientEmail === email);
}

function seedWhatsapp(key: string): string {
  let n = 0;
  for (const ch of key) {
    n = (n * 31 + ch.charCodeAt(0)) % 100_000_000;
  }
  return `9198${String(n).padStart(8, "0")}`;
}

async function createInvitation(
  trainer: Actor,
  spec: TraineeSpec,
): Promise<Invitation & { token: string }> {
  const result = await expectOk<Invitation & { token: string }>({
    method: "POST",
    path: "/invitations",
    actor: trainer,
    idempotencyKey: idempotencyKey("invitation.create", spec.email),
    body: {
      recipientEmail: spec.email,
      recipientDisplayName: spec.displayName,
      recipientWhatsapp: spec.whatsapp ?? seedWhatsapp(spec.key),
      expiresInDays: 21,
      ...(onboardingTemplateIdFor(spec)
        ? { onboardingFormTemplateId: onboardingTemplateIdFor(spec) }
        : {}),
    },
  });
  return result.data!;
}

async function ensurePendingInvitation(trainer: Actor, spec: TraineeSpec): Promise<void> {
  const existing = await findInvitation(trainer, spec.email);
  if (existing) {
    log(`invitation already present (${existing.status})`);
    return;
  }
  await createInvitation(trainer, spec);
  log("invitation created and left pending");
}

async function ensureRelationship(
  trainer: Actor,
  spec: TraineeSpec,
  traineeActor: Actor,
): Promise<CoachingRelationship> {
  // The raw invitation token is only returned on creation, so an invitation
  // that was already accepted is resolved through the trainer's own view.
  const existing = await findInvitation(trainer, spec.email);
  if (existing?.coachingRelationshipId) {
    const relationship = await getData<CoachingRelationship>(
      trainer,
      `/relationships/${existing.coachingRelationshipId}`,
    );
    log(`relationship already present (${relationship.status})`);
    return relationship;
  }

  const created = await createInvitation(trainer, spec);
  const accepted = await expectOk<{ relationship: CoachingRelationship }>({
    method: "POST",
    path: "/invitations/accept",
    actor: traineeActor,
    body: {
      token: created.token,
      displayName: spec.displayName,
      timezone: spec.timezone,
    },
  });
  log("invitation accepted, coaching relationship created");
  return accepted.data!.relationship;
}

async function ensureIntake(
  spec: TraineeSpec,
  traineeActor: Actor,
  relationship: CoachingRelationship,
): Promise<void> {
  if (!spec.intake) return;

  const current = await call<OnboardingFormResponse>({
    method: "GET",
    path: `/onboarding/relationships/${relationship.id}`,
    actor: traineeActor,
  });
  let submission = current.status === 200 ? current.data : null;

  if (submission?.status === "submitted") {
    log("intake already submitted");
    return;
  }

  if (!submission) {
    const draft = await expectOk<OnboardingFormResponse>({
      method: "PUT",
      path: `/onboarding/relationships/${relationship.id}/draft`,
      actor: traineeActor,
      body: { answers: spec.intake, expectedVersion: 0 },
    });
    submission = draft.data!;
  }

  if (spec.intakeDraftOnly) {
    log("intake draft saved and intentionally left unsubmitted");
    return;
  }

  await expectOk<OnboardingFormResponse>({
    method: "POST",
    path: `/onboarding/relationships/${relationship.id}/submit`,
    actor: traineeActor,
    idempotencyKey: idempotencyKey("intake.submit", spec.key),
    body: { expectedVersion: submission.version },
  });
  log("intake submitted and awaiting trainer review");
}

async function ensureOnboardingReview(
  trainer: Actor,
  spec: TraineeSpec,
  relationship: CoachingRelationship,
): Promise<CoachingRelationship> {
  if (
    relationship.onboardingStatus === "coaching_ready" ||
    relationship.onboardingStatus === "active" ||
    relationship.onboardingStatus === "ended"
  ) {
    return relationship;
  }

  const reviewed = await expectOk<{ relationship: CoachingRelationship }>({
    method: "POST",
    path: `/onboarding/relationships/${relationship.id}/review`,
    actor: trainer,
    idempotencyKey: idempotencyKey("onboarding.review", spec.key),
    body: { outcome: "coaching_ready" },
  });
  log("onboarding reviewed, relationship is coaching ready");
  return reviewed.data!.relationship;
}

// ---------------------------------------------------------------------------
// Coaching configuration
// ---------------------------------------------------------------------------

async function ensureConfiguration(
  trainer: Actor,
  spec: TraineeSpec,
  relationship: CoachingRelationship,
): Promise<void> {
  const config = spec.configuration;
  if (!config) return;

  const current = await call<CoachingConfiguration>({
    method: "GET",
    path: `/configurations/relationships/${relationship.id}`,
    actor: trainer,
  });
  let configuration = current.status === 200 ? current.data : null;

  if (
    configuration?.status === "active" &&
    configuration.goalShort === config.goalShort &&
    configuration.goalDescription === config.goalDescription
  ) {
    log("coaching configuration already active");
    return;
  }

  if (configuration?.status === "active") {
    const opened = await expectOk<CoachingConfiguration>({
      method: "POST",
      path: `/configurations/relationships/${relationship.id}/versions`,
      actor: trainer,
      idempotencyKey: idempotencyKey(
        "configuration.version",
        spec.key,
        config.goalShort,
      ),
      body: { expectedVersion: configuration.recordVersion },
    });
    configuration = opened.data;
    log("opened a new configuration version for the short goal and description");
  }

  if (
    configuration &&
    (configuration.status === "draft" || configuration.status === "configured") &&
    (configuration.goalShort !== config.goalShort ||
      configuration.goalDescription !== config.goalDescription)
  ) {
    const updated = await expectOk<CoachingConfiguration>({
      method: "PUT",
      path: `/configurations/relationships/${relationship.id}/draft`,
      actor: trainer,
      body: {
        expectedVersion: configuration.recordVersion,
        goalShort: config.goalShort,
        goalDescription: config.goalDescription,
        notes: config.notes,
        workout: {
          sessionsPerWeek: config.sessionsPerWeek,
          completionWindowHours: config.completionWindowHours,
        },
        nutrition: {
          mealsPerDay: config.mealsPerDay,
          confirmationWindowHours: config.confirmationWindowHours,
          photoRequirement: config.photoRequirement,
        },
        checkin: { cadence: config.cadence, dueWindowHours: config.dueWindowHours },
        tracking: {
          requireBodyWeight: config.requireBodyWeight,
          requireProgressPhotos: config.requireProgressPhotos,
          requireSessionRpe: config.requireSessionRpe,
        },
      },
    });
    configuration = updated.data;
  }

  if (!configuration) {
    const draft = await expectOk<CoachingConfiguration>({
      method: "PUT",
      path: `/configurations/relationships/${relationship.id}/draft`,
      actor: trainer,
      body: {
        expectedVersion: 0,
        goalShort: config.goalShort,
        goalDescription: config.goalDescription,
        notes: config.notes,
        workout: {
          sessionsPerWeek: config.sessionsPerWeek,
          completionWindowHours: config.completionWindowHours,
        },
        nutrition: {
          mealsPerDay: config.mealsPerDay,
          confirmationWindowHours: config.confirmationWindowHours,
          photoRequirement: config.photoRequirement,
        },
        checkin: { cadence: config.cadence, dueWindowHours: config.dueWindowHours },
        tracking: {
          requireBodyWeight: config.requireBodyWeight,
          requireProgressPhotos: config.requireProgressPhotos,
          requireSessionRpe: config.requireSessionRpe,
        },
      },
    });
    configuration = draft.data!;
  }

  if (configuration.status === "draft") {
    const configured = await expectOk<CoachingConfiguration>({
      method: "POST",
      path: `/configurations/relationships/${relationship.id}/configure`,
      actor: trainer,
      idempotencyKey: idempotencyKey("configuration.configure", spec.key, config.goalShort),
      body: { expectedVersion: configuration.recordVersion },
    });
    configuration = configured.data!;
  }

  if (configuration.status === "configured") {
    await expectOk<CoachingConfiguration>({
      method: "POST",
      path: `/configurations/relationships/${relationship.id}/activate`,
      actor: trainer,
      idempotencyKey: idempotencyKey("configuration.activate", spec.key, config.goalShort),
      body: { expectedVersion: configuration.recordVersion },
    });
  }

  log("coaching configuration active");
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

async function loadPlanVersions(trainer: Actor, planId: string): Promise<PlanVersion[]> {
  const plan = await getData<PlanWithVersions>(trainer, `/plans/${planId}`);
  const versions: PlanVersion[] = [];
  for (const row of plan.versions) {
    versions.push(await getData<PlanVersion>(trainer, `/plans/${planId}/versions/${row.id}`));
  }
  return versions.sort((a, b) => a.versionNumber - b.versionNumber);
}

/** Create the plan when missing and make sure version 1 is published. */
async function ensurePublishedPlan(
  trainer: Actor,
  spec: TraineeSpec,
  relationship: CoachingRelationship,
): Promise<string | null> {
  if (!spec.planTitle || !spec.content) return null;

  const list = await getData<PlanListResponse>(
    trainer,
    `/plans/relationships/${relationship.id}?limit=50`,
  );
  let planId = list.items.find((item) => item.plan.title === spec.planTitle)?.plan.id;

  if (!planId) {
    const created = await expectOk<CreatePlanResponse>({
      method: "POST",
      path: `/plans/relationships/${relationship.id}`,
      actor: trainer,
      idempotencyKey: idempotencyKey("plan.create", spec.key),
      body: {
        title: spec.planTitle,
        content: await planContentFor(trainer, spec, `${spec.key}-v1`),
      },
    });
    planId = created.data!.plan.id;
    log(`plan created: ${spec.planTitle}`);
  }

  const versions = await loadPlanVersions(trainer, planId);
  const firstDraft = versions.find(
    (version) => version.versionNumber === 1 && version.status === "draft",
  );
  if (firstDraft) {
    await expectOk<PlanVersion>({
      method: "POST",
      path: `/plans/${planId}/versions/${firstDraft.id}/publish`,
      actor: trainer,
      idempotencyKey: idempotencyKey("plan.publish", spec.key, "v1"),
      body: { expectedRecordVersion: firstDraft.recordVersion, mode: "immediate" },
    });
    log("plan version 1 published and effective");
  }

  return planId;
}

/**
 * A plan adjustment creates a new immutable version with its own effective
 * time rather than editing the published one.
 */
async function ensureAdjustment(
  trainer: Actor,
  spec: TraineeSpec,
  planId: string,
): Promise<void> {
  const adjustment = spec.adjustment;
  if (!adjustment || !spec.content) return;

  const versions = await loadPlanVersions(trainer, planId);
  if (versions.length >= 2) return;

  const source = versions.find((version) => version.versionNumber === 1);
  if (!source) return;

  const created = await expectOk<PlanVersion>({
    method: "POST",
    path: `/plans/${planId}/versions`,
    actor: trainer,
    idempotencyKey: idempotencyKey("plan.draft_from_version", spec.key, "v2"),
    body: { sourceVersionId: source.id, asAdjustment: true },
  });
  const draft = created.data!;

  const updated = await expectOk<PlanVersion>({
    method: "PUT",
    path: `/plans/${planId}/versions/${draft.id}`,
    actor: trainer,
    body: {
      expectedRecordVersion: draft.recordVersion,
      content: await planContentFor(trainer, spec, `${spec.key}-v2`),
    },
  });

  const effectiveFrom =
    adjustment.mode === "scheduled"
      ? new Date(Date.now() + 3 * 86_400_000).toISOString()
      : undefined;

  await expectOk<PlanVersion>({
    method: "POST",
    path: `/plans/${planId}/versions/${draft.id}/publish`,
    actor: trainer,
    idempotencyKey: idempotencyKey("plan.publish", spec.key, "v2"),
    body: {
      expectedRecordVersion: updated.data!.recordVersion,
      mode: adjustment.mode,
      ...(effectiveFrom ? { effectiveFrom } : {}),
    },
  });
  log(`plan adjustment published (${adjustment.mode}): ${adjustment.note}`);
}

// ---------------------------------------------------------------------------
// Expectation generation
// ---------------------------------------------------------------------------

/**
 * Generate only for dates that have no assignment yet. Generation always uses
 * the currently effective plan version, so skipping covered dates keeps reruns
 * from producing a second set of expectations for the same day.
 */
async function generateWorkoutExpectations(
  trainer: Actor,
  spec: TraineeSpec,
  relationship: CoachingRelationship,
  from: string,
  to: string,
): Promise<number> {
  if (from > to) return 0;

  const existing = await getData<WorkoutAssignmentListResponse>(
    trainer,
    `/workouts/relationships/${relationship.id}/assignments`,
  );
  const covered = new Set(existing.items.map((item) => item.localDate));

  let created = 0;
  for (const [rangeFrom, rangeTo] of uncoveredRanges(from, to, covered)) {
    const result = await expectOk<{ created: number }>({
      method: "POST",
      path: `/workouts/relationships/${relationship.id}/assignments/generate`,
      actor: trainer,
      idempotencyKey: idempotencyKey("workout.generate", spec.key, rangeFrom, rangeTo),
      body: { fromDate: rangeFrom, toDate: rangeTo },
    });
    created += result.data?.created ?? 0;
  }
  return created;
}

async function generateMealExpectations(
  trainer: Actor,
  spec: TraineeSpec,
  relationship: CoachingRelationship,
  from: string,
  to: string,
): Promise<number> {
  if (from > to) return 0;

  const existing = await getData<MealAssignmentListResponse>(
    trainer,
    `/meals/relationships/${relationship.id}/assignments`,
  );
  const covered = new Set(existing.items.map((item) => item.localDate));

  let created = 0;
  for (const [rangeFrom, rangeTo] of uncoveredRanges(from, to, covered)) {
    const result = await expectOk<{ created: number }>({
      method: "POST",
      path: `/meals/relationships/${relationship.id}/assignments/generate`,
      actor: trainer,
      idempotencyKey: idempotencyKey("meal.generate", spec.key, rangeFrom, rangeTo),
      body: { fromDate: rangeFrom, toDate: rangeTo },
    });
    created += result.data?.created ?? 0;
  }
  return created;
}

// ---------------------------------------------------------------------------
// Workout executions
// ---------------------------------------------------------------------------

type WorkoutOutcome = "complete" | "partial" | "skip" | "miss";

function workoutOutcomeFor(spec: TraineeSpec, localDate: string): WorkoutOutcome {
  if (spec.adherence === "on_track" && roll("workout", spec.key, localDate) < 0.15) {
    return "partial";
  }
  return "complete";
}

async function recordWorkoutHistory(
  trainer: Actor,
  spec: TraineeSpec,
  traineeActor: Actor,
  relationship: CoachingRelationship,
): Promise<void> {
  if (spec.adherence === "no_recent_data") return;

  const today = localDateIn(spec.timezone);
  const assignments = await getData<WorkoutAssignmentListResponse>(
    trainer,
    `/workouts/relationships/${relationship.id}/assignments`,
  );
  const pastOpen = assignments.items
    .filter((item) => item.localDate < today && !item.execution)
    .sort((left, right) => left.localDate.localeCompare(right.localDate));
  const missedOnPurpose =
    spec.adherence === "needs_attention" ? pastOpen[0] : undefined;

  let executed = 0;
  for (const assignment of assignments.items) {
    if (assignment.localDate >= today || assignment.execution) continue;
    if (missedOnPurpose && assignment.id === missedOnPurpose.id) continue;

    const outcome = workoutOutcomeFor(spec, assignment.localDate);
    if (outcome === "miss") continue;

    if (outcome === "skip") {
      await expectOk<WorkoutExecution>({
        method: "POST",
        path: `/workouts/assignments/${assignment.id}/skip`,
        actor: traineeActor,
        idempotencyKey: idempotencyKey("workout.skip", assignment.id),
      });
    } else {
      await completeWorkout(traineeActor, spec, assignment, outcome === "partial");
    }
    executed += 1;
  }

  if (executed > 0) log(`${executed} workout executions recorded`);
}

/**
 * Leaves one session started but unfinished so the in-progress execution state
 * is visible alongside finished, skipped, and missed sessions.
 */
async function startUnfinishedWorkout(
  trainer: Actor,
  spec: TraineeSpec,
  traineeActor: Actor,
  relationship: CoachingRelationship,
): Promise<void> {
  if (!spec.sessionInProgress) return;

  const today = localDateIn(spec.timezone);
  const assignments = await getData<WorkoutAssignmentListResponse>(
    trainer,
    `/workouts/relationships/${relationship.id}/assignments`,
  );
  const alreadyOpen = assignments.items.some(
    (item) => item.status === "in_progress" || item.status === "paused",
  );
  if (alreadyOpen) return;

  const open = assignments.items.filter((item) => !item.execution);
  // Prefer a session scheduled for today; otherwise use the most recent one
  // the trainee started and never finished.
  const target =
    open.find((item) => item.localDate === today) ??
    open.filter((item) => item.localDate < today).at(-1);
  if (!target) return;

  const started = await expectOk<WorkoutExecution>({
    method: "POST",
    path: `/workouts/assignments/${target.id}/start`,
    actor: traineeActor,
    idempotencyKey: idempotencyKey("workout.start", target.id),
  });
  const execution = started.data!;

  const firstExercise = execution.exercises[0];
  if (firstExercise) {
    for (const set of firstExercise.sets) {
      if (set.status !== "pending") continue;
      await expectOk<WorkoutExecution>({
        method: "POST",
        path: `/workouts/executions/${execution.id}/sets/${set.id}/complete`,
        actor: traineeActor,
        body: {},
      });
    }
  }
  log(`session left in progress: ${target.workoutDayName} (${target.localDate})`);
}

async function completeWorkout(
  traineeActor: Actor,
  spec: TraineeSpec,
  assignment: WorkoutAssignment,
  partial: boolean,
): Promise<void> {
  const started = await expectOk<WorkoutExecution>({
    method: "POST",
    path: `/workouts/assignments/${assignment.id}/start`,
    actor: traineeActor,
    idempotencyKey: idempotencyKey("workout.start", assignment.id),
  });
  const execution = started.data!;
  const sets = execution.exercises.flatMap((exercise) => exercise.sets);

  for (let index = 0; index < sets.length; index += 1) {
    const set = sets[index]!;
    if (set.status !== "pending") continue;

    // Leaving the last sets unfinished is what makes the server resolve the
    // execution as Modified rather than Completed.
    if (partial && index >= sets.length - 2) {
      await expectOk<WorkoutExecution>({
        method: "POST",
        path: `/workouts/executions/${execution.id}/sets/${set.id}/skip`,
        actor: traineeActor,
      });
      continue;
    }

    const body =
      partial && set.prescribedReps !== null && set.prescribedReps > 4
        ? { actualReps: set.prescribedReps - 2 }
        : {};

    await expectOk<WorkoutExecution>({
      method: "POST",
      path: `/workouts/executions/${execution.id}/sets/${set.id}/complete`,
      actor: traineeActor,
      body,
    });
  }

  const sessionRpe = execution.requireSessionRpe
    ? Math.round(6 + roll("rpe", spec.key, assignment.localDate) * 3)
    : null;

  await expectOk<WorkoutExecution>({
    method: "POST",
    path: `/workouts/executions/${execution.id}/complete`,
    actor: traineeActor,
    idempotencyKey: idempotencyKey("workout.complete", assignment.id),
    body: sessionRpe === null ? {} : { sessionRpe },
  });
}

// ---------------------------------------------------------------------------
// Meal compliance
// ---------------------------------------------------------------------------

type MealOutcome = "confirm" | "deviate" | "skip" | "overdue";

function mealOutcomeFor(
  spec: TraineeSpec,
  assignment: MealAssignment,
  inWindow: boolean,
): MealOutcome {
  const value = roll("meal", spec.key, assignment.localDate, assignment.mealName);

  if (spec.adherence === "no_recent_data") return "overdue";
  // Photo-required meals cannot be confirmed without an upload. Skipping still
  // records compliance and does not leave an overdue-meal exception.
  if (assignment.photoRequired) return "skip";
  if (spec.adherence === "needs_attention") return "confirm";
  if (inWindow && value < 0.2) return "deviate";
  return "confirm";
}

const DEVIATION_KINDS: MealDeviationKind[] = [
  "portion_adjustment",
  "substitute",
  "restaurant",
  "repeat_recent",
];

const DEVIATION_NOTES: Record<string, string> = {
  portion_adjustment: "Smaller portion, was not very hungry.",
  substitute: "Swapped the protein for tofu, same portion size.",
  restaurant: "Client dinner out. Chose grilled over fried.",
  repeat_recent: "Repeated yesterday's lunch, it was already prepped.",
};

async function recordMealHistory(
  trainer: Actor,
  spec: TraineeSpec,
  traineeActor: Actor,
  relationship: CoachingRelationship,
): Promise<void> {
  if (spec.adherence === "no_recent_data") return;

  const today = localDateIn(spec.timezone);
  const now = new Date().toISOString();
  const assignments = await getData<MealAssignmentListResponse>(
    trainer,
    `/meals/relationships/${relationship.id}/assignments`,
  );

  let logged = 0;
  for (const assignment of assignments.items) {
    if (assignment.compliance) continue;

    const isPast = assignment.localDate < today;
    const inWindow =
      assignment.localDate === today && assignment.windowEndsAt > now;
    if (!isPast && !inWindow) continue;

    const outcome = mealOutcomeFor(spec, assignment, inWindow);
    if (outcome === "overdue") continue;

    if (outcome === "skip") {
      await expectOk({
        method: "POST",
        path: `/meals/assignments/${assignment.id}/skip`,
        actor: traineeActor,
        idempotencyKey: idempotencyKey("meal.skip", assignment.id),
        body: { notes: "Skipped, travelling with no suitable option." },
      });
    } else if (outcome === "deviate") {
      const kind =
        DEVIATION_KINDS[Math.floor(roll("deviation", assignment.id) * DEVIATION_KINDS.length)]!;
      await expectOk({
        method: "POST",
        path: `/meals/assignments/${assignment.id}/deviate`,
        actor: traineeActor,
        idempotencyKey: idempotencyKey("meal.deviate", assignment.id),
        body: { deviationKind: kind, notes: DEVIATION_NOTES[kind] ?? null },
      });
    } else {
      await expectOk({
        method: "POST",
        path: `/meals/assignments/${assignment.id}/confirm`,
        actor: traineeActor,
        idempotencyKey: idempotencyKey("meal.confirm", assignment.id),
        body: {},
      });
    }
    logged += 1;
  }

  if (logged > 0) log(`${logged} meal compliance records logged`);
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

async function ensureCheckins(
  trainer: Actor,
  spec: TraineeSpec,
  traineeActor: Actor,
  relationship: CoachingRelationship,
): Promise<void> {
  if (!spec.checkins?.length) return;

  for (const checkinSpec of spec.checkins) {
    const localDate = addLocalDays(localDateIn(spec.timezone), -checkinSpec.daysAgo);

    const scheduled = await expectOk<ScheduleCheckinResponse>({
      method: "POST",
      path: `/checkins/relationships/${relationship.id}/schedule`,
      actor: trainer,
      idempotencyKey: idempotencyKey("checkin.schedule", spec.key, localDate),
      body: { localDate },
    });
    let checkin = scheduled.data!.checkin;

    if (checkinSpec.outcome === "open") continue;

    if (checkin.recordStatus === "draft") {
      const submitted = await expectOk<Checkin>({
        method: "POST",
        path: `/checkins/${checkin.id}/submit`,
        actor: traineeActor,
        idempotencyKey: idempotencyKey("checkin.submit", spec.key, localDate),
        body: {
          expectedVersion: checkin.recordVersion,
          answers: {
            wellbeing: checkinSpec.wellbeing ?? "Steady week overall.",
            notes: checkinSpec.notes ?? null,
            bodyWeightKg: checkinSpec.bodyWeightKg ?? null,
          },
        },
      });
      checkin = submitted.data!;
    }

    if (checkinSpec.outcome === "reviewed" && !checkin.review) {
      await expectOk<Checkin>({
        method: "POST",
        path: `/checkins/${checkin.id}/review`,
        actor: trainer,
        idempotencyKey: idempotencyKey("checkin.review", spec.key, localDate),
        body: {
          outcome: checkinSpec.reviewOutcome ?? "acknowledged",
          notes: checkinSpec.reviewNotes ?? null,
        },
      });
    }
  }

  const awaiting = spec.checkins.filter((item) => item.outcome === "awaiting_review").length;
  log(`${spec.checkins.length} check-ins scheduled, ${awaiting} awaiting trainer review`);
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

async function ensureProgress(
  trainer: Actor,
  spec: TraineeSpec,
  traineeActor: Actor,
  relationship: CoachingRelationship,
): Promise<void> {
  const progress = spec.progress;
  if (!progress) return;

  for (let week = progress.weeks; week >= 0; week -= 1) {
    const observedAt = isoDaysAgo(week * 7);
    const elapsed = progress.weeks - week;

    await upsertMeasurement(traineeActor, spec, relationship.id, {
      seed: `weight-w${week}`,
      type: "body_weight_kg",
      value: round1(progress.startWeightKg + progress.weeklyDeltaKg * elapsed),
      unit: "kg",
      observedAt,
    });

    // Waist is measured fortnightly, which keeps the chart series honest.
    if (week % 2 === 0) {
      await upsertMeasurement(traineeActor, spec, relationship.id, {
        seed: `waist-w${week}`,
        type: "waist_cm",
        value: round1(progress.waistStartCm + progress.weeklyWaistDeltaCm * elapsed),
        unit: "cm",
        observedAt,
      });
      if (progress.hipStartCm !== undefined && progress.weeklyHipDeltaCm !== undefined) {
        await upsertMeasurement(traineeActor, spec, relationship.id, {
          seed: `hip-w${week}`,
          type: "hip_cm",
          value: round1(progress.hipStartCm + progress.weeklyHipDeltaCm * elapsed),
          unit: "cm",
          observedAt,
        });
      }
    }
  }

  const existing = await getData<ProgressEntryListResponse>(
    trainer,
    `/progress/relationships/${relationship.id}/entries`,
  );
  for (const entry of progress.entries) {
    if (existing.items.some((item) => item.title === entry.title)) continue;
    await expectOk({
      method: "POST",
      path: `/progress/relationships/${relationship.id}/entries`,
      actor: traineeActor,
      idempotencyKey: idempotencyKey("progress.entry", spec.key, entry.title),
      body: {
        entryType: entry.entryType,
        title: entry.title,
        body: entry.body,
        observedAt: isoDaysAgo(entry.daysAgo, 9),
      },
    });
  }

  log(`progress series spanning ${progress.weeks} weeks`);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const measurementIdsByRelationship = new Map<string, Set<string>>();

async function upsertMeasurement(
  traineeActor: Actor,
  spec: TraineeSpec,
  relationshipId: string,
  input: {
    seed: string;
    type: "body_weight_kg" | "waist_cm" | "hip_cm";
    value: number;
    unit: string;
    observedAt: string;
  },
): Promise<void> {
  const id = stableUuid("measurement", spec.key, input.seed);
  let known = measurementIdsByRelationship.get(relationshipId);
  if (!known) {
    const existing = await getData<MeasurementListResponse>(
      traineeActor,
      `/progress/relationships/${relationshipId}/measurements`,
    );
    known = new Set(existing.items.map((item) => item.id));
    measurementIdsByRelationship.set(relationshipId, known);
  }
  if (known.has(id)) return;
  known.add(id);

  // A client-supplied stable id makes the create endpoint converge on reruns.
  // Skip when that id already exists so a later calendar day does not reuse the
  // idempotency key with a new observedAt.
  await expectOk({
    method: "POST",
    path: `/progress/relationships/${relationshipId}/measurements`,
    actor: traineeActor,
    idempotencyKey: idempotencyKey("progress.measurement", spec.key, input.seed),
    body: {
      id,
      type: input.type,
      value: input.value,
      unit: input.unit,
      observedAt: input.observedAt,
    },
  });
}

// ---------------------------------------------------------------------------
// Exceptions and trainer notes
// ---------------------------------------------------------------------------

async function ensureExceptions(
  trainer: Actor,
  spec: TraineeSpec,
  relationship: CoachingRelationship,
  pass = "initial",
): Promise<void> {
  // Exceptions are derived server-side from missed and overdue expectations.
  // The script only asks the API to evaluate; it never writes them directly.
  await expectOk({
    method: "POST",
    path: `/exceptions/relationships/${relationship.id}/evaluate`,
    actor: trainer,
    idempotencyKey: idempotencyKey(
      "exception.evaluate",
      spec.key,
      localDateIn(spec.timezone),
      pass,
    ),
  });
}

async function ensureTrainerNotes(
  trainer: Actor,
  spec: TraineeSpec,
  relationship: CoachingRelationship,
): Promise<void> {
  if (!spec.trainerNotes?.length) return;

  const existing = await getData<TrainerNoteListResponse>(
    trainer,
    `/checkins/relationships/${relationship.id}/notes`,
  );

  for (const body of spec.trainerNotes) {
    if (existing.items.some((item) => item.body === body)) continue;
    await expectOk({
      method: "POST",
      path: `/checkins/relationships/${relationship.id}/notes`,
      actor: trainer,
      idempotencyKey: idempotencyKey("checkin.note", spec.key, digest("note", body)),
      body: { body },
    });
  }
}

// ---------------------------------------------------------------------------
// Iteration A profiles, snapshots, adherence, and onboarding forms
// ---------------------------------------------------------------------------

const PROGRESS_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const TRAINEE_PROFILES: Record<string, { dateOfBirth: string; gender: string }> = {
  priya: { dateOfBirth: "1996-04-18", gender: "female" },
  arjun: { dateOfBirth: "1988-11-02", gender: "male" },
  neha: { dateOfBirth: "1999-07-23", gender: "female" },
  rahul: { dateOfBirth: "1985-01-09", gender: "male" },
  ananya: { dateOfBirth: "2001-09-14", gender: "female" },
  vikram: { dateOfBirth: "1982-06-30", gender: "male" },
  sanjana: { dateOfBirth: "1997-12-05", gender: "female" },
  kabir: { dateOfBirth: "2003-03-21", gender: "male" },
  ishaan: { dateOfBirth: "1993-02-11", gender: "male" },
};

const LEGACY_ONBOARDING_FIELD_TYPES = new Set(["text", "textarea", "select"]);

/** New trainer versions use the six typed fields. Stored legacy versions are not rewritten. */
const TRAINER_ONBOARDING_FIELDS: OnboardingFieldDefinition[] = [
  {
    id: "preferred_name",
    type: "short_text",
    label: "Preferred name",
    required: false,
    maxLength: 80,
  },
  { id: "goals", type: "long_text", label: "Goals", required: true, maxLength: 2000 },
  {
    id: "relevant_history",
    type: "long_text",
    label: "Relevant history",
    required: false,
    maxLength: 4000,
  },
  {
    id: "preferences",
    type: "long_text",
    label: "Preferences",
    required: false,
    maxLength: 2000,
  },
  { id: "schedule", type: "long_text", label: "Schedule", required: true, maxLength: 2000 },
  {
    id: "limitations",
    type: "long_text",
    label: "Limitations",
    required: false,
    maxLength: 2000,
  },
  {
    id: "training_background",
    type: "single_choice",
    label: "Training background",
    required: false,
    options: [
      { id: "new", label: "New to training" },
      { id: "some", label: "Some experience" },
      { id: "consistent", label: "Consistent for years" },
    ],
  },
  {
    id: "equipment_access",
    type: "multiple_choice",
    label: "Equipment you can use",
    required: false,
    options: [
      { id: "barbell", label: "Barbell" },
      { id: "dumbbells", label: "Dumbbells" },
      { id: "bodyweight", label: "Bodyweight only" },
    ],
  },
  { id: "years_training", type: "number", label: "Years of training", required: false },
  { id: "trains_at_home", type: "yes_no", label: "Trains at home", required: false },
];

function onboardingFieldsAreLegacy(fields: readonly OnboardingFieldDefinition[]): boolean {
  return fields.some((field) => LEGACY_ONBOARDING_FIELD_TYPES.has(field.type));
}

let globalOnboardingTemplateId = "";
let trainerOnboardingTemplateId = "";

function onboardingTemplateIdFor(spec: TraineeSpec): string | undefined {
  if (spec.onboardingTemplate === "global" && globalOnboardingTemplateId) {
    return globalOnboardingTemplateId;
  }
  if (spec.onboardingTemplate === "trainer" && trainerOnboardingTemplateId) {
    return trainerOnboardingTemplateId;
  }
  return undefined;
}

async function listFoods(trainer: Actor): Promise<FoodLibraryItem[]> {
  const items: FoodLibraryItem[] = [];
  let cursor: string | null = null;
  do {
    const page: FoodLibraryListResponse = await getData<FoodLibraryListResponse>(
      trainer,
      `/libraries/foods?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

async function listExercises(trainer: Actor): Promise<ExerciseLibraryItem[]> {
  const items: ExerciseLibraryItem[] = [];
  let cursor: string | null = null;
  do {
    const page: ExerciseLibraryListResponse = await getData<ExerciseLibraryListResponse>(
      trainer,
      `/libraries/exercises?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

function foodsByName(items: readonly FoodLibraryItem[]): Map<string, FoodLibraryItem> {
  const foods = new Map<string, FoodLibraryItem>();
  for (const item of items) {
    if (item.ownership === "trainer" || !foods.has(item.name)) foods.set(item.name, item);
  }
  return foods;
}

function exerciseIdsByName(items: readonly ExerciseLibraryItem[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const item of items) {
    if (item.ownership === "trainer" || !ids.has(item.name)) ids.set(item.name, item.id);
  }
  return ids;
}

function assertGlobalLibrary(foods: readonly FoodLibraryItem[], exercises: readonly ExerciseLibraryItem[]): void {
  const globalFoods = foods.filter((item) => item.ownership === "global");
  if (globalFoods.length === 0) {
    throw new SeedError("No global foods are available. Apply the local migrations before seeding.");
  }
  for (const food of globalFoods) {
    const converting = food.servings.some((serving) => serving.conversionScaled != null);
    if (
      !food.classification ||
      !food.basis ||
      !converting ||
      food.energyKcalScaled == null
    ) {
      throw new SeedError(
        `Global food "${food.name}" needs a classification, a per-100 basis, scaled energy, and a converting serving.`,
      );
    }
  }
  const globalExercises = exercises.filter((item) => item.ownership === "global");
  if (globalExercises.length === 0) {
    throw new SeedError("No global exercises are available. Apply the local migrations before seeding.");
  }
  for (const exercise of globalExercises) {
    if (exercise.primaryMuscles.length === 0) {
      throw new SeedError(`Global exercise "${exercise.name}" needs a primary muscle.`);
    }
  }
}

function foodLibraryMatches(
  existing: FoodLibraryItem,
  item: (typeof FOOD_LIBRARY)[number],
): boolean {
  if (existing.classification !== item.classification || existing.basis !== item.basis) {
    return false;
  }
  if (
    existing.energyKcalScaled !== scaleDecimal(item.energyKcal) ||
    existing.proteinScaled !== scaleDecimal(item.proteinGrams) ||
    existing.carbsScaled !== scaleDecimal(item.carbsGrams) ||
    existing.fatScaled !== scaleDecimal(item.fatGrams)
  ) {
    return false;
  }
  return item.servings.every((serving) =>
    existing.servings.some(
      (row) =>
        row.label === serving.label &&
        row.unit === serving.unit &&
        row.conversionScaled === scaleDecimal(serving.conversion),
    ),
  );
}

function contentNeedsCurrentContract(content: PlanContent, spec: ContentSpec): boolean {
  if (spec.days.length > 0 && content.workoutDays.some((day) => day.weekday == null)) {
    return true;
  }
  if (
    spec.meals.length > 0 &&
    content.mealPrescriptions.some(
      (meal) =>
        meal.mealType == null ||
        meal.localTime == null ||
        (meal.applicableWeekdays?.length ?? 0) === 0 ||
        meal.items.some((item) => item.snapshotKind !== "calculated"),
    )
  ) {
    return true;
  }
  return content.workoutDays.some((day) =>
    day.exercises.some((exercise) => exercise.primaryMuscles.length === 0),
  );
}

async function planContentFor(
  trainer: Actor,
  spec: TraineeSpec,
  seed: string,
): Promise<PlanContent> {
  if (!spec.content) {
    throw new SeedError(`Plan content is missing for ${spec.displayName}.`);
  }
  const [foods, exercises] = await Promise.all([
    listFoods(trainer),
    listExercises(trainer),
  ]);
  return buildPlanContent(
    seed,
    spec.content,
    foodsByName(foods),
    exerciseIdsByName(exercises),
  );
}

async function ensureTraineeProfile(traineeActor: Actor, spec: TraineeSpec): Promise<void> {
  const profile = TRAINEE_PROFILES[spec.key];
  if (!profile) return;
  const current = await call<TraineeProfile>({
    method: "GET",
    path: "/me/trainee-profile",
    actor: traineeActor,
  });
  if (
    current.data?.dateOfBirth === profile.dateOfBirth &&
    current.data.gender === profile.gender
  ) {
    return;
  }
  await expectOk<TraineeProfile>({
    method: "PUT",
    path: "/me/trainee-profile",
    actor: traineeActor,
    body: profile,
  });
  log(`trainee profile set (${profile.gender}, born ${profile.dateOfBirth})`);
}

async function ensureMealSnapshots(
  trainer: Actor,
  spec: TraineeSpec,
  planId: string,
): Promise<void> {
  if (!spec.content?.meals.length) return;
  const versions = await loadPlanVersions(trainer, planId);
  if (versions.some((version) => version.status === "draft")) return;
  const effective = [...versions]
    .reverse()
    .find((version) => version.status === "effective");
  if (!effective) return;
  const missingItems = effective.content.mealPrescriptions.some(
    (meal) => meal.items.length === 0,
  );
  if (!missingItems) return;

  const created = await expectOk<PlanVersion>({
    method: "POST",
    path: `/plans/${planId}/versions`,
    actor: trainer,
    idempotencyKey: idempotencyKey("plan.snapshot_draft", spec.key),
    body: { sourceVersionId: effective.id, asAdjustment: true },
  });
  const draft = created.data!;
  const updated = await expectOk<PlanVersion>({
    method: "PUT",
    path: `/plans/${planId}/versions/${draft.id}`,
    actor: trainer,
    body: {
      expectedRecordVersion: draft.recordVersion,
      content: await planContentFor(trainer, spec, `${spec.key}-snapshots`),
    },
  });
  await expectOk<PlanVersion>({
    method: "POST",
    path: `/plans/${planId}/versions/${draft.id}/publish`,
    actor: trainer,
    idempotencyKey: idempotencyKey("plan.snapshot_publish", spec.key),
    body: { expectedRecordVersion: updated.data!.recordVersion, mode: "immediate" },
  });
  log("published a new plan version with food-item snapshots");
}

async function closeLapsedSignals(
  trainer: Actor,
  spec: TraineeSpec,
  traineeActor: Actor,
  relationship: CoachingRelationship,
): Promise<void> {
  const today = localDateIn(spec.timezone);
  const workouts = await getData<WorkoutAssignmentListResponse>(
    trainer,
    `/workouts/relationships/${relationship.id}/assignments`,
  );
  for (const assignment of workouts.items) {
    if (assignment.status !== "missed") continue;
    await completeWorkout(traineeActor, spec, assignment, false);
  }

  const meals = await getData<MealAssignmentListResponse>(
    trainer,
    `/meals/relationships/${relationship.id}/assignments`,
  );
  for (const assignment of meals.items) {
    if (assignment.compliance || assignment.status !== "overdue") continue;
    if (assignment.photoRequired) {
      await expectOk({
        method: "POST",
        path: `/meals/assignments/${assignment.id}/skip`,
        actor: traineeActor,
        idempotencyKey: idempotencyKey("meal.skip.settle", assignment.id),
        body: { notes: "Logged during the development seed so the meal is no longer overdue." },
      });
    } else {
      await expectOk({
        method: "POST",
        path: `/meals/assignments/${assignment.id}/confirm`,
        actor: traineeActor,
        idempotencyKey: idempotencyKey("meal.confirm.settle", assignment.id),
        body: {},
      });
    }
  }

  const checkins = await getData<CheckinListResponse>(
    trainer,
    `/checkins/relationships/${relationship.id}`,
  );
  for (const checkin of checkins.items) {
    if (checkin.status !== "overdue" || checkin.recordStatus !== "draft") continue;
    if (checkin.localDate >= today) continue;
    await expectOk<Checkin>({
      method: "POST",
      path: `/checkins/${checkin.id}/submit`,
      actor: traineeActor,
      idempotencyKey: idempotencyKey("checkin.submit.settle", checkin.id),
      body: {
        expectedVersion: checkin.recordVersion,
        answers: {
          wellbeing: "Catching up on a check-in that had passed its due window.",
          notes: "Submitted from the development seed so this check-in is no longer overdue.",
          bodyWeightKg: null,
        },
      },
    });
  }
}

async function resolveOpenExceptions(trainer: Actor, relationshipId: string): Promise<void> {
  const open = await getData<ExceptionListResponse>(
    trainer,
    `/exceptions/relationships/${relationshipId}`,
  );
  for (const exception of open.items) {
    await expectOk({
      method: "POST",
      path: `/exceptions/${exception.id}/acknowledge`,
      actor: trainer,
      idempotencyKey: idempotencyKey("exception.acknowledge", exception.id),
      body: { note: "Seen while refreshing development seed data." },
    });
  }
  const acknowledged = await getData<ExceptionListResponse>(
    trainer,
    `/exceptions/relationships/${relationshipId}?status=acknowledged`,
  );
  for (const exception of acknowledged.items) {
    await expectOk({
      method: "POST",
      path: `/exceptions/${exception.id}/resolve`,
      actor: trainer,
      idempotencyKey: idempotencyKey("exception.resolve", exception.id),
      body: {
        note: "Source signal was logged and this exception is closed.",
        interventionKind: "note",
      },
    });
  }
  if (open.items.length + acknowledged.items.length > 0) {
    log("open adherence exceptions resolved after the source signals were logged");
  }
}

async function settleAdherence(
  trainer: Actor,
  spec: TraineeSpec,
  traineeActor: Actor,
  relationship: CoachingRelationship,
): Promise<void> {
  if (!spec.adherence) return;

  if (spec.adherence === "on_track") {
    await closeLapsedSignals(trainer, spec, traineeActor, relationship);
  }

  await ensureExceptions(trainer, spec, relationship);

  if (spec.adherence === "on_track") {
    await resolveOpenExceptions(trainer, relationship.id);
    await ensureExceptions(trainer, spec, relationship);
    await resolveOpenExceptions(trainer, relationship.id);
    return;
  }

  if (spec.adherence !== "needs_attention") return;

  const open = await getData<ExceptionListResponse>(
    trainer,
    `/exceptions/relationships/${relationship.id}`,
  );
  if (open.items.length > 0) {
    log(`needs attention from ${open.items.length} open adherence exception(s)`);
    return;
  }

  const localDate = addLocalDays(localDateIn(spec.timezone), -6);
  await expectOk<ScheduleCheckinResponse>({
    method: "POST",
    path: `/checkins/relationships/${relationship.id}/schedule`,
    actor: trainer,
    idempotencyKey: idempotencyKey("checkin.schedule.attention", spec.key, localDate),
    body: { localDate },
  });
  await ensureExceptions(trainer, spec, relationship, "overdue-checkin");
  log("left an overdue check-in so adherence stays needs attention");
}

async function ensureProgressPhotos(
  traineeActor: Actor,
  spec: TraineeSpec,
  relationship: CoachingRelationship,
): Promise<void> {
  if (!spec.progress || spec.progress.weeks < 4) return;
  const existing = await getData<ProgressEntryListResponse>(
    traineeActor,
    `/progress/relationships/${relationship.id}/entries`,
  );
  const photos = [
    { title: "Progress photo — front", daysAgo: spec.progress.weeks * 7 },
    { title: "Progress photo — side", daysAgo: Math.round(spec.progress.weeks * 3.5) },
    { title: "Progress photo — latest", daysAgo: 4 },
  ];
  let created = 0;
  for (const photo of photos) {
    if (existing.items.some((item) => item.title === photo.title)) continue;
    const target = await expectOk<CreateUploadTargetResponse>({
      method: "POST",
      path: "/files/upload-targets",
      actor: traineeActor,
      idempotencyKey: idempotencyKey("progress.photo.upload", spec.key, photo.title),
      body: {
        coachingRelationshipId: relationship.id,
        mediaType: "progress_photo",
        contentType: "image/png",
        byteSize: PROGRESS_PNG.byteLength,
        originalFilename: `${spec.key}-progress.png`,
      },
    });
    const uploadUrl = target.data!.uploadUrl.startsWith("http")
      ? target.data!.uploadUrl
      : `${baseUrl}${target.data!.uploadUrl}`;
    const uploaded = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: PROGRESS_PNG,
    });
    if (!uploaded.ok) {
      throw new SeedError(
        `Progress photo upload failed for ${spec.displayName} (${uploaded.status}).`,
      );
    }
    await expectOk({
      method: "POST",
      path: `/progress/relationships/${relationship.id}/entries`,
      actor: traineeActor,
      idempotencyKey: idempotencyKey("progress.photo.entry", spec.key, photo.title),
      body: {
        entryType: "progress_photo",
        title: photo.title,
        body: "Development seed progress photo.",
        observedAt: isoDaysAgo(photo.daysAgo, 8),
        mediaAssetId: target.data!.mediaAsset.id,
      },
    });
    created += 1;
  }
  if (created > 0) log(`${created} progress photos uploaded`);
}

async function ensureOnboardingForms(trainer: Actor): Promise<void> {
  heading("Onboarding form templates");
  setScope("onboarding");
  const listed = await getData<OnboardingFormTemplateListResponse>(
    trainer,
    "/onboarding/form-templates?limit=50",
  );
  const globalTemplate = listed.items.find((item) => item.ownership === "global");
  if (!globalTemplate) {
    throw new SeedError(
      "No global onboarding form template is available. Apply the local migrations before seeding.",
    );
  }
  globalOnboardingTemplateId = globalTemplate.id;
  log(
    `global onboarding template ${globalTemplate.name} has ${globalTemplate.latestVersionNumber} version(s)`,
  );

  let trainerTemplate = listed.items.find(
    (item) => item.ownership === "trainer" && item.name === "Ramesh coaching intake",
  );
  if (!trainerTemplate) {
    const forked = await expectOk<OnboardingFormTemplateDetail>({
      method: "POST",
      path: `/onboarding/form-templates/${globalTemplate.id}/fork`,
      actor: trainer,
      idempotencyKey: idempotencyKey("onboarding.fork", "ramesh"),
      body: {
        name: "Ramesh coaching intake",
        description: "Trainer copy of the default intake, with a second version for background.",
      },
    });
    trainerTemplate = forked.data!;
    log("forked the global onboarding template");
  }

  trainerOnboardingTemplateId = trainerTemplate.id;
  const detail = await getData<OnboardingFormTemplateDetail>(
    trainer,
    `/onboarding/form-templates/${trainerTemplate.id}`,
  );
  const latest = detail.versions[detail.versions.length - 1];
  if (!latest || onboardingFieldsAreLegacy(latest.fields)) {
    await expectOk<OnboardingFormTemplateDetail>({
      method: "POST",
      path: `/onboarding/form-templates/${trainerTemplate.id}/versions`,
      actor: trainer,
      idempotencyKey: idempotencyKey("onboarding.version", "ramesh", "typed-fields"),
      body: { fields: TRAINER_ONBOARDING_FIELDS },
    });
    log("appended a trainer onboarding version with typed fields");
  } else {
    log(`trainer onboarding template has ${detail.versions.length} versions`);
  }
}

const DIRECTORY_EXPECTATIONS: { name: string; adherenceState: AdherenceState; status: string }[] =
  [
    { name: "Priya Sharma", adherenceState: "on_track", status: "active" },
    { name: "Arjun Mehta", adherenceState: "needs_attention", status: "active" },
    { name: "Ishaan Kapoor", adherenceState: "no_recent_data", status: "active" },
    { name: "Meera Krishnan", adherenceState: "not_available", status: "invited" },
  ];

async function assertSeededReadModels(trainer: Actor): Promise<void> {
  heading("Read-model check");
  setScope("verify");
  const items: ClientDirectoryListResponse["items"] = [];
  let cursor: string | null = null;
  do {
    const page: ClientDirectoryListResponse = await getData<ClientDirectoryListResponse>(
      trainer,
      `/clients?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const goals = new Set(
    items.map((item) => item.goalShort).filter((goal): goal is string => Boolean(goal)),
  );
  if (goals.size < 2) {
    throw new SeedError(
      `Clients directory has ${goals.size} distinct short goals; expected at least 2.`,
    );
  }

  for (const expected of DIRECTORY_EXPECTATIONS) {
    const item = items.find((row) => row.traineeDisplayName === expected.name);
    if (!item) throw new SeedError(`Directory is missing ${expected.name}.`);
    if (item.adherenceState !== expected.adherenceState || item.status !== expected.status) {
      throw new SeedError(
        `${expected.name} is ${item.status} / ${item.adherenceState}; expected ${expected.status} / ${expected.adherenceState}.`,
      );
    }
    log(`${expected.name}: ${item.status}, ${item.adherenceState}`);
  }

  const meera = items.find((item) => item.traineeDisplayName === "Meera Krishnan");
  if (!meera?.invitationId || meera.relationshipId) {
    throw new SeedError("Meera Krishnan should be a pending invitation with no relationship.");
  }

  const priya = items.find((item) => item.traineeDisplayName === "Priya Sharma");
  if (!priya?.relationshipId || !priya.goalShort || !priya.effectivePlan || !priya.nextCheckin) {
    throw new SeedError("Priya Sharma is missing a goal, effective plan, or next check-in.");
  }
  const workspace = await getData<ClientWorkspace>(
    trainer,
    `/workspaces/relationships/${priya.relationshipId}`,
  );
  if (
    workspace.header.adherenceState !== "on_track" ||
    !workspace.header.goalShort ||
    !workspace.configuration.configuration?.goalDescription ||
    workspace.header.traineeProfile.age === null ||
    !workspace.header.traineeProfile.gender ||
    !workspace.plan.version ||
    workspace.overview.recentActivity.length === 0 ||
    workspace.overview.progress.measurements.length < 8 ||
    workspace.overview.progress.media.length === 0
  ) {
    throw new SeedError(
      "Priya Sharma's workspace is missing the Iteration A header, activity, or progress series.",
    );
  }
  log(
    `Priya workspace age ${workspace.header.traineeProfile.age}, ${workspace.overview.progress.measurements.length} measurements, ${workspace.overview.progress.media.length} photos`,
  );
}

// ---------------------------------------------------------------------------
// Templates and libraries
// ---------------------------------------------------------------------------

async function ensureTemplatesAndLibraries(trainer: Actor): Promise<void> {
  heading("Trainer templates and libraries");
  setScope("library");

  let exercises = await listExercises(trainer);
  for (const item of EXERCISE_LIBRARY) {
    const existing = exercises.find(
      (row) => row.ownership === "trainer" && row.name === item.name,
    );
    if (!existing) {
      await expectOk({ method: "POST", path: "/libraries/exercises", actor: trainer, body: item });
      continue;
    }
    if (
      existing.primaryMuscles.length > 0 &&
      existing.secondaryMuscles.length === item.secondaryMuscles.length &&
      existing.equipment.length > 0 &&
      existing.difficulty
    ) {
      continue;
    }
    await expectOk<ExerciseLibraryItem>({
      method: "PUT",
      path: `/libraries/exercises/${existing.id}`,
      actor: trainer,
      body: item,
    });
  }
  exercises = await listExercises(trainer);
  log(`${EXERCISE_LIBRARY.length} trainer-owned exercise library items available`);

  let foods = await listFoods(trainer);
  for (const item of FOOD_LIBRARY) {
    const existing = foods.find((row) => row.ownership === "trainer" && row.name === item.name);
    if (!existing) {
      await expectOk({ method: "POST", path: "/libraries/foods", actor: trainer, body: item });
      continue;
    }
    if (foodLibraryMatches(existing, item)) continue;
    await expectOk<FoodLibraryItem>({
      method: "PUT",
      path: `/libraries/foods/${existing.id}`,
      actor: trainer,
      body: item,
    });
  }
  foods = await listFoods(trainer);
  assertGlobalLibrary(foods, exercises);
  log(
    `${FOOD_LIBRARY.length} trainer-owned foods available; ${foods.filter((item) => item.ownership === "global").length} global foods checked`,
  );

  const foodLookup = foodsByName(foods);
  const exerciseLookup = exerciseIdsByName(exercises);
  const templates = await getData<PlanTemplateListResponse>(trainer, "/templates?limit=50");
  for (const template of TEMPLATES) {
    const content = buildPlanContent(
      `template-${template.title}`,
      template.content,
      foodLookup,
      exerciseLookup,
    );
    const existing = templates.items.find(
      (item) => item.ownership === "trainer" && item.title === template.title,
    );
    if (!existing) {
      await expectOk({
        method: "POST",
        path: "/templates",
        actor: trainer,
        idempotencyKey: idempotencyKey("template.create", template.title),
        body: { title: template.title, templateType: template.templateType, content },
      });
      continue;
    }
    const detail = await getData<PlanTemplate>(trainer, `/templates/${existing.id}`);
    if (!contentNeedsCurrentContract(detail.content, template.content)) continue;
    await expectOk<PlanTemplate>({
      method: "PUT",
      path: `/templates/${existing.id}`,
      actor: trainer,
      body: {
        expectedRecordVersion: detail.recordVersion,
        templateType: template.templateType,
        content,
      },
    });
  }
  log(`${TEMPLATES.length} plan templates available`);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function seedClient(trainer: Actor, spec: TraineeSpec): Promise<SeededClient | null> {
  heading(`Client: ${spec.displayName} <${spec.email}>`);
  setScope(spec.displayName);

  if (spec.stage === "invited") {
    await ensurePendingInvitation(trainer, spec);
    return null;
  }

  const traineeActor: Actor = {
    token: createTestIdToken(`trainee-${spec.email}`, spec.email),
    role: "trainee",
    label: `trainee ${spec.email}`,
  };

  let relationship = await ensureRelationship(trainer, spec, traineeActor);
  await ensureTraineeProfile(traineeActor, spec);
  await ensureIntake(spec, traineeActor, relationship);

  if (spec.stage === "onboarding_pending" || spec.stage === "onboarding_submitted") {
    relationship = await getData<CoachingRelationship>(
      trainer,
      `/relationships/${relationship.id}`,
    );
    log(`held at ${relationship.onboardingStatus} by design`);
    await ensureTrainerNotes(trainer, spec, relationship);
    return { spec, relationship };
  }

  relationship = await ensureOnboardingReview(trainer, spec, relationship);

  if (spec.stage === "coaching_ready") {
    log("coaching ready with no coaching configuration yet, by design");
    await ensureTrainerNotes(trainer, spec, relationship);
    return { spec, relationship };
  }

  await ensureConfiguration(trainer, spec, relationship);
  const planId = await ensurePublishedPlan(trainer, spec, relationship);

  const today = localDateIn(spec.timezone);
  const yesterday = addLocalDays(today, -1);
  const upcomingFrom =
    spec.adherence === "no_recent_data" ? addLocalDays(today, 1) : today;

  // History is generated and executed against the version effective at the
  // time, then the adjustment publishes a new version for upcoming days.
  const pastWorkouts = await generateWorkoutExpectations(
    trainer,
    spec,
    relationship,
    addLocalDays(today, -(spec.workoutHistoryDays ?? 0)),
    yesterday,
  );
  const pastMeals = await generateMealExpectations(
    trainer,
    spec,
    relationship,
    addLocalDays(today, -(spec.mealHistoryDays ?? 0)),
    yesterday,
  );
  if (pastWorkouts + pastMeals > 0) {
    log(`${pastWorkouts} past workout and ${pastMeals} past meal expectations generated`);
  }

  if (planId) {
    await ensureAdjustment(trainer, spec, planId);
    await ensureMealSnapshots(trainer, spec, planId);
  }

  const upcomingWorkouts = await generateWorkoutExpectations(
    trainer,
    spec,
    relationship,
    upcomingFrom,
    addLocalDays(today, 7),
  );
  const upcomingMeals = await generateMealExpectations(
    trainer,
    spec,
    relationship,
    upcomingFrom,
    addLocalDays(today, 2),
  );
  if (upcomingWorkouts + upcomingMeals > 0) {
    log(
      `${upcomingWorkouts} upcoming workout and ${upcomingMeals} upcoming meal ` +
        `expectations generated`,
    );
  }

  // Claim the in-progress session first so the adherence pass does not finish
  // every past assignment before one can be left open.
  await startUnfinishedWorkout(trainer, spec, traineeActor, relationship);
  await recordWorkoutHistory(trainer, spec, traineeActor, relationship);
  await recordMealHistory(trainer, spec, traineeActor, relationship);

  await ensureCheckins(trainer, spec, traineeActor, relationship);
  await ensureProgress(trainer, spec, traineeActor, relationship);
  await ensureProgressPhotos(traineeActor, spec, relationship);
  await settleAdherence(trainer, spec, traineeActor, relationship);
  await ensureTrainerNotes(trainer, spec, relationship);

  return { spec, relationship };
}

// ---------------------------------------------------------------------------
// Inventory (read back from the API so the summary reflects real state)
// ---------------------------------------------------------------------------

type Inventory = Record<string, number>;

async function buildInventory(trainer: Actor, clients: SeededClient[]): Promise<Inventory> {
  const inventory: Inventory = {
    "Coaching relationships": clients.length,
    "Pending invitations": 0,
    "Accepted invitations": 0,
    "Intake submissions (submitted)": 0,
    "Intake drafts (unsubmitted)": 0,
    "Active coaching configurations": 0,
    "Clients without a configuration": 0,
    Plans: 0,
    "Plan versions (effective)": 0,
    "Plan versions (scheduled)": 0,
    "Plan versions (superseded)": 0,
    "Workout assignments": 0,
    "Workout assignments completed": 0,
    "Workout assignments modified": 0,
    "Workout assignments skipped": 0,
    "Workout assignments missed": 0,
    "Workout assignments in progress": 0,
    "Workout assignments upcoming": 0,
    "Meal assignments": 0,
    "Meal assignments confirmed": 0,
    "Meal assignments modified": 0,
    "Meal assignments skipped": 0,
    "Meal assignments logged after the window": 0,
    "Meal assignments overdue": 0,
    "Meal assignments pending": 0,
    "Check-ins": 0,
    "Check-ins submitted, awaiting review": 0,
    "Check-ins reviewed": 0,
    "Check-ins due or overdue": 0,
    "Exceptions open": 0,
    "Exceptions acknowledged": 0,
    "Exceptions resolved": 0,
    Measurements: 0,
    "Progress entries": 0,
    "Trainer notes": 0,
    "Plan templates": 0,
    "Exercise library items (trainer-owned)": 0,
    "Food library items (trainer-owned)": 0,
  };

  const invitations = await getData<InvitationListResponse>(trainer, "/invitations?limit=50");
  for (const invitation of invitations.items) {
    if (invitation.status === "pending") inventory["Pending invitations"]! += 1;
    if (invitation.status === "accepted") inventory["Accepted invitations"]! += 1;
  }

  for (const client of clients) {
    const id = client.relationship.id;

    const intake = await call<OnboardingFormResponse>({
      method: "GET",
      path: `/onboarding/relationships/${id}`,
      actor: trainer,
    });
    if (intake.data?.status === "submitted") inventory["Intake submissions (submitted)"]! += 1;
    if (intake.data?.status === "draft") inventory["Intake drafts (unsubmitted)"]! += 1;

    const configuration = await call<CoachingConfiguration>({
      method: "GET",
      path: `/configurations/relationships/${id}`,
      actor: trainer,
    });
    if (configuration.data?.status === "active") {
      inventory["Active coaching configurations"]! += 1;
    } else {
      inventory["Clients without a configuration"]! += 1;
    }

    const plans = await getData<PlanListResponse>(
      trainer,
      `/plans/relationships/${id}?limit=50`,
    );
    inventory["Plans"]! += plans.items.length;
    for (const entry of plans.items) {
      for (const version of entry.versions) {
        if (version.status === "effective") inventory["Plan versions (effective)"]! += 1;
        if (version.status === "scheduled") inventory["Plan versions (scheduled)"]! += 1;
        if (version.status === "superseded") inventory["Plan versions (superseded)"]! += 1;
      }
    }

    const workouts = await getData<WorkoutAssignmentListResponse>(
      trainer,
      `/workouts/relationships/${id}/assignments`,
    );
    inventory["Workout assignments"]! += workouts.items.length;
    for (const item of workouts.items) {
      if (item.status === "completed") inventory["Workout assignments completed"]! += 1;
      else if (item.status === "modified") inventory["Workout assignments modified"]! += 1;
      else if (item.status === "skipped") inventory["Workout assignments skipped"]! += 1;
      else if (item.status === "missed") inventory["Workout assignments missed"]! += 1;
      else if (item.status === "in_progress" || item.status === "paused") {
        inventory["Workout assignments in progress"]! += 1;
      } else inventory["Workout assignments upcoming"]! += 1;
    }

    const meals = await getData<MealAssignmentListResponse>(
      trainer,
      `/meals/relationships/${id}/assignments`,
    );
    inventory["Meal assignments"]! += meals.items.length;
    for (const item of meals.items) {
      if (item.status === "confirmed") inventory["Meal assignments confirmed"]! += 1;
      else if (item.status === "logged_later") {
        inventory["Meal assignments logged after the window"]! += 1;
      } else if (item.status === "modified") inventory["Meal assignments modified"]! += 1;
      else if (item.status === "skipped") inventory["Meal assignments skipped"]! += 1;
      else if (item.status === "overdue") inventory["Meal assignments overdue"]! += 1;
      else inventory["Meal assignments pending"]! += 1;
    }

    const checkins = await getData<CheckinListResponse>(
      trainer,
      `/checkins/relationships/${id}`,
    );
    inventory["Check-ins"]! += checkins.items.length;
    for (const item of checkins.items) {
      if (item.status === "reviewed") inventory["Check-ins reviewed"]! += 1;
      else if (item.status === "submitted") {
        inventory["Check-ins submitted, awaiting review"]! += 1;
      } else if (item.status === "due" || item.status === "overdue") {
        inventory["Check-ins due or overdue"]! += 1;
      }
    }

    const [open, acknowledged, resolved] = await Promise.all([
      getData<ExceptionListResponse>(trainer, `/exceptions/relationships/${id}`),
      getData<ExceptionListResponse>(
        trainer,
        `/exceptions/relationships/${id}?status=acknowledged`,
      ),
      getData<ExceptionListResponse>(
        trainer,
        `/exceptions/relationships/${id}?status=resolved`,
      ),
    ]);
    inventory["Exceptions open"]! += open.items.length;
    inventory["Exceptions acknowledged"]! += acknowledged.items.length;
    inventory["Exceptions resolved"]! += resolved.items.length;

    const measurements = await getData<MeasurementListResponse>(
      trainer,
      `/progress/relationships/${id}/measurements`,
    );
    inventory["Measurements"]! += measurements.items.length;

    const entries = await getData<ProgressEntryListResponse>(
      trainer,
      `/progress/relationships/${id}/entries`,
    );
    inventory["Progress entries"]! += entries.items.length;

    const notes = await getData<TrainerNoteListResponse>(
      trainer,
      `/checkins/relationships/${id}/notes`,
    );
    inventory["Trainer notes"]! += notes.items.length;
  }

  const templates = await getData<PlanTemplateListResponse>(trainer, "/templates?limit=50");
  inventory["Plan templates"]! = templates.items.length;

  const exercises = await getData<ExerciseLibraryListResponse>(
    trainer,
    "/libraries/exercises?limit=100",
  );
  inventory["Exercise library items (trainer-owned)"]! = exercises.items.filter(
    (item) => item.ownership === "trainer",
  ).length;

  const foods = await getData<FoodLibraryListResponse>(trainer, "/libraries/foods?limit=100");
  inventory["Food library items (trainer-owned)"]! = foods.items.filter(
    (item) => item.ownership === "trainer",
  ).length;

  return inventory;
}

function printSummary(inventory: Inventory, elapsedMs: number): void {
  heading("Seed complete");
  const width = Math.max(...Object.keys(inventory).map((label) => label.length));
  for (const [label, value] of Object.entries(inventory)) {
    console.log(`  ${label.padEnd(width)}  ${value}`);
  }
  console.log(
    `\n  ${requestCount} API requests in ${(elapsedMs / 1000).toFixed(1)}s against ${baseUrl}`,
  );
  console.log(`\n  Sign in to the trainer web app as: ${TRAINER_EMAIL}`);
  console.log("  Trainee test identities use the uid pattern: trainee-<email>");
  console.log("  Re-running this script is safe and will not duplicate the world.\n");
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  baseUrl = resolveBaseUrl();

  heading(`FitBud development seed → ${baseUrl}`);
  await assertLocalTestApi();
  log("local API reachable and running in test auth mode");

  const trainer: Actor = {
    token: createTestIdToken(TRAINER_UID, TRAINER_EMAIL),
    role: "trainer",
    label: `trainer ${TRAINER_EMAIL}`,
  };

  // The session exchange provisions the trainer role and profile when missing.
  await expectOk({
    method: "POST",
    path: "/auth/session",
    actor: trainer,
    body: { idToken: trainer.token, timezone: "Asia/Kolkata" },
  });
  log(`trainer ready: ${TRAINER_DISPLAY_NAME} <${TRAINER_EMAIL}>`);

  await ensureTemplatesAndLibraries(trainer);
  await ensureOnboardingForms(trainer);

  const clients: SeededClient[] = [];
  for (const spec of TRAINEES) {
    const seeded = await seedClient(trainer, spec);
    if (seeded) clients.push(seeded);
  }

  heading("Trainer-facing verification");
  setScope("verify");
  const attention = await getData<AttentionFeedResponse>(
    trainer,
    "/exceptions/attention?limit=50",
  );
  log(`${attention.items.length} items in the trainer attention feed`);
  const inbox = await getData<TrainerCheckinInboxResponse>(trainer, "/checkins/inbox");
  log(`${inbox.items.length} items in the trainer check-in inbox`);

  const inventory = await buildInventory(trainer, clients);
  printSummary(inventory, Date.now() - startedAt);
  await assertSeededReadModels(trainer);
}

main().catch((error: unknown) => {
  setScope("");
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSeed failed.\n\n${message}\n`);
  process.exitCode = 1;
});
