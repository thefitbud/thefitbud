import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import type { Env } from "../types.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import { evaluateAndEnqueueReminders } from "../domain/reminders.js";
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

describe("an unresolvable stored timezone (CU20)", () => {
  const SEED = "2026-10-26T00:30:00.000Z";
  const RUN_AT = "2026-10-26T09:45:00.000Z";
  const LATER = "2026-10-26T10:45:00.000Z";
  /** IANA-shaped, and no runtime has data for it: `Intl` throws a RangeError. */
  const BAD_ZONE = "Not/AZone";
  /** The demo trainee with the most reminders due at RUN_AT. */
  const BROKEN_EMAIL = "pooja.silent@demo.fitbud.test";
  const SWEEPER_ID = "c1a0f6de-1f2b-4f0e-9b7a-0c3d5e8f1a20";

  function one(h: MemoryDbHandle, sql: string): unknown[] | undefined {
    return h.sqlite.exec(sql)[0]?.values[0];
  }

  function userIdFor(h: MemoryDbHandle, email: string): string {
    const row = one(h, `select user_id from user_identities where email_norm = '${email}'`);
    expect(row).toBeDefined();
    return String(row![0]);
  }

  function countCreated(h: MemoryDbHandle, at: string, where: string): number {
    return Number(
      one(h, `select count(*) from notifications where created_at = '${at}' and ${where}`)![0],
    );
  }

  function caughtLines(operation: string): Array<Record<string, unknown>> {
    return lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l.operation === operation);
  }

  it("costs only that trainee's reminders: the run continues, the deferred sweep still runs, and the zone is logged", async () => {
    await prepareDemoSeededDb(SEED);
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
    const brokenUserId = userIdFor(handle, BROKEN_EMAIL);
    handle.sqlite.run(`update users set timezone = ? where id = ?`, [BAD_ZONE, brokenUserId]);
    // A deferred row with no relationship, which `retryDeferredReminders` — the
    // step that used to be skipped altogether — suppresses. Its final state is
    // the proof that the sweep still ran after the failure.
    handle.sqlite.run(
      `insert into notifications
         (id, recipient_user_id, coaching_relationship_id, notification_type,
          domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at)
       values (?, ?, null, 'workout_reminder', 'workout_assignment', ?, 'deferred', ?, ?, null)`,
      [
        SWEEPER_ID,
        userIdFor(handle, "aarav.ontrack@demo.fitbud.test"),
        SWEEPER_ID,
        `deferred:cu20-sweeper:${SWEEPER_ID}`,
        SEED,
      ],
    );

    await expect(handleScheduledReminders(env, new Date(RUN_AT))).resolves.toBeUndefined();

    // Nothing for the broken trainee: no fabricated noon, no quiet-hours
    // decision taken on a local time nobody is in.
    expect(countCreated(handle, RUN_AT, `recipient_user_id = '${brokenUserId}'`)).toBe(0);
    // ...and the rest of the run is untouched. Before containment the throw
    // ended the run here, so every line below was zero.
    expect(
      countCreated(handle, RUN_AT, `recipient_user_id <> '${brokenUserId}'`),
    ).toBeGreaterThan(20);
    expect(
      Number(
        one(
          handle,
          `select count(distinct recipient_user_id) from notifications
             where created_at = '${RUN_AT}' and recipient_user_id <> '${brokenUserId}'`,
        )![0],
      ),
    ).toBeGreaterThan(5);
    expect(one(handle, `select state from notifications where id = '${SWEEPER_ID}'`)![0]).toBe(
      "suppressed",
    );

    // Contained is not silent: the line says which zone and what threw.
    const caught = caughtLines("reminders.collect_relationship_local_date");
    expect(caught.length).toBeGreaterThan(0);
    expect(caught[0]).toMatchObject({
      level: "warn",
      message: "reminders.caught_error",
      errorName: "UnresolvableRecipientTimeZoneError",
      timeZone: BAD_ZONE,
      causeName: "RangeError",
    });
    // The two call sites are tellable apart, so one failing relationship does
    // not read as two unrelated problems.
    expect(caughtLines("reminders.run_context_local_date").length).toBeGreaterThan(0);
    // No error message rides along, from any error type.
    for (const line of caught) expect(line).not.toHaveProperty("errorDetail");

    const text = lines.join("\n");
    expect(text).not.toContain(BROKEN_EMAIL);
    expect(text).not.toContain(brokenUserId);
    expect(text).not.toMatch(/bearer\s/i);
  }, 180_000);

  it("a deferred row whose zone broke since it was written is reported, not retried against a fabricated noon", async () => {
    await prepareDemoSeededDb(SEED);
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
    // First run, everything resolvable: some reminders land in quiet hours and
    // are written as `deferred:` rows.
    await handleScheduledReminders(env, new Date(RUN_AT));
    const deferred = one(
      handle,
      `select recipient_user_id, id from notifications
         where state = 'deferred' and dedupe_key like 'deferred:%' limit 1`,
    );
    expect(deferred).toBeDefined();
    const [recipientId, deferredId] = [String(deferred![0]), String(deferred![1])];
    handle.sqlite.run(`update users set timezone = ? where id = ?`, [BAD_ZONE, recipientId]);
    // Swept after the broken row, so its final state proves the sweep carried on.
    handle.sqlite.run(
      `insert into notifications
         (id, recipient_user_id, coaching_relationship_id, notification_type,
          domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at)
       values (?, ?, null, 'workout_reminder', 'workout_assignment', ?, 'deferred', ?, ?, null)`,
      [
        SWEEPER_ID,
        userIdFor(handle, "aarav.ontrack@demo.fitbud.test"),
        SWEEPER_ID,
        `deferred:cu20-sweeper:${SWEEPER_ID}`,
        SEED,
      ],
    );
    lines = [];

    // Second run: `retryDeferredReminders` rebuilds that row and reaches
    // `persistReminder`, where the local time is now underivable. Without the
    // throw this took `?? "12:00"` and decided quiet hours on a made-up noon.
    await expect(handleScheduledReminders(env, new Date(LATER))).resolves.toBeUndefined();

    const caught = caughtLines("reminders.retry_deferred_candidate");
    expect(caught.length).toBeGreaterThan(0);
    expect(caught[0]).toMatchObject({
      level: "warn",
      errorName: "UnresolvableRecipientTimeZoneError",
      timeZone: BAD_ZONE,
    });
    // The row is left deferred for a later run, never silently delivered.
    expect(one(handle, `select state from notifications where id = '${deferredId}'`)![0]).toBe(
      "deferred",
    );
    // ...and the sweep did not stop there.
    expect(one(handle, `select state from notifications where id = '${SWEEPER_ID}'`)![0]).toBe(
      "suppressed",
    );
    expect(lines.join("\n")).not.toContain(recipientId);
  }, 180_000);

  it("a candidate whose enqueue fails costs that reminder only, and the run continues", async () => {
    await prepareDemoSeededDb(SEED);
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
    // The other way `persistReminder` throws in production: the Queue producer
    // rejects. Before containment this ended the candidate loop too, and
    // `retryDeferredReminders` never ran.
    let sends = 0;
    const queue = {
      send: async () => {
        sends += 1;
        if (sends === 1) throw new Error("Queue is unavailable");
      },
    };

    const result = await evaluateAndEnqueueReminders(handle.db, {
      now: RUN_AT,
      queue,
      pushProviderMode: "test",
      deliverInline: false,
    });

    expect(sends).toBeGreaterThan(10);
    expect(result.deliveriesEnqueued).toBeGreaterThan(10);
    const caught = caughtLines("reminders.persist_candidate");
    expect(caught).toHaveLength(1);
    expect(caught[0]).toMatchObject({
      level: "warn",
      message: "reminders.caught_error",
      errorName: "Error",
    });
    // No message, for this or any other error type.
    expect(caught[0]).not.toHaveProperty("errorDetail");
    expect(lines.join("\n")).not.toContain("Queue is unavailable");
  }, 180_000);

  it("never prints a stored zone that is not an IANA-shaped name", async () => {
    await prepareDemoSeededDb(SEED);
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
    // `users.timezone` is 64 characters the user supplies, and until this task
    // `POST /invitations/accept` wrote them unchecked, so rows like this exist
    // on exactly the path that makes a zone unresolvable. The stored value must
    // not reach the log line through any field, including an error message.
    const brokenUserId = userIdFor(handle, BROKEN_EMAIL);
    handle.sqlite.run(`update users set timezone = ? where id = ?`, [
      BROKEN_EMAIL,
      brokenUserId,
    ]);

    await expect(handleScheduledReminders(env, new Date(RUN_AT))).resolves.toBeUndefined();

    const caught = caughtLines("reminders.collect_relationship_local_date");
    expect(caught.length).toBeGreaterThan(0);
    // Reported, and reported as unprintable rather than quietly dropped.
    expect(caught[0]).toMatchObject({
      errorName: "UnresolvableRecipientTimeZoneError",
      timeZoneShape: "non_iana",
      causeName: "RangeError",
    });
    expect(caught[0]).not.toHaveProperty("timeZone");
    // The whole log output, not just the timeZone field.
    const text = lines.join("\n");
    expect(text).not.toContain(BROKEN_EMAIL);
    expect(text).not.toContain("pooja");
    expect(text).not.toContain("@demo.fitbud.test");
    // ...and the run still finished.
    expect(
      countCreated(handle, RUN_AT, `recipient_user_id <> '${brokenUserId}'`),
    ).toBeGreaterThan(20);
  }, 180_000);

  it("keeps every other error's message out of the log", async () => {
    setTestDbOverride(failingDb);
    const failing = message({ notificationId: NOTIFICATION_ID, deliveryId: DELIVERY_ID });
    await handleReminderQueueBatch(
      { messages: [failing.message] } as unknown as MessageBatch<unknown>,
      env,
    );
    const logged = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(logged[0]).toMatchObject({ errorName: "D1Failure", errorCode: "SQLITE_BUSY" });
    expect(logged[0]).not.toHaveProperty("errorDetail");
    expect(logged[0]).not.toHaveProperty("timeZone");
    expect(logged[0]).not.toHaveProperty("timeZoneShape");
    expect(logged[0]).not.toHaveProperty("causeName");
    expect(lines.join("\n")).not.toContain(SECRET_MESSAGE);
  });
});
