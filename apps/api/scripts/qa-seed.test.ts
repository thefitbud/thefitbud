/**
 * QT2: the QA seed is deterministic and idempotent, and the QA reset cannot reach
 * past the three QA accounts.
 *
 * The reset is a data-destruction boundary, so the tests here do not trust the
 * predicates by reading them: they build the staging-like world (the demo personas
 * Firoz's real-email accounts point at, plus the QA world beside them), checksum
 * every row that is not a QA row, run the reset, and require the checksum to be
 * unchanged.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { TEST_OTP_IDENTIFIER_RE } from "../src/auth/test-otp.js";
import { verifyPassword } from "../src/auth/password.js";
import { setTestDbOverride } from "../src/db/client.js";
import { createMemoryR2Bucket } from "../src/lib/memory-r2.js";
import {
  createMemoryDb,
  yieldToEventLoop,
  type MemoryDbHandle,
} from "../src/test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../src/test-support/seeded-db.js";
import type { Env } from "../src/types.js";
import { QA_ACCOUNTS, QA_EMAIL_PATTERN, qaUserId } from "../src/seed/qa/accounts.js";
import {
  buildQaSeed,
  qaReferenceInstant,
  stableExpectations,
  type QaExpectations,
  type QaSeedResult,
} from "../src/seed/qa/build.js";
import { qaScopeIdentity } from "../src/seed/qa/identity.js";
import { QA_TABLE_PLAN } from "../src/seed/qa/ownership.js";
import { qaPasswordHash } from "../src/seed/qa/password.js";
import { buildQaResetSql, qaResetGuardSql } from "../src/seed/qa/reset.js";

const REFERENCE_DATE = "2026-11-02";
const OTHER_REFERENCE_DATE = "2026-11-09";
/** Test input only; the staging password is a GitHub Actions secret. */
const TEST_QA_PASSWORD = "qa-seed-vitest-input-2026";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const committedExpectations = JSON.parse(
  readFileSync(path.join(apiRoot, "src/seed/qa/expectations.json"), "utf8"),
) as QaExpectations;

type Sqlite = MemoryDbHandle["sqlite"];

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when the test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "dev_sink",
  };
}

function tableNames(sqlite: Sqlite): string[] {
  return (
    sqlite.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%\\_fts%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )[0]?.values ?? []
  ).map((row) => String(row[0]));
}

/**
 * Primary key columns of `table`, from the schema.
 *
 * Everything below identifies QA rows by the primary keys the seed emitted
 * (`QaSeedResult.rowKeys`), never by `qaScopePredicate`. Classifying rows with the
 * same predicate the reset deletes by would make an over-broad predicate invisible:
 * the rows it wrongly matched would be filed as "QA" and excluded from the "no other
 * row changed" checksum. These helpers come from a different source, so a widened
 * predicate shows up as other people's rows disappearing.
 */
function pkColumns(sqlite: Sqlite, table: string): string[] {
  return (
    sqlite.exec(
      `SELECT name FROM pragma_table_info('${table}') WHERE pk > 0 ORDER BY pk`,
    )[0]?.values ?? []
  ).map((row) => String(row[0]));
}

type TableRow = { key: string; json: string };

function tableRows(sqlite: Sqlite, table: string): TableRow[] {
  const [result] = sqlite.exec(`SELECT * FROM ${table}`);
  if (!result) {
    return [];
  }
  const indexes = pkColumns(sqlite, table).map((column) => result.columns.indexOf(column));
  return result.values.map((values) => ({
    key: indexes.map((index) => String(values[index])).join("\u0000"),
    json: JSON.stringify(values),
  }));
}

function checksum(entries: Array<[string, string[]]>): string {
  const hash = createHash("sha256");
  for (const [table, rows] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`${table}:${rows.length}\n`);
    for (const row of [...rows].sort()) {
      hash.update(`${row}\n`);
    }
  }
  return hash.digest("hex");
}

/** Every row of every table — no filtering, so there is nothing to get wrong. */
function fullChecksum(sqlite: Sqlite): string {
  return checksum(
    tableNames(sqlite).map((table) => [table, tableRows(sqlite, table).map((row) => row.json)]),
  );
}

type RowKeys = Record<string, string[]>;

function keySets(rowKeys: RowKeys): Map<string, Set<string>> {
  return new Map(
    Object.entries(rowKeys).map(([table, keys]) => [table, new Set(keys)] as const),
  );
}

/** Every row whose primary key the seed did NOT emit, i.e. everyone else's rows. */
function othersChecksum(sqlite: Sqlite, rowKeys: RowKeys): string {
  const qa = keySets(rowKeys);
  return checksum(
    tableNames(sqlite).map((table) => {
      const keys = qa.get(table);
      return [
        table,
        tableRows(sqlite, table)
          .filter((row) => !keys?.has(row.key))
          .map((row) => row.json),
      ];
    }),
  );
}

/** Every row whose primary key the seed emitted, i.e. exactly the seeded QA rows. */
function qaChecksum(sqlite: Sqlite, rowKeys: RowKeys): string {
  const qa = keySets(rowKeys);
  return checksum(
    [...qa].map(([table, keys]) => [
      table,
      tableRows(sqlite, table)
        .filter((row) => keys.has(row.key))
        .map((row) => row.json),
    ]),
  );
}

/** How many of the seed's own rows are in the database. */
function seededRowsPresent(sqlite: Sqlite, rowKeys: RowKeys): number {
  let total = 0;
  for (const [table, keys] of keySets(rowKeys)) {
    total += tableRows(sqlite, table).filter((row) => keys.has(row.key)).length;
  }
  return total;
}

/** Rows of `table` whose primary key the seed emitted. */
function seededRowsIn(sqlite: Sqlite, rowKeys: RowKeys, table: string): number {
  const keys = new Set(rowKeys[table] ?? []);
  return tableRows(sqlite, table).filter((row) => keys.has(row.key)).length;
}

/**
 * Rows still carrying a QA user id in one of the plan's own user columns — found from
 * the plan's column metadata, not from its predicates. This catches rows the nightly
 * run created, which the seed's key list cannot know about.
 */
function rowsReferencingQaUsers(sqlite: Sqlite, userIds: readonly string[]): string[] {
  const ids = userIds.map((id) => `'${id}'`).join(", ");
  const found: string[] = [];
  for (const plan of QA_TABLE_PLAN) {
    for (const column of plan.userColumns ?? []) {
      const count = Number(
        sqlite.exec(`SELECT count(*) FROM ${plan.table} WHERE ${column} IN (${ids})`)[0]
          ?.values[0]?.[0] ?? 0,
      );
      if (count > 0) {
        found.push(`${plan.table}.${column}=${count}`);
      }
    }
  }
  return found;
}

/** Rows of any plan table still pointing at one of the QA relationships. */
function rowsReferencingRelationships(
  sqlite: Sqlite,
  relationshipIds: readonly string[],
): string[] {
  const ids = relationshipIds.map((id) => `'${id}'`).join(", ");
  const found: string[] = [];
  for (const plan of QA_TABLE_PLAN) {
    const columns = (
      sqlite.exec(`SELECT name FROM pragma_table_info('${plan.table}')`)[0]?.values ?? []
    )
      .map((row) => String(row[0]))
      .filter((name) => name === "coaching_relationship_id" || name === "relationship_id");
    for (const column of columns) {
      const count = Number(
        sqlite.exec(`SELECT count(*) FROM ${plan.table} WHERE ${column} IN (${ids})`)[0]
          ?.values[0]?.[0] ?? 0,
      );
      if (count > 0) {
        found.push(`${plan.table}.${column}=${count}`);
      }
    }
  }
  return found;
}

async function login(email: string, password: string): Promise<string> {
  const response = await app.request(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email, password }),
    },
    testEnv(),
  );
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return (JSON.parse(text) as { data: { token: string } }).data.token;
}

describe("QA seed (QT2)", () => {
  let built: QaSeedResult;
  let resetSql: string;

  beforeAll(async () => {
    built = await buildQaSeed({
      referenceDate: REFERENCE_DATE,
      qaPasswordHash: qaPasswordHash(TEST_QA_PASSWORD),
      forbiddenStrings: [TEST_QA_PASSWORD],
    });
    resetSql = buildQaResetSql(qaScopeIdentity());
  }, 240_000);

  it("is byte-identical for the same reference date and different for another", async () => {
    const again = await buildQaSeed({
      referenceDate: REFERENCE_DATE,
      qaPasswordHash: qaPasswordHash(TEST_QA_PASSWORD),
      forbiddenStrings: [TEST_QA_PASSWORD],
    });
    expect(again.sql).toBe(built.sql);
    expect(again.expectations).toEqual(built.expectations);

    const other = await buildQaSeed({
      referenceDate: OTHER_REFERENCE_DATE,
      qaPasswordHash: qaPasswordHash(TEST_QA_PASSWORD),
      forbiddenStrings: [TEST_QA_PASSWORD],
    });
    expect(other.sql).not.toBe(built.sql);
    expect(other.expectations.referenceDate).toBe(OTHER_REFERENCE_DATE);
    // The guarantees hold on another date too, with the same identities.
    expect(other.expectations.accounts.map((account) => account.userId)).toEqual(
      built.expectations.accounts.map((account) => account.userId),
    );
  }, 240_000);

  it("builds on every day of the week, rest days included", async () => {
    // Mon 2026-11-02 to Sun 2026-11-08. The generated plan trains four days a week,
    // so three of these are rest days for both QA trainees; the nightly job seeds
    // whatever today is, so every one of them has to build.
    const week = [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ];
    const seen = new Map<string, string>();
    let restDays = 0;
    for (const referenceDate of week) {
      const result = await buildQaSeed({
        referenceDate,
        qaPasswordHash: qaPasswordHash(TEST_QA_PASSWORD),
        forbiddenStrings: [TEST_QA_PASSWORD],
      });
      expect(result.expectations.referenceDate).toBe(referenceDate);
      seen.set(referenceDate, createHash("sha256").update(result.sql).digest("hex"));
      for (const account of result.expectations.accounts) {
        if (account.role !== "trainee") {
          continue;
        }
        const today = account.today!;
        // What every date guarantees.
        expect(today.mealNames.length, `${referenceDate} ${account.email} meals`).
          toBeGreaterThanOrEqual(result.expectations.guarantees.mealAssignmentsTodayMin);
        expect(account.loggableWorkout, `${referenceDate} ${account.email}`).toBeTruthy();
        expect(account.loggableWorkout!.localDate <= referenceDate).toBe(true);
        if (account.key === "ontrack") {
          expect(today.loggedMealCount).toBeGreaterThanOrEqual(
            result.expectations.guarantees.loggedMealsTodayOnTrack,
          );
        }
        if (account.key === "slipping") {
          expect(today.openExceptionCount).toBeGreaterThanOrEqual(
            result.expectations.guarantees.openExceptionsSlippingMin,
          );
          expect(today.pendingCheckinId).toBeTruthy();
        }
        if (today.workoutName === null) {
          restDays += 1;
        }
      }
    }
    // Each date is its own world, and rest days really do occur in that week — if the
    // generator ever trained seven days a week this test would stop proving anything.
    expect(new Set(seen.values()).size).toBe(week.length);
    expect(restDays).toBeGreaterThan(0);
  }, 600_000);

  it("uses only allowlisted QA addresses and no real person's identity", () => {
    for (const account of QA_ACCOUNTS) {
      expect(account.email).toMatch(QA_EMAIL_PATTERN);
      // The nightly run signs in through the staging test-mode OTP (QT1), which
      // allowlists exactly these addresses.
      expect(account.email).toMatch(TEST_OTP_IDENTIFIER_RE);
      expect(account.email.toLowerCase()).toBe(account.email);
      expect(account.displayName.startsWith("QA ")).toBe(true);
    }
    expect(built.sql).not.toContain(TEST_QA_PASSWORD);
    expect(built.sql).not.toContain("@demo.fitbud.test");
    expect(built.sql).not.toContain("FitBud-demo-2026");
    expect(built.sql).not.toMatch(/\+91\d/);
    expect(built.sql).not.toContain("Rahul Verma");
    expect(built.sql).not.toContain("Aarav Shah");
    expect(built.sql).not.toContain("Rohan Mehta");
    // The hash is stored, never the plaintext, and the production verifier reads it.
    expect(built.sql).toContain("pbkdf2$100000$");
  });

  it("hashes the QA password so the product's own verifier accepts it", async () => {
    const hash = qaPasswordHash(TEST_QA_PASSWORD);
    expect(hash).toBe(qaPasswordHash(TEST_QA_PASSWORD));
    expect(await verifyPassword(TEST_QA_PASSWORD, hash)).toBe(true);
    expect(await verifyPassword("something-else-entirely", hash)).toBe(false);
    expect(() => qaPasswordHash("short")).toThrow(/PASSWORD_LENGTH/);
  });

  it("keeps the committed expectations.json in step with the generated world", () => {
    expect(stableExpectations(committedExpectations)).toBe(
      stableExpectations(built.expectations),
    );
    for (const account of built.expectations.accounts) {
      expect(account.userId).toBe(
        qaUserId(QA_ACCOUNTS.find((entry) => entry.key === account.key)!),
      );
    }
    const slipping = built.expectations.accounts.find((a) => a.key === "slipping")!;
    expect(slipping.signIn).toBe("otp_only");
    expect(slipping.today?.pendingCheckinId).toBeTruthy();
    expect(slipping.today?.openExceptionCount).toBeGreaterThanOrEqual(2);
    const onTrack = built.expectations.accounts.find((a) => a.key === "ontrack")!;
    expect(onTrack.today?.mealNames.length).toBeGreaterThanOrEqual(3);
    expect(onTrack.today?.loggedMealCount).toBeGreaterThanOrEqual(1);
    expect(onTrack.today?.workoutName).toBeTruthy();
  });

  it("applies twice to a fresh database and changes nothing the second time", async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    try {
      handle.sqlite.exec(built.sql);
      await yieldToEventLoop();
      const once = qaChecksum(handle.sqlite, built.rowKeys);
      const others = othersChecksum(handle.sqlite, built.rowKeys);
      for (const [table, expected] of Object.entries(built.expectations.rowCounts)) {
        expect(seededRowsIn(handle.sqlite, built.rowKeys, table), table).toBe(expected);
      }
      handle.sqlite.exec(built.sql);
      await yieldToEventLoop();
      expect(qaChecksum(handle.sqlite, built.rowKeys)).toBe(once);
      expect(othersChecksum(handle.sqlite, built.rowKeys)).toBe(others);
    } finally {
      handle.close();
    }
  }, 120_000);

  it("produces a world the product API accepts, and restores it after real mutations", async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    try {
      handle.sqlite.exec(built.sql);
      await yieldToEventLoop();
      const seeded = qaChecksum(handle.sqlite, built.rowKeys);
      setTestDbOverride(handle.db);

      const trainer = built.expectations.accounts.find((a) => a.key === "trainer")!;
      const onTrack = built.expectations.accounts.find((a) => a.key === "ontrack")!;
      const slipping = built.expectations.accounts.find((a) => a.key === "slipping")!;
      const qaIds = built.expectations.accounts.map((account) => account.userId);
      const relationshipIds = built.expectations.accounts
        .map((account) => account.relationshipId)
        .filter((id): id is string => Boolean(id));

      const trainerToken = await login(trainer.email, TEST_QA_PASSWORD);
      const trainerHeaders = {
        Authorization: `Bearer ${trainerToken}`,
        "x-fitbud-role": "trainer",
      };
      const attention = await app.request(
        "/exceptions/attention?groupBy=relationship&limit=50",
        { headers: trainerHeaders },
        testEnv(),
      );
      const attentionText = await attention.text();
      expect(attention.status, attentionText).toBe(200);
      const groups = (
        JSON.parse(attentionText) as {
          data: {
            groups?: Array<{
              relationshipId: string;
              traineeDisplayName: string;
              items: Array<{ id: string; status: string }>;
            }>;
          };
        }
      ).data.groups ?? [];
      const slippingGroup = groups.find(
        (group) => group.relationshipId === slipping.relationshipId,
      );
      expect(slippingGroup?.traineeDisplayName).toBe(slipping.displayName);
      expect(slippingGroup!.items.length).toBeGreaterThanOrEqual(2);

      const traineeToken = await login(onTrack.email, TEST_QA_PASSWORD);
      const traineeHeaders = {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
      };
      const day = await app.request(
        `/me/day/${REFERENCE_DATE}`,
        { headers: traineeHeaders },
        testEnv(),
      );
      expect(day.status, await day.clone().text()).toBe(200);

      // What the nightly run does on these accounts (D-QA1-7): a trainee logs a meal
      // and the trainer marks an exception reviewed.
      const assignments = await app.request(
        `/meals/relationships/${onTrack.relationshipId}/assignments?fromDate=${REFERENCE_DATE}&toDate=${REFERENCE_DATE}`,
        { headers: traineeHeaders },
        testEnv(),
      );
      const assignmentsText = await assignments.text();
      expect(assignments.status, assignmentsText).toBe(200);
      const pendingMeal = (
        JSON.parse(assignmentsText) as {
          data: {
            items: Array<{
              id: string;
              compliance: unknown | null;
              loggingLocked: boolean;
            }>;
          };
        }
      ).data.items.find((item) => item.compliance === null && !item.loggingLocked);
      expect(pendingMeal, assignmentsText).toBeTruthy();
      const confirmed = await app.request(
        `/meals/assignments/${pendingMeal!.id}/confirm`,
        {
          method: "POST",
          headers: {
            ...traineeHeaders,
            "Content-Type": "application/json",
            "Idempotency-Key": "qa-seed-test-confirm-1",
          },
          body: JSON.stringify({}),
        },
        testEnv(),
      );
      expect(confirmed.status, await confirmed.clone().text()).toBe(200);

      const acknowledged = await app.request(
        `/exceptions/${slippingGroup!.items[0]!.id}/acknowledge`,
        {
          method: "POST",
          headers: {
            ...trainerHeaders,
            "Content-Type": "application/json",
            "Idempotency-Key": "qa-seed-test-ack-1",
          },
          body: JSON.stringify({ note: "Reviewed by the nightly QA run." }),
        },
        testEnv(),
      );
      expect(acknowledged.status, await acknowledged.clone().text()).toBe(200);
      // The run left rows the seed never emitted: a new compliance row and a new
      // exception action, neither in `rowKeys`.
      const afterMutations = seededRowsPresent(handle.sqlite, built.rowKeys);
      expect(
        rowsReferencingQaUsers(handle.sqlite, qaIds).length,
      ).toBeGreaterThan(0);
      expect(
        Number(
          handle.sqlite.exec(
            `SELECT count(*) FROM meal_compliance WHERE assignment_id = '${pendingMeal!.id}'`,
          )[0]?.values[0]?.[0] ?? 0,
        ),
      ).toBe(1);
      expect(
        Number(
          handle.sqlite.exec(
            `SELECT count(*) FROM exception_actions WHERE exception_id = '${slippingGroup!.items[0]!.id}'`,
          )[0]?.values[0]?.[0] ?? 0,
        ),
      ).toBeGreaterThan(0);

      setTestDbOverride(null);
      handle.sqlite.exec(resetSql);
      await yieldToEventLoop();
      // Nothing of the QA accounts' survives: not the seeded rows, not the rows the
      // run created. Each check comes from a different source than the predicates.
      expect(seededRowsPresent(handle.sqlite, built.rowKeys)).toBe(0);
      expect(afterMutations).toBeGreaterThan(0);
      expect(rowsReferencingQaUsers(handle.sqlite, qaIds)).toEqual([]);
      expect(rowsReferencingRelationships(handle.sqlite, relationshipIds)).toEqual([]);
      expect(
        Number(
          handle.sqlite.exec(
            `SELECT count(*) FROM meal_compliance WHERE assignment_id = '${pendingMeal!.id}'`,
          )[0]?.values[0]?.[0] ?? 0,
        ),
      ).toBe(0);

      handle.sqlite.exec(built.sql);
      await yieldToEventLoop();
      expect(qaChecksum(handle.sqlite, built.rowKeys)).toBe(seeded);
      for (const [table, expected] of Object.entries(built.expectations.rowCounts)) {
        expect(seededRowsIn(handle.sqlite, built.rowKeys, table), table).toBe(expected);
      }
    } finally {
      setTestDbOverride(null);
      handle.close();
    }
  }, 180_000);
});

describe("QA reset (QT2)", () => {
  const identity = qaScopeIdentity();
  const resetSql = buildQaResetSql(identity);

  it("mentions no identity other than the three QA ids", () => {
    const uuids = new Set(
      resetSql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [],
    );
    expect([...uuids].sort()).toEqual([...identity.userIds].sort());
    for (const statement of resetSql.split("\n")) {
      if (!statement.startsWith("DELETE FROM")) {
        continue;
      }
      expect(statement).toContain(" WHERE ");
      // Every delete is anchored on a literal QA identity, directly or through a
      // subquery that is itself anchored on one.
      const anchors = [...identity.userIds, ...identity.identifierHashes];
      expect(
        anchors.some((anchor) => statement.includes(anchor)),
        statement.slice(0, 120),
      ).toBe(true);
    }
    expect(resetSql).not.toContain("auth_rate_limits");
  });

  it("deletes a table's children before the table itself", async () => {
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      const position = new Map(QA_TABLE_PLAN.map((plan, index) => [plan.table, index]));
      for (const [index, plan] of QA_TABLE_PLAN.entries()) {
        const fks =
          handle.sqlite.exec(
            `SELECT "from", "table" FROM pragma_foreign_key_list('${plan.table}')`,
          )[0]?.values ?? [];
        for (const [column, target] of fks) {
          const parent = String(target);
          const parentIndex = position.get(parent);
          if (parentIndex === undefined || parent === plan.table) {
            continue;
          }
          expect(
            parentIndex,
            `${plan.table}.${String(column)} -> ${parent} must be inserted before it (and deleted after)`,
          ).toBeLessThan(index);
        }
      }
    } finally {
      handle.close();
    }
  }, 60_000);

  it("has every cascading child of a plan table in the plan", async () => {
    // Why a cascade cannot leave the QA world: a CASCADE can only delete rows that
    // reference the row being deleted, and every table that cascades from a table
    // here is itself here, so the reset's own predicates still bound what goes. A new
    // cascading table added to the schema but not to the plan would break that.
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      const planned = new Set(QA_TABLE_PLAN.map((plan) => plan.table));
      const tables = (
        handle.sqlite.exec(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%\\_fts%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )[0]?.values ?? []
      ).map((row) => String(row[0]));
      const escaping: string[] = [];
      const setNull: string[] = [];
      let cascades = 0;
      for (const table of tables) {
        const fks =
          handle.sqlite.exec(
            `SELECT "from", "table", on_delete FROM pragma_foreign_key_list('${table}')`,
          )[0]?.values ?? [];
        for (const [column, target, onDelete] of fks) {
          const action = String(onDelete).toUpperCase();
          if (action === "SET NULL") {
            setNull.push(`${table}.${String(column)}`);
          }
          if (action !== "CASCADE") {
            continue;
          }
          cascades += 1;
          if (planned.has(String(target)) && !planned.has(table)) {
            escaping.push(`${table}.${String(column)} -> ${String(target)}`);
          }
        }
      }
      expect(cascades).toBeGreaterThan(0);
      // SET NULL would let a delete change a row instead of removing it.
      expect(setNull).toEqual([]);
      expect(escaping).toEqual([]);
    } finally {
      handle.close();
    }
  }, 60_000);

  it("only reads tables that come earlier in the plan", () => {
    const seen = new Set<string>();
    for (const plan of QA_TABLE_PLAN) {
      for (const parent of plan.parents ?? []) {
        expect(seen.has(parent.table), `${plan.table} -> ${parent.table}`).toBe(true);
      }
      seen.add(plan.table);
    }
    expect(seen.size).toBe(QA_TABLE_PLAN.length);
  });

  it("aborts when a fixed QA id is not its QA account", async () => {
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      const guard = qaResetGuardSql();
      const now = "2026-11-02T06:30:00.000Z";
      // Nothing seeded: the guard passes.
      expect(() => handle.sqlite.exec(guard)).not.toThrow();

      // A different account occupying one of the fixed ids must stop the reset.
      handle.sqlite.exec(
        `INSERT INTO users (id, firebase_uid, account_state, timezone, created_at, updated_at) VALUES ('${identity.userIds[0]}', 'firebase-someone-else', 'active', 'Asia/Kolkata', '${now}', '${now}');`,
      );
      expect(() => handle.sqlite.exec(guard)).toThrow(/malformed JSON/i);

      handle.sqlite.exec(`DELETE FROM users WHERE id = '${identity.userIds[0]}';`);
      expect(() => handle.sqlite.exec(guard)).not.toThrow();

      // A QA address on some other user id must stop it too: the reset would miss it.
      handle.sqlite.exec(
        `INSERT INTO users (id, firebase_uid, account_state, timezone, created_at, updated_at) VALUES ('11111111-2222-4333-8444-555555555555', 'qa-seed-trainer', 'active', 'Asia/Kolkata', '${now}', '${now}');`,
      );
      expect(() => handle.sqlite.exec(guard)).toThrow(/malformed JSON/i);
    } finally {
      handle.close();
    }
  }, 60_000);
});

describe("QA reset beside the staging demo world (QT2)", () => {
  const referenceInstant = qaReferenceInstant(REFERENCE_DATE);

  beforeAll(async () => {
    await prepareDemoSeededDb(referenceInstant);
  }, 240_000);

  it("deletes every QA row and changes no other row", async () => {
    const seed = await buildQaSeed({
      referenceDate: REFERENCE_DATE,
      qaPasswordHash: qaPasswordHash(TEST_QA_PASSWORD),
      forbiddenStrings: [TEST_QA_PASSWORD],
    });
    const handle = await createDemoSeededDb(referenceInstant);
    try {
      // Staging-like: the demo personas Firoz's real-email accounts point at, with the
      // QA world applied beside them.
      // The QA keys must not already exist, or excluding them would quietly drop a
      // demo row from the "everyone else" set.
      expect(seededRowsPresent(handle.sqlite, seed.rowKeys)).toBe(0);
      const beforeAnything = fullChecksum(handle.sqlite);
      const demoOnly = othersChecksum(handle.sqlite, seed.rowKeys);
      expect(demoOnly).not.toBe("");

      // The reset with no QA row present must be a complete no-op. This needs no
      // classification of rows at all, so a widened predicate cannot hide here.
      handle.sqlite.exec(buildQaResetSql(qaScopeIdentity()));
      await yieldToEventLoop();
      expect(fullChecksum(handle.sqlite)).toBe(beforeAnything);

      handle.sqlite.exec(seed.sql);
      await yieldToEventLoop();
      expect(seededRowsPresent(handle.sqlite, seed.rowKeys)).toBeGreaterThan(4000);
      expect(othersChecksum(handle.sqlite, seed.rowKeys)).toBe(demoOnly);

      handle.sqlite.exec(buildQaResetSql(qaScopeIdentity()));
      await yieldToEventLoop();
      expect(seededRowsPresent(handle.sqlite, seed.rowKeys)).toBe(0);
      expect(othersChecksum(handle.sqlite, seed.rowKeys)).toBe(demoOnly);
      expect(fullChecksum(handle.sqlite)).toBe(beforeAnything);

      // The demo personas the QA accounts were generated from are untouched.
      for (const account of QA_ACCOUNTS) {
        const rows = handle.sqlite.exec(
          `SELECT count(*) FROM user_identities WHERE email = '${account.demoEmail}'`,
        )[0]?.values[0]?.[0];
        expect(Number(rows), account.demoEmail).toBe(1);
      }
    } finally {
      handle.close();
    }
  }, 240_000);
});
