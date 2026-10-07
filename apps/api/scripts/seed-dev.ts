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

import type {
  AttentionFeedResponse,
  Checkin,
  CheckinListResponse,
  CoachingConfiguration,
  CoachingRelationship,
  CreatePlanResponse,
  ExceptionListResponse,
  ExerciseLibraryListResponse,
  FoodLibraryListResponse,
  OnboardingFormResponse,
  Invitation,
  InvitationListResponse,
  MealAssignment,
  MealAssignmentListResponse,
  MealDeviationKind,
  MealPrescription,
  MeasurementListResponse,
  PlanContent,
  PlanListResponse,
  PlanTemplateListResponse,
  PlanTemplateType,
  PlanVersion,
  PlanWithVersions,
  ProgressEntryListResponse,
  Role,
  ScheduleCheckinResponse,
  TrainerCheckinInboxResponse,
  TrainerNoteListResponse,
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

function weightedPick<T extends string>(value: number, weights: [T, number][]): T {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = value * total;
  for (const [option, weight] of weights) {
    cursor -= weight;
    if (cursor < 0) return option;
  }
  return weights[weights.length - 1]![0];
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
type WorkoutDaySpec = { name: string; exercises: ExerciseSpec[] };
type MealSpec = {
  name: string;
  scheduleHint: string;
  instructions: string;
  photoRequired?: boolean;
};
type ContentSpec = { days: WorkoutDaySpec[]; meals: MealSpec[] };

function buildWorkoutDays(seed: string, days: WorkoutDaySpec[]): WorkoutDay[] {
  return days.map((day, dayIndex) => ({
    id: stableUuid(seed, "day", day.name),
    order: dayIndex + 1,
    name: day.name,
    exercises: day.exercises.map((exercise, exerciseIndex) => ({
      id: stableUuid(seed, "day", day.name, "exercise", exercise.name),
      order: exerciseIndex + 1,
      name: exercise.name,
      instructions: exercise.instructions,
      setTargets: exercise.sets.map((set, setIndex) => ({
        id: stableUuid(seed, "day", day.name, "ex", exercise.name, `set${setIndex}`),
        order: setIndex + 1,
        reps: set.reps,
        loadLabel: set.loadLabel,
        rpe: set.rpe,
      })),
    })),
  }));
}

function buildMealPrescriptions(seed: string, meals: MealSpec[]): MealPrescription[] {
  return meals.map((meal, index) => ({
    id: stableUuid(seed, "meal", meal.name),
    order: index + 1,
    name: meal.name,
    scheduleHint: meal.scheduleHint,
    instructions: meal.instructions,
    photoRequired: meal.photoRequired ?? false,
    items: [],
  }));
}

function buildPlanContent(seed: string, spec: ContentSpec): PlanContent {
  return {
    workoutDays: buildWorkoutDays(seed, spec.days),
    mealPrescriptions: buildMealPrescriptions(seed, spec.meals),
  };
}

// ---------------------------------------------------------------------------
// Realistic content library
// ---------------------------------------------------------------------------

const STRENGTH_DAYS: WorkoutDaySpec[] = [
  {
    name: "Lower Body Strength",
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
    name: "Breakfast — Masala Oats with Egg Whites",
    scheduleHint: "07:30",
    instructions: "50 g oats, four egg whites, one cup vegetables.",
  },
  {
    name: "Lunch — Rajma, Brown Rice and Salad",
    scheduleHint: "13:00",
    instructions: "One cup rajma, 150 g cooked brown rice, large salad.",
  },
  {
    name: "Dinner — Grilled Chicken Tikka with Greens",
    scheduleHint: "20:00",
    instructions: "180 g chicken, two cups greens, one roti on training days.",
    photoRequired: true,
  },
];

const FAT_LOSS_MEALS: MealSpec[] = [
  {
    name: "Breakfast — Moong Dal Chilla with Curd",
    scheduleHint: "08:00",
    instructions: "Two chillas with 150 g low fat curd.",
  },
  {
    name: "Lunch — Paneer Bhurji with Multigrain Roti",
    scheduleHint: "13:30",
    instructions: "150 g paneer, two multigrain rotis, cucumber salad.",
  },
  {
    name: "Evening Snack — Roasted Chana and Fruit",
    scheduleHint: "17:00",
    instructions: "40 g roasted chana with one apple or guava.",
  },
  {
    name: "Dinner — Fish Curry with Sauteed Vegetables",
    scheduleHint: "20:30",
    instructions: "180 g fish in a light curry with two cups vegetables.",
  },
];

const RECOVERY_MEALS: MealSpec[] = [
  {
    name: "Breakfast — Ragi Porridge with Almonds",
    scheduleHint: "08:00",
    instructions: "40 g ragi, 200 ml milk, ten almonds.",
  },
  {
    name: "Lunch — Curd Rice with Dal and Vegetables",
    scheduleHint: "13:00",
    instructions: "One cup curd rice, half a cup of dal, one cup vegetables.",
  },
  {
    name: "Dinner — Vegetable Khichdi with Salad",
    scheduleHint: "19:30",
    instructions: "One and a half cups khichdi with a lemon-dressed salad.",
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

type AdherenceProfile = "strong" | "mixed" | "slipping" | "upcoming_only";

type ConfigurationSpec = {
  goalShort: string;
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
  goalShort: "Add 10 kg to the squat while holding body weight steady",
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
  goalShort: "Lose 6 kg over 16 weeks without losing strength",
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
  goalShort: "Return to full training after a lower back flare-up",
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
    adherence: "strong",
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
    adherence: "slipping",
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
    configuration: STRENGTH_CONFIG,
    planTitle: "Strength Foundation — 12 Week Build",
    content: STRENGTH_CONTENT,
    adherence: "strong",
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
    adherence: "mixed",
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
    adherence: "upcoming_only",
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
  },
  {
    key: "dev",
    displayName: "Dev Patel",
    email: "dev.patel@example.com",
    timezone: "Asia/Kolkata",
    stage: "invited",
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
  defaultLoadLabel: string;
  defaultReps: number;
}[] = [
  {
    name: "Bulgarian Split Squat",
    instructions: "Rear foot elevated, torso slightly forward, controlled descent.",
    defaultLoadLabel: "2 x 12 kg",
    defaultReps: 10,
  },
  {
    name: "Cable Face Pull",
    instructions: "Pull to the forehead with thumbs back to reach the rear delts.",
    defaultLoadLabel: "15 kg",
    defaultReps: 15,
  },
  {
    name: "Farmer's Carry",
    instructions: "Tall posture with ribs down, thirty metres per round.",
    defaultLoadLabel: "2 x 24 kg",
    defaultReps: 1,
  },
  {
    name: "Hanging Leg Raise",
    instructions: "Posterior pelvic tilt at the top, no swinging.",
    defaultLoadLabel: "Bodyweight",
    defaultReps: 10,
  },
  {
    name: "Landmine Press",
    instructions: "Shoulder-friendly pressing option, half-kneeling or standing.",
    defaultLoadLabel: "20 kg",
    defaultReps: 10,
  },
];

const FOOD_LIBRARY: { name: string; portionLabel: string; notes: string }[] = [
  {
    name: "Paneer Bhurji",
    portionLabel: "150 g paneer",
    notes: "Roughly 28 g protein. Cook with minimal oil.",
  },
  {
    name: "Moong Dal Chilla",
    portionLabel: "2 chillas",
    notes: "Pair with low fat curd for a complete breakfast.",
  },
  {
    name: "Curd Rice with Roasted Chana",
    portionLabel: "1 cup curd rice, 30 g chana",
    notes: "Good travel-day option and easy on digestion.",
  },
  {
    name: "Grilled Chicken Tikka",
    portionLabel: "180 g chicken",
    notes: "Yoghurt marinade. Grill or air fry rather than pan fry.",
  },
  {
    name: "Ragi Porridge with Almonds",
    portionLabel: "40 g ragi, 10 almonds",
    notes: "Slow-release carbohydrate for early morning sessions.",
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

  if (configuration?.status === "active") {
    log("coaching configuration already active");
    return;
  }

  if (!configuration) {
    const draft = await expectOk<CoachingConfiguration>({
      method: "PUT",
      path: `/configurations/relationships/${relationship.id}/draft`,
      actor: trainer,
      body: {
        expectedVersion: 0,
        goalShort: config.goalShort,
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
      idempotencyKey: idempotencyKey("configuration.configure", spec.key),
      body: { expectedVersion: configuration.recordVersion },
    });
    configuration = configured.data!;
  }

  if (configuration.status === "configured") {
    await expectOk<CoachingConfiguration>({
      method: "POST",
      path: `/configurations/relationships/${relationship.id}/activate`,
      actor: trainer,
      idempotencyKey: idempotencyKey("configuration.activate", spec.key),
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
        content: buildPlanContent(`${spec.key}-v1`, spec.content),
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
      content: buildPlanContent(`${spec.key}-v2`, spec.content),
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
  const value = roll("workout", spec.key, localDate);
  switch (spec.adherence) {
    case "strong":
      return weightedPick(value, [
        ["complete", 70],
        ["partial", 16],
        ["skip", 6],
        ["miss", 8],
      ]);
    case "slipping":
      return weightedPick(value, [
        ["complete", 26],
        ["partial", 16],
        ["skip", 16],
        ["miss", 42],
      ]);
    default:
      return weightedPick(value, [
        ["complete", 46],
        ["partial", 24],
        ["skip", 10],
        ["miss", 20],
      ]);
  }
}

async function recordWorkoutHistory(
  trainer: Actor,
  spec: TraineeSpec,
  traineeActor: Actor,
  relationship: CoachingRelationship,
): Promise<void> {
  if (spec.adherence === "upcoming_only") return;

  const today = localDateIn(spec.timezone);
  const assignments = await getData<WorkoutAssignmentListResponse>(
    trainer,
    `/workouts/relationships/${relationship.id}/assignments`,
  );

  let executed = 0;
  for (const assignment of assignments.items) {
    if (assignment.localDate >= today || assignment.execution) continue;

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

  // Without a ready photo upload a photo-required meal can only be skipped or
  // left to lapse, so it never reaches confirm or deviate.
  if (assignment.photoRequired) {
    return weightedPick(value, [
      ["skip", 55],
      ["overdue", 45],
    ]);
  }

  // Today's meals are still inside their confirmation window, which is what
  // produces genuine confirmed / modified / skipped statuses rather than the
  // logged-later status every backdated record derives to.
  if (inWindow) {
    return weightedPick(value, [
      ["confirm", 46],
      ["deviate", 20],
      ["skip", 6],
      ["overdue", 28],
    ]);
  }

  switch (spec.adherence) {
    case "strong":
      return weightedPick(value, [
        ["confirm", 74],
        ["deviate", 15],
        ["skip", 5],
        ["overdue", 6],
      ]);
    case "slipping":
      return weightedPick(value, [
        ["confirm", 34],
        ["deviate", 24],
        ["skip", 16],
        ["overdue", 26],
      ]);
    default:
      return weightedPick(value, [
        ["confirm", 54],
        ["deviate", 22],
        ["skip", 10],
        ["overdue", 14],
      ]);
  }
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
  if (spec.adherence === "upcoming_only") return;

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

async function upsertMeasurement(
  traineeActor: Actor,
  spec: TraineeSpec,
  relationshipId: string,
  input: {
    seed: string;
    type: "body_weight_kg" | "waist_cm";
    value: number;
    unit: string;
    observedAt: string;
  },
): Promise<void> {
  // A client-supplied stable id makes the create endpoint converge on reruns.
  await expectOk({
    method: "POST",
    path: `/progress/relationships/${relationshipId}/measurements`,
    actor: traineeActor,
    idempotencyKey: idempotencyKey("progress.measurement", spec.key, input.seed),
    body: {
      id: stableUuid("measurement", spec.key, input.seed),
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
    ),
  });

  const handling = spec.exceptionHandling ?? "none";
  if (handling === "none") return;

  // Skip when this relationship already has handled exceptions, so reruns do
  // not slowly acknowledge every open item.
  const [acknowledged, resolved] = await Promise.all([
    getData<ExceptionListResponse>(
      trainer,
      `/exceptions/relationships/${relationship.id}?status=acknowledged`,
    ),
    getData<ExceptionListResponse>(
      trainer,
      `/exceptions/relationships/${relationship.id}?status=resolved`,
    ),
  ]);
  if (acknowledged.items.length + resolved.items.length > 0) return;

  const open = await getData<ExceptionListResponse>(
    trainer,
    `/exceptions/relationships/${relationship.id}`,
  );
  // Work the two oldest so the attention feed still shows untouched exceptions.
  const targets = open.items.slice(-2);
  for (const exception of targets) {
    await expectOk({
      method: "POST",
      path: `/exceptions/${exception.id}/acknowledge`,
      actor: trainer,
      idempotencyKey: idempotencyKey("exception.acknowledge", exception.id),
      body: { note: "Seen. Following up at the next check-in." },
    });

    if (handling === "resolve") {
      await expectOk({
        method: "POST",
        path: `/exceptions/${exception.id}/resolve`,
        actor: trainer,
        idempotencyKey: idempotencyKey("exception.resolve", exception.id),
        body: {
          note: "Discussed with the client and adjusted the week.",
          interventionKind: "plan_adjustment",
        },
      });
    }
  }

  if (targets.length > 0) {
    log(`${targets.length} exceptions ${handling === "resolve" ? "resolved" : "acknowledged"}`);
  }
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
// Templates and libraries
// ---------------------------------------------------------------------------

async function ensureTemplatesAndLibraries(trainer: Actor): Promise<void> {
  heading("Trainer templates and libraries");
  setScope("library");

  const templates = await getData<PlanTemplateListResponse>(trainer, "/templates?limit=50");
  for (const template of TEMPLATES) {
    if (templates.items.some((item) => item.title === template.title)) continue;
    await expectOk({
      method: "POST",
      path: "/templates",
      actor: trainer,
      idempotencyKey: idempotencyKey("template.create", template.title),
      body: {
        title: template.title,
        templateType: template.templateType,
        content: buildPlanContent(`template-${template.title}`, template.content),
      },
    });
  }
  log(`${TEMPLATES.length} plan templates available`);

  const exercises = await getData<ExerciseLibraryListResponse>(
    trainer,
    "/libraries/exercises?limit=100",
  );
  for (const item of EXERCISE_LIBRARY) {
    if (exercises.items.some((row) => row.ownership === "trainer" && row.name === item.name)) {
      continue;
    }
    await expectOk({ method: "POST", path: "/libraries/exercises", actor: trainer, body: item });
  }
  log(`${EXERCISE_LIBRARY.length} trainer-owned exercise library items available`);

  const foods = await getData<FoodLibraryListResponse>(trainer, "/libraries/foods?limit=100");
  for (const item of FOOD_LIBRARY) {
    if (foods.items.some((row) => row.ownership === "trainer" && row.name === item.name)) {
      continue;
    }
    await expectOk({ method: "POST", path: "/libraries/foods", actor: trainer, body: item });
  }
  log(`${FOOD_LIBRARY.length} trainer-owned food library items available`);
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

  if (planId) await ensureAdjustment(trainer, spec, planId);

  const upcomingWorkouts = await generateWorkoutExpectations(
    trainer,
    spec,
    relationship,
    today,
    addLocalDays(today, 7),
  );
  const upcomingMeals = await generateMealExpectations(
    trainer,
    spec,
    relationship,
    today,
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
  await ensureExceptions(trainer, spec, relationship);
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
}

main().catch((error: unknown) => {
  setScope("");
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSeed failed.\n\n${message}\n`);
  process.exitCode = 1;
});
