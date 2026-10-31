import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deviceTokens, notificationDeliveries, notifications, users } from "../db/schema.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import type { Env } from "../types.js";
import { checkExpoPushReceipts, handleScheduledPushReceipts } from "./push-receipts.js";
import { setTestDbOverride } from "../db/client.js";

const NOW = new Date("2026-10-31T10:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const ACCESS = "test-expo-access-token";

let handle: MemoryDbHandle;
let seq = 0;

async function seedUser(): Promise<string> {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  await handle.db.insert(users).values({
    id,
    firebaseUid: `firebase-${id}`,
    timezone: "Asia/Kolkata",
    createdAt: minutesAgo(10_000),
    updatedAt: minutesAgo(10_000),
  });
  return id;
}

/** One accepted push: user's active Expo token, the notification and its delivery. */
async function seedAccepted(input: {
  userId: string;
  acceptedMinutesAgo: number;
  ticketId: string | null;
  providerStatus?: "accepted" | "failed" | "queued" | "skipped";
  failureCategory?: string | null;
}) {
  const n = ++seq;
  const tokenId = `token-${n}`;
  await handle.db.insert(deviceTokens).values({
    id: tokenId,
    userId: input.userId,
    platform: "ios",
    provider: "fcm",
    token: `ExponentPushToken[device-${n}]`,
    installationId: `install-${n}`,
    status: "active",
    lastSeenAt: minutesAgo(2_000),
    createdAt: minutesAgo(2_000),
    updatedAt: minutesAgo(2_000),
  });
  const notificationId = `notification-${n}`;
  await handle.db.insert(notifications).values({
    id: notificationId,
    recipientUserId: input.userId,
    notificationType: "trainer_checkin_submitted",
    domainEntityType: "checkin",
    domainEntityId: `checkin-${n}`,
    state: "delivered",
    dedupeKey: `receipts-test:${n}`,
    createdAt: minutesAgo(input.acceptedMinutesAgo + 1),
  });
  const deliveryId = `delivery-${n}`;
  await handle.db.insert(notificationDeliveries).values({
    id: deliveryId,
    notificationId,
    deviceTokenId: tokenId,
    channel: "push",
    providerStatus: input.providerStatus ?? "accepted",
    providerMessageId: input.ticketId,
    failureCategory: input.failureCategory ?? null,
    attemptNumber: 1,
    acceptedAt: minutesAgo(input.acceptedMinutesAgo),
    createdAt: minutesAgo(input.acceptedMinutesAgo + 1),
    updatedAt: minutesAgo(input.acceptedMinutesAgo),
  });
  return { tokenId, notificationId, deliveryId };
}

async function delivery(id: string) {
  const [row] = await handle.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, id));
  return row!;
}
async function tokenStatus(id: string) {
  const [row] = await handle.db.select().from(deviceTokens).where(eq(deviceTokens.id, id));
  return row!.status;
}
async function notificationState(id: string) {
  const [row] = await handle.db.select().from(notifications).where(eq(notifications.id, id));
  return row!.state;
}

/** Mock getReceipts: answers from `receipts`, records requested ids. */
function receiptsFetch(receipts: Record<string, unknown>) {
  const requested: string[][] = [];
  const fn = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toBe("https://exp.host/--/api/v2/push/getReceipts");
    const ids = (JSON.parse(String(init!.body)) as { ids: string[] }).ids;
    requested.push(ids);
    const data: Record<string, unknown> = {};
    for (const id of ids) if (receipts[id]) data[id] = receipts[id];
    return Response.json({ data });
  });
  return { fn, requested };
}

const DNR = { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } };

beforeEach(async () => {
  handle = await createMemoryDb();
});

afterEach(() => {
  handle.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setTestDbOverride(null);
});

describe("checkExpoPushReceipts", () => {
  it("revokes DeviceNotRegistered tokens, records receipt errors without changing provider_status, ignores ok", async () => {
    const user = await seedUser();
    const gone = await seedAccepted({ userId: user, acceptedMinutesAgo: 30, ticketId: "ticket-gone" });
    const fine = await seedAccepted({ userId: user, acceptedMinutesAgo: 30, ticketId: "ticket-ok" });
    const big = await seedAccepted({ userId: user, acceptedMinutesAgo: 30, ticketId: "ticket-big" });
    const pending = await seedAccepted({ userId: user, acceptedMinutesAgo: 30, ticketId: "ticket-pending" });
    const { fn } = receiptsFetch({
      "ticket-gone": DNR,
      "ticket-ok": { status: "ok" },
      "ticket-big": { status: "error", details: { error: "MessageTooBig" } },
    });

    const result = await checkExpoPushReceipts(handle.db, { fetchImpl: fn, now: NOW, accessToken: ACCESS });

    expect(result).toEqual({ checked: 4, receiptErrors: 2, tokensRevoked: 1 });
    expect(await tokenStatus(gone.tokenId)).toBe("revoked");
    expect(await delivery(gone.deliveryId)).toMatchObject({
      providerStatus: "accepted",
      providerMessageId: "ticket-gone",
      failureCategory: "DeviceNotRegistered",
    });
    expect(await notificationState(gone.notificationId)).toBe("delivered");
    expect(await tokenStatus(fine.tokenId)).toBe("active");
    expect(await delivery(fine.deliveryId)).toMatchObject({ providerStatus: "accepted", failureCategory: null });
    expect(await tokenStatus(big.tokenId)).toBe("active");
    expect(await delivery(big.deliveryId)).toMatchObject({ providerStatus: "accepted", failureCategory: "MessageTooBig" });
    expect(await delivery(pending.deliveryId)).toMatchObject({ providerStatus: "accepted", failureCategory: null });
    expect((fn.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS}`);
  });

  it("only reads accepted deliveries 15 min to 24 h old with a ticket id and no recorded receipt error", async () => {
    const user = await seedUser();
    await seedAccepted({ userId: user, acceptedMinutesAgo: 14, ticketId: "too-new" });
    await seedAccepted({ userId: user, acceptedMinutesAgo: 15, ticketId: "edge-new" });
    await seedAccepted({ userId: user, acceptedMinutesAgo: 24 * 60, ticketId: "edge-old" });
    await seedAccepted({ userId: user, acceptedMinutesAgo: 24 * 60 + 1, ticketId: "too-old" });
    await seedAccepted({ userId: user, acceptedMinutesAgo: 60, ticketId: null });
    await seedAccepted({ userId: user, acceptedMinutesAgo: 60, ticketId: "failed", providerStatus: "failed" });
    await seedAccepted({ userId: user, acceptedMinutesAgo: 60, ticketId: "done", failureCategory: "MessageTooBig" });
    const { fn, requested } = receiptsFetch({});

    await checkExpoPushReceipts(handle.db, { fetchImpl: fn, now: NOW });

    expect(requested.flat().sort()).toEqual(["edge-new", "edge-old"]);
  });

  it("asks for receipts in chunks of at most 1,000 ids", async () => {
    const user = await seedUser();
    const tickets: string[] = [];
    for (let i = 0; i < 1_001; i += 1) {
      tickets.push(`ticket-${i}`);
      await seedAccepted({ userId: user, acceptedMinutesAgo: 60, ticketId: `ticket-${i}` });
    }
    const { fn, requested } = receiptsFetch({ "ticket-1000": DNR });

    const result = await checkExpoPushReceipts(handle.db, { fetchImpl: fn, now: NOW });

    expect(requested.map((ids) => ids.length)).toEqual([1_000, 1]);
    expect(requested.flat().sort()).toEqual([...tickets].sort());
    expect(result).toMatchObject({ checked: 1_001, receiptErrors: 1, tokensRevoked: 1 });
  }, 60_000);

  it("makes no request when nothing is due", async () => {
    const fn = vi.fn<typeof fetch>();
    expect(await checkExpoPushReceipts(handle.db, { fetchImpl: fn, now: NOW })).toEqual({
      checked: 0,
      receiptErrors: 0,
      tokensRevoked: 0,
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("a failed receipts request changes nothing", async () => {
    const user = await seedUser();
    const row = await seedAccepted({ userId: user, acceptedMinutesAgo: 30, ticketId: "ticket-x" });
    const fn = vi.fn<typeof fetch>(async () => new Response("{}", { status: 503 }));
    expect(await checkExpoPushReceipts(handle.db, { fetchImpl: fn, now: NOW })).toMatchObject({
      receiptErrors: 0,
      tokensRevoked: 0,
    });
    expect(await tokenStatus(row.tokenId)).toBe("active");
    expect((await delivery(row.deliveryId)).failureCategory).toBeNull();
  });
});

describe("handleScheduledPushReceipts", () => {
  function env(mode: Env["PUSH_PROVIDER_MODE"]): Env {
    return {
      DB: {} as D1Database,
      MEDIA: createMemoryR2Bucket(),
      FIREBASE_PROJECT_ID: "fitbud-local",
      SESSION_COOKIE_NAME: "fitbud_session",
      AUTH_MODE: "test",
      PUSH_PROVIDER_MODE: mode,
      MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    };
  }

  for (const mode of ["test", "fcm", undefined] as const) {
    it(`does nothing and never calls exp.host in ${mode ?? "unset"} mode`, async () => {
      const fetchSpy = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchSpy);
      expect(await handleScheduledPushReceipts(env(mode), NOW)).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});
