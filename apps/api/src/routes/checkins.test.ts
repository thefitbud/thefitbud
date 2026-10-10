import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GLOBAL_CHECKIN_FORM_FIELDS,
  GLOBAL_CHECKIN_FORM_TEMPLATE_ID,
  GLOBAL_CHECKIN_FORM_VERSION_ID,
  formatLocalDate,
} from "@fitbud/core";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";

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

async function reachActiveCheckinConfig(
  suffix: string,
  options: { dueWindowHours?: number } = {},
) {
  const dueWindowHours = options.dueWindowHours ?? 48;
  const trainer = await createTrainerSession(`checkin-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-checkin-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `checkin-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `checkin-trainee-${suffix}`,
    `checkin-trainee-${suffix}@example.com`,
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
          goals: "Recomp",
          relevant_history: "None",
          preferences: "Home food",
          schedule: "Evenings",
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
        "Idempotency-Key": `submit-checkin-${suffix}`,
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
        "Idempotency-Key": `review-checkin-${suffix}`,
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
        goalShort: "Check-in cadence",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 2,
          confirmationWindowHours: 24,
          photoRequirement: "none",
        },
        checkin: { cadence: "weekly", dueWindowHours },
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
        "Idempotency-Key": `cfg-checkin-${suffix}`,
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
        "Idempotency-Key": `act-checkin-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 2 }),
    },
    testEnv(),
  );

  const today = formatLocalDate(new Date(), "Asia/Kolkata");
  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
    today,
  };
}

describe("check-in loop", () => {
  let closeDb: () => void;
  let db: Db;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    db = memory.db;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  it("returns 401 for unauthenticated check-in list", async () => {
    const response = await app.request(
      "/checkins/relationships/00000000-0000-4000-8000-000000000099",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects trainee scheduling and trainer submitting", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("authz");

    const traineeSchedule = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "trainee-schedule",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    expect(traineeSchedule.status).toBe(403);

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "trainer-schedule",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    expect(scheduled.status).toBe(200);
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string } };
    };

    const trainerSubmit = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/submit`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "trainer-submit",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          answers: { wellbeing: "Feeling good" },
        }),
      },
      testEnv(),
    );
    expect(trainerSubmit.status).toBe(403);
  });

  it("runs schedule → due → submit → review → schedule next; overdue is derived", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("loop", { dueWindowHours: 1 });

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-1",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    expect(scheduled.status).toBe(200);
    const scheduledBody = (await scheduled.json()) as {
      data: {
        checkin: {
          id: string;
          status: string;
          recordVersion: number;
          checkinFormVersionId: string;
          definitionVersion: number;
        };
      };
    };
    expect(scheduledBody.data.checkin.checkinFormVersionId).toBe(
      GLOBAL_CHECKIN_FORM_VERSION_ID,
    );
    expect(scheduledBody.data.checkin.definitionVersion).toBe(1);
    expect(["due", "scheduled", "overdue"]).toContain(
      scheduledBody.data.checkin.status,
    );

    const listedTrainee = await app.request(
      `/checkins/relationships/${relationshipId}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(listedTrainee.status).toBe(200);
    const traineeList = (await listedTrainee.json()) as {
      data: { items: Array<{ id: string; status: string }> };
    };
    expect(traineeList.data.items).toHaveLength(1);
    expect(traineeList.data.items[0]!.id).toBe(scheduledBody.data.checkin.id);

    const submitted = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-1",
        },
        body: JSON.stringify({
          expectedVersion: scheduledBody.data.checkin.recordVersion,
          answers: {
            wellbeing: "Strong week",
            notes: "Sleep was better",
            bodyWeightKg: 72.5,
          },
        }),
      },
      testEnv(),
    );
    expect(submitted.status).toBe(200);
    const submittedBody = (await submitted.json()) as {
      data: { status: string; answers: { wellbeing: string } };
    };
    expect(submittedBody.data.status).toBe("submitted");
    expect(submittedBody.data.answers.wellbeing).toBe("Strong week");

    const duplicate = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-2",
        },
        body: JSON.stringify({
          expectedVersion: 1,
          answers: { wellbeing: "Again" },
        }),
      },
      testEnv(),
    );
    expect(duplicate.status).toBe(422);

    const [relationship] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    const photoId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    await db.insert(schema.mediaAssets).values({
      id: photoId,
      coachingRelationshipId: relationshipId,
      uploaderUserId: relationship!.traineeUserId,
      mediaType: "checkin_photo",
      status: "ready",
      objectKey: `tests/${photoId}`,
      contentType: "image/jpeg",
      byteSize: 128,
      originalFilename: "check-in.jpg",
      domainEntityType: "checkin",
      domainEntityId: scheduledBody.data.checkin.id,
      recordVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
    });

    const context = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/review-context`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(context.status).toBe(200);
    const contextBody = (await context.json()) as {
      data: {
        checkin: {
          status: string;
          checkinFormVersionId: string;
          answers: { wellbeing: string; bodyWeightKg: number };
        };
        pinnedForm: {
          id: string;
          fields: Array<{ id: string; type: string; measurementType?: string }>;
        };
        photos: Array<{ id: string; mediaType: string }>;
        activeExceptions: unknown[];
        measurements: Array<{ type: string }>;
        previousNotes: unknown[];
        currentPlan: unknown;
        currentConfiguration: { checkinCadence: string } | null;
        recentWorkoutAdherence: { pending: number };
        recentMealCompliance: { pending: number };
      };
    };
    expect(contextBody.data.checkin.status).toBe("submitted");
    expect(contextBody.data.checkin.answers.wellbeing).toBe("Strong week");
    expect(contextBody.data.checkin.checkinFormVersionId).toBe(
      GLOBAL_CHECKIN_FORM_VERSION_ID,
    );
    expect(contextBody.data.pinnedForm.id).toBe(GLOBAL_CHECKIN_FORM_VERSION_ID);
    expect(contextBody.data.pinnedForm.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "body_weight",
          type: "measurement",
          measurementType: "body_weight_kg",
        }),
      ]),
    );
    expect(contextBody.data.activeExceptions).toEqual([]);
    expect(contextBody.data.measurements[0]?.type).toBe("body_weight_kg");
    expect(contextBody.data.photos).toEqual([
      expect.objectContaining({ id: photoId, mediaType: "checkin_photo" }),
    ]);
    expect(contextBody.data.currentConfiguration?.checkinCadence).toBe("weekly");
    expect(contextBody.data.recentWorkoutAdherence).toBeTruthy();
    expect(contextBody.data.recentMealCompliance).toBeTruthy();

    const traineeContext = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/review-context`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(traineeContext.status).toBe(403);

    const note = await app.request(
      `/checkins/relationships/${relationshipId}/notes`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "note-1",
        },
        body: JSON.stringify({
          body: "Keep the current volume.",
          checkinId: scheduledBody.data.checkin.id,
        }),
      },
      testEnv(),
    );
    expect(note.status).toBe(200);

    const reviewed = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/review`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "review-1",
        },
        body: JSON.stringify({
          outcome: "acknowledged",
          notes: "Looks solid",
        }),
      },
      testEnv(),
    );
    expect(reviewed.status).toBe(200);
    const reviewedBody = (await reviewed.json()) as {
      data: { status: string; review: { outcome: string } };
    };
    expect(reviewedBody.data.status).toBe("reviewed");
    expect(reviewedBody.data.review.outcome).toBe("acknowledged");

    const next = await app.request(
      `/checkins/relationships/${relationshipId}/schedule-next`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "next-1",
        },
        body: JSON.stringify({ fromCheckinId: scheduledBody.data.checkin.id }),
      },
      testEnv(),
    );
    expect(next.status).toBe(200);
    const nextBody = (await next.json()) as {
      data: { checkin: { id: string; localDate: string }; created: boolean };
    };
    expect(nextBody.data.created).toBe(true);
    expect(nextBody.data.checkin.id).not.toBe(scheduledBody.data.checkin.id);

    const overdueSeed = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "overdue-seed",
        },
        body: JSON.stringify({ localDate: "2020-01-01" }),
      },
      testEnv(),
    );
    expect(overdueSeed.status).toBe(200);
    const overdueBody = (await overdueSeed.json()) as {
      data: { checkin: { id: string; status: string } };
    };
    expect(overdueBody.data.checkin.status).toBe("overdue");

    const otherTrainer = await createTrainerSession(
      "other-checkin-coach@example.com",
    );
    const forbidden = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/review-context`,
      { headers: { Cookie: otherTrainer.cookie } },
      testEnv(),
    );
    expect(forbidden.status).toBe(404);

    // Touch db for unused-var lint when drizzle types require it in some setups.
    const rows = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.coachingRelationshipId, relationshipId));
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("isolates inbox to owning trainer", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveCheckinConfig("inbox");
    await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inbox-schedule",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );

    const inbox = await app.request(
      "/checkins/inbox",
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(inbox.status).toBe(200);
    const inboxBody = (await inbox.json()) as {
      data: { items: Array<{ coachingRelationshipId: string }> };
    };
    expect(
      inboxBody.data.items.every(
        (item) => item.coachingRelationshipId === relationshipId,
      ),
    ).toBe(true);

    const otherTrainer = await createTrainerSession(
      "inbox-other@example.com",
    );
    const otherInbox = await app.request(
      "/checkins/inbox",
      { headers: { Cookie: otherTrainer.cookie } },
      testEnv(),
    );
    expect(otherInbox.status).toBe(200);
    const otherBody = (await otherInbox.json()) as {
      data: { items: unknown[] };
    };
    expect(otherBody.data.items).toEqual([]);
  });

  it("pins a forked form version without changing the global base", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveCheckinConfig("forms");

    const globalBefore = await app.request(
      `/checkins/form-templates/${GLOBAL_CHECKIN_FORM_TEMPLATE_ID}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(globalBefore.status).toBe(200);
    const globalBeforeBody = (await globalBefore.json()) as {
      data: { versions: Array<{ id: string; fields: unknown[] }> };
    };
    expect(globalBeforeBody.data.versions[0]?.id).toBe(
      GLOBAL_CHECKIN_FORM_VERSION_ID,
    );
    expect(globalBeforeBody.data.versions[0]?.fields).toEqual(
      GLOBAL_CHECKIN_FORM_FIELDS,
    );

    const immutable = await app.request(
      `/checkins/form-templates/${GLOBAL_CHECKIN_FORM_TEMPLATE_ID}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "global-version",
        },
        body: JSON.stringify({ fields: GLOBAL_CHECKIN_FORM_FIELDS }),
      },
      testEnv(),
    );
    expect(immutable.status).toBe(403);

    const fork = await app.request(
      `/checkins/form-templates/${GLOBAL_CHECKIN_FORM_TEMPLATE_ID}/fork`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "fork-checkin-form",
        },
        body: JSON.stringify({ name: "Studio weekly check-in" }),
      },
      testEnv(),
    );
    expect(fork.status).toBe(201);
    const forkBody = (await fork.json()) as {
      data: { id: string; ownership: string; versions: Array<{ id: string }> };
    };
    expect(forkBody.data.ownership).toBe("trainer");
    expect(forkBody.data.id).not.toBe(GLOBAL_CHECKIN_FORM_TEMPLATE_ID);
    const forkVersionId = forkBody.data.versions[0]!.id;

    const customized = await app.request(
      `/checkins/form-templates/${forkBody.data.id}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "fork-version-2",
        },
        body: JSON.stringify({
          fields: [
            ...GLOBAL_CHECKIN_FORM_FIELDS,
            {
              id: "waist",
              label: "Waist",
              type: "measurement",
              measurementType: "waist_cm",
              required: false,
            },
          ],
        }),
      },
      testEnv(),
    );
    expect(customized.status).toBe(201);
    const customizedBody = (await customized.json()) as {
      data: { versions: Array<{ id: string; version: number }> };
    };
    const pinnedVersionId = customizedBody.data.versions.find(
      (version) => version.version === 2,
    )!.id;

    const globalAfter = await app.request(
      `/checkins/form-templates/${GLOBAL_CHECKIN_FORM_TEMPLATE_ID}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const globalAfterBody = (await globalAfter.json()) as {
      data: { versions: Array<{ id: string; fields: unknown[] }> };
    };
    expect(globalAfterBody.data.versions).toHaveLength(1);
    expect(globalAfterBody.data.versions[0]?.fields).toEqual(
      GLOBAL_CHECKIN_FORM_FIELDS,
    );

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-fork",
        },
        body: JSON.stringify({
          localDate: today,
          checkinFormVersionId: pinnedVersionId,
        }),
      },
      testEnv(),
    );
    expect(scheduled.status).toBe(200);
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string; checkinFormVersionId: string } };
    };
    expect(scheduledBody.data.checkin.checkinFormVersionId).toBe(
      pinnedVersionId,
    );
    expect(scheduledBody.data.checkin.checkinFormVersionId).not.toBe(
      forkVersionId,
    );

    const submitted = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-fork",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          answers: {
            wellbeing: "Steady",
            bodyWeightKg: 70.2,
            fieldAnswers: { waist: 81 },
          },
        }),
      },
      testEnv(),
    );
    expect(submitted.status).toBe(200);
    const submittedBody = (await submitted.json()) as {
      data: { answers: { wellbeing: string; bodyWeightKg: number } };
    };
    expect(submittedBody.data.answers.wellbeing).toBe("Steady");
    expect(submittedBody.data.answers.bodyWeightKg).toBe(70.2);

    const standalone = await app.request(
      `/progress/relationships/${relationshipId}/measurements`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "standalone-hip",
        },
        body: JSON.stringify({ type: "hip_cm", value: 96, unit: "cm" }),
      },
      testEnv(),
    );
    expect(standalone.status).toBe(200);
    const standaloneBody = (await standalone.json()) as {
      data: { type: string; checkinId: string | null; source: string };
    };
    expect(standaloneBody.data.checkinId).toBeNull();
    expect(standaloneBody.data.source).toBe("trainee_entry");

    const stored = await db
      .select()
      .from(schema.measurements)
      .where(eq(schema.measurements.coachingRelationshipId, relationshipId));
    expect(stored.map((row) => row.type).sort()).toEqual([
      "body_weight_kg",
      "hip_cm",
      "waist_cm",
    ]);
    expect(
      stored.find((row) => row.type === "body_weight_kg")?.checkinId,
    ).toBe(scheduledBody.data.checkin.id);
    expect(stored.find((row) => row.type === "hip_cm")?.checkinId).toBeNull();

    const next = await app.request(
      `/checkins/relationships/${relationshipId}/schedule-next`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "schedule-next-pin",
        },
        body: JSON.stringify({ fromCheckinId: scheduledBody.data.checkin.id }),
      },
      testEnv(),
    );
    expect(next.status).toBe(200);
    const nextBody = (await next.json()) as {
      data: { checkin: { checkinFormVersionId: string } };
    };
    expect(nextBody.data.checkin.checkinFormVersionId).toBe(pinnedVersionId);
  });
});
