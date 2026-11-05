/**
 * What the suite knows about its QA world (QT2), the `api` suite's personas (D-W5-14).
 *
 * Two sources, deliberately kept apart, both keyed by suite (`suites.api`):
 *
 *  - STABLE, committed: `apps/api/src/seed/qa/expectations.json` (accounts, ids,
 *    names, sign-in methods, `guarantees`). The same for every reference date.
 *  - PER RUN, generated: `apps/api/.qa-seed/api/expectations.json`, written by
 *    `scripts/qa-seed.ts --suite api` for the run that seeded staging (`referenceDate`, `today`,
 *    `loggableWorkout`, `rowCounts`). Absent on a machine that never ran the seed.
 *
 * Anything dated comes only from the per-run file, and a test uses it only when its
 * `referenceDate` is today's date for that trainee. Hard-coding dated values from
 * the committed copy would fail every night the date moves on.
 *
 * The allowlist pattern is imported from QT1 (`TEST_OTP_IDENTIFIER_RE`), not restated.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TEST_OTP_IDENTIFIER_RE } from "../src/auth/test-otp.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "..");
/**
 * This suite's own persona set (D-W5-14). Both expectation files are keyed by suite;
 * the staging API smoke reads `suites.api` only and signs in only as those accounts,
 * so the web, Android and iOS suites' writes never change what it reads.
 */
export const QA_SMOKE_SUITE = "api";
export const COMMITTED_EXPECTATIONS = path.join(apiRoot, "src", "seed", "qa", "expectations.json");
/** Written by `qa-seed.ts --suite api` for the run that seeded this suite's world. */
export const RUN_EXPECTATIONS = path.join(apiRoot, ".qa-seed", QA_SMOKE_SUITE, "expectations.json");

/** This suite's entry of a keyed expectations file (`{ suites: { api: … } }`), or `undefined`. */
function suiteEntry(json: unknown): Record<string, unknown> | undefined {
  const suites = (json as { suites?: Record<string, unknown> } | null)?.suites;
  const entry = suites?.[QA_SMOKE_SUITE];
  return entry && typeof entry === "object" ? (entry as Record<string, unknown>) : undefined;
}

/**
 * The accounts `global-setup.ts` signs in once per run. `run-context.ts` derives the
 * role it sends from the key, so a second *trainer* key cannot be added here without
 * changing that file; `run-context.ts` is outside this task's `files_owned`, so the
 * second trainer is listed separately below and signed in by the one suite that
 * needs it (CU11; the PR reports the one-line follow-up).
 */
export const ACCOUNT_KEYS = ["trainer", "ontrack", "slipping"] as const;
export type AccountKey = (typeof ACCOUNT_KEYS)[number];

/**
 * The second QA trainer and their single client (CU11). They are seeded and reset
 * exactly like the others, and the staging smoke reads their real relationship and
 * client ids to prove a trainer cannot reach another trainer's data.
 */
export const SECOND_TRAINER_KEYS = ["trainer2", "client2"] as const;
export type SecondTrainerKey = (typeof SECOND_TRAINER_KEYS)[number];

/** Every account the QA seed writes, in `expectations.json` order. */
export const ALL_ACCOUNT_KEYS = [...ACCOUNT_KEYS, ...SECOND_TRAINER_KEYS] as const;
export type AnyAccountKey = (typeof ALL_ACCOUNT_KEYS)[number];

const stableAccountSchema = z.object({
  key: z.enum(ALL_ACCOUNT_KEYS),
  email: z.string().regex(TEST_OTP_IDENTIFIER_RE),
  role: z.enum(["trainer", "trainee"]),
  displayName: z.string().min(1),
  userId: z.string().uuid(),
  firebaseUid: z.string().min(1),
  signIn: z.enum(["password_or_otp", "otp_only"]),
  relationshipId: z.string().uuid().optional(),
});
export type StableAccount = z.infer<typeof stableAccountSchema>;

const guaranteesSchema = z.object({
  mealAssignmentsTodayMin: z.number().int().nonnegative(),
  loggedMealsTodayOnTrack: z.number().int().nonnegative(),
  /**
   * Meals plus workouts still unlogged on the reference date, per trainee persona.
   * The seed builder fails when it cannot guarantee it (BT7, D-W4-14); the smoke
   * asserts it on the live day (G4).
   */
  unloggedItemsTodayMin: z.number().int().nonnegative(),
  openExceptionsSlippingMin: z.number().int().nonnegative(),
  pendingCheckinsSlipping: z.number().int().nonnegative(),
  /** Check-ins the slipping client can start today, in their own timezone (QT2b). */
  startableCheckinsSlipping: z.number().int().nonnegative(),
  loggableWorkoutsPerTrainee: z.number().int().nonnegative(),
  workoutAssignmentsTodayMax: z.number().int().nonnegative(),
  /** Clients of each QA trainer; the ownership checks read both worlds (CU11). */
  clientsFirstTrainer: z.number().int().nonnegative(),
  clientsSecondTrainer: z.number().int().nonnegative(),
});
export type Guarantees = z.infer<typeof guaranteesSchema>;

const stableSchema = z.object({
  guarantees: guaranteesSchema,
  accounts: z.array(stableAccountSchema).length(ALL_ACCOUNT_KEYS.length),
});

export type Stable = {
  guarantees: Guarantees;
  accounts: Record<AnyAccountKey, StableAccount>;
};

/**
 * Items on a `GET /me/day/:date` response that are assigned but not yet logged:
 * meals plus workouts, minus the logged meals and workouts.
 */
export function unloggedItemsOnDay(day: {
  assignments: { workouts: readonly unknown[]; meals: readonly unknown[] };
  logs: { workouts: number; meals: number };
}): number {
  return day.assignments.meals.length + day.assignments.workouts.length - day.logs.meals - day.logs.workouts;
}

export function parseStable(json: unknown): Stable {
  const parsed = stableSchema.parse(json);
  const accounts = {} as Record<AnyAccountKey, StableAccount>;
  for (const account of parsed.accounts) accounts[account.key] = account;
  for (const key of ALL_ACCOUNT_KEYS) {
    if (!accounts[key]) throw new Error(`The QA expectations have no "${key}" account.`);
  }
  return { guarantees: parsed.guarantees, accounts };
}

/** The committed file's `suites.api` entry, validated by {@link parseStable}. */
export function loadStable(file = COMMITTED_EXPECTATIONS): Stable {
  const entry = suiteEntry(JSON.parse(readFileSync(file, "utf8")));
  if (!entry) {
    throw new Error(`The QA expectations have no "${QA_SMOKE_SUITE}" suite.`);
  }
  return parseStable(entry);
}

const runAccountSchema = z.object({
  key: z.enum(ALL_ACCOUNT_KEYS),
  loggableWorkout: z
    .object({
      assignmentId: z.string().uuid(),
      localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      workoutName: z.string(),
      isToday: z.boolean(),
    })
    .optional(),
  today: z
    .object({
      workoutName: z.string().nullable(),
      mealNames: z.array(z.string()),
      loggedMealCount: z.number().int().nonnegative(),
      openExceptionCount: z.number().int().nonnegative(),
      pendingCheckinId: z.string().uuid().nullable(),
      /**
       * Optional so a hand-written fixture (and a run file written before CU11)
       * still parses; the generator always writes it.
       */
      startableCheckinId: z.string().uuid().nullable().optional(),
    })
    .optional(),
});

const runSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accounts: z.array(runAccountSchema),
});

export type RunExpectations = {
  referenceDate: string;
  accounts: Partial<Record<AnyAccountKey, z.infer<typeof runAccountSchema>>>;
};

/**
 * The seed run's own file, or `null` when this machine did not generate one or it
 * seeded another suite (D-W5-14: dated values from another suite's world describe
 * other accounts).
 */
export function loadRun(file = RUN_EXPECTATIONS): RunExpectations | null {
  if (!existsSync(file)) return null;
  const json = JSON.parse(readFileSync(file, "utf8")) as { referenceDate?: unknown };
  const entry = suiteEntry(json);
  if (!entry) return null;
  const parsed = runSchema.parse({ referenceDate: json.referenceDate, accounts: entry.accounts });
  const accounts: RunExpectations["accounts"] = {};
  for (const account of parsed.accounts) accounts[account.key] = account;
  return { referenceDate: parsed.referenceDate, accounts };
}

/**
 * The dated expectations for one account, or `null` when they do not describe
 * `localToday` (no run file, or the seed was generated for another date). A test
 * that gets `null` still checks shape and contract, but not dated values.
 */
export function todaysExpectations(
  run: RunExpectations | null,
  key: AnyAccountKey,
  localToday: string,
): NonNullable<RunExpectations["accounts"][AnyAccountKey]>["today"] | null {
  if (!run || run.referenceDate !== localToday) return null;
  return run.accounts[key]?.today ?? null;
}

/** Calendar date (YYYY-MM-DD) of `now` in an IANA time zone. */
export function localDateIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}
