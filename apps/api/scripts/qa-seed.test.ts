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
import { QA_TABLE_PLAN, qaScopePredicate } from "../src/seed/qa/ownership.js";
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

function rowsOf(sqlite: Sqlite, sql: string): string[] {
  const [result] = sqlite.exec(sql);
  if (!result) {
    return [];
  }
  return result.values.map((values) => JSON.stringify(values)).sort();
}

/** Hash of every row of every table, so any change anywhere shows up. */
function checksum(entries: Array<[string, string[]]>): string {
  const hash = createHash("sha256");
  for (const [table, rows] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`${table}:${rows.length}\n`);
    for (const row of rows) {
      hash.update(`${row}\n`);
    }
  }
  return hash.digest("hex");
}

/** `mode: "qa"` selects the rows the reset deletes; `"other"` selects everything else. */
function worldChecksum(sqlite: Sqlite, mode: "qa" | "other"): string {
  const identity = qaScopeIdentity();
  const planned = new Map(
    QA_TABLE_PLAN.map((plan) => [
      plan.table,
      qaScopePredicate(plan.table, identity, "reset"),
    ]),
  );
  const entries: Array<[string, string[]]> = [];
  for (const table of tableNames(sqlite)) {
    const predicate = planned.get(table);
    if (!predicate) {
      // Not in the ownership plan: the reset must leave the whole table alone.
      if (mode === "other") {
        entries.push([table, rowsOf(sqlite, `SELECT * FROM ${table}`)]);
      }
      continue;
    }
    const want = mode === "qa" ? 1 : 0;
    entries.push([
      table,
      rowsOf(sqlite, `SELECT * FROM ${table} WHERE coalesce(${predicate}, 0) = ${want}`),
    ]);
  }
  return checksum(entries);
}

/** Rows of `table` the reset would delete — not the whole table, which holds library rows. */
function qaTableCount(sqlite: Sqlite, table: string): number {
  const predicate = qaScopePredicate(table, qaScopeIdentity(), "reset");
  return Number(
    sqlite.exec(`SELECT count(*) FROM ${table} WHERE coalesce(${predicate}, 0) = 1`)[0]
      ?.values[0]?.[0] ?? 0,
  );
}

function qaRowCount(sqlite: Sqlite): number {
  const identity = qaScopeIdentity();
  let total = 0;
  for (const plan of QA_TABLE_PLAN) {
    const predicate = qaScopePredicate(plan.table, identity, "reset");
    total += Number(
      sqlite.exec(
        `SELECT count(*) FROM ${plan.table} WHERE coalesce(${predicate}, 0) = 1`,
      )[0]?.values[0]?.[0] ?? 0,
    );
  }
  return total;
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
      const once = worldChecksum(handle.sqlite, "qa");
      const others = worldChecksum(handle.sqlite, "other");
      for (const [table, expected] of Object.entries(built.expectations.rowCounts)) {
        expect(qaTableCount(handle.sqlite, table), table).toBe(expected);
      }
      handle.sqlite.exec(built.sql);
      await yieldToEventLoop();
      expect(worldChecksum(handle.sqlite, "qa")).toBe(once);
      expect(worldChecksum(handle.sqlite, "other")).toBe(others);
    } finally {
      handle.close();
    }
  }, 120_000);

  it("produces a world the product API accepts, and restores it after real mutations", async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    try {
      handle.sqlite.exec(built.sql);
      await yieldToEventLoop();
      const seeded = worldChecksum(handle.sqlite, "qa");
      setTestDbOverride(handle.db);

      const trainer = built.expectations.accounts.find((a) => a.key === "trainer")!;
      const onTrack = built.expectations.accounts.find((a) => a.key === "ontrack")!;
      const slipping = built.expectations.accounts.find((a) => a.key === "slipping")!;

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
      expect(worldChecksum(handle.sqlite, "qa")).not.toBe(seeded);

      setTestDbOverride(null);
      handle.sqlite.exec(resetSql);
      await yieldToEventLoop();
      expect(qaRowCount(handle.sqlite)).toBe(0);
      handle.sqlite.exec(built.sql);
      await yieldToEventLoop();
      expect(worldChecksum(handle.sqlite, "qa")).toBe(seeded);
      for (const [table, expected] of Object.entries(built.expectations.rowCounts)) {
        expect(qaTableCount(handle.sqlite, table), table).toBe(expected);
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
      const demoOnly = worldChecksum(handle.sqlite, "other");
      handle.sqlite.exec(seed.sql);
      await yieldToEventLoop();
      expect(qaRowCount(handle.sqlite)).toBeGreaterThan(4000);
      expect(worldChecksum(handle.sqlite, "other")).toBe(demoOnly);

      handle.sqlite.exec(buildQaResetSql(qaScopeIdentity()));
      await yieldToEventLoop();
      expect(qaRowCount(handle.sqlite)).toBe(0);
      expect(worldChecksum(handle.sqlite, "other")).toBe(demoOnly);

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
