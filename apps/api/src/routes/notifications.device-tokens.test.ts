import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deviceTokens,
  notificationDeliveries,
  notifications,
} from "../db/schema.js";
import { app } from "../index.js";
import { deliverReminderMessage } from "../domain/reminders.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import {
  createTrainerSession,
  register,
  testEnv,
} from "../test-support/notification-routes.js";

async function createInvitation(cookie: string, suffix: string) {
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-dt-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `dt-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  expect(created.status).toBe(200);
  const body = (await created.json()) as { data: { token: string } };
  return body.data.token;
}

/** A trainer and an accepted trainee of theirs, with the trainee's bearer token. */
async function createCoachingPair(suffix: string) {
  const trainer = await createTrainerSession(`dt-coach-${suffix}@example.com`);
  const invitationToken = await createInvitation(trainer.cookie, suffix);
  const traineeToken = createTestIdToken(
    `dt-trainee-${suffix}`,
    `dt-trainee-${suffix}@example.com`,
  );
  const accept = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: invitationToken,
        timezone: "Asia/Kolkata",
      }),
    },
    testEnv(),
  );
  expect(accept.status).toBe(200);
  return { trainerCookie: trainer.cookie, traineeToken };
}

type DeviceTokenPayload = {
  data: {
    deviceToken: {
      id: string;
      userId: string;
      token: string;
      provider: string;
      platform: string;
      status: string;
      lastSeenAt: string;
    };
  };
};

/** Pins `nowIso()` so a test can prove a timestamp column was rewritten. */
function setNow(instant: string | null) {
  const globals = globalThis as { FITBUD_NOW?: string };
  if (instant === null) {
    delete globals.FITBUD_NOW;
    return;
  }
  globals.FITBUD_NOW = instant;
}

/** A delivery row pointing at `deviceTokenId`, like a push that was sent. */
async function recordDelivery(
  db: Db,
  input: { userId: string; deviceTokenId: string; suffix: string },
) {
  const notificationId = `notif-${input.suffix}`;
  const deliveryId = `delivery-${input.suffix}`;
  const now = new Date().toISOString();
  await db.insert(notifications).values({
    id: notificationId,
    recipientUserId: input.userId,
    coachingRelationshipId: null,
    notificationType: "workout_reminder",
    domainEntityType: "workout_assignment",
    domainEntityId: `assignment-${input.suffix}`,
    state: "delivered",
    dedupeKey: `dedupe-${input.suffix}`,
    createdAt: now,
  });
  await db.insert(notificationDeliveries).values({
    id: deliveryId,
    notificationId,
    deviceTokenId: input.deviceTokenId,
    channel: "push",
    providerStatus: "accepted",
    providerMessageId: `provider-${input.suffix}`,
    failureCategory: null,
    attemptNumber: 1,
    acceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return { notificationId, deliveryId };
}

/**
 * A queued workout reminder for `userId`, exactly as the cron leaves it for the
 * queue consumer: no attempt marker, nothing sent yet. `deliverReminderMessage`
 * then runs the real send path over it.
 */
async function queueDelivery(
  db: Db,
  input: { userId: string; suffix: string },
) {
  // The push payload schema requires uuids for the ids it routes on.
  const notificationId = crypto.randomUUID();
  const deliveryId = `queued-delivery-${input.suffix}`;
  const now = new Date().toISOString();
  await db.insert(notifications).values({
    id: notificationId,
    recipientUserId: input.userId,
    coachingRelationshipId: null,
    notificationType: "workout_reminder",
    domainEntityType: "workout_assignment",
    domainEntityId: crypto.randomUUID(),
    state: "queued",
    dedupeKey: `queued-dedupe-${input.suffix}`,
    createdAt: now,
  });
  await db.insert(notificationDeliveries).values({
    id: deliveryId,
    notificationId,
    deviceTokenId: null,
    channel: "push",
    providerStatus: "queued",
    providerMessageId: null,
    failureCategory: null,
    attemptNumber: 1,
    attemptStartedAt: null,
    acceptedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { notificationId, deliveryId };
}

describe("device tokens (X4b)", () => {
  let closeDb: (() => void) | undefined;
  let db: Db;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    setTestDbOverride(memory.db);
    db = memory.db;
    closeDb = memory.close;
  });

  afterEach(() => {
    setNow(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setTestDbOverride(null);
    closeDb?.();
  });

  it("accepts an Expo push token from a trainee", async () => {
    const { traineeToken } = await createCoachingPair("expo");
    const response = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[trainee-expo-token-1]",
        platform: "ios",
        installationId: "install-expo-1",
        provider: "expo",
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DeviceTokenPayload;
    expect(body.data.deviceToken.provider).toBe("expo");
    expect(body.data.deviceToken.status).toBe("active");
    expect(body.data.deviceToken.token).toBe(
      "ExponentPushToken[trainee-expo-token-1]",
    );

    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.id, body.data.deviceToken.id));
    expect(rows[0]?.provider).toBe("expo");
  });

  it("accepts an Expo push token from a trainer", async () => {
    const trainer = await createTrainerSession("dt-expo-trainer@example.com");
    const response = await register(
      { cookie: trainer.cookie },
      {
        token: "ExponentPushToken[trainer-expo-token-1]",
        platform: "android",
        installationId: "install-expo-trainer",
        provider: "expo",
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DeviceTokenPayload;
    expect(body.data.deviceToken.provider).toBe("expo");
  });

  it("defaults the provider to fcm for clients that omit it", async () => {
    const { traineeToken } = await createCoachingPair("default");
    const response = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "legacy-fcm-token-abcdefgh",
        platform: "android",
        installationId: "install-default",
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DeviceTokenPayload;
    expect(body.data.deviceToken.provider).toBe("fcm");
  });

  it("replaces the token of an existing installation instead of failing", async () => {
    const { traineeToken } = await createCoachingPair("reregister");
    setNow("2026-11-01T06:00:00.000Z");
    const first = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "legacy-fcm-token-reregister",
        platform: "android",
        installationId: "install-reregister",
        provider: "fcm",
      },
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as DeviceTokenPayload;
    const firstRow = (
      await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.id, firstBody.data.deviceToken.id))
    )[0]!;

    setNow("2026-11-01T07:30:00.000Z");
    const second = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[rotated-expo-token]",
        platform: "ios",
        installationId: "install-reregister",
        provider: "expo",
      },
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as DeviceTokenPayload;

    expect(secondBody.data.deviceToken.id).toBe(firstBody.data.deviceToken.id);
    expect(secondBody.data.deviceToken.token).toBe(
      "ExponentPushToken[rotated-expo-token]",
    );
    expect(secondBody.data.deviceToken.provider).toBe("expo");
    expect(secondBody.data.deviceToken.platform).toBe("ios");
    expect(secondBody.data.deviceToken.status).toBe("active");
    // Strictly later: the clock advanced between the two registrations, so this
    // fails if `lastSeenAt` (or `updatedAt`) is left at its stored value.
    expect(firstRow.lastSeenAt).toBe("2026-11-01T06:00:00.000Z");
    expect(secondBody.data.deviceToken.lastSeenAt).toBe(
      "2026-11-01T07:30:00.000Z",
    );
    expect(
      secondBody.data.deviceToken.lastSeenAt > firstRow.lastSeenAt,
    ).toBe(true);

    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, secondBody.data.deviceToken.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token).toBe("ExponentPushToken[rotated-expo-token]");
    expect(rows[0]?.updatedAt).toBe("2026-11-01T07:30:00.000Z");
    expect(rows[0]!.updatedAt > firstRow.updatedAt).toBe(true);
  });

  it("re-activates a revoked installation on re-registration", async () => {
    const { traineeToken } = await createCoachingPair("revoked");
    const first = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[revoked-then-back]",
        platform: "ios",
        installationId: "install-revoked",
        provider: "expo",
      },
    );
    expect(first.status).toBe(200);
    const remove = await app.request(
      "/notifications/device-tokens",
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ installationId: "install-revoked" }),
      },
      testEnv(),
    );
    expect(remove.status).toBe(200);

    const again = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[revoked-then-back-2]",
        platform: "ios",
        installationId: "install-revoked",
        provider: "expo",
      },
    );
    expect(again.status).toBe(200);
    const body = (await again.json()) as DeviceTokenPayload;
    expect(body.data.deviceToken.status).toBe("active");
    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, body.data.deviceToken.userId));
    expect(rows).toHaveLength(1);
  });

  it("moves a token to a new installation of the same user without duplicates", async () => {
    const { traineeToken } = await createCoachingPair("moved");
    const first = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[moved-token]",
        platform: "ios",
        installationId: "install-old",
        provider: "expo",
      },
    );
    expect(first.status).toBe(200);
    const second = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[new-installation-token]",
        platform: "ios",
        installationId: "install-new",
        provider: "expo",
      },
    );
    expect(second.status).toBe(200);

    // The same token now reports from the newer installation.
    const third = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[moved-token]",
        platform: "ios",
        installationId: "install-new",
        provider: "expo",
      },
    );
    expect(third.status).toBe(200);
    const body = (await third.json()) as DeviceTokenPayload;
    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, body.data.deviceToken.userId));
    const active = rows.filter((row) => row.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0]?.installationId).toBe("install-new");
    expect(active[0]?.token).toBe("ExponentPushToken[moved-token]");
    // The superseded registration is revoked and parked, never deleted.
    const superseded = rows.filter((row) => row.status === "revoked");
    expect(superseded).toHaveLength(1);
    expect(superseded[0]?.installationId).toMatch(/^revoked:/);
  });

  it("keeps delivery history when a token moves to a new installation", async () => {
    const { traineeToken } = await createCoachingPair("delivery");
    const old = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[delivery-moved-token]",
        platform: "ios",
        installationId: "install-delivery-old",
        provider: "expo",
      },
    );
    expect(old.status).toBe(200);
    const oldBody = (await old.json()) as DeviceTokenPayload;

    const current = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[delivery-other-token]",
        platform: "ios",
        installationId: "install-delivery-new",
        provider: "expo",
      },
    );
    expect(current.status).toBe(200);
    const currentBody = (await current.json()) as DeviceTokenPayload;

    // A push was already sent to the old installation's registration.
    const { deliveryId } = await recordDelivery(db, {
      userId: oldBody.data.deviceToken.userId,
      deviceTokenId: oldBody.data.deviceToken.id,
      suffix: "delivery-moved",
    });

    // App reinstalled: the same Expo token now reports the new installation id.
    const moved = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[delivery-moved-token]",
        platform: "ios",
        installationId: "install-delivery-new",
        provider: "expo",
      },
    );
    expect(moved.status).toBe(200);
    const movedBody = (await moved.json()) as DeviceTokenPayload;
    expect(movedBody.data.deviceToken.id).toBe(oldBody.data.deviceToken.id);
    expect(movedBody.data.deviceToken.status).toBe("active");

    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, movedBody.data.deviceToken.userId));
    const active = rows.filter((row) => row.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(oldBody.data.deviceToken.id);
    expect(active[0]?.installationId).toBe("install-delivery-new");
    expect(active[0]?.token).toBe("ExponentPushToken[delivery-moved-token]");

    // The replaced registration keeps its id and is revoked, not deleted.
    const superseded = rows.find(
      (row) => row.id === currentBody.data.deviceToken.id,
    );
    expect(superseded?.status).toBe("revoked");
    expect(superseded?.installationId).toMatch(/^revoked:/);

    // The delivery still resolves to the device token it was sent to.
    const deliveries = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, deliveryId));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.deviceTokenId).toBe(oldBody.data.deviceToken.id);
  });

  // D-W3-9 (Firoz, 2 Nov 2026) replaces X4b's 403 criterion: a token held by
  // another user is always reassigned to the caller, active or revoked, and
  // this route never answers DEVICE_TOKEN_OWNED. The test this block replaces
  // pinned that 403.
  describe("a token held by another user is reassigned (X4k, D-W3-9)", () => {
    const SHARED = "ExponentPushToken[shared-phone-expo-token]";

    it("reassigns a revoked token of another user to the new user", async () => {
      const a = await createCoachingPair("reassign-revoked-a");
      const b = await createCoachingPair("reassign-revoked-b");

      const first = await register(
        { bearer: a.traineeToken, role: "trainee" },
        {
          token: SHARED,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(first.status).toBe(200);
      const aBody = (await first.json()) as DeviceTokenPayload;

      // A's row is revoked while it still holds the token. This is the state
      // the sender leaves behind on a DeviceNotRegistered ticket and the state
      // of every row revoked before this change: `domain/reminders.ts` and
      // `jobs/push-receipts.ts` set `status` only. D-W3-9 reassigns it anyway.
      await db
        .update(deviceTokens)
        .set({ status: "revoked" })
        .where(eq(deviceTokens.id, aBody.data.deviceToken.id));
      const beforeHandover = (
        await db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.id, aBody.data.deviceToken.id))
      )[0];
      expect(beforeHandover?.token).toBe(SHARED);

      const second = await register(
        { bearer: b.traineeToken, role: "trainee" },
        {
          token: SHARED,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(second.status).toBe(200);
      const bBody = (await second.json()) as DeviceTokenPayload;
      expect(bBody.data.deviceToken.token).toBe(SHARED);
      expect(bBody.data.deviceToken.status).toBe("active");
      expect(bBody.data.deviceToken.userId).not.toBe(
        aBody.data.deviceToken.userId,
      );

      const holders = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.token, SHARED));
      expect(holders).toHaveLength(1);
      expect(holders[0]?.id).toBe(bBody.data.deviceToken.id);
      expect(holders[0]?.status).toBe("active");

      // A's row still exists, still revoked, and no longer holds the token.
      const aRow = (
        await db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.id, aBody.data.deviceToken.id))
      )[0];
      expect(aRow).toBeDefined();
      expect(aRow?.status).toBe("revoked");
      expect(aRow?.token).not.toBe(SHARED);
      expect(aRow?.token).toMatch(/^revoked:/);
    });

    it("releases the token when the user signs out of the device", async () => {
      const a = await createCoachingPair("signout-release-a");
      const b = await createCoachingPair("signout-release-b");
      const first = await register(
        { bearer: a.traineeToken, role: "trainee" },
        {
          token: SHARED,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(first.status).toBe(200);
      const aBody = (await first.json()) as DeviceTokenPayload;

      const remove = await app.request(
        "/notifications/device-tokens",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${a.traineeToken}`,
            "x-fitbud-role": "trainee",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ deviceTokenId: aBody.data.deviceToken.id }),
        },
        testEnv(),
      );
      expect(remove.status).toBe(200);

      // Signing out revokes the row and releases the token, so the unique
      // index is not held by a signed-out user. The row is kept, never deleted.
      const aRow = (
        await db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.id, aBody.data.deviceToken.id))
      )[0];
      expect(aRow).toBeDefined();
      expect(aRow?.status).toBe("revoked");
      expect(aRow?.token).toMatch(/^revoked:/);
      expect(
        await db.select().from(deviceTokens).where(eq(deviceTokens.token, SHARED)),
      ).toHaveLength(0);

      // The next person to sign in on this phone registers the same token.
      const second = await register(
        { bearer: b.traineeToken, role: "trainee" },
        {
          token: SHARED,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(second.status).toBe(200);
      const bBody = (await second.json()) as DeviceTokenPayload;
      expect(bBody.data.deviceToken.status).toBe("active");
      expect(bBody.data.deviceToken.token).toBe(SHARED);
    });

    it("reassigns an active token of another user and revokes their row", async () => {
      const a = await createCoachingPair("reassign-active-a");
      const b = await createCoachingPair("reassign-active-b");

      const first = await register(
        { bearer: a.traineeToken, role: "trainee" },
        {
          token: SHARED,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(first.status).toBe(200);
      const aBody = (await first.json()) as DeviceTokenPayload;

      // A push already went to A's registration. The foreign key
      // `notification_deliveries.device_token_id` has no ON DELETE clause and
      // the harness runs with foreign keys on, so a hard delete of A's row
      // here raises FOREIGN KEY constraint failed instead of passing quietly.
      const { deliveryId } = await recordDelivery(db, {
        userId: aBody.data.deviceToken.userId,
        deviceTokenId: aBody.data.deviceToken.id,
        suffix: "reassign-active",
      });

      // No delete in between: A is still active on this device.
      const second = await register(
        { bearer: b.traineeToken, role: "trainee" },
        {
          token: SHARED,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(second.status).toBe(200);
      const raw2 = await second.text();
      const bBody = JSON.parse(raw2) as DeviceTokenPayload;
      expect(bBody.data.deviceToken.status).toBe("active");
      expect(bBody.data.deviceToken.token).toBe(SHARED);
      expect(bBody.data.deviceToken.id).not.toBe(aBody.data.deviceToken.id);
      // The response describes the caller's own registration only: no trace of
      // the other user's row id or their parked sentinel token.
      expect(raw2).not.toContain(aBody.data.deviceToken.id);
      expect(raw2).not.toContain("revoked:");
      expect(bBody.data.deviceToken.userId).not.toBe(
        aBody.data.deviceToken.userId,
      );

      const aRow = (
        await db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.id, aBody.data.deviceToken.id))
      )[0];
      expect(aRow).toBeDefined();
      expect(aRow?.status).toBe("revoked");
      expect(aRow?.token).not.toBe(SHARED);
      expect(aRow?.token).toMatch(/^revoked:/);

      const holders = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.token, SHARED));
      expect(holders).toHaveLength(1);
      expect(holders[0]?.id).toBe(bBody.data.deviceToken.id);

      // A's delivery history is intact and still attributed to A's row.
      const deliveries = await db
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.id, deliveryId));
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.deviceTokenId).toBe(aBody.data.deviceToken.id);
    });

    it("stops pushes to the previous user on that device and sends to the new one", async () => {
      const a = await createCoachingPair("push-after-a");
      const b = await createCoachingPair("push-after-b");

      const first = await register(
        { bearer: a.traineeToken, role: "trainee" },
        {
          token: SHARED,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(first.status).toBe(200);
      const aBody = (await first.json()) as DeviceTokenPayload;

      const second = await register(
        { bearer: b.traineeToken, role: "trainee" },
        {
          token: SHARED,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(second.status).toBe(200);
      const bBody = (await second.json()) as DeviceTokenPayload;

      // Only the outbound Expo call is stubbed; the rest is the real send path
      // the reminder queue consumer runs.
      const sentTo: string[] = [];
      const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
        const body = JSON.parse(String(init!.body)) as { to: string }[];
        for (const message of body) sentTo.push(message.to);
        return Response.json({
          data: body.map(() => ({ status: "ok", id: "ticket-x4k" })),
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      // 15:00 UTC is 20:30 in Asia/Kolkata: outside the default quiet hours.
      const SEND_AT = "2026-11-02T15:00:00.000Z";

      const aQueued = await queueDelivery(db, {
        userId: aBody.data.deviceToken.userId,
        suffix: "push-after-a",
      });
      await deliverReminderMessage(db, aQueued, "expo", SEND_AT);

      // The previous user has no active device: nothing was handed to Expo.
      expect(sentTo).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
      const aDelivery = (
        await db
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.id, aQueued.deliveryId))
      )[0];
      expect(aDelivery?.providerStatus).toBe("skipped");
      expect(aDelivery?.failureCategory).toBe("no_device_token");

      const bQueued = await queueDelivery(db, {
        userId: bBody.data.deviceToken.userId,
        suffix: "push-after-b",
      });
      await deliverReminderMessage(db, bQueued, "expo", SEND_AT);

      // The new user owns the device, so their push goes to the token once.
      expect(sentTo).toEqual([SHARED]);
      const bDelivery = (
        await db
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.id, bQueued.deliveryId))
      )[0];
      expect(bDelivery?.providerStatus).toBe("accepted");
      expect(bDelivery?.deviceTokenId).toBe(bBody.data.deviceToken.id);
    });

    it("reassigns a token that is already shaped like a park sentinel", async () => {
      // `token` accepts any string of 8 to 4096 characters, so the sentinel
      // prefix is not reserved: a client can post `revoked:<id>` itself. If a
      // park were single-valued, parking a row whose token already equals its
      // own sentinel would write the value it already holds -- a no-op leaving
      // the row holding the token -- and the registration that follows would
      // fail on `device_tokens_token_uidx` with a 500.
      const a = await createCoachingPair("sentinel-shaped-a");
      const b = await createCoachingPair("sentinel-shaped-b");

      const first = await register(
        { bearer: a.traineeToken, role: "trainee" },
        {
          token: "ExponentPushToken[sentinel-shaped]",
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(first.status).toBe(200);
      const aBody = (await first.json()) as DeviceTokenPayload;
      const collidingToken = `revoked:${aBody.data.deviceToken.id}`;

      // A re-registers with a token that is exactly its own row's sentinel
      // shape. Same user, same installation, so this is X4b's update path.
      const posted = await register(
        { bearer: a.traineeToken, role: "trainee" },
        {
          token: collidingToken,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(posted.status).toBe(200);
      const postedBody = (await posted.json()) as DeviceTokenPayload;
      expect(postedBody.data.deviceToken.id).toBe(aBody.data.deviceToken.id);
      expect(postedBody.data.deviceToken.token).toBe(collidingToken);

      // B registers that same value. The park must move A's row off it.
      const second = await register(
        { bearer: b.traineeToken, role: "trainee" },
        {
          token: collidingToken,
          platform: "ios",
          installationId: "install-shared-phone",
          provider: "expo",
        },
      );
      expect(second.status).toBe(200);
      const bBody = (await second.json()) as DeviceTokenPayload;
      expect(bBody.data.deviceToken.status).toBe("active");
      expect(bBody.data.deviceToken.token).toBe(collidingToken);

      const holders = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.token, collidingToken));
      expect(holders).toHaveLength(1);
      expect(holders[0]?.id).toBe(bBody.data.deviceToken.id);
      expect(holders[0]?.status).toBe("active");

      const aRow = (
        await db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.id, aBody.data.deviceToken.id))
      )[0];
      expect(aRow).toBeDefined();
      expect(aRow?.status).toBe("revoked");
      expect(aRow?.token).not.toBe(collidingToken);
    });

    it("reassigns the constant test-mode token and installation id", async () => {
      // In AUTH_MODE=test the mobile client reports the same token and
      // installation id for every user of the build
      // (apps/mobile/src/notifications/routing.ts).
      const TEST_TOKEN = "ExponentPushToken[fitbud-mobile-local-token]";
      const TEST_INSTALL = "fitbud-mobile-local-install";
      const trainer = await createTrainerSession("dt-test-mode@example.com");
      const trainee = await createCoachingPair("test-mode");

      const asTrainer = await register(
        { cookie: trainer.cookie },
        {
          token: TEST_TOKEN,
          platform: "ios",
          installationId: TEST_INSTALL,
          provider: "expo",
        },
      );
      expect(asTrainer.status).toBe(200);
      const trainerBody = (await asTrainer.json()) as DeviceTokenPayload;

      const asTrainee = await register(
        { bearer: trainee.traineeToken, role: "trainee" },
        {
          token: TEST_TOKEN,
          platform: "ios",
          installationId: TEST_INSTALL,
          provider: "expo",
        },
      );
      expect(asTrainee.status).toBe(200);
      const traineeBody = (await asTrainee.json()) as DeviceTokenPayload;
      expect(traineeBody.data.deviceToken.status).toBe("active");
      expect(traineeBody.data.deviceToken.token).toBe(TEST_TOKEN);

      const holders = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.token, TEST_TOKEN));
      expect(holders).toHaveLength(1);
      expect(holders[0]?.id).toBe(traineeBody.data.deviceToken.id);
      expect(holders[0]?.status).toBe("active");

      const trainerRow = (
        await db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.id, trainerBody.data.deviceToken.id))
      )[0];
      expect(trainerRow?.status).toBe("revoked");
      expect(trainerRow?.token).toMatch(/^revoked:/);
    });

    it("hands the phone back: the first user registering again takes it over", async () => {
      const a = await createCoachingPair("handback-a");
      const b = await createCoachingPair("handback-b");
      const body = {
        token: SHARED,
        platform: "ios" as const,
        installationId: "install-shared-phone",
        provider: "expo" as const,
      };

      const aFirst = await register(
        { bearer: a.traineeToken, role: "trainee" },
        body,
      );
      expect(aFirst.status).toBe(200);
      const aBody = (await aFirst.json()) as DeviceTokenPayload;

      const bTurn = await register(
        { bearer: b.traineeToken, role: "trainee" },
        body,
      );
      expect(bTurn.status).toBe(200);
      const bBody = (await bTurn.json()) as DeviceTokenPayload;

      // The phone goes back to A, who signs in again.
      const aAgain = await register(
        { bearer: a.traineeToken, role: "trainee" },
        body,
      );
      expect(aAgain.status).toBe(200);
      const aAgainBody = (await aAgain.json()) as DeviceTokenPayload;
      expect(aAgainBody.data.deviceToken.userId).toBe(
        aBody.data.deviceToken.userId,
      );
      expect(aAgainBody.data.deviceToken.status).toBe("active");
      expect(aAgainBody.data.deviceToken.token).toBe(SHARED);

      const holders = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.token, SHARED));
      expect(holders).toHaveLength(1);
      expect(holders[0]?.userId).toBe(aBody.data.deviceToken.userId);
      expect(holders[0]?.status).toBe("active");

      const bRow = (
        await db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.id, bBody.data.deviceToken.id))
      )[0];
      expect(bRow).toBeDefined();
      expect(bRow?.status).toBe("revoked");
      expect(bRow?.token).toMatch(/^revoked:/);
    });
  });

  it("lets a trainee register and delete a device token", async () => {
    const { traineeToken } = await createCoachingPair("trainee-crud");
    const response = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[trainee-crud-token]",
        platform: "android",
        installationId: "install-trainee-crud",
        provider: "expo",
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DeviceTokenPayload;

    const remove = await app.request(
      "/notifications/device-tokens",
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceTokenId: body.data.deviceToken.id }),
      },
      testEnv(),
    );
    expect(remove.status).toBe(200);
    const removeBody = (await remove.json()) as { data: { revoked: number } };
    expect(removeBody.data.revoked).toBe(1);

    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.id, body.data.deviceToken.id));
    expect(rows[0]?.status).toBe("revoked");
  });

  it("returns 403 FORBIDDEN_ROLE when the client selects no role", async () => {
    // A user permitted both roles on mobile has no role until the client picks one.
    const inviter = await createTrainerSession("dt-inviter@example.com");
    const dual = await createTrainerSession("dt-dual@example.com");
    const invitationToken = await createInvitation(inviter.cookie, "dual");
    const accept = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dual.idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: invitationToken,
          timezone: "Asia/Kolkata",
        }),
      },
      testEnv(),
    );
    expect(accept.status).toBe(200);

    const response = await register(
      { bearer: dual.idToken },
      {
        token: "ExponentPushToken[no-role-token]",
        platform: "ios",
        installationId: "install-no-role",
        provider: "expo",
      },
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN_ROLE");
  });

  it("returns 401 for an unauthenticated registration", async () => {
    const response = await register(
      {},
      {
        token: "ExponentPushToken[anonymous-token]",
        platform: "ios",
        installationId: "install-anonymous",
        provider: "expo",
      },
    );
    expect(response.status).toBe(401);
  });
});
