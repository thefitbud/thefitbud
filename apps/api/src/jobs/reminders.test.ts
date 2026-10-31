import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import type { Env } from "../types.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import { handleReminderQueueBatch, handleScheduledReminders } from "./reminders.js";

const EMAIL = "priya.client@example.test";
const SECRET_MESSAGE = `D1 failed for ${EMAIL} Bearer abc.def.ghi`;
const DELIVERY_ID = "5d0e8a2c-3b4f-4a1e-9c7d-2f1e0d9c8b7a";
const NOTIFICATION_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const env: Env = {
  DB: {} as D1Database,
  MEDIA: createMemoryR2Bucket(),
  FIREBASE_PROJECT_ID: "fitbud-local",
  SESSION_COOKIE_NAME: "fitbud_session",
  AUTH_MODE: "test",
  PUSH_PROVIDER_MODE: "test",
  MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  ENVIRONMENT: "local",
};

class D1Failure extends Error {
  readonly code = "SQLITE_BUSY";
  constructor() {
    super(SECRET_MESSAGE);
    this.name = "D1Failure";
  }
}

/** A Db whose every query throws, like D1 being unavailable. */
const failingDb = new Proxy({} as Db, {
  get() {
    return () => {
      throw new D1Failure();
    };
  },
});

function message(body: unknown) {
  const calls: string[] = [];
  return {
    calls,
    message: { body, ack: () => calls.push("ack"), retry: () => calls.push("retry") },
  };
}

let lines: string[];
let handle: MemoryDbHandle | undefined;

beforeEach(() => {
  lines = [];
  for (const method of ["debug", "info", "warn", "error", "log"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  setTestDbOverride(null);
  handle?.close();
  handle = undefined;
});

describe("handleReminderQueueBatch (OB2)", () => {
  it("logs a failing message with safe fields and still retries it", async () => {
    setTestDbOverride(failingDb);
    const failing = message({ notificationId: NOTIFICATION_ID, deliveryId: DELIVERY_ID });
    const invalid = message({ nope: true });

    const result = await handleReminderQueueBatch(
      { messages: [failing.message, invalid.message] } as unknown as MessageBatch<unknown>,
      env,
    );

    expect(failing.calls).toEqual(["retry"]);
    expect(invalid.calls).toEqual(["ack"]);
    expect(result).toEqual({ acked: 1, retried: 1 });
    const logged = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(logged).toEqual([
      expect.objectContaining({
        level: "error",
        message: "queue.message_failed",
        operation: "queue.reminders.deliver",
        entityType: "notification_delivery",
        entityId: DELIVERY_ID,
        errorName: "D1Failure",
        errorCode: "SQLITE_BUSY",
      }),
    ]);
    const text = lines.join("\n");
    expect(text).not.toContain(SECRET_MESSAGE);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toMatch(/bearer\s/i);
  });

  it("acks a message whose notification no longer exists, without logging", async () => {
    handle = await createMemoryDb();
    setTestDbOverride(handle.db);
    const gone = message({ notificationId: NOTIFICATION_ID, deliveryId: DELIVERY_ID });
    const result = await handleReminderQueueBatch(
      { messages: [gone.message] } as unknown as MessageBatch<unknown>,
      env,
    );
    expect(gone.calls).toEqual(["ack"]);
    expect(result).toEqual({ acked: 1, retried: 0 });
    expect(lines).toEqual([]);
  });
});

describe("caught errors in reminder evaluation (OB2)", () => {
  const SEED = "2026-10-26T00:30:00.000Z";
  const RUN_AT = "2026-10-26T09:45:00.000Z";

  it("a malformed meal prescription is logged with operation and errorName, and the run continues", async () => {
    await prepareDemoSeededDb(SEED);
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
    const today = RUN_AT.slice(0, 10);
    const [row] = handle.sqlite.exec(
      `select id from meal_assignments where local_date = '${today}' limit 1`,
    )[0]?.values ?? [];
    expect(row).toBeDefined();
    handle.sqlite.run(`update meal_assignments set meal_prescription_json = ? where id = ?`, [
      `{"note": "contact ${EMAIL}"`,
      String(row![0]),
    ]);

    await expect(handleScheduledReminders(env, new Date(RUN_AT))).resolves.toBeUndefined();

    const caught = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l.message === "reminders.caught_error");
    expect(caught.length).toBeGreaterThan(0);
    expect(caught[0]).toMatchObject({
      level: "warn",
      operation: expect.stringMatching(/^reminders\.meal_(slot|local_time)_parse$/),
      errorName: "SyntaxError",
    });
    const text = lines.join("\n");
    expect(text).not.toContain(EMAIL);
    expect(text).not.toMatch(/JSON|position|Unexpected/);
  }, 120_000);
});
