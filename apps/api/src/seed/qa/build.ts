/**
 * Builds the deterministic QA seed (QT2, D-QA1-3).
 *
 * The seed is not written by hand and it is not the staging file: it is read out of
 * the demo generator, so the QA world is the same persisted entities, relationships,
 * plan versions and state transitions the product workflow produces.
 *
 * 1. migrations + library seed into an in-memory `node:sqlite` database,
 * 2. `buildDemoSeedSql` with a fixed reference instant,
 * 3. keep the rows owned by the three personas (`ownership.ts`, strict scope),
 * 4. rewrite them onto the QA identities: new ids, QA emails, fixed firebase uids,
 *    no phone numbers, `QA `-prefixed display names,
 * 5. emit `INSERT OR IGNORE` statements sorted by table then primary key, so the
 *    same reference date always gives a byte-identical file and a second apply
 *    changes no row.
 *
 * Nothing is ever emitted for the demo personas themselves: the QA rows carry
 * different primary keys, so applying this file to staging cannot update or delete a
 * row belonging to Firoz's real-email accounts.
 */
import { hashPassword } from "../../auth/password.js";
import { createMemoryDb, yieldToEventLoop } from "../../test-support/memory-db.js";
import { buildDemoSeedSql, kolkataLocalDate } from "../demo/build.js";
import { demoUuid, sha256HexSync, sqlQuote } from "../demo/ids.js";
import { loadDemoLibraryIndex } from "../demo/personas.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../demo/spec.js";
import {
  QA_ACCOUNTS,
  QA_EMAIL_PATTERN,
  qaRowId,
  qaUserId,
  type QaAccount,
} from "./accounts.js";
import { demoScopeIdentity, qaScopeIdentity } from "./identity.js";
import { QA_TABLE_PLAN, qaScopePredicate, type QaTablePlan } from "./ownership.js";

export type QaSeedInput = {
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
  /**
   * What every reference date satisfies; the build fails when one is not met. There
   * is deliberately no "a workout today" guarantee: the generated plan trains four
   * days a week, so roughly three days in seven are rest days for both QA trainees.
   * `loggableWorkoutsPerTrainee` is the guarantee a workout suite can rely on.
   */
  guarantees: {
    mealAssignmentsTodayMin: number;
    loggedMealsTodayOnTrack: number;
    openExceptionsSlippingMin: number;
    pendingCheckinsSlipping: number;
    loggableWorkoutsPerTrainee: number;
    workoutAssignmentsTodayMax: number;
  };
  accounts: QaAccountExpectation[];
  /** Rows the seed inserts per table, for the reset + reseed round trip. */
  rowCounts: Record<string, number>;
};

/**
 * The part of `expectations.json` that must be the same for every reference date.
 * The committed file is compared on this, so it cannot drift from the generator.
 */
export function stableExpectations(expectations: QaExpectations): string {
  return JSON.stringify(
    {
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
  openExceptionsSlippingMin: 2,
  pendingCheckinsSlipping: 1,
  loggableWorkoutsPerTrainee: 1,
  workoutAssignmentsTodayMax: 1,
};

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
 * The demo world's rows for the three personas, keyed by table, in plan order.
 */
function readOwnedRows(sqlite: Sqlite): Map<string, Row[]> {
  const identity = demoScopeIdentity();
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

/** old id → QA id, for every row the QA world owns plus the three accounts. */
function buildIdMap(owned: Map<string, Row[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const account of QA_ACCOUNTS) {
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
          map.set(value, qaRowId(value));
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
  notifications(row) {
    row.dedupe_key = qaUniqueKey(String(row.dedupe_key), "qa:");
  },
  media_assets(row) {
    row.object_key = qaUniqueKey(String(row.object_key), "qa/");
  },
};

/**
 * A globally unique column keeps its value when it embeds a (already rewritten) QA
 * id; otherwise it is prefixed, so a QA row can never collide with a demo row on a
 * unique index. `verifyAgainstDemoWorld` proves the result.
 */
function qaUniqueKey(value: string, prefix: string): string {
  UUID_RE.lastIndex = 0;
  return UUID_RE.test(value) ? value : `${prefix}${value}`;
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
        for (const account of QA_ACCOUNTS) {
          next = replaceAll(next, account.demoEmail, account.email);
          next = replaceAll(next, account.demoDisplayName, account.displayName);
        }
        for (const account of QA_ACCOUNTS) {
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
): void {
  const banned: Array<[string, string]> = [
    ["a demo email domain", "@demo.fitbud.test"],
    ["an Indian mobile number", "+9190"],
    ["the demo password", DEMO_PASSWORD_PLAINTEXT],
    ...forbiddenStrings.map(
      (value) => ["a forbidden string", value] as [string, string],
    ),
  ];
  const qaEmails = new Set(QA_ACCOUNTS.map((account) => account.email));
  const qaUids = new Set(QA_ACCOUNTS.map((account) => account.firebaseUid));
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
        for (const account of QA_ACCOUNTS) {
          if (value.includes(account.demoDisplayName)) {
            throw new Error(
              `QA seed: ${table}.${column} still contains the demo name ${account.demoDisplayName}`,
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
): { sql: string; rowCounts: Record<string, number>; rowKeys: Record<string, string[]> } {
  const parts: string[] = [
    `-- FitBud QA seed (QT2), reference date ${referenceDate} in Asia/Kolkata.`,
    "-- Generated by apps/api/scripts/qa-seed.ts; do not edit by hand.",
    `-- QA accounts: ${QA_ACCOUNTS.map((account) => account.email).join(", ")}`,
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

function localDateFor(sqlite: Sqlite, userId: string, instant: string): string {
  const rows = query(sqlite, `SELECT timezone FROM users WHERE id = ${sqlQuote(userId)}`);
  const timezone = String(rows[0]?.timezone ?? "Asia/Kolkata");
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
  sqlite: Sqlite;
  owned: Map<string, Row[]>;
  referenceDate: string;
  referenceInstant: string;
  rowCounts: Record<string, number>;
  pendingCheckinId: string;
}): QaExpectations {
  const { owned, referenceDate, rowCounts } = input;
  const trainer = QA_ACCOUNTS.find((account) => account.role === "trainer")!;
  const relationshipByTrainee = new Map<string, string>();
  for (const row of owned.get("coaching_relationships") ?? []) {
    relationshipByTrainee.set(String(row.trainee_user_id), String(row.id));
  }
  const accounts: QaAccountExpectation[] = QA_ACCOUNTS.map((account) => {
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
      throw new Error(`QA seed: ${account.email} has no relationship with ${trainer.email}`);
    }
    const localDate = localDateFor(input.sqlite, demoUuid("user", account.demoEmail), input.referenceInstant);
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
      },
    };
  });
  return {
    $comment:
      "Generated by apps/api/scripts/qa-seed.ts (QT2). `accounts[].email|role|displayName|userId|firebaseUid|signIn|relationshipId` and `guarantees` are the same for every reference date; `today`, `loggableWorkout`, `rowCounts` and `referenceDate` describe the run that produced this file. The generated plan trains four days a week, so `today.workoutName` is null on a rest day (roughly three days in seven) — a suite that must open and log a workout uses `loggableWorkout`, which every reference date has. The nightly job writes the current run's copy to apps/api/.qa-seed/expectations.json.",
    referenceDate,
    guarantees: QA_GUARANTEES,
    accounts,
    rowCounts,
  };
}

/**
 * Applies the generated seed to the scratch database, which still holds the whole
 * demo world, and checks every row landed. An `INSERT OR IGNORE` that collided with
 * a demo row on a unique index would be skipped silently; this turns that into a
 * build failure.
 */
function verifyAgainstDemoWorld(sqlite: Sqlite, sql: string, rowCounts: Record<string, number>): void {
  sqlite.exec(sql);
  const identity = qaScopeIdentity();
  for (const [table, expected] of Object.entries(rowCounts)) {
    const predicate = qaScopePredicate(table, identity, "seed");
    const actual = Number(
      query(sqlite, `SELECT count(*) AS n FROM ${table} WHERE ${predicate}`)[0]?.n ?? 0,
    );
    if (actual !== expected) {
      throw new Error(
        `QA seed: ${table} has ${actual} QA rows after applying the seed beside the demo world, expected ${expected}`,
      );
    }
  }
}

export async function buildQaSeed(input: QaSeedInput): Promise<QaSeedResult> {
  for (const account of QA_ACCOUNTS) {
    if (!QA_EMAIL_PATTERN.test(account.email)) {
      throw new Error(`QA account ${account.email} is outside the allowlist (D-QA1-2)`);
    }
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

    const owned = readOwnedRows(sqlite);
    const slipping = QA_ACCOUNTS.find((account) => account.key === "slipping")!;
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

    const idMap = buildIdMap(owned);
    rewriteRows(owned, {
      idMap,
      qaPasswordHash: input.qaPasswordHash,
      accountByQaUserId: new Map(QA_ACCOUNTS.map((account) => [qaUserId(account), account])),
    });
    sortByPrimaryKey(owned);
    assertNoLeakedIdentity(owned, demoCreatedIds, input.forbiddenStrings ?? []);
    await yieldToEventLoop();

    const { sql, rowCounts, rowKeys } = emitSql(sqlite, owned, input.referenceDate);
    const expectations = buildExpectations({
      sqlite,
      owned,
      referenceDate: input.referenceDate,
      referenceInstant,
      rowCounts,
      pendingCheckinId: idMap.get(pendingDemoCheckinId) ?? pendingDemoCheckinId,
    });
    await yieldToEventLoop();
    verifyAgainstDemoWorld(sqlite, sql, rowCounts);
    return { sql, expectations, rowKeys };
  } finally {
    handle.close();
  }
}
