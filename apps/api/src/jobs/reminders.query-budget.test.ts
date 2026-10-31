import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDbOverride } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import { handleScheduledReminders } from "./reminders.js";

/**
 * I8 / D-W1-11: one scheduled reminder run on the demo seed makes at most 200
 * D1 queries (Workers Paid allows 1,000 per invocation), and bulk reads do not
 * change which reminders are created.
 */
const SEED = "2026-10-26T00:30:00.000Z";
/** Mid-afternoon in India on the seed day: workout, meal and check-in reminders are due. */
const RUN_AT = "2026-10-26T09:45:00.000Z";
const QUERY_BUDGET = 200;

/** Staging and production bind REMINDER_QUEUE (I4a): the cron enqueues, the consumer delivers. */
function cronEnv(sent: unknown[] = []): Env {
  return {
    REMINDER_QUEUE: {
      send: async (message: unknown) => {
        sent.push(message);
      },
    } as unknown as Env["REMINDER_QUEUE"],
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    PUSH_PROVIDER_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
  };
}

describe("scheduled reminder run query budget (I8)", () => {
  let handle: MemoryDbHandle;
  const createdNotifications = () =>
    (
      handle.sqlite.exec(
        `select notification_type, recipient_user_id, domain_entity_type, domain_entity_id, dedupe_key, state
           from notifications where created_at = '${RUN_AT}' order by dedupe_key, recipient_user_id`,
      )[0]?.values ?? []
    ).map((row) => row.map(String).join(" | "));

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(RUN_AT));
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  it(`stays within ${QUERY_BUDGET} D1 queries for one run on the demo seed`, async () => {
    handle.queryCounter.reset();
    await handleScheduledReminders(cronEnv(), new Date(RUN_AT));
    console.info(`[I8] scheduled reminder run: ${handle.queryCounter.count} D1 queries`);
    expect(handle.queryCounter.count).toBeLessThanOrEqual(QUERY_BUDGET);
  });

  it("a second run five minutes later creates nothing new and stays small", async () => {
    await handleScheduledReminders(cronEnv(), new Date(RUN_AT));
    const before = handle.sqlite.exec("select count(*) from notifications")[0]?.values[0]?.[0];
    const sent: unknown[] = [];
    handle.queryCounter.reset();
    await handleScheduledReminders(cronEnv(sent), new Date(Date.parse(RUN_AT) + 5 * 60_000));
    const after = handle.sqlite.exec("select count(*) from notifications")[0]?.values[0]?.[0];
    expect(after).toBe(before);
    expect(sent).toHaveLength(0);
    expect(handle.queryCounter.count).toBeLessThanOrEqual(40);
  });

  it("creates the same reminders as before the bulk reads (snapshot)", async () => {
    const sent: unknown[] = [];
    await handleScheduledReminders(cronEnv(sent), new Date(RUN_AT));
    const created = createdNotifications();
    expect(created.length).toBeGreaterThan(0);
    expect(created).toMatchSnapshot();
    const queued = created.filter((row) => row.endsWith("| queued")).length;
    expect(sent).toHaveLength(queued);
  });
});
