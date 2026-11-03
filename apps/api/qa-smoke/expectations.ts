/**
 * What the suite knows about the QA world (QT2).
 *
 * Two sources, deliberately kept apart:
 *
 *  - STABLE, committed: `apps/api/src/seed/qa/expectations.json` (accounts, ids,
 *    names, sign-in methods, `guarantees`). The same for every reference date.
 *  - PER RUN, generated: `apps/api/.qa-seed/expectations.json`, written by
 *    `scripts/qa-seed.ts` for the run that seeded staging (`referenceDate`, `today`,
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
export const COMMITTED_EXPECTATIONS = path.join(apiRoot, "src", "seed", "qa", "expectations.json");
export const RUN_EXPECTATIONS = path.join(apiRoot, ".qa-seed", "expectations.json");

export const ACCOUNT_KEYS = ["trainer", "ontrack", "slipping"] as const;
export type AccountKey = (typeof ACCOUNT_KEYS)[number];

const stableAccountSchema = z.object({
  key: z.enum(ACCOUNT_KEYS),
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
  openExceptionsSlippingMin: z.number().int().nonnegative(),
  pendingCheckinsSlipping: z.number().int().nonnegative(),
  loggableWorkoutsPerTrainee: z.number().int().nonnegative(),
  workoutAssignmentsTodayMax: z.number().int().nonnegative(),
});
export type Guarantees = z.infer<typeof guaranteesSchema>;

const stableSchema = z.object({
  guarantees: guaranteesSchema,
  accounts: z.array(stableAccountSchema).length(ACCOUNT_KEYS.length),
});

export type Stable = {
  guarantees: Guarantees;
  accounts: Record<AccountKey, StableAccount>;
};

export function parseStable(json: unknown): Stable {
  const parsed = stableSchema.parse(json);
  const accounts = {} as Record<AccountKey, StableAccount>;
  for (const account of parsed.accounts) accounts[account.key] = account;
  for (const key of ACCOUNT_KEYS) {
    if (!accounts[key]) throw new Error(`The QA expectations have no "${key}" account.`);
  }
  return { guarantees: parsed.guarantees, accounts };
}

export function loadStable(file = COMMITTED_EXPECTATIONS): Stable {
  return parseStable(JSON.parse(readFileSync(file, "utf8")));
}

const runAccountSchema = z.object({
  key: z.enum(ACCOUNT_KEYS),
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
    })
    .optional(),
});

const runSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accounts: z.array(runAccountSchema),
});

export type RunExpectations = {
  referenceDate: string;
  accounts: Partial<Record<AccountKey, z.infer<typeof runAccountSchema>>>;
};

/** The seed run's own file, or `null` when this machine did not generate one. */
export function loadRun(file = RUN_EXPECTATIONS): RunExpectations | null {
  if (!existsSync(file)) return null;
  const parsed = runSchema.parse(JSON.parse(readFileSync(file, "utf8")));
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
  key: AccountKey,
  localToday: string,
): NonNullable<RunExpectations["accounts"][AccountKey]>["today"] | null {
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
