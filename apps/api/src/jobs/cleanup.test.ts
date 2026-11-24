import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import type { MemoryDbHandle, SqlJsCompatDatabase } from "../test-support/memory-db.js";
import { assertNoForeignKeyViolations } from "../test-support/foreign-key-check.js";
import { setTestDbOverride } from "../db/client.js";
import type { Env } from "../types.js";
import {
  CLEANUP_UTC_HOUR,
  handleScheduledCleanup,
  isDailyCleanupTick,
  runCleanup,
} from "./cleanup.js";

/**
 * Z14-4: the daily cleanup, on the full demo seed plus realistic rows of each
 * kind it may delete, each next to rows of the same kind it must keep.
 */

const REF = "2026-11-24T06:00:00.000Z";
const NOW = new Date("2026-11-24T21:00:00.000Z");
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Tables the job may delete from, plus coaching tables it must never touch. */
const TOUCHED = [
  "idempotency_records",
  "sync_mutations",
  "web_sessions",
  "auth_otps",
  "notifications",
  "notification_deliveries",
] as const;
const COACHING = [
  "coaching_relationships",
  "plan_versions",
  "workout_executions",
  "set_executions",
  "meal_compliance",
  "checkins",
  "exceptions",
  "trainer_notes",
  "change_log",
  "log_edit_events",
  "measurements",
  "payment_records",
] as const;

let handle: MemoryDbHandle | null = null;

beforeAll(async () => {
  await prepareDemoSeededDb(REF);
}, 120_000);

afterEach(() => {
  setTestDbOverride(null);
  handle?.close();
  handle = null;
  vi.restoreAllMocks();
});

function one<T = unknown>(sqlite: SqlJsCompatDatabase, query: string): T {
  return sqlite.exec(query)[0]!.values[0]![0] as T;
}

function ids(sqlite: SqlJsCompatDatabase, table: string): Set<string> {
  return new Set((sqlite.exec(`SELECT id FROM ${table}`)[0]?.values ?? []).map((row) => String(row[0])));
}

function counts(sqlite: SqlJsCompatDatabase, tables: readonly string[]): Record<string, number> {
  return Object.fromEntries(tables.map((table) => [table, Number(one(sqlite, `SELECT count(*) FROM ${table}`))]));
}

type World = { trainerId: string; traineeId: string; relationshipId: string };

function world(sqlite: SqlJsCompatDatabase): World {
  const [relationshipId, trainerId, traineeId] = sqlite.exec(
    "SELECT id, trainer_user_id, trainee_user_id FROM coaching_relationships WHERE status = 'active' ORDER BY id LIMIT 1",
  )[0]!.values[0]!.map(String);
  return { trainerId: trainerId!, traineeId: traineeId!, relationshipId: relationshipId! };
}

function addIdempotency(sqlite: SqlJsCompatDatabase, id: string, actor: string, expiresAt: string): void {
  sqlite.run(
    `INSERT INTO idempotency_records (id, actor_user_id, operation, key_hash, request_fingerprint, response_status, response_body, created_at, expires_at)
     VALUES (?, ?, 'POST /meals/compliance', ?, 'fp', 201, '{"ok":true}', ?, ?)`,
    [id, actor, `key-${id}`, iso(-2 * DAY), expiresAt],
  );
}

function addSyncVerdict(
  sqlite: SqlJsCompatDatabase,
  id: string,
  actor: string,
  status: "applied" | "already_applied" | "rejected" | "conflicted",
  createdAt: string,
): void {
  sqlite.run(
    `INSERT INTO sync_mutations (id, mutation_id, actor_user_id, idempotency_key, operation, entity_type, record_id, result_status, server_version, result_body, created_at)
     VALUES (?, ?, ?, ?, 'meal_compliance.log', 'meal_compliance', NULL, ?, 3, '{}', ?)`,
    [id, `mutation-${id}`, actor, `idem-${id}`, status, createdAt],
  );
}

function addWebLogin(
  sqlite: SqlJsCompatDatabase,
  id: string,
  user: string,
  expiresAt: string,
  revokedAt: string | null,
): void {
  sqlite.run(
    `INSERT INTO web_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, user, `hash-${id}`, expiresAt, revokedAt, iso(-10 * DAY), iso(-1 * DAY)],
  );
}

function addLoginCode(
  sqlite: SqlJsCompatDatabase,
  id: string,
  createdAt: string,
  state: { consumedAt?: string; invalidatedAt?: string } = {},
): void {
  const created = Date.parse(createdAt);
  sqlite.run(
    `INSERT INTO auth_otps (id, identifier_hash, code_hash, purpose, expires_at, attempts, channels_sent, consumed_at, invalidated_at, created_at)
     VALUES (?, 'identifier-hash', ?, 'login', ?, 0, '["email"]', ?, ?, ?)`,
    [
      id,
      `code-${id}`,
      new Date(created + 10 * MIN).toISOString(),
      state.consumedAt ?? null,
      state.invalidatedAt ?? null,
      createdAt,
    ],
  );
}

function addNotification(
  sqlite: SqlJsCompatDatabase,
  w: World,
  id: string,
  state: "pending" | "queued" | "delivered" | "read" | "failed" | "suppressed" | "deferred",
  createdAt: string,
  withDelivery = false,
): void {
  sqlite.run(
    `INSERT INTO notifications (id, recipient_user_id, coaching_relationship_id, notification_type, domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at)
     VALUES (?, ?, ?, 'meal_reminder', 'coaching_relationship', ?, ?, ?, ?, ?)`,
    [id, w.traineeId, w.relationshipId, w.relationshipId, state, `cleanup-test:${id}`, createdAt, state === "read" ? createdAt : null],
  );
  if (withDelivery) {
    sqlite.run(
      `INSERT INTO notification_deliveries (id, notification_id, device_token_id, channel, provider_status, provider_message_id, attempt_number, created_at, updated_at)
       VALUES (?, ?, NULL, 'push', 'accepted', 'ticket', 1, ?, ?)`,
      [`delivery-${id}`, id, createdAt, createdAt],
    );
  }
}

/** Adds one realistic set of rows; returns the ids the job must delete. */
function addRows(sqlite: SqlJsCompatDatabase, w: World): Record<(typeof TOUCHED)[number], string[]> {
  addIdempotency(sqlite, "idem-expired", w.traineeId, iso(-1 * MIN));
  addIdempotency(sqlite, "idem-live", w.traineeId, iso(+1 * HOUR));

  addSyncVerdict(sqlite, "sync-applied-old", w.traineeId, "applied", iso(-31 * DAY));
  addSyncVerdict(sqlite, "sync-already-old", w.traineeId, "already_applied", iso(-45 * DAY));
  addSyncVerdict(sqlite, "sync-applied-recent", w.traineeId, "applied", iso(-29 * DAY));
  addSyncVerdict(sqlite, "sync-rejected-old", w.traineeId, "rejected", iso(-60 * DAY));
  addSyncVerdict(sqlite, "sync-conflicted-old", w.traineeId, "conflicted", iso(-60 * DAY));

  addWebLogin(sqlite, "web-expired", w.trainerId, iso(-1 * MIN), null);
  addWebLogin(sqlite, "web-revoked", w.trainerId, iso(+20 * DAY), iso(-1 * HOUR));
  addWebLogin(sqlite, "web-live", w.trainerId, iso(+20 * DAY), null);

  addLoginCode(sqlite, "otp-used-old", iso(-2 * DAY), { consumedAt: iso(-2 * DAY + MIN) });
  addLoginCode(sqlite, "otp-invalidated-old", iso(-3 * DAY), { invalidatedAt: iso(-3 * DAY + 2 * MIN) });
  addLoginCode(sqlite, "otp-expired-old", iso(-26 * HOUR));
  addLoginCode(sqlite, "otp-used-today", iso(-2 * HOUR), { consumedAt: iso(-2 * HOUR + MIN) });
  addLoginCode(sqlite, "otp-live", iso(-2 * MIN));

  addNotification(sqlite, w, "n-read-old", "read", iso(-91 * DAY), true);
  addNotification(sqlite, w, "n-read-older", "read", iso(-200 * DAY));
  addNotification(sqlite, w, "n-read-recent", "read", iso(-89 * DAY), true);
  for (const state of ["pending", "queued", "delivered", "failed", "suppressed", "deferred"] as const) {
    addNotification(sqlite, w, `n-${state}-old`, state, iso(-120 * DAY), true);
  }

  return {
    idempotency_records: ["idem-expired"],
    sync_mutations: ["sync-applied-old", "sync-already-old"],
    web_sessions: ["web-expired", "web-revoked"],
    auth_otps: ["otp-used-old", "otp-invalidated-old", "otp-expired-old"],
    notifications: ["n-read-old", "n-read-older"],
    notification_deliveries: ["delivery-n-read-old"],
  };
}

describe("isDailyCleanupTick", () => {
  it("is true on exactly one 5-minute cron tick a day", () => {
    const ticks = Array.from({ length: 288 }, (_, i) => new Date(Date.parse("2026-11-24T00:00:00.000Z") + i * 5 * MIN));
    const due = ticks.filter(isDailyCleanupTick).map((at) => at.toISOString());
    expect(due).toEqual([`2026-11-24T${String(CLEANUP_UTC_HOUR).padStart(2, "0")}:00:00.000Z`]);
  });
});

describe("runCleanup", () => {
  it("deletes exactly the expired and old rows listed in the spec, and nothing else", async () => {
    handle = await createDemoSeededDb(REF);
    const { sqlite } = handle;
    const w = world(sqlite);
    const coachingBefore = counts(sqlite, COACHING);
    // Clear demo rows the rules already cover, so only our rows are in play.
    await runCleanup(handle.db, NOW, { maxBatches: 1_000 });
    const seedIds = Object.fromEntries(TOUCHED.map((t) => [t, ids(sqlite, t)]));

    const expected = addRows(sqlite, w);
    const withOurs = Object.fromEntries(TOUCHED.map((t) => [t, ids(sqlite, t)]));
    const result = await runCleanup(handle.db, NOW);

    for (const table of TOUCHED) {
      const after = ids(sqlite, table);
      const deleted = [...withOurs[table]!].filter((id) => !after.has(id)).sort();
      expect(deleted, table).toEqual([...expected[table]].sort());
      for (const id of seedIds[table]!) expect(after.has(id), `${table} seed row kept`).toBe(true);
    }
    expect(result).toEqual({
      idempotencyRecords: 1,
      syncVerdicts: 2,
      expiredWebLogins: 2,
      loginCodes: 3,
      readNotifications: 2,
      notificationDeliveries: 1,
    });
    // Kept: every unread state, recent read rows and their deliveries.
    expect([...ids(sqlite, "notification_deliveries")].filter((id) => id.startsWith("delivery-n-")).sort()).toEqual(
      [
        "delivery-n-deferred-old",
        "delivery-n-delivered-old",
        "delivery-n-failed-old",
        "delivery-n-pending-old",
        "delivery-n-queued-old",
        "delivery-n-read-recent",
        "delivery-n-suppressed-old",
      ],
    );
    expect(counts(sqlite, COACHING)).toEqual(coachingBefore);
    assertNoForeignKeyViolations(sqlite);
  });

  it("is bounded per run and idempotent: a backlog drains over later runs, then nothing changes", async () => {
    handle = await createDemoSeededDb(REF);
    const { sqlite } = handle;
    const w = world(sqlite);
    await runCleanup(handle.db, NOW, { maxBatches: 1_000 });
    for (let i = 0; i < 7; i += 1) {
      addNotification(sqlite, w, `n-backlog-${i}`, "read", iso(-(100 + i) * DAY), true);
      addIdempotency(sqlite, `idem-backlog-${i}`, w.traineeId, iso(-(i + 1) * HOUR));
    }

    const first = await runCleanup(handle.db, NOW, { batchSize: 2, maxBatches: 2 });
    expect(first.readNotifications).toBe(4);
    expect(first.notificationDeliveries).toBe(4);
    expect(first.idempotencyRecords).toBe(4);
    // Oldest first, and each deleted notification took its delivery with it.
    const left = [...ids(sqlite, "notifications")].filter((id) => id.startsWith("n-backlog-")).sort();
    expect(left).toEqual(["n-backlog-0", "n-backlog-1", "n-backlog-2"]);
    assertNoForeignKeyViolations(sqlite);

    const second = await runCleanup(handle.db, NOW, { batchSize: 2, maxBatches: 2 });
    expect(second.readNotifications).toBe(3);
    expect(second.idempotencyRecords).toBe(3);

    const third = await runCleanup(handle.db, NOW, { batchSize: 2, maxBatches: 2 });
    expect(third).toEqual({
      idempotencyRecords: 0,
      syncVerdicts: 0,
      expiredWebLogins: 0,
      loginCodes: 0,
      readNotifications: 0,
      notificationDeliveries: 0,
    });
  });
});

describe("handleScheduledCleanup", () => {
  const env = { DB: {} as D1Database } as Env;

  it("does nothing on the other ticks of the day", async () => {
    handle = await createDemoSeededDb(REF);
    setTestDbOverride(handle.db);
    addIdempotency(handle.sqlite, "idem-expired", world(handle.sqlite).traineeId, iso(-1 * MIN));
    expect(await handleScheduledCleanup(env, new Date("2026-11-24T21:05:00.000Z"))).toBeNull();
    expect(await handleScheduledCleanup(env, new Date("2026-11-24T06:00:00.000Z"))).toBeNull();
    expect(ids(handle.sqlite, "idempotency_records").has("idem-expired")).toBe(true);
  });

  it("runs on the daily tick and logs counts only", async () => {
    handle = await createDemoSeededDb(REF);
    setTestDbOverride(handle.db);
    const w = world(handle.sqlite);
    await runCleanup(handle.db, NOW, { maxBatches: 1_000 });
    addIdempotency(handle.sqlite, "idem-expired", w.traineeId, iso(-1 * MIN));
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await handleScheduledCleanup(env, NOW);
    expect(result?.idempotencyRecords).toBe(1);
    expect(ids(handle.sqlite, "idempotency_records").has("idem-expired")).toBe(false);
    const line = JSON.parse(String(info.mock.calls.at(-1)![0])) as Record<string, unknown>;
    expect(line).toMatchObject({ message: "cleanup.completed", operation: "cron.cleanup", idempotencyRecords: 1 });
    expect(JSON.stringify(line)).not.toContain(w.traineeId);
  });
});
