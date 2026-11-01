import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SAFE_PUSH_PAYLOAD_KEYS } from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import { setTestDbOverride } from "../db/client.js";
import {
  deviceTokens,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  users,
} from "../db/schema.js";
import { handleReminderQueueBatch, handleScheduledReminders } from "../jobs/reminders.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import type { Env } from "../types.js";

/**
 * X4c on the demo seed: the cron evaluates real coaching state (workout, meal and check-in
 * expectations of active relationships), enqueues, the queue consumer delivers through the
 * Expo sender, and only the outbound call to exp.host is mocked.
 *
 * 15:00 UTC is 20:30 in Asia/Kolkata: after the workout and meal reminder times, before the
 * 22:00 quiet hours start, so all three trainee reminder types are due.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const RUN_AT = "2026-10-26T15:00:00.000Z";
/** 17:00 UTC is 22:30 in Asia/Kolkata, inside the default quiet hours (22:00 to 07:00). */
const QUIET_AT = "2026-10-26T17:00:00.000Z";
const SEND_URL = "https://exp.host/--/api/v2/push/send";
const TYPES = ["meal_reminder", "workout_reminder", "checkin_reminder"] as const;
type ReminderType = (typeof TYPES)[number];

type QueueMessage = { notificationId: string; deliveryId: string };
type ExpoMessage = Record<string, unknown> & { to: string; data: Record<string, unknown> };

function env(sent: QueueMessage[] = []): Env {
  return {
    REMINDER_QUEUE: {
      send: async (message: QueueMessage) => {
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
    PUSH_PROVIDER_MODE: "expo",
    EXPO_ACCESS_TOKEN: "test-expo-access-token-x4c",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
  };
}

function batchOf(message: QueueMessage) {
  const acked: string[] = [];
  const retried: string[] = [];
  const batch = {
    messages: [
      {
        body: message,
        ack: () => acked.push(message.deliveryId),
        retry: () => retried.push(message.deliveryId),
      },
    ],
  } as unknown as MessageBatch<unknown>;
  return { batch, acked, retried };
}

describe("reminder pushes end to end through the Expo sender (X4c)", () => {
  let handle: MemoryDbHandle;
  let queued: QueueMessage[];
  let expoCalls: ExpoMessage[];
  let expoUrls: string[];

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(RUN_AT));
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
    queued = [];
    expoCalls = [];
    expoUrls = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setTestDbOverride(null);
    handle.close();
  });

  /** Mocks only the outbound Expo call; `reply` decides each token's ticket. */
  function mockExpo(reply: (to: string) => Response | Record<string, unknown> = () => ({ status: "ok", id: "t-1" })) {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        // Recorded and asserted by the tests: an assertion thrown here would be swallowed by the sender.
        expoUrls.push(String(url));
        const body = JSON.parse(String(init!.body)) as ExpoMessage[];
        expoCalls.push(...body);
        const first = reply(body[0]!.to);
        if (first instanceof Response) return first;
        return Response.json({ data: body.map(() => first) });
      }),
    );
  }

  async function runCron() {
    await handleScheduledReminders(env(queued), new Date(RUN_AT));
  }

  /** The first queued reminder of a type, with its stored notification. */
  async function queuedOfType(type: ReminderType) {
    for (const message of queued) {
      const [notification] = await handle.db
        .select()
        .from(notifications)
        .where(eq(notifications.id, message.notificationId));
      if (notification?.notificationType === type) return { message, notification };
    }
    throw new Error(`the cron queued no ${type} on the demo seed at ${RUN_AT}`);
  }

  /** Replaces the recipient's device tokens with exactly these (in send order). */
  async function setTokens(
    userId: string,
    tokens: Array<{ id: string; token: string; status?: "active" | "revoked" }>,
  ) {
    await handle.db.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
    for (const t of tokens) {
      const status = t.status ?? "active";
      await handle.db.insert(deviceTokens).values({
        id: t.id,
        userId,
        platform: "android",
        provider: "expo",
        token: t.token,
        // A superseded row is soft-revoked onto a sentinel installation id (X4b).
        installationId: status === "revoked" ? `revoked:${t.id}` : `${t.id}-install`,
        status,
        lastSeenAt: SEED,
        createdAt: SEED,
        updatedAt: SEED,
      });
    }
  }

  async function setPreferences(userId: string, patch: Partial<typeof notificationPreferences.$inferInsert>) {
    await handle.db
      .insert(notificationPreferences)
      .values({ userId, createdAt: SEED, updatedAt: SEED, ...patch })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...patch, updatedAt: SEED } });
  }

  async function state(notificationId: string, deliveryId: string) {
    const [notification] = await handle.db.select().from(notifications).where(eq(notifications.id, notificationId));
    const [delivery] = await handle.db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, deliveryId));
    return { notification: notification!, delivery: delivery! };
  }

  for (const type of TYPES) {
    it(`${type}: cron, queue and delivery make one routing-only Expo send`, async () => {
      await runCron();
      const { message, notification } = await queuedOfType(type);
      await setTokens(notification.recipientUserId, [{ id: "x4c-3-live", token: "ExponentPushToken[x4c-live]" }]);
      mockExpo();

      const { batch, acked, retried } = batchOf(message);
      await handleReminderQueueBatch(batch, env());

      expect(acked).toEqual([message.deliveryId]);
      expect(retried).toEqual([]);
      expect(expoCalls).toHaveLength(1);
      const sent = expoCalls[0]!;
      expect(sent.to).toBe("ExponentPushToken[x4c-live]");
      // Routing only: the safe key set, the ids to open the right screen, no coaching detail.
      expect(Object.keys(sent.data).sort()).toEqual([...SAFE_PUSH_PAYLOAD_KEYS].sort());
      expect(sent.data).toMatchObject({
        notificationId: notification.id,
        notificationType: type,
        domainEntityId: notification.domainEntityId,
      });
      expect(sent.title).toBe("FitBud");
      // The lock-screen text is the type label only: no meal, plan, id or other coaching detail.
      expect(sent.body).toBe(labelFor("notification_type", type));
      expect(String(sent.body)).not.toContain(notification.domainEntityId);
      expect(expoUrls).toEqual([SEND_URL]);
      const after = await state(message.notificationId, message.deliveryId);
      expect(after.delivery).toMatchObject({ providerStatus: "accepted", deviceTokenId: "x4c-3-live" });
      expect(after.notification.state).toBe("delivered");
    }, 60_000);
  }

  it("inside quiet hours the delivery is deferred and nothing is sent", async () => {
    await runCron();
    const { message, notification } = await queuedOfType("meal_reminder");
    const [recipient] = await handle.db.select().from(users).where(eq(users.id, notification.recipientUserId));
    expect(recipient!.timezone).toBe("Asia/Kolkata");
    await setTokens(notification.recipientUserId, [{ id: "x4c-3-live", token: "ExponentPushToken[x4c-live]" }]);
    mockExpo();

    // The message waits in the queue past the start of the recipient's quiet hours.
    vi.setSystemTime(new Date(QUIET_AT));
    const { batch, acked } = batchOf(message);
    await handleReminderQueueBatch(batch, env());

    expect(acked).toEqual([message.deliveryId]);
    expect(expoCalls).toHaveLength(0);
    const after = await state(message.notificationId, message.deliveryId);
    expect(after.notification.state).toBe("deferred");
    expect(after.delivery).toMatchObject({ providerStatus: "skipped", failureCategory: "quiet_hours" });
  }, 60_000);

  it("push off and category off each suppress the send", async () => {
    await runCron();
    const meal = await queuedOfType("meal_reminder");
    const workout = await queuedOfType("workout_reminder");
    mockExpo();

    await setTokens(meal.notification.recipientUserId, [{ id: "x4c-meal", token: "ExponentPushToken[x4c-meal]" }]);
    await setPreferences(meal.notification.recipientUserId, { pushEnabled: false });
    await handleReminderQueueBatch(batchOf(meal.message).batch, env());

    await setTokens(workout.notification.recipientUserId, [
      { id: "x4c-workout", token: "ExponentPushToken[x4c-workout]" },
    ]);
    // Push back on, only the workout category off.
    await setPreferences(workout.notification.recipientUserId, { pushEnabled: true, workoutReminder: false });
    await handleReminderQueueBatch(batchOf(workout.message).batch, env());

    expect(expoCalls).toHaveLength(0);
    for (const item of [meal, workout]) {
      const after = await state(item.message.notificationId, item.message.deliveryId);
      expect(after.notification.state).toBe("suppressed");
      expect(after.delivery).toMatchObject({ providerStatus: "skipped", failureCategory: "preferences" });
    }
  }, 60_000);

  it("the same dedupe key twice sends once", async () => {
    await runCron();
    const { message, notification } = await queuedOfType("checkin_reminder");
    await setTokens(notification.recipientUserId, [{ id: "x4c-3-live", token: "ExponentPushToken[x4c-live]" }]);
    mockExpo();
    const queuedBefore = queued.length;

    await handleReminderQueueBatch(batchOf(message).batch, env());
    expect(expoCalls).toHaveLength(1);

    // The next cron tick sees the same expectation: same dedupe key, nothing new is queued.
    await runCron();
    expect(queued.filter((m) => m.notificationId === message.notificationId)).toHaveLength(1);
    expect(
      await handle.db.select().from(notifications).where(eq(notifications.dedupeKey, notification.dedupeKey)),
    ).toHaveLength(1);
    // Nothing at all is queued again: every reminder of the first tick is already persisted.
    expect(queued).toHaveLength(queuedBefore);

    // The same queue message delivered again after acceptance is not sent again.
    await handleReminderQueueBatch(batchOf(message).batch, env());
    expect(expoCalls).toHaveLength(1);
  }, 60_000);

  it("a revoked token is never tried, even as the fallback when the live token fails", async () => {
    await runCron();
    const { message, notification } = await queuedOfType("workout_reminder");
    await setTokens(notification.recipientUserId, [
      { id: "x4c-1-revoked", token: "ExponentPushToken[x4c-old]", status: "revoked" },
      { id: "x4c-3-live", token: "ExponentPushToken[x4c-live]" },
    ]);
    // The live token's send fails, so a revoked row would be the next one tried if it were selected.
    mockExpo(() => new Response("{}", { status: 503 }));

    const { batch, acked } = batchOf(message);
    await handleReminderQueueBatch(batch, env());

    expect(acked).toEqual([message.deliveryId]);
    expect(expoCalls.map((m) => m.to)).toEqual(["ExponentPushToken[x4c-live]"]);
    expect((await state(message.notificationId, message.deliveryId)).delivery).toMatchObject({
      providerStatus: "failed",
      failureCategory: "provider_error",
    });
    const [oldRow] = await handle.db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.id, "x4c-1-revoked"));
    expect(oldRow!.status).toBe("revoked");
  }, 60_000);

  it("a failing token does not stop the next token", async () => {
    await runCron();
    const { message, notification } = await queuedOfType("meal_reminder");
    await setTokens(notification.recipientUserId, [
      { id: "x4c-1-flaky", token: "ExponentPushToken[x4c-flaky]" },
      { id: "x4c-2-gone", token: "ExponentPushToken[x4c-gone]" },
      { id: "x4c-3-live", token: "ExponentPushToken[x4c-live]" },
    ]);
    mockExpo((to) => {
      if (to.includes("flaky")) return new Response("{}", { status: 503 });
      if (to.includes("gone")) {
        return { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } };
      }
      return { status: "ok", id: "t-live" };
    });

    const { batch, acked, retried } = batchOf(message);
    await handleReminderQueueBatch(batch, env());

    expect(expoCalls.map((m) => m.to)).toEqual([
      "ExponentPushToken[x4c-flaky]",
      "ExponentPushToken[x4c-gone]",
      "ExponentPushToken[x4c-live]",
    ]);
    expect(acked).toEqual([message.deliveryId]);
    expect(retried).toEqual([]);
    const after = await state(message.notificationId, message.deliveryId);
    expect(after.delivery).toMatchObject({
      providerStatus: "accepted",
      providerMessageId: "t-live",
      deviceTokenId: "x4c-3-live",
    });
    const status = async (id: string) =>
      (await handle.db.select().from(deviceTokens).where(eq(deviceTokens.id, id)))[0]!.status;
    // A transient provider error never revokes; DeviceNotRegistered does.
    expect(await status("x4c-1-flaky")).toBe("active");
    expect(await status("x4c-2-gone")).toBe("revoked");
    expect(await status("x4c-3-live")).toBe("active");
  }, 60_000);
});
