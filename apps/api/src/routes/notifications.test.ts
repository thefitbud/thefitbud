import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
} from "@fitbud/core";
import { pushPayloadSchema } from "@fitbud/contracts";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { routingPayloadForNotification } from "../lib/push-provider.js";
import type { Env } from "../types.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  for (const file of [
    "0000_identity.sql",
    "0001_relationship_onboarding.sql",
    "0012_invitation_whatsapp.sql",
    "0002_coaching_configuration.sql",
    "0003_plans.sql",
    "0004_workouts.sql",
    "0005_meals.sql",
    "0006_checkins.sql",
    "0007_exceptions.sql",
    "0008_progress_media.sql",
    "0009_sync.sql",
    "0010_notifications.sql",
    "0013_domain_contracts.sql",
  "0014_onboarding_form_templates.sql",
    "0011_templates_libraries.sql",
    "0015_iteration_a.sql",
    "0016_food_exercise_libraries.sql",
    "0017_plan_template_ownership.sql",

    "0018_assignment_schedule_status.sql",
    "0019_checkin_form_templates.sql",
    "0020_exception_severity.sql",
  ]) {
    sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
  }
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  return {
    db,
    close: () => sqlite.close(),
  };
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
          quietHoursStart: "00:00",
          quietHoursEnd: "00:00",
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

    const first = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
        body: JSON.stringify({}),
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
        body: JSON.stringify({ quietHoursStart: null, quietHoursEnd: null }),
      },
      testEnv(),
    );
    const third = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
    const localDate = "2026-10-10";
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

    await evaluateAt("2026-10-09T23:30:00.000Z");
    const early = await db.select().from(schema.notifications);
    expect(early.map((row) => row.dedupeKey)).not.toContain(
      workoutReminderDedupeKey(workoutId, "06:00"),
    );

    await evaluateAt("2026-10-10T01:45:00.000Z");
    const midMorning = await db.select().from(schema.notifications);
    const keys = midMorning.map((row) => row.dedupeKey);
    expect(keys).toContain(workoutReminderDedupeKey(workoutId, "06:00"));
    expect(keys).toContain(mealReminderDedupeKey(breakfast.id, "advance"));
    expect(keys).not.toContain(mealReminderDedupeKey(breakfast.id, "follow_up_30"));
    expect(keys).not.toContain(workoutReminderDedupeKey(workoutId, "18:00"));
    expect(keys.some((key) => key.includes(lunch.id))).toBe(false);

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
    await evaluateAt("2026-10-10T03:30:00.000Z");
    const afterLog = await db.select().from(schema.notifications);
    expect(afterLog.map((row) => row.dedupeKey)).not.toContain(
      mealReminderDedupeKey(breakfast.id, "follow_up_30"),
    );
    expect(afterLog.map((row) => row.dedupeKey)).not.toContain(
      mealReminderDedupeKey(breakfast.id, "follow_up_60"),
    );

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

    await evaluateAt("2026-10-10T12:30:00.000Z");
    const evening = await db.select().from(schema.notifications);
    expect(evening.map((row) => row.dedupeKey)).not.toContain(
      workoutReminderDedupeKey(workoutId, "18:00"),
    );

    await evaluateAt("2026-10-10T15:29:00.000Z");
    expect(
      (await db.select().from(schema.notifications)).map((row) => row.dedupeKey),
    ).not.toContain(dailySummaryDedupeKey(relationshipId, localDate));
    await evaluateAt("2026-10-10T15:30:00.000Z");
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

    async function nudge(activityId: string) {
      return app.request(
        `/notifications/relationships/${relationshipId}/nudges`,
        {
          method: "POST",
          headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
          body: JSON.stringify({ activityType: "checkin", activityId }),
        },
        testEnv(),
      );
    }

    const first = await nudge(ids[0]!);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: { deduped: boolean; notification: { dedupeKey: string; state: string } };
    };
    expect(firstBody.data.deduped).toBe(false);
    expect(firstBody.data.notification.dedupeKey).toBe(
      activityNudgeDedupeKey(ids[0]!, today),
    );
    expect(firstBody.data.notification.state).toBe("delivered");
    const repeated = await nudge(ids[0]!);
    expect(repeated.status).toBe(200);
    expect(((await repeated.json()) as { data: { deduped: boolean } }).data.deduped).toBe(
      true,
    );
    expect((await nudge(ids[1]!)).status).toBe(200);
    expect((await nudge(ids[2]!)).status).toBe(200);
    const limited = await nudge(ids[3]!);
    expect(limited.status).toBe(429);
    expect(
      ((await limited.json()) as { error: { code: string } }).error.code,
    ).toBe("NUDGE_RATE_LIMITED");
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
          quietHoursStart: "00:00",
          quietHoursEnd: "00:00",
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
          quietHoursStart: "00:00",
          quietHoursEnd: "00:00",
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
    const quietNudge = await app.request(
      `/notifications/relationships/${quietRelationship}/nudges`,
      {
        method: "POST",
        headers: { Cookie: quietTrainer, "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: "checkin",
          activityId: quietCheckinId,
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
        body: JSON.stringify({ quietHoursStart: null, quietHoursEnd: null }),
      },
      testEnv(),
    );
    const released = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: { Cookie: quietTrainer, "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
