import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDbOverride } from "../db/client.js";
import {
  deviceTokens,
  notificationDeliveries,
  notifications,
  scheduledJobs,
} from "../db/schema.js";
import { handleReminderQueueBatch, handleScheduledReminders } from "../jobs/reminders.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import type { Env } from "../types.js";

/**
 * X4i / D-W3-8: at-most-once push delivery on the demo seed. The cron evaluates real
 * coaching state, the queue consumer delivers through the production Expo sender, and
 * only the outbound call to exp.host and the one delivery write under test are forced
 * to fail. A trainee can be sent a reminder once or not at all, never twice.
 *
 * 15:00 UTC is 20:30 in Asia/Kolkata: after the workout and meal reminder times and
 * before the 22:00 quiet hours start, so trainee reminders are due.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const RUN_AT = "2026-10-26T15:00:00.000Z";
const LIVE_TOKEN = "ExponentPushToken[x4i-live]";

type QueueMessage = { notificationId: string; deliveryId: string };
type ExpoMessage = Record<string, unknown> & { to: string; data: Record<string, unknown> };
type DeliveryValues = Partial<typeof notificationDeliveries.$inferInsert>;

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
    EXPO_ACCESS_TOKEN: "test-expo-access-token-x4i",
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

describe("push delivery is at-most-once on queue retries (X4i)", () => {
  let handle: MemoryDbHandle;
  let queued: QueueMessage[];
  let expoCalls: ExpoMessage[];

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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setTestDbOverride(null);
    handle.close();
  });

  /** Mocks only the outbound Expo call. */
  function mockExpo(reply: () => Response | Record<string, unknown> = () => ({ status: "ok", id: "x4i-ticket" })) {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        const body = JSON.parse(String(init!.body)) as ExpoMessage[];
        expoCalls.push(...body);
        const answer = reply();
        if (answer instanceof Response) return answer;
        return Response.json({ data: body.map(() => answer) });
      }),
    );
  }

  /**
   * Forces exactly one delivery write to fail, the way a D1 hiccup would: the
   * update on `notification_deliveries` whose values match the predicate throws.
   * Returns a function that lifts the injection again.
   */
  function failDeliveryWrite(matches: (values: DeliveryValues) => boolean): () => void {
    const realUpdate = handle.db.update.bind(handle.db);
    let active = true;
    type UpdateFn = typeof handle.db.update;
    type SetBuilder = { set: (values: DeliveryValues) => unknown };
    vi.spyOn(handle.db, "update").mockImplementation(((table: Parameters<UpdateFn>[0]) => {
      const builder = realUpdate(table) as unknown as SetBuilder;
      if (table !== notificationDeliveries) return builder as never;
      const realSet = builder.set.bind(builder);
      builder.set = (values: DeliveryValues) => {
        if (active && matches(values)) {
          throw new Error("D1_ERROR: forced delivery write failure");
        }
        return realSet(values);
      };
      return builder as never;
    }) as UpdateFn);
    return () => {
      active = false;
    };
  }

  async function runCron() {
    await handleScheduledReminders(env(queued), new Date(RUN_AT));
  }

  /** The first queued reminder, with its stored notification, and one live token for its recipient. */
  async function firstQueuedReminder() {
    const message = queued[0];
    if (!message) throw new Error(`the cron queued no reminder on the demo seed at ${RUN_AT}`);
    const [notification] = await handle.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, message.notificationId));
    const recipientUserId = notification!.recipientUserId;
    await handle.db.delete(deviceTokens).where(eq(deviceTokens.userId, recipientUserId));
    await handle.db.insert(deviceTokens).values({
      id: "x4i-live-token",
      userId: recipientUserId,
      platform: "android",
      provider: "expo",
      token: LIVE_TOKEN,
      installationId: "x4i-live-token-install",
      status: "active",
      lastSeenAt: SEED,
      createdAt: SEED,
      updatedAt: SEED,
    });
    return { message, notification: notification! };
  }

  async function state(message: QueueMessage) {
    const [notification] = await handle.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, message.notificationId));
    const [delivery] = await handle.db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, message.deliveryId));
    return { notification: notification!, delivery: delivery! };
  }

  async function job(dedupeKey: string) {
    const [row] = await handle.db
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.dedupeKey, `deliver:${dedupeKey}`));
    return row;
  }

  it("the normal path sends once, marks the attempt and records acceptance", async () => {
    await runCron();
    const { message, notification } = await firstQueuedReminder();
    mockExpo();

    const { batch, acked, retried } = batchOf(message);
    await handleReminderQueueBatch(batch, env());

    expect(expoCalls.map((m) => m.to)).toEqual([LIVE_TOKEN]);
    expect(acked).toEqual([message.deliveryId]);
    expect(retried).toEqual([]);
    const after = await state(message);
    expect(after.delivery).toMatchObject({
      providerStatus: "accepted",
      providerMessageId: "x4i-ticket",
      deviceTokenId: "x4i-live-token",
      failureCategory: null,
    });
    // The marker is kept: it is the record that this delivery was attempted.
    expect(after.delivery.attemptStartedAt).toBe(RUN_AT);
    expect(after.notification.state).toBe("delivered");
    expect(await job(notification.dedupeKey)).toMatchObject({ state: "completed" });
  }, 60_000);

  it("provider accepted but the acceptance write fails: the retry sends nothing and records uncertain", async () => {
    await runCron();
    const { message, notification } = await firstQueuedReminder();
    mockExpo();
    const lift = failDeliveryWrite((values) => values.providerStatus === "accepted");

    const first = batchOf(message);
    await handleReminderQueueBatch(first.batch, env());

    // The push went out, the acceptance write failed, so the queue retries the message.
    expect(expoCalls).toHaveLength(1);
    expect(first.retried).toEqual([message.deliveryId]);
    expect(first.acked).toEqual([]);
    const between = await state(message);
    expect(between.delivery.providerStatus).toBe("queued");
    expect(between.delivery.attemptStartedAt).toBe(RUN_AT);

    lift();
    const second = batchOf(message);
    await handleReminderQueueBatch(second.batch, env());

    // The whole point: no second push for the same reminder.
    expect(expoCalls).toHaveLength(1);
    expect(second.acked).toEqual([message.deliveryId]);
    const after = await state(message);
    expect(after.delivery).toMatchObject({
      providerStatus: "uncertain",
      failureCategory: "unknown_provider_outcome",
      providerMessageId: null,
      acceptedAt: null,
    });
    // Neither delivered nor failed is known, so the notification state is not invented.
    expect(after.notification.state).toBe("queued");
    expect(await job(notification.dedupeKey)).toMatchObject({
      state: "failed",
      lastErrorCategory: "unknown_provider_outcome",
    });

    // A later redelivery of the same message is still not sent.
    const third = batchOf(message);
    await handleReminderQueueBatch(third.batch, env());
    expect(expoCalls).toHaveLength(1);
    expect(third.acked).toEqual([message.deliveryId]);
    expect((await state(message)).delivery.providerStatus).toBe("uncertain");
  }, 60_000);

  it("when the attempt marker cannot be written nothing is sent and the message retries", async () => {
    await runCron();
    const { message } = await firstQueuedReminder();
    mockExpo();
    const lift = failDeliveryWrite(
      (values) => values.attemptStartedAt === RUN_AT && values.providerStatus === undefined,
    );

    const first = batchOf(message);
    await handleReminderQueueBatch(first.batch, env());

    expect(expoCalls).toEqual([]);
    expect(first.retried).toEqual([message.deliveryId]);
    const between = await state(message);
    expect(between.delivery.providerStatus).toBe("queued");
    expect(between.delivery.attemptStartedAt).toBeNull();
    expect(between.notification.state).toBe("queued");

    // Nothing was sent, so the retry is free to make a clean first attempt.
    lift();
    const second = batchOf(message);
    await handleReminderQueueBatch(second.batch, env());
    expect(expoCalls.map((m) => m.to)).toEqual([LIVE_TOKEN]);
    expect(second.acked).toEqual([message.deliveryId]);
    expect((await state(message)).delivery).toMatchObject({ providerStatus: "accepted" });
  }, 60_000);

  it("a provider error is recorded as failed, frees the marker, and the retry sends exactly once more", async () => {
    await runCron();
    const { message } = await firstQueuedReminder();
    let refuse = true;
    mockExpo(() => (refuse ? new Response("{}", { status: 503 }) : { status: "ok", id: "x4i-ticket-2" }));

    const first = batchOf(message);
    await handleReminderQueueBatch(first.batch, env());

    expect(expoCalls).toHaveLength(1);
    expect(first.acked).toEqual([message.deliveryId]);
    const between = await state(message);
    expect(between.delivery).toMatchObject({
      providerStatus: "failed",
      failureCategory: "provider_error",
    });
    // The provider answered and refused: no attempt is in flight, so the marker is free.
    expect(between.delivery.attemptStartedAt).toBeNull();

    refuse = false;
    const second = batchOf(message);
    await handleReminderQueueBatch(second.batch, env());

    expect(expoCalls).toHaveLength(2);
    expect(second.acked).toEqual([message.deliveryId]);
    expect((await state(message)).delivery).toMatchObject({
      providerStatus: "accepted",
      providerMessageId: "x4i-ticket-2",
    });
  }, 60_000);

  it("two queue deliveries of the same message race and only one push goes out", async () => {
    await runCron();
    const { message } = await firstQueuedReminder();
    mockExpo();

    const a = batchOf(message);
    const b = batchOf(message);
    await Promise.all([
      handleReminderQueueBatch(a.batch, env()),
      handleReminderQueueBatch(b.batch, env()),
    ]);

    expect(expoCalls).toHaveLength(1);
    expect([...a.acked, ...b.acked]).toEqual([message.deliveryId, message.deliveryId]);
    const after = await state(message);
    expect(["accepted", "uncertain"]).toContain(after.delivery.providerStatus);
  }, 60_000);
});
