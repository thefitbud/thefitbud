import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activityNudgeDedupeKey,
  addDaysToLocalDate,
  dailySummaryDedupeKey,
  deferredReminderDedupeKey,
  formatLocalDate,
  mealReminderDedupeKey,
  pushPayloadHasOnlySafeKeys,
  weekdayFromLocalDate,
  workoutReminderDedupeKey,
  WORKOUT_REMINDER_SLOT,
} from "@fitbud/core";
import * as schema from "../db/schema.js";
import { pushPayloadSchema } from "@fitbud/contracts";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { routingPayloadForNotification } from "../lib/push-provider.js";
import { nowIso } from "../lib/crypto.js";
import type { Env } from "../types.js";

const KOLKATA_TZ = "Asia/Kolkata";

/** Wall-clock time on `localDate` in Asia/Kolkata, as a UTC ISO instant. */
function istWallClockToUtc(localDate: string, hours: number, minutes: number): string {
  const [year, month, day] = localDate.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const istOffsetMinutes = 5 * 60 + 30;
  const utcMs = utcMidnight + (hours * 60 + minutes - istOffsetMinutes) * 60_000;
  return new Date(utcMs).toISOString();
}

function dubaiWallClockToUtc(localDate: string, hours: number, minutes: number): string {
  const [year, month, day] = localDate.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const dubaiOffsetMinutes = 4 * 60;
  const utcMs = utcMidnight + (hours * 60 + minutes - dubaiOffsetMinutes) * 60_000;
  return new Date(utcMs).toISOString();
}


import { createMemoryDb as createSharedMemoryDb } from "../test-support/memory-db.js";

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const handle = await createSharedMemoryDb();
  return { db: handle.db, close: handle.close };
}

function dummyD1(): D1Database {
  return {
    prepare() {
      throw new Error("D1 should not be used when test DB override is set");
    },
    dump: async () => new ArrayBuffer(0),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function testEnv(): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    PUSH_PROVIDER_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

async function createTrainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const sessionResponse = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(sessionResponse.status).toBe(200);
  const setCookie = sessionResponse.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return { cookie: setCookie!.split(";")[0]! };
}

async function reachActiveCheckinConfig(suffix: string) {
  const trainer = await createTrainerSession(`push-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-push-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `push-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `push-trainee-${suffix}`,
    `push-trainee-${suffix}@example.com`,
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
        token: createdBody.data.token,
        timezone: "Asia/Kolkata",
      }),
    },
    testEnv(),
  );
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string } };
  };
  const relationshipId = acceptBody.data.relationship.id;

  await app.request(
    `/onboarding/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: 0,
        answers: {
          goals: "Consistency",
          relevant_history: "None",
          preferences: "Home",
          schedule: "Mornings",
          limitations: "None",
        },
      }),
    },
    testEnv(),
  );
  await app.request(
    `/onboarding/relationships/${relationshipId}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
        "Idempotency-Key": `submit-push-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  await app.request(
    `/onboarding/relationships/${relationshipId}/review`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-push-${suffix}`,
      },
      body: JSON.stringify({ outcome: "coaching_ready" }),
    },
    testEnv(),
  );
  await app.request(
    `/configurations/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: 0,
        goalShort: "Push reminders",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 2,
          confirmationWindowHours: 24,
          photoRequirement: "none",
        },
        checkin: { cadence: "weekly", dueWindowHours: 48 },
        tracking: {
          requireBodyWeight: false,
          requireProgressPhotos: false,
          requireSessionRpe: false,
        },
      }),
    },
    testEnv(),
  );
  await app.request(
    `/configurations/relationships/${relationshipId}/configure`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `cfg-push-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  await app.request(
    `/configurations/relationships/${relationshipId}/activate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `act-push-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 2 }),
    },
    testEnv(),
  );

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
    today: formatLocalDate(new Date(), "Asia/Kolkata"),
  };
}

describe("notifications and reminders (D4)", () => {
  let closeDb: (() => void) | undefined;
  let db: Db;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    setTestDbOverride(memory.db);
    db = memory.db;
    closeDb = memory.close;
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb?.();
  });

  it("returns 401 for unauthenticated device token registration", async () => {
    const response = await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "ios",
          token: "fcm-test-token-abcdefgh",
          installationId: "install-1",
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("registers a device token owned by the authenticated trainee", async () => {
    const { traineeToken } = await reachActiveCheckinConfig("token");
    const response = await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "ios",
          token: "fcm-test-token-abcdefgh",
          installationId: "install-token-1",
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { deviceToken: { userId: string; status: string; token: string } };
    };
    expect(body.data.deviceToken.status).toBe("active");
    expect(body.data.deviceToken.token).toBe("fcm-test-token-abcdefgh");

    const me = await app.request(
      "/me",
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const meBody = (await me.json()) as { data: { userId: string } };
    expect(body.data.deviceToken.userId).toBe(meBody.data.userId);
  });

  it("rejects registering another user's device token", async () => {
    const a = await reachActiveCheckinConfig("own-a");
    const b = await reachActiveCheckinConfig("own-b");

    const first = await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${a.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "android",
          token: "shared-fcm-token-xyz12345",
          installationId: "install-a",
        }),
      },
      testEnv(),
    );
    expect(first.status).toBe(200);

    const second = await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${b.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "android",
          token: "shared-fcm-token-xyz12345",
          installationId: "install-b",
        }),
      },
      testEnv(),
    );
    expect(second.status).toBe(403);
  });

  it("evaluates due check-in reminders with dedupe and safe payloads; provider acceptance ≠ completion", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("eval");

    await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "ios",
          token: "fcm-eval-token-abcdefgh",
          installationId: "install-eval",
        }),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quietHoursStart: "12:00",
          quietHoursEnd: "12:01",
        }),
      },
      testEnv(),
    );

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-push-eval",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    expect(scheduled.status).toBe(200);
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string; recordStatus: string } };
    };
    expect(scheduledBody.data.checkin.recordStatus).toBe("draft");

    const firstEval = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(firstEval.status).toBe(200);
    const firstBody = (await firstEval.json()) as {
      data: {
        notificationsCreated: number;
        notificationsDeduped: number;
        deliveriesEnqueued: number;
      };
    };
    expect(firstBody.data.notificationsCreated).toBeGreaterThanOrEqual(1);
    expect(firstBody.data.deliveriesEnqueued).toBeGreaterThanOrEqual(1);

    const secondEval = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(secondEval.status).toBe(200);
    const secondBody = (await secondEval.json()) as {
      data: {
        notificationsCreated: number;
        notificationsDeduped: number;
      };
    };
    expect(secondBody.data.notificationsCreated).toBe(0);
    expect(secondBody.data.notificationsDeduped).toBeGreaterThanOrEqual(1);

    const listed = await app.request(
      "/notifications",
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const listedBody = (await listed.json()) as {
      data: {
        items: Array<{
          id: string;
          type: string;
          domainEntityId: string;
          dedupeKey: string;
          createdAt: string;
          domainEntityType: string;
        }>;
      };
    };
    const reminder = listedBody.data.items.find(
      (item) => item.domainEntityId === scheduledBody.data.checkin.id,
    );
    expect(reminder).toBeTruthy();
    expect(reminder!.type).toBe("checkin_reminder");
    expect(reminder!.dedupeKey).toBe(
      `checkin_reminder:${scheduledBody.data.checkin.id}`,
    );

    const payload = routingPayloadForNotification({
      notificationId: reminder!.id,
      notificationType: "checkin_reminder",
      domainEntityType: "checkin",
      domainEntityId: reminder!.domainEntityId,
      createdAt: reminder!.createdAt,
    });
    expect(pushPayloadSchema.parse(payload)).toEqual(payload);
    expect(pushPayloadHasOnlySafeKeys(payload)).toBe(true);
    expect(payload).not.toHaveProperty("answers");
    expect(payload).not.toHaveProperty("trainerNote");
    expect(payload).not.toHaveProperty("body");

    const deliveries = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.notificationId, reminder!.id));
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0]!.providerStatus).toBe("accepted");
    expect(deliveries[0]!.acceptedAt).toBeTruthy();

    // Provider acceptance must not complete the check-in workflow.
    const checkinRows = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, scheduledBody.data.checkin.id));
    expect(checkinRows[0]!.recordStatus).toBe("draft");
  });

  it("lets the trainer change reminder rules and rejects the trainee", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("rules");
    const traineePut = await app.request(
      `/notifications/relationships/${relationshipId}/reminder-rules`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rules: [{ reminderType: "checkin_reminder", enabled: false }],
        }),
      },
      testEnv(),
    );
    expect(traineePut.status).toBe(403);
    const traineeBody = (await traineePut.json()) as { error: { code: string } };
    expect(traineeBody.error.code).toBe("FORBIDDEN_ROLE");

    const traineeGet = await app.request(
      `/notifications/relationships/${relationshipId}/reminder-rules`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(traineeGet.status).toBe(200);

    const trainerPut = await app.request(
      `/notifications/relationships/${relationshipId}/reminder-rules`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rules: [{ reminderType: "checkin_reminder", enabled: false }],
        }),
      },
      testEnv(),
    );
    expect(trainerPut.status).toBe(200);
    const trainerBody = (await trainerPut.json()) as {
      data: { items: Array<{ reminderType: string; enabled: boolean }> };
    };
    expect(
      trainerBody.data.items.find((item) => item.reminderType === "checkin_reminder")
        ?.enabled,
    ).toBe(false);

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-rules-off",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    expect(scheduled.status).toBe(200);
    const checkinId = (
      (await scheduled.json()) as { data: { checkin: { id: string } } }
    ).data.checkin.id;

    const evaluated = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(evaluated.status).toBe(200);
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, checkinId));
    expect(rows).toHaveLength(0);
  });

  it("defers quiet-hour reminders without consuming the delivery key, then delivers the same reminder", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("quiet");
    await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "ios",
          token: "fcm-quiet-token-abcdefgh",
          installationId: "install-quiet",
        }),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
        }),
      },
      testEnv(),
    );
    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-quiet",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    const checkinId = (
      (await scheduled.json()) as { data: { checkin: { id: string } } }
    ).data.checkin.id;
    const deliveryKey = `checkin_reminder:${checkinId}`;
    const duringQuietNow = istWallClockToUtc(today, 3, 0);

    const first = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: duringQuietNow }),
      },
      testEnv(),
    );
    expect(first.status).toBe(200);
    const duringQuiet = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, checkinId));
    expect(duringQuiet).toHaveLength(1);
    expect(duringQuiet[0]!.state).toBe("deferred");
    expect(duringQuiet[0]!.dedupeKey).toBe(deferredReminderDedupeKey(deliveryKey));
    expect(duringQuiet[0]!.dedupeKey).not.toBe(deliveryKey);

    const second = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: duringQuietNow }),
      },
      testEnv(),
    );
    expect(second.status).toBe(200);
    const stillDeferred = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, checkinId));
    expect(stillDeferred).toHaveLength(1);
    expect(stillDeferred[0]!.state).toBe("deferred");

    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quietHoursStart: "04:00", quietHoursEnd: "04:01" }),
      },
      testEnv(),
    );
    const third = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 5, 0) }),
      },
      testEnv(),
    );
    expect(third.status).toBe(200);
    const delivered = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, checkinId));
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.dedupeKey).toBe(deliveryKey);
    expect(delivered[0]!.state).toBe("delivered");
    const checkin = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, checkinId));
    expect(checkin[0]!.recordStatus).toBe("draft");
  });

  it("keeps a category-off reminder suppressed when the category is turned back on", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("category");
    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ categories: { checkinReminder: false } }),
      },
      testEnv(),
    );
    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-category",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    const checkinId = (
      (await scheduled.json()) as { data: { checkin: { id: string } } }
    ).data.checkin.id;
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ categories: { checkinReminder: true } }),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, checkinId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("suppressed");
    expect(rows[0]!.dedupeKey).toBe(`checkin_reminder:${checkinId}`);
    const deliveries = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.notificationId, rows[0]!.id));
    expect(deliveries).toHaveLength(0);
  });

  it("sends no automatic reminder or nudge after the relationship ends", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveCheckinConfig("ended-rem");
    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-ended-rem",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    const checkinId = (
      (await scheduled.json()) as { data: { checkin: { id: string } } }
    ).data.checkin.id;
    const endedAt = new Date().toISOString();
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt, updatedAt: endedAt })
      .where(eq(schema.coachingRelationships.id, relationshipId));

    const evaluated = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(evaluated.status).toBe(200);
    const reminders = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, checkinId));
    expect(reminders).toHaveLength(0);

    const nudge = await app.request(
      `/notifications/relationships/${relationshipId}/nudges`,
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ activityType: "checkin", activityId: checkinId }),
      },
      testEnv(),
    );
    expect(nudge.status).toBe(409);
    const nudgeBody = (await nudge.json()) as { error: { code: string } };
    expect(nudgeBody.error.code).toBe("RELATIONSHIP_ENDED");
    const checkin = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, checkinId));
    expect(checkin[0]!.recordStatus).toBe("draft");
  });

  it("applies meal and workout clocks, suppresses logged items, and summarizes the day", async () => {
    const { trainerCookie, traineeToken, relationshipId } =
      await reachActiveCheckinConfig("clocks");
    const localDate = addDaysToLocalDate(formatLocalDate(new Date(), KOLKATA_TZ), 1);
    const weekday = weekdayFromLocalDate(localDate);
    await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "ios",
          token: "fcm-clock-token-abcdefgh",
          installationId: "install-clock",
        }),
      },
      testEnv(),
    );
    const plan = await app.request(
      `/plans/relationships/${relationshipId}`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-clocks",
        },
        body: JSON.stringify({
          title: "Clock plan",
          content: {
            workoutDays: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                order: 1,
                name: "Strength",
                weekday,
                exercises: [
                  {
                    id: "22222222-2222-4222-8222-222222222222",
                    order: 1,
                    name: "Squat",
                    instructions: null,
                    setTargets: [
                      {
                        id: "33333333-3333-4333-8333-333333333333",
                        order: 1,
                        reps: 5,
                        loadLabel: "60kg",
                        rpe: null,
                      },
                    ],
                  },
                ],
              },
            ],
            mealPrescriptions: [
              {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
                order: 1,
                name: "Breakfast",
                mealType: "breakfast",
                applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
                localTime: "08:00",
                scheduleHint: null,
                instructions: null,
                photoRequired: false,
              },
              {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
                order: 2,
                name: "Lunch",
                mealType: "lunch",
                applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
                localTime: null,
                scheduleHint: "Midday",
                instructions: null,
                photoRequired: false,
              },
            ],
          },
        }),
      },
      testEnv(),
    );
    expect(plan.status, await plan.clone().text()).toBe(201);
    const planBody = (await plan.json()) as {
      data: { plan: { id: string }; version: { id: string; recordVersion: number } };
    };
    const published = await app.request(
      `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "pub-clocks",
        },
        body: JSON.stringify({
          expectedRecordVersion: planBody.data.version.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(published.status, await published.clone().text()).toBe(200);
    const generateBody = JSON.stringify({ fromDate: localDate, toDate: localDate });
    for (const [path, key] of [
      [`/workouts/relationships/${relationshipId}/assignments/generate`, "gen-wo-clock"],
      [`/meals/relationships/${relationshipId}/assignments/generate`, "gen-meal-clock"],
    ] as const) {
      const generated = await app.request(
        path,
        {
          method: "POST",
          headers: {
            Cookie: trainerCookie,
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: generateBody,
        },
        testEnv(),
      );
      expect(generated.status, await generated.clone().text()).toBe(200);
    }
    const workouts = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${localDate}&toDate=${localDate}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const workoutId = (
      (await workouts.json()) as { data: { items: Array<{ id: string }> } }
    ).data.items[0]!.id;
    const meals = await app.request(
      `/meals/relationships/${relationshipId}/assignments?fromDate=${localDate}&toDate=${localDate}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const mealItems = (
      (await meals.json()) as {
        data: { items: Array<{ id: string; mealName: string }> };
      }
    ).data.items;
    const breakfast = mealItems.find((item) => item.mealName === "Breakfast")!;
    const lunch = mealItems.find((item) => item.mealName === "Lunch")!;

    async function evaluateAt(now: string) {
      const response = await app.request(
        "/notifications/reminders/evaluate",
        {
          method: "POST",
          headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
          body: JSON.stringify({ now }),
        },
        testEnv(),
      );
      expect(response.status).toBe(200);
    }

    await evaluateAt(istWallClockToUtc(localDate, 5, 0));
    const early = await db.select().from(schema.notifications);
    expect(early.map((row) => row.dedupeKey)).not.toContain(
      workoutReminderDedupeKey(workoutId, WORKOUT_REMINDER_SLOT),
    );

    await evaluateAt(istWallClockToUtc(localDate, 8, 45));
    const midMorning = await db.select().from(schema.notifications);
    const keys = midMorning.map((row) => row.dedupeKey);
    expect(keys).toContain(mealReminderDedupeKey(breakfast.id, "after"));
    expect(keys.some((key) => key.includes(lunch.id))).toBe(false);

    await evaluateAt(istWallClockToUtc(localDate, 19, 14));
    const beforeWorkoutNudge = await db.select().from(schema.notifications);
    expect(beforeWorkoutNudge.map((row) => row.dedupeKey)).not.toContain(
      workoutReminderDedupeKey(workoutId, WORKOUT_REMINDER_SLOT),
    );
    await evaluateAt(istWallClockToUtc(localDate, 19, 15));
    const eveningWorkout = await db.select().from(schema.notifications);
    expect(eveningWorkout.map((row) => row.dedupeKey)).toContain(
      workoutReminderDedupeKey(workoutId, WORKOUT_REMINDER_SLOT),
    );

    const beforeNudge = await db
      .select()
      .from(schema.workoutAssignments)
      .where(eq(schema.workoutAssignments.id, workoutId));
    const executionsBefore = await db.select().from(schema.workoutExecutions);
    const nudge = await app.request(
      `/notifications/relationships/${relationshipId}/nudges`,
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ activityType: "workout", activityId: workoutId }),
      },
      testEnv(),
    );
    expect(nudge.status).toBe(200);
    const nudgeBody = (await nudge.json()) as {
      data: { notification: { type: string; dedupeKey: string }; deduped: boolean };
    };
    expect(nudgeBody.data.notification.type).toBe("activity_nudge");
    expect(nudgeBody.data.deduped).toBe(false);
    const afterNudge = await db
      .select()
      .from(schema.workoutAssignments)
      .where(eq(schema.workoutAssignments.id, workoutId));
    expect(afterNudge[0]).toEqual(beforeNudge[0]);
    expect(await db.select().from(schema.workoutExecutions)).toEqual(executionsBefore);

    const confirmed = await app.request(
      `/meals/assignments/${breakfast.id}/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "confirm-breakfast-clock",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(confirmed.status, await confirmed.clone().text()).toBe(200);
    const countBefore = (await db.select().from(schema.notifications)).length;
    await evaluateAt(istWallClockToUtc(localDate, 9, 0));
    const countAfter = (await db.select().from(schema.notifications)).length;
    expect(countAfter).toBe(countBefore);

    const skipped = await app.request(
      `/workouts/assignments/${workoutId}/skip`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Idempotency-Key": "skip-clock-workout",
        },
      },
      testEnv(),
    );
    expect(skipped.status, await skipped.clone().text()).toBe(200);
    const executionAfterSkip = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, workoutId));
    const resolvedNudge = await app.request(
      `/notifications/relationships/${relationshipId}/nudges`,
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ activityType: "workout", activityId: workoutId }),
      },
      testEnv(),
    );
    expect(resolvedNudge.status).toBe(409);
    expect(
      ((await resolvedNudge.json()) as { error: { code: string } }).error.code,
    ).toBe("ACTIVITY_RESOLVED");
    const executionAfterNudge = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, workoutId));
    expect(executionAfterNudge).toEqual(executionAfterSkip);

    await evaluateAt(istWallClockToUtc(localDate, 21, 29));
    const summaryBeforeCap = (await db.select().from(schema.notifications)).find(
      (row) => row.dedupeKey === dailySummaryDedupeKey(relationshipId, localDate),
    );
    expect(summaryBeforeCap?.notificationType).toBe("daily_summary");
    await evaluateAt(istWallClockToUtc(localDate, 21, 30));
    const summary = (await db.select().from(schema.notifications)).find(
      (row) => row.dedupeKey === dailySummaryDedupeKey(relationshipId, localDate),
    );
    expect(summary?.notificationType).toBe("daily_summary");
    expect(summary?.domainEntityId).toBe(relationshipId);
    await evaluateAt("2026-10-10T15:45:00.000Z");
    const summaries = (await db.select().from(schema.notifications)).filter(
      (row) => row.notificationType === "daily_summary",
    );
    expect(summaries).toHaveLength(1);
  });

  it("dedupes, rate-limits, and preference-checks activity nudges without completing the activity", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("nudge");
    await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "ios",
          token: "fcm-nudge-token-abcdefgh",
          installationId: "install-nudge",
        }),
      },
      testEnv(),
    );
    const ids: string[] = [];
    for (let offset = 0; offset < 4; offset += 1) {
      const localDate = addDaysToLocalDate(today, offset);
      const scheduled = await app.request(
        `/checkins/relationships/${relationshipId}/schedule`,
        {
          method: "POST",
          headers: {
            Cookie: trainerCookie,
            "Content-Type": "application/json",
            "Idempotency-Key": `schedule-nudge-${offset}`,
          },
          body: JSON.stringify({ localDate }),
        },
        testEnv(),
      );
      expect(scheduled.status, await scheduled.clone().text()).toBe(200);
      ids.push(
        ((await scheduled.json()) as { data: { checkin: { id: string } } }).data
          .checkin.id,
      );
    }

    const traineeNudge = await app.request(
      `/notifications/relationships/${relationshipId}/nudges`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ activityType: "checkin", activityId: ids[0] }),
      },
      testEnv(),
    );
    expect(traineeNudge.status).toBe(403);
    expect(
      ((await traineeNudge.json()) as { error: { code: string } }).error.code,
    ).toBe("FORBIDDEN_ROLE");

    async function nudge(activityId: string, now: string) {
      return app.request(
        `/notifications/relationships/${relationshipId}/nudges`,
        {
          method: "POST",
          headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
          body: JSON.stringify({ activityType: "checkin", activityId, now }),
        },
        testEnv(),
      );
    }

    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quietHoursStart: "10:00",
          quietHoursEnd: "11:00",
        }),
      },
      testEnv(),
    );

    const outsideQuietNudgeNow = istWallClockToUtc(today, 9, 30);
    const first = await nudge(ids[0]!, outsideQuietNudgeNow);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: { deduped: boolean; notification: { dedupeKey: string; state: string } };
    };
    expect(firstBody.data.deduped).toBe(false);
    expect(firstBody.data.notification.dedupeKey).toBe(
      activityNudgeDedupeKey(ids[0]!, today),
    );
    expect(firstBody.data.notification.state).toBe("delivered");
    const repeated = await nudge(ids[0]!, outsideQuietNudgeNow);
    expect(repeated.status).toBe(200);
    expect(((await repeated.json()) as { data: { deduped: boolean } }).data.deduped).toBe(
      true,
    );
    expect((await nudge(ids[1]!, outsideQuietNudgeNow)).status).toBe(200);
    expect((await nudge(ids[2]!, outsideQuietNudgeNow)).status).toBe(200);
    const limited = await nudge(ids[3]!, outsideQuietNudgeNow);
    expect(limited.status).toBe(429);
    expect(
      ((await limited.json()) as { error: { code: string } }).error.code,
    ).toBe("NUDGE_LIMIT");
    const stillDraft = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, ids[0]!));
    expect(stillDraft[0]!.recordStatus).toBe("draft");

    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categories: { checkinReminder: false },
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
        }),
      },
      testEnv(),
    );
    const { trainerCookie: quietTrainer, traineeToken: quietTrainee, relationshipId: quietRelationship, today: quietToday } =
      await reachActiveCheckinConfig("nudge-quiet");
    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${quietTrainee}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
        }),
      },
      testEnv(),
    );
    const quietScheduled = await app.request(
      `/checkins/relationships/${quietRelationship}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: quietTrainer,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-nudge-quiet",
        },
        body: JSON.stringify({ localDate: quietToday }),
      },
      testEnv(),
    );
    const quietCheckinId = (
      (await quietScheduled.json()) as { data: { checkin: { id: string } } }
    ).data.checkin.id;
    const duringQuietNudgeNow = istWallClockToUtc(quietToday, 23, 0);
    const quietNudge = await app.request(
      `/notifications/relationships/${quietRelationship}/nudges`,
      {
        method: "POST",
        headers: { Cookie: quietTrainer, "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: "checkin",
          activityId: quietCheckinId,
          now: duringQuietNudgeNow,
        }),
      },
      testEnv(),
    );
    expect(quietNudge.status).toBe(200);
    const quietBody = (await quietNudge.json()) as {
      data: { notification: { id: string; state: string; dedupeKey: string } };
    };
    expect(quietBody.data.notification.state).toBe("deferred");
    expect(quietBody.data.notification.dedupeKey).toBe(
      deferredReminderDedupeKey(activityNudgeDedupeKey(quietCheckinId, quietToday)),
    );
    const quietCheckin = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, quietCheckinId));
    expect(quietCheckin[0]!.recordStatus).toBe("draft");

    await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${quietTrainee}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "ios",
          token: "fcm-nudge-quiet-token-abc",
          installationId: "install-nudge-quiet",
        }),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${quietTrainee}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quietHoursStart: "04:00", quietHoursEnd: "04:01" }),
      },
      testEnv(),
    );
    const released = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: quietTrainer, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(quietToday, 5, 0) }),
      },
      testEnv(),
    );
    expect(released.status).toBe(200);
    const releasedRow = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, quietBody.data.notification.id));
    expect(releasedRow[0]!.state).toBe("delivered");
    expect(releasedRow[0]!.dedupeKey).toBe(
      activityNudgeDedupeKey(quietCheckinId, quietToday),
    );
    const stillOpen = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, quietCheckinId));
    expect(stillOpen[0]!.recordStatus).toBe("draft");

    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${quietTrainee}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ categories: { checkinReminder: false } }),
      },
      testEnv(),
    );
    const suppressedDate = addDaysToLocalDate(quietToday, 1);
    const suppressedScheduled = await app.request(
      `/checkins/relationships/${quietRelationship}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: quietTrainer,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-nudge-suppressed",
        },
        body: JSON.stringify({ localDate: suppressedDate }),
      },
      testEnv(),
    );
    expect(suppressedScheduled.status).toBe(200);
    const suppressedCheckinId = (
      (await suppressedScheduled.json()) as { data: { checkin: { id: string } } }
    ).data.checkin.id;
    const suppressedNudge = await app.request(
      `/notifications/relationships/${quietRelationship}/nudges`,
      {
        method: "POST",
        headers: { Cookie: quietTrainer, "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: "checkin",
          activityId: suppressedCheckinId,
        }),
      },
      testEnv(),
    );
    expect(suppressedNudge.status).toBe(200);
    const suppressedBody = (await suppressedNudge.json()) as {
      data: { notification: { state: string; dedupeKey: string } };
    };
    expect(suppressedBody.data.notification.state).toBe("suppressed");
    expect(suppressedBody.data.notification.dedupeKey).toBe(
      activityNudgeDedupeKey(suppressedCheckinId, quietToday),
    );
    const repeatedSuppressed = await app.request(
      `/notifications/relationships/${quietRelationship}/nudges`,
      {
        method: "POST",
        headers: { Cookie: quietTrainer, "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: "checkin",
          activityId: suppressedCheckinId,
        }),
      },
      testEnv(),
    );
    expect(repeatedSuppressed.status).toBe(200);
    expect(
      ((await repeatedSuppressed.json()) as { data: { deduped: boolean } }).data.deduped,
    ).toBe(true);
    const suppressedCheckin = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, suppressedCheckinId));
    expect(suppressedCheckin[0]!.recordStatus).toBe("draft");
  });
});

describe("§3.6 day-in-life reminder battery", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("skips meal reminders for self_logger backoff", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveCheckinConfig("selflog");
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    await db.insert(schema.reminderStates).values({
      traineeUserId: rel!.traineeUserId,
      consecutiveIgnores: 0,
      mode: "self_logger",
      pausedUntil: null,
      lastEvaluatedAt: nowIso(),
      updatedAt: nowIso(),
    });
    const evaluate = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 8, 45) }),
      },
      testEnv(),
    );
    expect(evaluate.status).toBe(200);
    const rows = await db.select().from(schema.notifications);
    expect(rows.some((row) => row.notificationType === "meal_reminder")).toBe(false);
  });

  it("uses meal override time for P-MEAL scheduling", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("override");
    const planId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
    const versionId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
    const assignmentId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
    const stamp = nowIso();
    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: relationshipId,
      title: "Override plan",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "published",
      contentJson: JSON.stringify({ workoutDays: [], mealPrescriptions: [] }),
      creationSource: "blank",
      publishedAt: stamp,
      effectiveFrom: today,
      effectiveTo: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const lunchPrescription = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      order: 1,
      name: "Lunch",
      mealType: "lunch",
      applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      localTime: "12:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
    };
    await db.insert(schema.mealAssignments).values({
      id: assignmentId,
      coachingRelationshipId: relationshipId,
      planId,
      planVersionId: versionId,
      mealPrescriptionId: lunchPrescription.id,
      mealName: "Lunch",
      mealPrescriptionJson: JSON.stringify(lunchPrescription),
      localDate: today,
      windowStartsAt: istWallClockToUtc(today, 0, 0),
      windowEndsAt: istWallClockToUtc(today, 23, 0),
      photoRequired: false,
      scheduleStatus: "scheduled",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "ios",
          token: "fcm-override-token-abcdefgh",
          installationId: "install-override",
        }),
      },
      testEnv(),
    );
    await app.request(
      "/me/meal-times",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          overrides: [{ slotKey: "lunch", dayPattern: "all", time: "14:30" }],
        }),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 15, 12) }),
      },
      testEnv(),
    );
    const mealReminders = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, "meal_reminder"));
    expect(mealReminders.length).toBeGreaterThanOrEqual(1);
  });

  it("does not deliver push reminders during default quiet hours at 22:00", async () => {
    const { trainerCookie, today } = await reachActiveCheckinConfig("quiet22");
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 22, 0) }),
      },
      testEnv(),
    );
    const queued = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.state, "queued"));
    expect(queued).toHaveLength(0);
  });

  it("respects custom quiet hours from 21:00 local", async () => {
    const { trainerCookie, traineeToken, today } =
      await reachActiveCheckinConfig("quiet21");
    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quietHoursStart: "21:00",
          quietHoursEnd: "06:00",
        }),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 21, 0) }),
      },
      testEnv(),
    );
    const queued = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.state, "queued"));
    expect(queued).toHaveLength(0);
  });

  it("skips meal reminders when backoff mode is paused", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveCheckinConfig("paused");
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    const pausedUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await db.insert(schema.reminderStates).values({
      traineeUserId: rel!.traineeUserId,
      consecutiveIgnores: 5,
      mode: "paused",
      pausedUntil,
      lastEvaluatedAt: nowIso(),
      updatedAt: nowIso(),
    });
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 8, 45) }),
      },
      testEnv(),
    );
    const mealRows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, "meal_reminder"));
    expect(mealRows).toHaveLength(0);
  });

  it("skips every other tick for soft_ignorer backoff", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveCheckinConfig("softign");
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    await db.insert(schema.reminderStates).values({
      traineeUserId: rel!.traineeUserId,
      consecutiveIgnores: 1,
      mode: "soft_ignorer",
      pausedUntil: null,
      lastEvaluatedAt: nowIso(),
      updatedAt: nowIso(),
    });
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 8, 45) }),
      },
      testEnv(),
    );
    const mealRows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, "meal_reminder"));
    expect(mealRows).toHaveLength(0);
  });

  it("schedules P-MEAL about 40 minutes after a 14:30 lunch override", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("lunch1510");
    const planId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
    const versionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
    const assignmentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";
    const stamp = nowIso();
    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: relationshipId,
      title: "Lunch plan",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "published",
      contentJson: JSON.stringify({ workoutDays: [], mealPrescriptions: [] }),
      creationSource: "blank",
      publishedAt: stamp,
      effectiveFrom: today,
      effectiveTo: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const lunchPrescription = {
      id: "ffffffff-ffff-4fff-8fff-fffffffffff1",
      order: 1,
      name: "Lunch",
      mealType: "lunch",
      applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      localTime: "12:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
    };
    await db.insert(schema.mealAssignments).values({
      id: assignmentId,
      coachingRelationshipId: relationshipId,
      planId,
      planVersionId: versionId,
      mealPrescriptionId: lunchPrescription.id,
      mealName: "Lunch",
      mealPrescriptionJson: JSON.stringify(lunchPrescription),
      localDate: today,
      windowStartsAt: istWallClockToUtc(today, 0, 0),
      windowEndsAt: istWallClockToUtc(today, 23, 0),
      photoRequired: false,
      scheduleStatus: "scheduled",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await app.request(
      "/me/meal-times",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          overrides: [{ slotKey: "lunch", dayPattern: "all", time: "14:30" }],
        }),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 15, 9) }),
      },
      testEnv(),
    );
    let mealRows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, "meal_reminder"));
    expect(mealRows).toHaveLength(0);
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 15, 10) }),
      },
      testEnv(),
    );
    mealRows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, "meal_reminder"));
    expect(
      mealRows.some(
        (row) => row.dedupeKey === mealReminderDedupeKey(assignmentId, "after"),
      ),
    ).toBe(true);
  });

  it("fires meal snooze once after the primary after reminder", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveCheckinConfig("snooze");
    const planId = "11111111-1111-4111-8111-111111111101";
    const versionId = "11111111-1111-4111-8111-111111111102";
    const assignmentId = "11111111-1111-4111-8111-111111111103";
    const stamp = nowIso();
    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: relationshipId,
      title: "Snooze plan",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "published",
      contentJson: JSON.stringify({ workoutDays: [], mealPrescriptions: [] }),
      creationSource: "blank",
      publishedAt: stamp,
      effectiveFrom: today,
      effectiveTo: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const breakfast = {
      id: "11111111-1111-4111-8111-111111111104",
      order: 1,
      name: "Breakfast",
      mealType: "breakfast",
      applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      localTime: "08:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
    };
    await db.insert(schema.mealAssignments).values({
      id: assignmentId,
      coachingRelationshipId: relationshipId,
      planId,
      planVersionId: versionId,
      mealPrescriptionId: breakfast.id,
      mealName: "Breakfast",
      mealPrescriptionJson: JSON.stringify(breakfast),
      localDate: today,
      windowStartsAt: istWallClockToUtc(today, 0, 0),
      windowEndsAt: istWallClockToUtc(today, 23, 0),
      photoRequired: false,
      scheduleStatus: "scheduled",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 8, 40) }),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 9, 10) }),
      },
      testEnv(),
    );
    const snoozeRows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, "meal_reminder"));
    expect(
      snoozeRows.some(
        (row) => row.dedupeKey === mealReminderDedupeKey(assignmentId, "snooze"),
      ),
    ).toBe(true);
  });

  it("uses preferred workout time 19:00 for the post-workout nudge at 20:15", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("wo1900");
    await db
      .delete(schema.workoutAssignments)
      .where(eq(schema.workoutAssignments.coachingRelationshipId, relationshipId));
    const prefPut = await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ preferredWorkoutTime: "19:00" }),
      },
      testEnv(),
    );
    expect(prefPut.status).toBe(200);
    const planId = "55555555-5555-4555-8555-555555555501";
    const versionId = "55555555-5555-4555-8555-555555555502";
    const workoutId = "55555555-5555-4555-8555-555555555503";
    const stamp = nowIso();
    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: relationshipId,
      title: "Workout plan",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "published",
      contentJson: JSON.stringify({ workoutDays: [], mealPrescriptions: [] }),
      creationSource: "blank",
      publishedAt: stamp,
      effectiveFrom: today,
      effectiveTo: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(schema.workoutAssignments).values({
      id: workoutId,
      coachingRelationshipId: relationshipId,
      planId,
      planVersionId: versionId,
      workoutDayId: "66666666-6666-4666-8666-666666666601",
      workoutDayName: "Strength",
      workoutDayJson: JSON.stringify({ name: "Strength", exercises: [] }),
      localDate: today,
      windowStartsAt: istWallClockToUtc(today, 0, 0),
      windowEndsAt: istWallClockToUtc(today, 23, 0),
      scheduleStatus: "scheduled",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 20, 14) }),
      },
      testEnv(),
    );
    let rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, workoutId));
    expect(
      rows.some(
        (row) =>
          row.dedupeKey === workoutReminderDedupeKey(workoutId, WORKOUT_REMINDER_SLOT),
      ),
    ).toBe(false);
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 20, 15) }),
      },
      testEnv(),
    );
    rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, workoutId));
    expect(
      rows.some(
        (row) =>
          row.dedupeKey === workoutReminderDedupeKey(workoutId, WORKOUT_REMINDER_SLOT),
      ),
    ).toBe(true);
  });

  it("clamps a 21:30 preferred workout nudge to 21:59 before quiet hours", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("clamp2130");
    await db
      .delete(schema.workoutAssignments)
      .where(eq(schema.workoutAssignments.coachingRelationshipId, relationshipId));
    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ preferredWorkoutTime: "21:30" }),
      },
      testEnv(),
    );
    const planId = "77777777-7777-4777-8777-777777777701";
    const versionId = "77777777-7777-4777-8777-777777777702";
    const workoutId = "77777777-7777-4777-8777-777777777703";
    const stamp = nowIso();
    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: relationshipId,
      title: "Clamp plan",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "published",
      contentJson: JSON.stringify({ workoutDays: [], mealPrescriptions: [] }),
      creationSource: "blank",
      publishedAt: stamp,
      effectiveFrom: today,
      effectiveTo: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(schema.workoutAssignments).values({
      id: workoutId,
      coachingRelationshipId: relationshipId,
      planId,
      planVersionId: versionId,
      workoutDayId: "88888888-8888-4888-8888-888888888801",
      workoutDayName: "Evening",
      workoutDayJson: JSON.stringify({ name: "Evening", exercises: [] }),
      localDate: today,
      windowStartsAt: istWallClockToUtc(today, 0, 0),
      windowEndsAt: istWallClockToUtc(today, 23, 0),
      scheduleStatus: "scheduled",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 21, 58) }),
      },
      testEnv(),
    );
    let rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, workoutId));
    expect(
      rows.some(
        (row) =>
          row.dedupeKey === workoutReminderDedupeKey(workoutId, WORKOUT_REMINDER_SLOT),
      ),
    ).toBe(false);
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 21, 59) }),
      },
      testEnv(),
    );
    rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, workoutId));
    expect(
      rows.some(
        (row) =>
          row.dedupeKey === workoutReminderDedupeKey(workoutId, WORKOUT_REMINDER_SLOT),
      ),
    ).toBe(true);
  });

  it("fires meal reminders in Asia/Dubai local time", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveCheckinConfig("dubai");
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    await db
      .update(schema.users)
      .set({ timezone: "Asia/Dubai" })
      .where(eq(schema.users.id, rel!.traineeUserId));
    const planId = "99999999-9999-4999-8999-999999999901";
    const versionId = "99999999-9999-4999-8999-999999999902";
    const assignmentId = "99999999-9999-4999-8999-999999999903";
    const stamp = nowIso();
    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: relationshipId,
      title: "Dubai plan",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "published",
      contentJson: JSON.stringify({ workoutDays: [], mealPrescriptions: [] }),
      creationSource: "blank",
      publishedAt: stamp,
      effectiveFrom: today,
      effectiveTo: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const lunch = {
      id: "99999999-9999-4999-8999-999999999904",
      order: 1,
      name: "Lunch",
      mealType: "lunch",
      applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      localTime: "13:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
    };
    await db.insert(schema.mealAssignments).values({
      id: assignmentId,
      coachingRelationshipId: relationshipId,
      planId,
      planVersionId: versionId,
      mealPrescriptionId: lunch.id,
      mealName: "Lunch",
      mealPrescriptionJson: JSON.stringify(lunch),
      localDate: today,
      windowStartsAt: dubaiWallClockToUtc(today, 0, 0),
      windowEndsAt: dubaiWallClockToUtc(today, 23, 0),
      photoRequired: false,
      scheduleStatus: "scheduled",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: dubaiWallClockToUtc(today, 13, 39) }),
      },
      testEnv(),
    );
    const early = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, "meal_reminder"));
    expect(early).toHaveLength(0);
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: dubaiWallClockToUtc(today, 13, 40) }),
      },
      testEnv(),
    );
    const mealRows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, "meal_reminder"));
    expect(
      mealRows.some(
        (row) => row.dedupeKey === mealReminderDedupeKey(assignmentId, "after"),
      ),
    ).toBe(true);
  });

  it("caps queued push reminders at five for five meals plus workout and summary", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("cap5");
    await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "ios",
          token: "fcm-cap5-token-abcdefgh",
          installationId: "install-cap5",
        }),
      },
      testEnv(),
    );
    await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ preferredWorkoutTime: "19:00" }),
      },
      testEnv(),
    );
    const planId = "22222222-2222-4222-8222-222222222201";
    const versionId = "22222222-2222-4222-8222-222222222202";
    const stamp = nowIso();
    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: relationshipId,
      title: "Cap plan",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "published",
      contentJson: JSON.stringify({ workoutDays: [], mealPrescriptions: [] }),
      creationSource: "blank",
      publishedAt: stamp,
      effectiveFrom: today,
      effectiveTo: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const mealTimes = ["07:00", "10:00", "13:00", "16:00", "19:00"];
    for (let i = 0; i < mealTimes.length; i += 1) {
      const localTime = mealTimes[i]!;
      const prescription = {
        id: `33333333-3333-4333-8333-3333333333${String(i).padStart(2, "0")}`,
        order: i + 1,
        name: `Meal ${i + 1}`,
        mealType: "snack",
        applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        localTime,
        scheduleHint: null,
        instructions: null,
        photoRequired: false,
        items: [],
      };
      await db.insert(schema.mealAssignments).values({
        id: `44444444-4444-4444-8444-4444444444${String(i).padStart(2, "0")}`,
        coachingRelationshipId: relationshipId,
        planId,
        planVersionId: versionId,
        mealPrescriptionId: prescription.id,
        mealName: prescription.name,
        mealPrescriptionJson: JSON.stringify(prescription),
        localDate: today,
        windowStartsAt: istWallClockToUtc(today, 0, 0),
        windowEndsAt: istWallClockToUtc(today, 23, 0),
        photoRequired: false,
        scheduleStatus: "scheduled",
        createdAt: stamp,
        updatedAt: stamp,
      });
    }
    await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ now: istWallClockToUtc(today, 21, 0) }),
      },
      testEnv(),
    );
    const pushTypes = new Set([
      "meal_reminder",
      "workout_reminder",
      "daily_summary",
      "checkin_reminder",
    ]);
    const pushRows = (await db.select().from(schema.notifications)).filter(
      (row) =>
        pushTypes.has(row.notificationType) &&
        row.state !== "suppressed" &&
        row.state !== "deferred",
    );
    expect(pushRows.length).toBeLessThanOrEqual(5);
    expect(pushRows.length).toBeGreaterThan(0);
  });
});

describe("trainer notification preferences (TW-29)", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("round-trips trainerCategories on GET/PUT", async () => {
    const trainer = await createTrainerSession("prefs-trainer@example.com");
    const get = await app.request(
      "/notifications/preferences",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(get.status).toBe(200);
    const getBody = (await get.json()) as {
      data: { trainerCategories: { morningSummary: boolean } };
    };
    expect(getBody.data.trainerCategories.morningSummary).toBe(false);

    const put = await app.request(
      "/notifications/preferences",
      {
        method: "PUT",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trainerCategories: { morningSummary: true, mealTimesChanged: false },
        }),
      },
      testEnv(),
    );
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as {
      data: {
        trainerCategories: { morningSummary: boolean; mealTimesChanged: boolean };
      };
    };
    expect(putBody.data.trainerCategories.morningSummary).toBe(true);
    expect(putBody.data.trainerCategories.mealTimesChanged).toBe(false);
  });
});
