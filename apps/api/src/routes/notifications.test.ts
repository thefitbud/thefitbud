import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatLocalDate, pushPayloadHasOnlySafeKeys } from "@fitbud/core";
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
});
