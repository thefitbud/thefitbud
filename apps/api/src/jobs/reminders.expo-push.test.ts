import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SAFE_PUSH_PAYLOAD_KEYS } from "@fitbud/contracts";
import { setTestDbOverride } from "../db/client.js";
import { deviceTokens, notificationDeliveries, notifications } from "../db/schema.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import type { Env } from "../types.js";
import { handleScheduledPushReceipts } from "./push-receipts.js";
import { handleReminderQueueBatch, handleScheduledReminders } from "./reminders.js";

/**
 * X4a on the demo seed: the cron enqueues a reminder, the queue consumer sends it
 * through a mocked Expo API, acceptance records the ticket id, a ticket
 * `DeviceNotRegistered` revokes that token at once, and a later receipt
 * `DeviceNotRegistered` revokes the accepting token.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const RUN_AT = "2026-10-26T09:45:00.000Z";
const ACCESS = "test-expo-access-token-x4a";
const DEAD = "ExponentPushToken[x4a-dead-device]";
const LIVE = "ExponentPushToken[x4a-live-device]";

type QueueMessage = { notificationId: string; deliveryId: string };

function env(mode: Env["PUSH_PROVIDER_MODE"], sent: QueueMessage[] = []): Env {
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
    PUSH_PROVIDER_MODE: mode,
    EXPO_ACCESS_TOKEN: ACCESS,
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

describe("expo push delivery (X4a)", () => {
  let handle: MemoryDbHandle;
  let logged: string[];

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(RUN_AT));
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
    logged = [];
    for (const method of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setTestDbOverride(null);
    handle.close();
  });

  /** Runs the cron, then gives the first queued reminder's recipient a dead and a live Expo token. */
  async function queuedReminderWithTokens() {
    const sent: QueueMessage[] = [];
    await handleScheduledReminders(env("expo", sent), new Date(RUN_AT));
    expect(sent.length).toBeGreaterThan(0);
    const message = sent[0]!;
    const [notification] = await handle.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, message.notificationId));
    const userId = notification!.recipientUserId;
    // No other active tokens, so the order below is the send order.
    await handle.db.update(deviceTokens).set({ status: "revoked" }).where(eq(deviceTokens.userId, userId));
    for (const [id, token] of [
      ["x4a-dead-token", DEAD],
      ["x4a-live-token", LIVE],
    ] as const) {
      await handle.db.insert(deviceTokens).values({
        id,
        userId,
        platform: "ios",
        provider: "fcm",
        token,
        installationId: `${id}-install`,
        status: "active",
        lastSeenAt: SEED,
        createdAt: SEED,
        updatedAt: SEED,
      });
    }
    return { message, notification: notification! };
  }

  async function tokenStatus(id: string) {
    const [row] = await handle.db.select().from(deviceTokens).where(eq(deviceTokens.id, id));
    return row!.status;
  }

  async function deliveryRow(id: string) {
    const [row] = await handle.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, id));
    return row!;
  }

  it("records the Expo ticket as acceptance, revokes a DeviceNotRegistered ticket's token, then revokes on a DeviceNotRegistered receipt", async () => {
    const { message, notification } = await queuedReminderWithTokens();
    const sends: Array<{ headers: Record<string, string>; body: Array<Record<string, unknown>> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        expect(String(url)).toBe("https://exp.host/--/api/v2/push/send");
        const body = JSON.parse(String(init!.body)) as Array<Record<string, unknown>>;
        sends.push({ headers: init!.headers as Record<string, string>, body });
        return Response.json({
          data: body.map((m) =>
            m.to === DEAD
              ? { status: "error", message: `"${DEAD}" is not registered`, details: { error: "DeviceNotRegistered" } }
              : { status: "ok", id: "expo-ticket-x4a-1" },
          ),
        });
      }),
    );

    const { batch, acked, retried } = batchOf(message);
    await handleReminderQueueBatch(batch, env("expo"));

    expect(acked).toEqual([message.deliveryId]);
    expect(retried).toEqual([]);
    expect(sends.map((s) => s.body[0]!.to)).toEqual([DEAD, LIVE]);
    for (const send of sends) {
      expect(send.headers.Authorization).toBe(`Bearer ${ACCESS}`);
      const [m] = send.body;
      expect(m!.sound).toBe("default");
      expect(m!.title).toBe("FitBud");
      expect(Object.keys(m!.data as object).sort()).toEqual([...SAFE_PUSH_PAYLOAD_KEYS].sort());
      expect(m!.data).toMatchObject({ notificationId: notification.id });
    }
    expect(await tokenStatus("x4a-dead-token")).toBe("revoked");
    expect(await tokenStatus("x4a-live-token")).toBe("active");
    expect(await deliveryRow(message.deliveryId)).toMatchObject({
      providerStatus: "accepted",
      providerMessageId: "expo-ticket-x4a-1",
      deviceTokenId: "x4a-live-token",
      failureCategory: null,
    });

    // 20 minutes later the receipt says the live device is gone too.
    const later = new Date(new Date(RUN_AT).getTime() + 20 * 60_000);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        expect(String(url)).toBe("https://exp.host/--/api/v2/push/getReceipts");
        expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS}`);
        const { ids } = JSON.parse(String(init!.body)) as { ids: string[] };
        expect(ids).toContain("expo-ticket-x4a-1");
        return Response.json({
          data: { "expo-ticket-x4a-1": { status: "error", details: { error: "DeviceNotRegistered" } } },
        });
      }),
    );
    const receipts = await handleScheduledPushReceipts(env("expo"), later);
    expect(receipts).toMatchObject({ receiptErrors: 1, tokensRevoked: 1 });
    expect(await tokenStatus("x4a-live-token")).toBe("revoked");
    expect(await deliveryRow(message.deliveryId)).toMatchObject({
      providerStatus: "accepted",
      failureCategory: "DeviceNotRegistered",
    });

    const text = logged.join("\n");
    for (const secret of [ACCESS, DEAD, LIVE]) expect(text).not.toContain(secret);
  }, 60_000);

  it("a provider error on every token fails the delivery without revoking", async () => {
    const { message } = await queuedReminderWithTokens();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("{}", { status: 503 })));
    const { batch, acked } = batchOf(message);
    await handleReminderQueueBatch(batch, env("expo"));
    expect(acked).toEqual([message.deliveryId]);
    expect(await deliveryRow(message.deliveryId)).toMatchObject({
      providerStatus: "failed",
      failureCategory: "provider_error",
    });
    expect(await tokenStatus("x4a-dead-token")).toBe("active");
    expect(await tokenStatus("x4a-live-token")).toBe("active");
  }, 60_000);

  for (const mode of ["test", undefined] as const) {
    it(`${mode ?? "unset"} mode uses the local double and never calls exp.host`, async () => {
      const { message } = await queuedReminderWithTokens();
      const fetchSpy = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchSpy);
      const { batch } = batchOf(message);
      await handleReminderQueueBatch(batch, env(mode));
      expect(fetchSpy).not.toHaveBeenCalled();
      const row = await deliveryRow(message.deliveryId);
      expect(row.providerStatus).toBe("accepted");
      expect(row.providerMessageId).toMatch(/^test-fcm-/);
      expect(row.deviceTokenId).toBe("x4a-dead-token");
    }, 60_000);
  }
});
