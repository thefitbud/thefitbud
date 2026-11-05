/**
 * Builds the deterministic QA seed (QT2, D-QA1-3).
 *
 * The seed is not written by hand and it is not the staging file: it is read out of
 * the demo generator, so the QA world is the same persisted entities, relationships,
 * plan versions and state transitions the product workflow produces.
 *
 * 1. migrations + library seed into an in-memory `node:sqlite` database,
 * 2. `buildDemoSeedSql` with a fixed reference instant,
 * 3. keep the rows owned by the QA personas (`ownership.ts`, strict scope),
 * 4. rewrite them onto the QA identities: new ids, QA emails, fixed firebase uids,
 *    no phone numbers, `QA `-prefixed display names,
 * 5. emit `INSERT OR IGNORE` statements sorted by table then primary key, so the
 *    same reference date always gives a byte-identical file and a second apply
 *    changes no row.
 *
 * Nothing is ever emitted for the demo personas themselves: the QA rows carry
 * different primary keys, so applying this file to staging cannot update or delete a
 * row belonging to Firoz's real-email accounts.
 *
 * The world holds two trainers (`accounts.ts`): the main one with two clients and a
 * second one with a single client. The second trainer is what lets the staging smoke
 * check ownership against real ids — a trainer reading another trainer's client — and
 * it costs no new secret and no second code path, because every scope predicate and
 * the whole reset are anchored on the suite's accounts (`qaSuiteAccounts`).
 *
 * One world per QA suite (D-W5-14). `api`, `web`, `android` and `ios` each get their
 * own copy of that world, rewritten from the same demo personas onto the suite's own
 * accounts (`accounts.ts`) with suite-specific row ids, so no two suites share a user,
 * a relationship or a row. A suite's seed and its reset touch that suite only.
 * {@link buildQaSeeds} builds several suites from one scratch demo world and applies
 * each beside the others, so a collision between two suites fails the build.
 *
 * Two hand adjustments are made to the generated world, both on the slipping client
 * and both documented where they happen: the newest submitted check-in is left
 * unreviewed ({@link leaveNewestCheckinUnreviewed}), and the open draft check-in is
 * moved onto the reference date so there is always one the trainee can start
 * ({@link makeOneCheckinDueOnReferenceDate}).
 */
import { hashPassword } from "../../auth/password.js";
import { createMemoryDb, yieldToEventLoop } from "../../test-support/memory-db.js";
import { buildDemoSeedSql, kolkataLocalDate } from "../demo/build.js";
import {
  addDaysFromLocalDate,
  demoUuid,
  localDayStartIso,
  sha256HexSync,
  sqlQuote,
} from "../demo/ids.js";
import { loadDemoLibraryIndex } from "../demo/personas.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../demo/spec.js";
import {
  QA_DEFAULT_SUITE,
  QA_EMAIL_PATTERN,
  QA_SUITES,
  qaAccount,
  qaRowId,
  qaSuiteAccounts,
  qaUserId,
  type QaAccount,
  type QaSuite,
} from "./accounts.js";
import { demoScopeIdentity, qaScopeIdentity } from "./identity.js";
import { QA_TABLE_PLAN, qaScopePredicate, type QaTablePlan } from "./ownership.js";

export type QaSeedInput = {
  /**
   * The suite whose world to build (D-W5-14). Defaults to `api`, the QA1 world; the
   * command-line script always passes one explicitly.
   */
  suite?: QaSuite;
  /** Civil date in Asia/Kolkata that the QA world treats as "today". */
  referenceDate: string;
  /** PBKDF2 hash of `FITBUD_QA_PASSWORD`; the plaintext never reaches this module. */
  qaPasswordHash: string;
  /** Strings that must not appear anywhere in the output (the QA password plaintext). */
  forbiddenStrings?: readonly string[];
};

export type QaAccountExpectation = {
  key: string;
  email: string;
  role: "trainer" | "trainee";
  displayName: string;
  userId: string;
  firebaseUid: string;
  signIn: "password_or_otp" | "otp_only";
  /** Relationship with the QA trainer (trainees only). */
  relationshipId?: string;
  today?: {
    /** `null` on a rest day: the generated plan trains four days a week. */
    workoutName: string | null;
    mealNames: string[];
    loggedMealCount: number;
    openExceptionCount: number;
    pendingCheckinId: string | null;
    /**
     * The check-in the trainee can start today: draft, window open, on the reference
     * date. `null` for a trainee the seed makes no such guarantee for.
     */
    startableCheckinId: string | null;
  };
  /**
   * A scheduled workout with no execution yet, so a suite can always open one and
   * log a set even when today is a rest day: today's when today is a training day,
   * otherwise the most recent past one (logging late is a supported product state).
   */
  loggableWorkout?: {
    assignmentId: string;
    localDate: string;
    workoutName: string;
    /** True when `localDate` is the reference date. */
    isToday: boolean;
  };
};

export type QaExpectations = {
  $comment: string;
  referenceDate: string;
  /** The suite these accounts belong to (D-W5-14). */
  suite: QaSuite;
  /**
   * What every reference date satisfies; the build fails when one is not met. There
   * is deliberately no "a workout today" guarantee: the generated plan trains four
   * days a week, so roughly three days in seven are rest days for both QA trainees.
   * `loggableWorkoutsPerTrainee` is the guarantee a workout suite can rely on.
   */
  guarantees: {
    mealAssignmentsTodayMin: number;
    loggedMealsTodayOnTrack: number;
    /**
     * Assigned meals and workouts on each trainee's today with no compliance or
     * execution yet. At least one, so a suite that asserts a not-everything-done
     * state is reading the seed (D-W4-14, D-W3b-36).
     */
    unloggedItemsTodayMin: number;
    openExceptionsSlippingMin: number;
    pendingCheckinsSlipping: number;
    /** Check-ins the slipping client can start on the reference date (QT2b). */
    startableCheckinsSlipping: number;
    loggableWorkoutsPerTrainee: number;
    workoutAssignmentsTodayMax: number;
    /**
     * Clients of the main QA trainer, and of the second one (CU11). Only the `api`
     * suite has a second trainer; every other suite guarantees 0 there.
     */
    clientsFirstTrainer: number;
    clientsSecondTrainer: number;
  };
  accounts: QaAccountExpectation[];
  /** Rows the seed inserts per table, for the reset + reseed round trip. */
  rowCounts: Record<string, number>;
};

/** One suite's entry in `expectations.json`: everything but the file-level fields. */
export type QaSuiteExpectations = Omit<QaExpectations, "$comment" | "referenceDate">;

/**
 * `expectations.json`, keyed by suite (D-W5-14: one file set, keyed by suite). The
 * committed copy holds every suite; a run's own copy (`.qa-seed/<suite>/`) holds the
 * suite that run seeded. Each suite reads only `suites.<its name>`.
 */
export type QaExpectationsFile = {
  $comment: string;
  referenceDate: string;
  suites: Partial<Record<QaSuite, QaSuiteExpectations>>;
  /**
   * Committed file only: a copy of `suites.android.accounts` at the top level, because
   * `scripts/qa/run-maestro.sh` and `run-maestro-ios.sh` (owned outside the seed) read
   * `.accounts[]`. qa.yml's `android` and `ios` jobs replace it with their own suite's
   * accounts before Maestro runs, so the two platforms never share. Drop it once those
   * scripts read `suites.<name>` themselves. No suite's loader reads it.
   */
  accounts?: QaAccountExpectation[];
};

/** The suite whose accounts the top-level Maestro runner view copies. */
export const QA_MAESTRO_RUNNER_DEFAULT_SUITE: QaSuite = "android";

const EXPECTATIONS_FILE_COMMENT =
  "Generated by apps/api/scripts/qa-seed.ts (QT2, D-W5-14). One entry per QA suite under `suites` (api, web, android, ios); each suite signs in only as its own accounts and reads only its own entry. `suites.<name>.accounts[].email|role|displayName|userId|firebaseUid|signIn|relationshipId` and `suites.<name>.guarantees` are the same for every reference date; `today`, `loggableWorkout`, `rowCounts` and `referenceDate` describe the run that produced this file. The generated plan trains four days a week, so `today.workoutName` is null on a rest day (roughly three days in seven) — a suite that must open and log a workout uses `loggableWorkout`, which every reference date has. `today.startableCheckinId` is the check-in the slipping client can start on that date (QT2b), and `guarantees.clientsSecondTrainer` is the second trainer's client world the api suite's ownership checks read (CU11; 0 for the other suites). `qa-seed --suite <name>` writes that run's copy to apps/api/.qa-seed/<name>/expectations.json.";

/** Puts per-suite build results into one keyed file. All must share a reference date. */
export function qaExpectationsFile(results: readonly QaExpectations[]): QaExpectationsFile {
  const referenceDate = results[0]?.referenceDate;
  if (!referenceDate) {
    throw new Error("QA expectations: no suite to write");
  }
  const suites: QaExpectationsFile["suites"] = {};
  for (const suite of QA_SUITES) {
    const result = results.find((entry) => entry.suite === suite);
    if (!result) {
      continue;
    }
    if (result.referenceDate !== referenceDate) {
      throw new Error("QA expectations: suites built for different reference dates");
    }
    suites[suite] = {
      suite: result.suite,
      guarantees: result.guarantees,
      accounts: result.accounts,
      rowCounts: result.rowCounts,
    };
  }
  if (Object.keys(suites).length !== results.length) {
    throw new Error("QA expectations: a suite appears twice or is unknown");
  }
  return { $comment: EXPECTATIONS_FILE_COMMENT, referenceDate, suites };
}

/**
 * The committed `expectations.json`: every suite, plus the top-level `accounts` view
 * the Maestro runner scripts still read ({@link QaExpectationsFile.accounts}).
 */
export function committedQaExpectationsFile(
  results: readonly QaExpectations[],
): QaExpectationsFile {
  const file = qaExpectationsFile(results);
  const runnerSuite = file.suites[QA_MAESTRO_RUNNER_DEFAULT_SUITE];
  if (!runnerSuite) {
    throw new Error(`QA expectations: the committed file needs the ${QA_MAESTRO_RUNNER_DEFAULT_SUITE} suite`);
  }
  return {
    $comment: `${file.$comment} The top-level \`accounts\` is a copy of \`suites.${QA_MAESTRO_RUNNER_DEFAULT_SUITE}.accounts\`, kept only because scripts/qa/run-maestro*.sh read \`.accounts[]\`; qa.yml's android and ios jobs replace it with their own suite's accounts before Maestro runs. No suite reads it.`,
    referenceDate: file.referenceDate,
    suites: file.suites,
    accounts: runnerSuite.accounts,
  };
}

/** One suite's expectations out of the keyed file, or `null` when the file has none. */
export function suiteExpectations(
  file: QaExpectationsFile,
  suite: QaSuite,
): QaExpectations | null {
  const entry = file.suites?.[suite];
  if (!entry) {
    return null;
  }
  return { $comment: file.$comment, referenceDate: file.referenceDate, ...entry };
}

/**
 * The part of `expectations.json` that must be the same for every reference date.
 * The committed file is compared on this, so it cannot drift from the generator.
 */
export function stableExpectations(expectations: QaExpectations): string {
  return JSON.stringify(
    {
      suite: expectations.suite,
      guarantees: expectations.guarantees,
      accounts: expectations.accounts.map((account) => ({
        key: account.key,
        email: account.email,
        role: account.role,
        displayName: account.displayName,
        userId: account.userId,
        firebaseUid: account.firebaseUid,
        signIn: account.signIn,
        relationshipId: account.relationshipId ?? null,
      })),
    },
    null,
    2,
  );
}

export type QaSeedResult = {
  sql: string;
  expectations: QaExpectations;
  /**
   * Primary-key tuples of every row the seed emits, per table (`\u0000`-joined).
   *
   * This is the QA row set as a list of facts, derived from the emitted rows and not
   * from any predicate, so a test can tell QA rows from everyone else's without
   * asking `qaScopePredicate` — which is the thing under test.
   */
  rowKeys: Record<string, string[]>;
};

/** `\u0000`-joined primary key of a row, the key used by {@link QaSeedResult.rowKeys}. */
export function qaRowKey(pk: readonly string[], row: Record<string, unknown>): string {
  return pk.map((column) => String(row[column])).join("\u0000");
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROWS_PER_STATEMENT = 40;
/**
 * Byte budget for one multi-row INSERT. SQLite refuses an over-long statement
 * (`SQLITE_TOOBIG`), and the meal rows carry a whole prescription snapshot, so the
 * chunks are capped by size as well as by row count.
 */
const BYTES_PER_STATEMENT = 64_000;

export const QA_GUARANTEES: QaExpectations["guarantees"] = {
  mealAssignmentsTodayMin: 3,
  loggedMealsTodayOnTrack: 1,
  unloggedItemsTodayMin: 1,
  openExceptionsSlippingMin: 2,
  pendingCheckinsSlipping: 1,
  startableCheckinsSlipping: 1,
  loggableWorkoutsPerTrainee: 1,
  workoutAssignmentsTodayMax: 1,
  clientsFirstTrainer: 2,
  clientsSecondTrainer: 1,
};

/**
 * One suite's guarantees: {@link QA_GUARANTEES} (the `api` suite's) with no second
 * trainer's client for a suite that has no second trainer (D-W5-14).
 */
export function qaGuarantees(suite: QaSuite = QA_DEFAULT_SUITE): QaExpectations["guarantees"] {
  const hasSecondTrainer = qaSuiteAccounts(suite).some((account) => account.key === "trainer2");
  return {
    ...QA_GUARANTEES,
    clientsSecondTrainer: hasSecondTrainer ? QA_GUARANTEES.clientsSecondTrainer : 0,
  };
}

/** Midday in Asia/Kolkata: the day is under way, so "today" has logged and pending items. */
export function qaReferenceInstant(referenceDate: string): string {
  if (!DATE_RE.test(referenceDate)) {
    throw new Error(`--reference-date must be YYYY-MM-DD, got ${referenceDate}`);
  }
  const instant = `${referenceDate}T06:30:00.000Z`;
  if (kolkataLocalDate(instant) !== referenceDate) {
    throw new Error(`Reference instant ${instant} is not ${referenceDate} in Asia/Kolkata`);
  }
  return instant;
}

/** Today in Asia/Kolkata, the default reference date (D-QA1-3). */
export function qaDefaultReferenceDate(now: Date = new Date()): string {
  return kolkataLocalDate(now.toISOString());
}

type Row = Record<string, unknown>;
type Sqlite = Awaited<ReturnType<typeof createMemoryDb>>["sqlite"];

function query(sqlite: Sqlite, sql: string): Row[] {
  const [result] = sqlite.exec(sql);
  if (!result) {
    return [];
  }
  return result.values.map((values) => {
    const row: Row = {};
    result.columns.forEach((column, index) => {
      row[column] = values[index];
    });
    return row;
  });
}

function columnsOf(sqlite: Sqlite, table: string): string[] {
  return query(sqlite, `SELECT name FROM pragma_table_info('${table}')`).map((row) =>
    String(row.name),
  );
}

function singleTextPk(sqlite: Sqlite, table: string): string | null {
  const pk = query(
    sqlite,
    `SELECT name FROM pragma_table_info('${table}') WHERE pk > 0 ORDER BY pk`,
  ).map((row) => String(row.name));
  return pk.length === 1 ? pk[0]! : null;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "string") {
    return sqlQuote(value);
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString("hex")}'`;
  }
  throw new Error(`Unsupported seed value type: ${typeof value}`);
}

/** Every single-column text primary key currently in the database. */
function allRowIds(sqlite: Sqlite): Set<string> {
  const ids = new Set<string>();
  const tables = query(
    sqlite,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%_fts%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).map((row) => String(row.name));
  for (const table of tables) {
    const pk = singleTextPk(sqlite, table);
    if (!pk) {
      continue;
    }
    for (const row of query(sqlite, `SELECT ${pk} AS id FROM ${table}`)) {
      if (typeof row.id === "string") {
        ids.add(row.id);
      }
    }
  }
  return ids;
}

/** Primary key columns of `plan` that are the row's own identity (not a reference). */
function ownIdColumns(plan: QaTablePlan): string[] {
  const referenced = new Set([
    ...(plan.userColumns ?? []),
    ...(plan.parents ?? []).map((parent) => parent.column),
  ]);
  return plan.pk.filter((column) => !referenced.has(column));
}

function orderBy(plan: QaTablePlan): string {
  return plan.pk.map(quoteIdentifier).join(", ");
}

/** `order` and friends are reserved words; the schema uses them as column names. */
function quoteIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unexpected identifier: ${name}`);
  }
  return `"${name}"`;
}

/**
 * The demo world's rows for one suite's QA personas, keyed by table, in plan order.
 */
function readOwnedRows(sqlite: Sqlite, suite: QaSuite): Map<string, Row[]> {
  const identity = demoScopeIdentity(suite);
  const owned = new Map<string, Row[]>();
  for (const plan of QA_TABLE_PLAN) {
    if (plan.resetOnly) {
      continue;
    }
    const predicate = qaScopePredicate(plan.table, identity, "seed");
    owned.set(
      plan.table,
      query(sqlite, `SELECT * FROM ${plan.table} WHERE ${predicate} ORDER BY ${orderBy(plan)}`),
    );
  }
  return owned;
}

/**
 * Leaves the slipping client's latest submitted check-in waiting for the trainer.
 *
 * The generator reviews every submitted check-in, but QT3/QT5/QT6 need a check-in in
 * the "submitted, not reviewed yet" state — the state the real workflow is in between
 * a trainee submitting and the trainer opening it. Dropping the newest review (and
 * anything hanging off it) is the only hand adjustment the QA world makes.
 */
function leaveNewestCheckinUnreviewed(
  owned: Map<string, Row[]>,
  slippingRelationshipId: string,
): string {
  const checkins = (owned.get("checkins") ?? [])
    .filter(
      (row) =>
        row.coaching_relationship_id === slippingRelationshipId && row.submitted_at !== null,
    )
    .sort((a, b) =>
      `${String(a.submitted_at)}|${String(a.id)}`.localeCompare(
        `${String(b.submitted_at)}|${String(b.id)}`,
      ),
    );
  const newest = checkins.at(-1);
  if (!newest) {
    throw new Error("QA seed: the slipping client has no submitted check-in to leave pending");
  }
  const checkinId = String(newest.id);
  const removedNotes = new Set(
    (owned.get("trainer_notes") ?? [])
      .filter((row) => row.checkin_id === checkinId)
      .map((row) => String(row.id)),
  );
  owned.set(
    "checkin_reviews",
    (owned.get("checkin_reviews") ?? []).filter((row) => row.checkin_id !== checkinId),
  );
  owned.set(
    "trainer_notes",
    (owned.get("trainer_notes") ?? []).filter((row) => !removedNotes.has(String(row.id))),
  );
  owned.set(
    "coach_asks",
    (owned.get("coach_asks") ?? []).filter(
      (row) => row.trainer_note_id === null || !removedNotes.has(String(row.trainer_note_id)),
    ),
  );
  owned.set(
    "interventions",
    (owned.get("interventions") ?? []).filter((row) => row.checkin_id !== checkinId),
  );
  return checkinId;
}

/**
 * Moves the slipping client's open draft check-in onto the reference date, so the
 * trainee always has one they can start.
 *
 * The generator already writes the next due check-in as a draft, but its date
 * follows the client's weekly cadence, so on most reference dates the window has not
 * opened yet and the status is `scheduled` — nothing to fill in. QT3's fill-and-send
 * flow therefore had to branch on whether one happened to be startable
 * (`apps/mobile/.maestro/flows/trainee/checkin.yaml`). Moving that same row — same
 * id, same pinned form version, same schedule — is the smallest change that makes
 * the guarantee hold on every reference date, and it fabricates nothing: no row is
 * created, and no row's identity changes.
 *
 * The window opens at the *start* of the civil day, not at the generator's 09:00:
 * the nightly QA job runs at 02:00 IST (`.github/workflows/qa.yml`), and a 09:00
 * window would still read `scheduled` when the suites run. It closes
 * `dueWindowHours` later, as the schedule says, so the check-in reads `due` (never
 * `overdue`) for the whole of the reference date.
 *
 * A check-in that already carries an exception is never moved: an exception keeps
 * its source signal, and rewriting the signal's date underneath it would make the
 * two disagree.
 */
function makeOneCheckinDueOnReferenceDate(input: {
  owned: Map<string, Row[]>;
  relationshipId: string;
  referenceDate: string;
  timezone: string;
}): string {
  const { owned, relationshipId, referenceDate, timezone } = input;
  const mine = (owned.get("checkins") ?? []).filter(
    (row) => row.coaching_relationship_id === relationshipId,
  );
  const signalled = new Set(
    (owned.get("exceptions") ?? [])
      .filter((row) => row.source_entity_type === "checkin")
      .map((row) => String(row.source_entity_id)),
  );
  const drafts = mine
    .filter(
      (row) =>
        row.record_status === "draft" &&
        row.submitted_at === null &&
        !signalled.has(String(row.id)),
    )
    .sort((a, b) =>
      `${String(a.local_date)}|${String(a.id)}`.localeCompare(
        `${String(b.local_date)}|${String(b.id)}`,
      ),
    );
  const chosen = drafts.at(-1);
  if (!chosen) {
    throw new Error(
      "QA seed: the slipping client has no open draft check-in to make due on the reference date",
    );
  }
  const taken = mine.find(
    (row) => row.id !== chosen.id && row.local_date === referenceDate,
  );
  if (taken) {
    // checkins_relationship_local_date_uidx: one check-in per relationship per day.
    throw new Error(
      `QA seed: the slipping client already has check-in ${String(taken.id)} on ${referenceDate}`,
    );
  }
  const scheduleRow = (owned.get("checkin_schedules") ?? []).find(
    (row) => row.coaching_relationship_id === relationshipId,
  );
  const windowHours = Number(scheduleRow?.due_window_hours ?? 48);
  if (!Number.isFinite(windowHours) || windowHours <= 0) {
    throw new Error(`QA seed: check-in schedule for ${relationshipId} has no due window`);
  }
  const startsAt = localDayStartIso(referenceDate, "00:00", timezone);
  chosen.local_date = referenceDate;
  chosen.window_starts_at = startsAt;
  chosen.window_ends_at = new Date(
    Date.parse(startsAt) + windowHours * 60 * 60 * 1000,
  ).toISOString();
  chosen.created_at = startsAt;
  chosen.updated_at = startsAt;
  return String(chosen.id);
}

/** old id → QA id, for every row the suite's QA world owns plus its QA accounts. */
function buildIdMap(owned: Map<string, Row[]>, suite: QaSuite): Map<string, string> {
  const map = new Map<string, string>();
  for (const account of qaSuiteAccounts(suite)) {
    map.set(demoUuid("user", account.demoEmail), qaUserId(account));
  }
  for (const plan of QA_TABLE_PLAN) {
    const rows = owned.get(plan.table);
    if (!rows) {
      continue;
    }
    for (const column of ownIdColumns(plan)) {
      for (const row of rows) {
        const value = row[column];
        if (typeof value === "string" && !map.has(value)) {
          map.set(value, qaRowId(value, suite));
        }
      }
    }
  }
  return map;
}

function replaceIds(value: string, idMap: Map<string, string>): string {
  return value.replace(UUID_RE, (match) => idMap.get(match) ?? match);
}

function replaceAll(value: string, needle: string, replacement: string): string {
  return value.split(needle).join(replacement);
}

/** Replaces a bare first name, leaving an already `QA `-prefixed name alone. */
function replaceFirstName(value: string, firstName: string, replacement: string): string {
  return value.replace(new RegExp(`(?<!QA )\\b${firstName}\\b`, "g"), replacement);
}

type Rewriter = (row: Row, context: RewriteContext) => void;
type RewriteContext = {
  suite: QaSuite;
  /** The suite's own accounts; nothing is rewritten onto another suite's. */
  accounts: readonly QaAccount[];
  idMap: Map<string, string>;
  qaPasswordHash: string;
  accountByQaUserId: Map<string, QaAccount>;
};

const COLUMN_REWRITERS: Record<string, Rewriter> = {
  users(row, context) {
    const account = context.accountByQaUserId.get(String(row.id));
    if (!account) {
      throw new Error(`QA seed: unexpected user row ${String(row.id)}`);
    }
    row.firebase_uid = account.firebaseUid;
  },
  user_identities(row, context) {
    const account = context.accountByQaUserId.get(String(row.user_id));
    if (!account) {
      throw new Error(`QA seed: unexpected identity row ${String(row.user_id)}`);
    }
    row.email = account.email;
    row.email_norm = account.email.toLowerCase();
    row.mobile_e164 = null;
    row.password_hash = account.hasPassword ? context.qaPasswordHash : null;
    row.password_updated_at = account.hasPassword ? row.password_updated_at : null;
    row.failed_login_count = 0;
    row.locked_until = null;
  },
  trainer_profiles(row, context) {
    const account = context.accountByQaUserId.get(String(row.user_id));
    row.display_name = account?.displayName ?? row.display_name;
    row.whatsapp_e164 = null;
  },
  trainee_profiles(row, context) {
    const account = context.accountByQaUserId.get(String(row.user_id));
    row.display_name = account?.displayName ?? row.display_name;
  },
  client_invitations(row, context) {
    const account = context.accountByQaUserId.get(String(row.accepted_user_id));
    row.recipient_email = account?.email ?? null;
    row.recipient_display_name = account?.displayName ?? null;
    row.recipient_whatsapp_e164 = null;
    // The invitation is already accepted, so no live token exists; this keeps the
    // unique token hash from colliding with the demo accounts' invitations.
    row.token_hash = sha256HexSync(`qa-accepted-invitation:${String(row.id)}`);
  },
  device_tokens(row) {
    row.token = `qa-device-token-${String(row.id)}`;
    row.installation_id = `qa-${String(row.id)}`;
  },
  notifications(row, context) {
    row.dedupe_key = qaUniqueKey(String(row.dedupe_key), "qa:", context.suite);
  },
  media_assets(row, context) {
    row.object_key = qaUniqueKey(String(row.object_key), "qa/", context.suite);
  },
};

/**
 * A globally unique column keeps its value when it embeds a (already rewritten,
 * suite-specific) QA id; otherwise it is prefixed, so a QA row can never collide with
 * a demo row, or with another suite's row, on a unique index. The `api` suite keeps
 * the QA1 prefix; every other suite adds its name (D-W5-14). `verifyAgainstDemoWorld`
 * proves the result.
 */
function qaUniqueKey(value: string, prefix: string, suite: QaSuite): string {
  UUID_RE.lastIndex = 0;
  if (UUID_RE.test(value)) {
    return value;
  }
  const separator = prefix.endsWith("/") ? "/" : ":";
  return suite === "api" ? `${prefix}${value}` : `${prefix}${suite}${separator}${value}`;
}

/** Sorts each table's rows by their QA primary key, so the output is stable. */
function sortByPrimaryKey(owned: Map<string, Row[]>): void {
  for (const plan of QA_TABLE_PLAN) {
    const rows = owned.get(plan.table);
    if (!rows) {
      continue;
    }
    rows.sort((a, b) =>
      plan.pk.map((column) => String(a[column])).join("|").localeCompare(
        plan.pk.map((column) => String(b[column])).join("|"),
      ),
    );
  }
}

function rewriteRows(owned: Map<string, Row[]>, context: RewriteContext): void {
  for (const plan of QA_TABLE_PLAN) {
    const rows = owned.get(plan.table);
    if (!rows) {
      continue;
    }
    for (const row of rows) {
      for (const [column, value] of Object.entries(row)) {
        if (typeof value !== "string") {
          continue;
        }
        let next = replaceIds(value, context.idMap);
        for (const account of context.accounts) {
          next = replaceAll(next, account.demoEmail, account.email);
          next = replaceAll(next, account.demoDisplayName, account.displayName);
        }
        for (const account of context.accounts) {
          const firstName = account.demoDisplayName.split(" ")[0]!;
          next = replaceFirstName(next, firstName, account.displayName);
        }
        row[column] = next;
      }
      COLUMN_REWRITERS[plan.table]?.(row, context);
    }
  }
}

/** Nothing identifying a real person, and no password, may reach the output file. */
function assertNoLeakedIdentity(
  owned: Map<string, Row[]>,
  forbiddenIds: Set<string>,
  forbiddenStrings: readonly string[],
  accounts: readonly QaAccount[],
): void {
  // Every persona's demo name is banned in every suite, not only the suite's own:
  // a suite without the second trainer must not carry "Priya Malhotra" either.
  const demoNames = [
    ...new Set(
      QA_SUITES.flatMap((suite) => qaSuiteAccounts(suite).map((a) => a.demoDisplayName)),
    ),
  ];
  const banned: Array<[string, string]> = [
    ["a demo email domain", "@demo.fitbud.test"],
    ["an Indian mobile number", "+9190"],
    ["the demo password", DEMO_PASSWORD_PLAINTEXT],
    ...forbiddenStrings.map(
      (value) => ["a forbidden string", value] as [string, string],
    ),
  ];
  const qaEmails = new Set(accounts.map((account) => account.email));
  const qaUids = new Set(accounts.map((account) => account.firebaseUid));
  for (const row of owned.get("users") ?? []) {
    if (!qaUids.has(String(row.firebase_uid))) {
      throw new Error(`QA seed: users.firebase_uid is ${String(row.firebase_uid)}, not a QA uid`);
    }
  }
  for (const row of owned.get("user_identities") ?? []) {
    if (!qaEmails.has(String(row.email)) || row.mobile_e164 !== null) {
      throw new Error(`QA seed: user_identities carries ${String(row.email)} or a phone number`);
    }
  }
  for (const [table, rows] of owned) {
    for (const row of rows) {
      for (const [column, value] of Object.entries(row)) {
        if (typeof value !== "string") {
          continue;
        }
        for (const [label, needle] of banned) {
          if (needle && value.includes(needle)) {
            throw new Error(`QA seed: ${table}.${column} still contains ${label}`);
          }
        }
        for (const demoName of demoNames) {
          if (value.includes(demoName)) {
            throw new Error(
              `QA seed: ${table}.${column} still contains the demo name ${demoName}`,
            );
          }
        }
        for (const match of value.match(UUID_RE) ?? []) {
          if (forbiddenIds.has(match)) {
            throw new Error(
              `QA seed: ${table}.${column} references ${match}, a row of the demo world outside the QA accounts`,
            );
          }
        }
      }
    }
  }
}

function emitSql(
  sqlite: Sqlite,
  owned: Map<string, Row[]>,
  referenceDate: string,
  suite: QaSuite,
): { sql: string; rowCounts: Record<string, number>; rowKeys: Record<string, string[]> } {
  const parts: string[] = [
    `-- FitBud QA seed (QT2), suite ${suite} (D-W5-14), reference date ${referenceDate} in Asia/Kolkata.`,
    "-- Generated by apps/api/scripts/qa-seed.ts; do not edit by hand.",
    `-- QA accounts: ${qaSuiteAccounts(suite).map((account) => account.email).join(", ")}`,
    "-- Idempotent: every statement is INSERT OR IGNORE, so a second apply changes no row.",
    "-- Apply qa-reset.sql first. Never run against production.",
    "PRAGMA defer_foreign_keys = true;",
  ];
  const rowCounts: Record<string, number> = {};
  const rowKeys: Record<string, string[]> = {};
  for (const plan of QA_TABLE_PLAN) {
    const rows = owned.get(plan.table);
    if (!rows || rows.length === 0) {
      continue;
    }
    rowCounts[plan.table] = rows.length;
    rowKeys[plan.table] = rows.map((row) => qaRowKey(plan.pk, row));
    const columns = columnsOf(sqlite, plan.table);
    parts.push("", `-- ${plan.table}: ${rows.length} rows`);
    const header = `INSERT OR IGNORE INTO ${plan.table} (${columns.map(quoteIdentifier).join(", ")}) VALUES`;
    const tuples = rows.map(
      (row) => `  (${columns.map((column) => sqlLiteral(row[column])).join(", ")})`,
    );
    let chunk: string[] = [];
    let bytes = 0;
    const flush = () => {
      if (chunk.length === 0) {
        return;
      }
      parts.push(header, `${chunk.join(",\n")};`);
      chunk = [];
      bytes = 0;
    };
    for (const tuple of tuples) {
      if (chunk.length >= ROWS_PER_STATEMENT || (chunk.length > 0 && bytes + tuple.length > BYTES_PER_STATEMENT)) {
        flush();
      }
      chunk.push(tuple);
      bytes += tuple.length + 2;
    }
    flush();
  }
  return { sql: `${parts.join("\n")}\n`, rowCounts, rowKeys };
}

/** The user's stored timezone; every QA expectation about a civil day reads it. */
function timezoneOf(sqlite: Sqlite, userId: string): string {
  const rows = query(sqlite, `SELECT timezone FROM users WHERE id = ${sqlQuote(userId)}`);
  return String(rows[0]?.timezone ?? "Asia/Kolkata");
}

function localDateFor(sqlite: Sqlite, userId: string, instant: string): string {
  const timezone = timezoneOf(sqlite, userId);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

/**
 * The workout a suite can open and log: today's when today is a training day,
 * otherwise the most recent earlier one that is still scheduled and has no
 * execution. Never a future assignment, which cannot be started yet.
 */
function pickLoggableWorkout(
  owned: Map<string, Row[]>,
  relationshipId: string,
  localDate: string,
): QaAccountExpectation["loggableWorkout"] {
  const executed = new Set(
    (owned.get("workout_executions") ?? []).map((row) => String(row.assignment_id)),
  );
  const candidates = (owned.get("workout_assignments") ?? [])
    .filter(
      (row) =>
        row.coaching_relationship_id === relationshipId &&
        row.schedule_status === "scheduled" &&
        row.superseded_at === null &&
        String(row.local_date) <= localDate &&
        !executed.has(String(row.id)),
    )
    .sort((a, b) =>
      `${String(a.local_date)}|${String(a.id)}`.localeCompare(
        `${String(b.local_date)}|${String(b.id)}`,
      ),
    );
  const chosen = candidates.at(-1);
  if (!chosen) {
    return undefined;
  }
  return {
    assignmentId: String(chosen.id),
    localDate: String(chosen.local_date),
    workoutName: String(chosen.workout_day_name),
    isToday: String(chosen.local_date) === localDate,
  };
}

function buildExpectations(input: {
  suite: QaSuite;
  sqlite: Sqlite;
  owned: Map<string, Row[]>;
  referenceDate: string;
  referenceInstant: string;
  rowCounts: Record<string, number>;
  pendingCheckinId: string;
  startableCheckinId: string;
}): QaExpectations {
  const { owned, referenceDate, rowCounts } = input;
  const relationshipByTrainee = new Map<string, string>();
  const clientCountByTrainer = new Map<string, number>();
  for (const row of owned.get("coaching_relationships") ?? []) {
    relationshipByTrainee.set(String(row.trainee_user_id), String(row.id));
    const trainerUserId = String(row.trainer_user_id);
    clientCountByTrainer.set(trainerUserId, (clientCountByTrainer.get(trainerUserId) ?? 0) + 1);
  }
  // Two trainers, each with their own clients (CU11): the staging smoke reads one
  // trainer's relationship ids as the other trainer and must be refused, so the
  // second world has to be here and has to be separate. Only the `api` suite has the
  // second trainer (D-W5-14); every relationship must belong to one of the suite's
  // own trainers, so the counts below add up to every relationship the suite owns.
  const { suite } = input;
  const guarantees = qaGuarantees(suite);
  const suiteAccounts = qaSuiteAccounts(suite);
  let countedClients = 0;
  for (const [key, expected] of [
    ["trainer", guarantees.clientsFirstTrainer],
    ["trainer2", guarantees.clientsSecondTrainer],
  ] as const) {
    if (!suiteAccounts.some((account) => account.key === key)) {
      if (expected !== 0) {
        throw new Error(`QA seed: suite ${suite} has no ${key} but guarantees ${expected} clients`);
      }
      continue;
    }
    const account = qaAccount(key, suite);
    const actual = clientCountByTrainer.get(qaUserId(account)) ?? 0;
    if (actual !== expected) {
      throw new Error(
        `QA seed: ${account.email} has ${actual} clients, expected ${expected}`,
      );
    }
    countedClients += actual;
  }
  const relationshipCount = (owned.get("coaching_relationships") ?? []).length;
  if (countedClients !== relationshipCount) {
    throw new Error(
      `QA seed: suite ${suite} owns ${relationshipCount} relationships, but its trainers have ${countedClients} clients`,
    );
  }
  const accounts: QaAccountExpectation[] = suiteAccounts.map((account) => {
    const userId = qaUserId(account);
    const base: QaAccountExpectation = {
      key: account.key,
      email: account.email,
      role: account.role,
      displayName: account.displayName,
      userId,
      firebaseUid: account.firebaseUid,
      signIn: account.hasPassword ? "password_or_otp" : "otp_only",
    };
    if (account.role === "trainer") {
      return base;
    }
    const relationshipId = relationshipByTrainee.get(userId);
    if (!relationshipId) {
      throw new Error(`QA seed: ${account.email} has no relationship with a QA trainer`);
    }
    const demoUserId = demoUuid("user", account.demoEmail);
    const localDate = localDateFor(input.sqlite, demoUserId, input.referenceInstant);
    const workouts = (owned.get("workout_assignments") ?? []).filter(
      (row) => row.coaching_relationship_id === relationshipId && row.local_date === localDate,
    );
    const meals = (owned.get("meal_assignments") ?? [])
      .filter(
        (row) => row.coaching_relationship_id === relationshipId && row.local_date === localDate,
      )
      .sort((a, b) => String(a.window_starts_at).localeCompare(String(b.window_starts_at)));
    const mealIds = new Set(meals.map((row) => String(row.id)));
    const loggedMealCount = (owned.get("meal_compliance") ?? []).filter((row) =>
      mealIds.has(String(row.assignment_id)),
    ).length;
    const openExceptionCount = (owned.get("exceptions") ?? []).filter(
      (row) =>
        row.coaching_relationship_id === relationshipId &&
        (row.status === "active" || row.status === "acknowledged"),
    ).length;
    const pendingCheckins = (owned.get("checkins") ?? []).filter(
      (row) =>
        row.coaching_relationship_id === relationshipId &&
        row.submitted_at !== null &&
        !(owned.get("checkin_reviews") ?? []).some((review) => review.checkin_id === row.id),
    );
    // Startable = a draft on the trainee's own civil day whose window is open for
    // every instant of that day. Comparing the window to the day's own bounds, not
    // to the reference instant, is what makes the guarantee independent of the hour
    // the nightly job happens to run at.
    const timezone = timezoneOf(input.sqlite, demoUserId);
    const dayStart = localDayStartIso(localDate, "00:00", timezone);
    const dayEnd = localDayStartIso(addDaysFromLocalDate(localDate, 1), "00:00", timezone);
    const startableCheckins = (owned.get("checkins") ?? []).filter(
      (row) =>
        row.coaching_relationship_id === relationshipId &&
        row.record_status === "draft" &&
        row.submitted_at === null &&
        String(row.local_date) === localDate &&
        String(row.window_starts_at) <= dayStart &&
        String(row.window_ends_at) >= dayEnd,
    );
    if (workouts.length > QA_GUARANTEES.workoutAssignmentsTodayMax) {
      throw new Error(
        `QA seed: ${account.email} has ${workouts.length} workouts on ${localDate}, expected at most ${QA_GUARANTEES.workoutAssignmentsTodayMax}`,
      );
    }
    const loggableWorkout = pickLoggableWorkout(owned, relationshipId, localDate);
    if (!loggableWorkout) {
      throw new Error(
        `QA seed: ${account.email} has no scheduled workout left to log on or before ${localDate}`,
      );
    }
    if (meals.length < QA_GUARANTEES.mealAssignmentsTodayMin) {
      throw new Error(
        `QA seed: ${account.email} has ${meals.length} meals on ${localDate}, expected at least ${QA_GUARANTEES.mealAssignmentsTodayMin}`,
      );
    }
    if (account.key === "ontrack" && loggedMealCount < QA_GUARANTEES.loggedMealsTodayOnTrack) {
      throw new Error(
        `QA seed: ${account.email} logged ${loggedMealCount} meals on ${localDate}, expected at least ${QA_GUARANTEES.loggedMealsTodayOnTrack}`,
      );
    }
    const loggedMealIds = new Set(
      (owned.get("meal_compliance") ?? []).map((row) => String(row.assignment_id)),
    );
    const executedWorkoutIds = new Set(
      (owned.get("workout_executions") ?? []).map((row) => String(row.assignment_id)),
    );
    const unloggedItemCount =
      meals.filter((row) => !loggedMealIds.has(String(row.id))).length +
      workouts.filter((row) => !executedWorkoutIds.has(String(row.id))).length;
    if (unloggedItemCount < QA_GUARANTEES.unloggedItemsTodayMin) {
      throw new Error(
        `QA seed: ${account.email} has ${unloggedItemCount} items still unlogged on ${localDate}, expected at least ${QA_GUARANTEES.unloggedItemsTodayMin}`,
      );
    }
    if (account.key === "slipping") {
      if (openExceptionCount < QA_GUARANTEES.openExceptionsSlippingMin) {
        throw new Error(
          `QA seed: ${account.email} has ${openExceptionCount} open exceptions, expected at least ${QA_GUARANTEES.openExceptionsSlippingMin}`,
        );
      }
      if (pendingCheckins.length !== QA_GUARANTEES.pendingCheckinsSlipping) {
        throw new Error(
          `QA seed: ${account.email} has ${pendingCheckins.length} check-ins awaiting review, expected ${QA_GUARANTEES.pendingCheckinsSlipping}`,
        );
      }
      if (String(pendingCheckins[0]!.id) !== input.pendingCheckinId) {
        throw new Error("QA seed: the pending check-in is not the one the build left unreviewed");
      }
      if (startableCheckins.length !== QA_GUARANTEES.startableCheckinsSlipping) {
        throw new Error(
          `QA seed: ${account.email} has ${startableCheckins.length} check-ins due on ${localDate}, expected ${QA_GUARANTEES.startableCheckinsSlipping}`,
        );
      }
      if (String(startableCheckins[0]!.id) !== input.startableCheckinId) {
        throw new Error("QA seed: the due check-in is not the one the build moved onto today");
      }
    }
    return {
      ...base,
      relationshipId,
      loggableWorkout,
      today: {
        workoutName: workouts[0] ? String(workouts[0].workout_day_name) : null,
        mealNames: meals.map((row) => String(row.meal_name)),
        loggedMealCount,
        openExceptionCount,
        pendingCheckinId: pendingCheckins[0] ? String(pendingCheckins[0].id) : null,
        startableCheckinId: startableCheckins[0] ? String(startableCheckins[0].id) : null,
      },
    };
  });
  return {
    $comment: EXPECTATIONS_FILE_COMMENT,
    referenceDate,
    suite,
    guarantees,
    accounts,
    rowCounts,
  };
}

/**
 * Applies the generated seed to the scratch database, which still holds the whole
 * demo world (and, in {@link buildQaSeeds}, every suite built before this one), and
 * checks every row landed. An `INSERT OR IGNORE` that collided with a demo row, or
 * with another suite's row, on a unique index would be skipped silently; this turns
 * that into a build failure.
 */
function verifyAgainstDemoWorld(
  sqlite: Sqlite,
  sql: string,
  rowCounts: Record<string, number>,
  suite: QaSuite,
): void {
  sqlite.exec(sql);
  const identity = qaScopeIdentity(suite);
  for (const [table, expected] of Object.entries(rowCounts)) {
    const predicate = qaScopePredicate(table, identity, "seed");
    const actual = Number(
      query(sqlite, `SELECT count(*) AS n FROM ${table} WHERE ${predicate}`)[0]?.n ?? 0,
    );
    if (actual !== expected) {
      throw new Error(
        `QA seed: ${table} has ${actual} QA rows for suite ${suite} after applying the seed beside the demo world, expected ${expected}`,
      );
    }
  }
}

/** One suite's seed, read out of a scratch database that already holds the demo world. */
async function buildSuiteSeed(input: {
  sqlite: Sqlite;
  suite: QaSuite;
  referenceDate: string;
  referenceInstant: string;
  qaPasswordHash: string;
  forbiddenStrings: readonly string[];
  demoCreatedIds: Set<string>;
}): Promise<QaSeedResult> {
  const { sqlite, suite } = input;
  const accounts = qaSuiteAccounts(suite);
  for (const account of accounts) {
    if (!QA_EMAIL_PATTERN.test(account.email)) {
      throw new Error(`QA account ${account.email} is outside the allowlist (D-QA1-2)`);
    }
  }
  const owned = readOwnedRows(sqlite, suite);
  const slipping = qaAccount("slipping", suite);
  const slippingDemoUserId = demoUuid("user", slipping.demoEmail);
  const slippingRelationship = (owned.get("coaching_relationships") ?? []).find(
    (row) => row.trainee_user_id === slippingDemoUserId,
  );
  if (!slippingRelationship) {
    throw new Error("QA seed: no relationship found for the slipping persona");
  }
  const pendingDemoCheckinId = leaveNewestCheckinUnreviewed(
    owned,
    String(slippingRelationship.id),
  );
  const dueDemoCheckinId = makeOneCheckinDueOnReferenceDate({
    owned,
    relationshipId: String(slippingRelationship.id),
    referenceDate: input.referenceDate,
    timezone: timezoneOf(sqlite, slippingDemoUserId),
  });

  const idMap = buildIdMap(owned, suite);
  rewriteRows(owned, {
    suite,
    accounts,
    idMap,
    qaPasswordHash: input.qaPasswordHash,
    accountByQaUserId: new Map(accounts.map((account) => [qaUserId(account), account])),
  });
  sortByPrimaryKey(owned);
  assertNoLeakedIdentity(owned, input.demoCreatedIds, input.forbiddenStrings, accounts);
  await yieldToEventLoop();

  const { sql, rowCounts, rowKeys } = emitSql(sqlite, owned, input.referenceDate, suite);
  const expectations = buildExpectations({
    suite,
    sqlite,
    owned,
    referenceDate: input.referenceDate,
    referenceInstant: input.referenceInstant,
    rowCounts,
    pendingCheckinId: idMap.get(pendingDemoCheckinId) ?? pendingDemoCheckinId,
    startableCheckinId: idMap.get(dueDemoCheckinId) ?? dueDemoCheckinId,
  });
  await yieldToEventLoop();
  verifyAgainstDemoWorld(sqlite, sql, rowCounts, suite);
  return { sql, expectations, rowKeys };
}

/**
 * Builds several suites' seeds from one scratch demo world (D-W5-14). Each suite's SQL
 * is applied beside the demo world and beside every suite built before it, so two
 * suites that collided on a primary key or a unique index would fail here. A suite's
 * output does not depend on which other suites are built with it.
 */
export async function buildQaSeeds(
  input: Omit<QaSeedInput, "suite"> & { suites: readonly QaSuite[] },
): Promise<Record<QaSuite, QaSeedResult>> {
  if (input.suites.length === 0 || new Set(input.suites).size !== input.suites.length) {
    throw new Error("QA seed: name each suite once");
  }
  const referenceInstant = qaReferenceInstant(input.referenceDate);
  const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
  try {
    const { sqlite } = handle;
    const libraryRowIds = allRowIds(sqlite);
    const libraryIndex = loadDemoLibraryIndex(sqlite);
    const demoSeedSql = buildDemoSeedSql({
      referenceInstant,
      passwordHash: await hashPassword(DEMO_PASSWORD_PLAINTEXT),
      libraryIndex,
    });
    await yieldToEventLoop();
    sqlite.exec(demoSeedSql);
    await yieldToEventLoop();

    // Any row the demo seed created is off limits in the output: a QA row's own id is
    // rewritten, and a leftover reference to someone else's row would be dangling.
    const demoCreatedIds = new Set(
      [...allRowIds(sqlite)].filter((id) => !libraryRowIds.has(id)),
    );

    const results = {} as Record<QaSuite, QaSeedResult>;
    for (const suite of input.suites) {
      results[suite] = await buildSuiteSeed({
        sqlite,
        suite,
        referenceDate: input.referenceDate,
        referenceInstant,
        qaPasswordHash: input.qaPasswordHash,
        forbiddenStrings: input.forbiddenStrings ?? [],
        demoCreatedIds,
      });
    }
    return results;
  } finally {
    handle.close();
  }
}

/** One suite's seed (default `api`, the QA1 world). */
export async function buildQaSeed(input: QaSeedInput): Promise<QaSeedResult> {
  const suite = input.suite ?? QA_DEFAULT_SUITE;
  const results = await buildQaSeeds({ ...input, suites: [suite] });
  return results[suite];
}
