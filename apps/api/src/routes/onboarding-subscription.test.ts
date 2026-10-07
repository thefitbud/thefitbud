import initSqlJs, { type Database } from "sql.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sql-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pushPayloadSchema } from "@fitbud/contracts";
import { addDaysToLocalDate, formatLocalDate, pushPayloadHasOnlySafeKeys } from "@fitbud/core";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { routingPayloadForNotification } from "../lib/push-provider.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const SEEDED_GLOBAL_FORM_ID = "11111111-1111-4111-8111-111111111111";
const HIGHER_GLOBAL_TEMPLATE_ID = "22222222-2222-4222-8222-222222222221";
const HIGHER_GLOBAL_FORM_ID = "22222222-2222-4222-8222-222222222222";

const MIGRATIONS_BEFORE_BACKFILL = [
  "0000_identity.sql",
  "0001_relationship_onboarding.sql",
  "0012_invitation_whatsapp.sql",
  "0002_coaching_configuration.sql",
  "0010_notifications.sql",
];

function applySql(sqlite: Database, file: string) {
  sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
}

function scalar(sqlite: Database, sql: string): unknown {
  const result = sqlite.exec(sql);
  return result[0]?.values[0]?.[0];
}

describe("migration 0013 backfill", () => {
  it("maps legacy rows onto the new contracts", async () => {
    const SQL = await initSqlJs();
    const sqlite = new SQL.Database();
    for (const file of MIGRATIONS_BEFORE_BACKFILL) applySql(sqlite, file);

    sqlite.run(
      `INSERT INTO users (id, firebase_uid, account_state, timezone, created_at, updated_at)
       VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'trainer-fb', 'active', 'Asia/Kolkata', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
              ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'trainee-fb', 'active', 'Asia/Kolkata', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
    );
    sqlite.run(
      `INSERT INTO coaching_relationships (
         id, trainer_user_id, trainee_user_id, status, invitation_id, started_at, ended_at, created_at, updated_at
       ) VALUES (
         'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
         'onboarding_submitted',
         NULL,
         '2026-09-02T00:00:00.000Z',
         NULL,
         '2026-09-02T00:00:00.000Z',
         '2026-09-02T00:00:00.000Z'
       )`,
    );
    sqlite.run(
      `INSERT INTO client_invitations (
         id, trainer_user_id, recipient_email, recipient_display_name, recipient_whatsapp_e164,
         token_hash, status, expires_at, accepted_user_id, coaching_relationship_id, created_at, updated_at
       ) VALUES (
         'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
         'trainee@example.com',
         'Trainee',
         NULL,
         'hash',
         'accepted',
         '2026-10-01T00:00:00.000Z',
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
         'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
         '2026-09-01T00:00:00.000Z',
         '2026-09-02T00:00:00.000Z'
       )`,
    );
    sqlite.run(
      `INSERT INTO coaching_configurations (
         id, coaching_relationship_id, status, version, primary_goal, notes,
         configured_at, activated_at, created_at, updated_at
       ) VALUES (
         'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
         'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
         'active',
         4,
         'Strength',
         NULL,
         '2026-09-03T00:00:00.000Z',
         '2026-09-03T00:00:00.000Z',
         '2026-09-03T00:00:00.000Z',
         '2026-09-03T00:00:00.000Z'
       )`,
    );
    sqlite.run(
      `INSERT INTO notification_preferences (
         user_id, push_enabled, workout_reminder, meal_reminder, checkin_reminder,
         quiet_hours_start, quiet_hours_end, created_at, updated_at
       ) VALUES (
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
         1, 1, 1, 1, NULL, NULL,
         '2026-09-01T00:00:00.000Z',
         '2026-09-01T00:00:00.000Z'
       )`,
    );

    applySql(sqlite, "0013_domain_contracts.sql");

    expect(scalar(sqlite, "SELECT status FROM coaching_relationships")).toBe("active");
    expect(scalar(sqlite, "SELECT invitation_id FROM coaching_relationships")).toBe(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    const invitationColumns = sqlite.exec("PRAGMA table_info(client_invitations)")[0]!;
    const nameIndex = invitationColumns.columns.indexOf("name");
    const names = invitationColumns.values.map((row) => row[nameIndex]);
    expect(names).not.toContain("coaching_relationship_id");

    expect(
      scalar(sqlite, "SELECT version_number FROM coaching_configurations"),
    ).toBe(1);
    expect(
      scalar(sqlite, "SELECT record_version FROM coaching_configurations"),
    ).toBe(4);
    expect(
      scalar(
        sqlite,
        "SELECT id FROM onboarding_form_versions WHERE key = 'mvp' AND version = 1",
      ),
    ).toBe(SEEDED_GLOBAL_FORM_ID);
    expect(
      scalar(
        sqlite,
        "SELECT subscription_renewal_reminder FROM notification_preferences",
      ),
    ).toBe(1);

    sqlite.run(
      `UPDATE coaching_configurations
       SET primary_goal = 'Add 10 kg to the squat while holding body weight steady'`,
    );
    applySql(sqlite, "0011_templates_libraries.sql");
    applySql(sqlite, "0015_iteration_a.sql");
    expect(
      scalar(sqlite, "SELECT goal_description FROM coaching_configurations"),
    ).toBe("Add 10 kg to the squat while holding body weight steady");
    expect(scalar(sqlite, "SELECT goal_short FROM coaching_configurations")).toBe(
      null,
    );
    const goalColumns = sqlite.exec("PRAGMA table_info(coaching_configurations)")[0]!;
    const goalNameIndex = goalColumns.columns.indexOf("name");
    const goalNames = goalColumns.values.map((row) => row[goalNameIndex]);
    expect(goalNames).not.toContain("primary_goal");
    expect(goalNames).toContain("goal_description");
    expect(goalNames).toContain("goal_short");

    sqlite.run(
      `INSERT INTO onboarding_form_versions (id, key, version, scope, trainer_user_id, schema_json, created_at)
       VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'coach', 1, 'global', NULL, '{}', '2026-10-01T00:00:00.000Z')`,
    );
    sqlite.run(
      `INSERT INTO onboarding_form_versions (id, key, version, scope, trainer_user_id, schema_json, created_at)
       VALUES ('99999999-9999-4999-8999-999999999999', 'coach', 1, 'trainer', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{}', '2026-10-01T00:00:00.000Z')`,
    );
    expect(() =>
      sqlite.run(
        `INSERT INTO onboarding_form_versions (id, key, version, scope, trainer_user_id, schema_json, created_at)
         VALUES ('88888888-8888-4888-8888-888888888888', 'coach', 1, 'global', NULL, '{}', '2026-10-01T00:00:00.000Z')`,
      ),
    ).toThrow();

    sqlite.close();
  });
});

const APP_MIGRATIONS = [
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
];

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  for (const file of APP_MIGRATIONS) applySql(sqlite, file);
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  return { db, close: () => sqlite.close() };
}

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

const FORM_FIELDS = {
  fields: [
    { id: "goals", type: "textarea", label: "Goals", required: true },
    { id: "schedule", type: "textarea", label: "Schedule", required: true },
  ],
};

describe("onboarding resolution and subscription", () => {
  let closeDb: (() => void) | null = null;
  let db: Db;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    db = memory.db;
    closeDb = memory.close;
    setTestDbOverride(db);
    await db.insert(schema.onboardingFormTemplates).values({
      id: HIGHER_GLOBAL_TEMPLATE_ID,
      ownership: "global",
      trainerUserId: null,
      name: "Seasonal onboarding",
      description: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await db.insert(schema.onboardingFormVersions).values({
      id: HIGHER_GLOBAL_FORM_ID,
      templateId: HIGHER_GLOBAL_TEMPLATE_ID,
      key: "seasonal",
      version: 5,
      scope: "global",
      trainerUserId: null,
      schemaJson: JSON.stringify(FORM_FIELDS),
      createdAt: "2026-10-01T00:00:00.000Z",
    });
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb?.();
    closeDb = null;
  });

  async function trainerSession(email: string) {
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
    const cookie = sessionResponse.headers.get("set-cookie")!.split(";")[0]!;
    const me = await app.request("/me", { headers: { Cookie: cookie } }, testEnv());
    const meBody = (await me.json()) as { data: { userId: string } };
    return { cookie, userId: meBody.data.userId };
  }

  it("pins the resolved form through review, configuration, and a new version", async () => {
    const trainer = await trainerSession("forms-coach@example.com");
    const trainerTemplateId = "33333333-3333-4333-8333-333333333331";
    const trainerFormId = "33333333-3333-4333-8333-333333333333";
    await db.insert(schema.onboardingFormTemplates).values({
      id: trainerTemplateId,
      ownership: "trainer",
      trainerUserId: trainer.userId,
      name: "Studio onboarding",
      description: null,
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
    await db.insert(schema.onboardingFormVersions).values({
      id: trainerFormId,
      templateId: trainerTemplateId,
      key: "studio",
      version: 2,
      scope: "trainer",
      trainerUserId: trainer.userId,
      schemaJson: JSON.stringify(FORM_FIELDS),
      createdAt: "2026-10-02T00:00:00.000Z",
    });

    const current = await app.request(
      "/onboarding/forms/current",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(current.status).toBe(400);

    const other = await trainerSession("global-only-coach@example.com");
    const otherInvite = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: other.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-global-only",
        },
        body: JSON.stringify({ recipientEmail: "global-only@example.com" }),
      },
      testEnv(),
    );
    const otherBody = (await otherInvite.json()) as {
      data: { onboardingFormTemplateVersionId: string };
    };
    expect(otherBody.data.onboardingFormTemplateVersionId).toBe(HIGHER_GLOBAL_FORM_ID);
    expect(otherBody.data.onboardingFormTemplateVersionId).not.toBe(
      SEEDED_GLOBAL_FORM_ID,
    );

    const created = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-forms-1",
        },
        body: JSON.stringify({ recipientEmail: "forms-trainee@example.com" }),
      },
      testEnv(),
    );
    const createdBody = (await created.json()) as {
      data: { token: string; onboardingFormTemplateVersionId: string };
    };
    expect(created.status).toBe(200);
    expect(createdBody.data.onboardingFormTemplateVersionId).toBe(trainerFormId);
    const traineeToken = createTestIdToken(
      "forms-trainee",
      "forms-trainee@example.com",
    );
    const accept = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: createdBody.data.token, timezone: "Asia/Kolkata" }),
      },
      testEnv(),
    );
    const acceptBody = (await accept.json()) as {
      data: { relationship: { id: string; status: string; onboardingStatus: string } };
    };
    const relationshipId = acceptBody.data.relationship.id;
    expect(acceptBody.data.relationship.status).toBe("active");
    expect(acceptBody.data.relationship.onboardingStatus).toBe("onboarding_pending");

    const draft = await app.request(
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
          answers: { goals: "Get stronger", schedule: "Mornings" },
        }),
      },
      testEnv(),
    );
    expect(draft.status).toBe(201);
    const draftBody = (await draft.json()) as {
      data: { onboardingFormVersionId: string; version: number };
    };
    expect(draftBody.data.onboardingFormVersionId).toBe(trainerFormId);

    const submit = await app.request(
      `/onboarding/relationships/${relationshipId}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-forms-1",
        },
        body: JSON.stringify({ expectedVersion: draftBody.data.version }),
      },
      testEnv(),
    );
    expect(submit.status).toBe(200);

    const review = await app.request(
      `/onboarding/relationships/${relationshipId}/review`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "review-forms-1",
        },
        body: JSON.stringify({ outcome: "coaching_ready" }),
      },
      testEnv(),
    );
    expect(review.status).toBe(200);
    const reviewBody = (await review.json()) as {
      data: { onboardingStatus: string; relationship: { status: string } };
    };
    expect(reviewBody.data.onboardingStatus).toBe("coaching_ready");
    expect(reviewBody.data.relationship.status).toBe("active");

    const saved = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          goalShort: "Strength",
          workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
          nutrition: {
            mealsPerDay: 3,
            confirmationWindowHours: 6,
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
    expect(saved.status).toBe(201);
    const savedBody = (await saved.json()) as {
      data: { recordVersion: number; versionNumber: number };
    };
    expect(savedBody.data.versionNumber).toBe(1);

    const configured = await app.request(
      `/configurations/relationships/${relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "configure-forms-1",
        },
        body: JSON.stringify({ expectedVersion: savedBody.data.recordVersion }),
      },
      testEnv(),
    );
    expect(configured.status).toBe(200);
    const configuredBody = (await configured.json()) as {
      data: { recordVersion: number };
    };

    const activated = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-forms-1",
        },
        body: JSON.stringify({ expectedVersion: configuredBody.data.recordVersion }),
      },
      testEnv(),
    );
    expect(activated.status).toBe(200);
    const relationship = await app.request(
      `/relationships/${relationshipId}`,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    const relationshipBody = (await relationship.json()) as {
      data: { status: string; onboardingStatus: string };
    };
    expect(relationshipBody.data.status).toBe("active");
    expect(relationshipBody.data.onboardingStatus).toBe("active");

    const activeRows = await db
      .select()
      .from(schema.coachingConfigurations)
      .where(eq(schema.coachingConfigurations.coachingRelationshipId, relationshipId));
    const active = activeRows.find((row) => row.status === "active");
    expect(active?.versionNumber).toBe(1);
    const activeWorkout = (
      await db
        .select()
        .from(schema.workoutExpectations)
        .where(eq(schema.workoutExpectations.coachingConfigurationId, active!.id))
    )[0]!;

    const overwrite = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: active!.recordVersion,
          goalShort: "Should fail",
          workout: { sessionsPerWeek: 9, completionWindowHours: 24 },
          nutrition: {
            mealsPerDay: 3,
            confirmationWindowHours: 6,
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
    expect(overwrite.status).toBe(409);

    const opened = await app.request(
      `/configurations/relationships/${relationshipId}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "version-forms-1",
        },
        body: JSON.stringify({ expectedVersion: active!.recordVersion }),
      },
      testEnv(),
    );
    expect(opened.status).toBe(201);
    const openedBody = (await opened.json()) as {
      data: { status: string; versionNumber: number; recordVersion: number };
    };
    expect(openedBody.data.status).toBe("draft");
    expect(openedBody.data.versionNumber).toBe(2);

    const visible = await app.request(
      `/configurations/relationships/${relationshipId}`,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    const visibleBody = (await visible.json()) as {
      data: { status: string; versionNumber: number };
    };
    expect(visibleBody.data.status).toBe("draft");
    expect(visibleBody.data.versionNumber).toBe(2);

    const activeWorkoutAfter = (
      await db
        .select()
        .from(schema.workoutExpectations)
        .where(eq(schema.workoutExpectations.id, activeWorkout.id))
    )[0]!;
    expect(activeWorkoutAfter.sessionsPerWeek).toBe(3);
    const stillActive = (
      await db
        .select()
        .from(schema.coachingConfigurations)
        .where(eq(schema.coachingConfigurations.id, active!.id))
    )[0]!;
    expect(stillActive.status).toBe("active");

    const response = (
      await db
        .select()
        .from(schema.onboardingFormResponses)
        .where(eq(schema.onboardingFormResponses.coachingRelationshipId, relationshipId))
    )[0]!;
    expect(response.onboardingFormVersionId).toBe(trainerFormId);
  });

  it("tracks subscription renewal, attention, history, and a routing-only reminder", async () => {
    const trainer = await trainerSession("subs-coach@example.com");
    const created = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-subs-1",
        },
        body: JSON.stringify({ recipientEmail: "subs-trainee@example.com" }),
      },
      testEnv(),
    );
    const createdBody = (await created.json()) as { data: { token: string } };
    const traineeToken = createTestIdToken("subs-trainee", "subs-trainee@example.com");
    const accept = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: createdBody.data.token }),
      },
      testEnv(),
    );
    const relationshipId = (
      (await accept.json()) as { data: { relationship: { id: string } } }
    ).data.relationship.id;

    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    const renewsOn = addDaysToLocalDate(today, 3);
    const saved = await app.request(
      `/relationships/${relationshipId}/subscription`,
      {
        method: "PUT",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "sub-save-1",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          planName: "Coaching",
          paymentFrequency: "monthly",
          startsOn: addDaysToLocalDate(today, -20),
          renewsOn,
        }),
      },
      testEnv(),
    );
    expect(saved.status).toBe(201);
    const savedBody = (await saved.json()) as {
      data: { versionNumber: number; renewalState: string; planName: string };
    };
    expect(savedBody.data.versionNumber).toBe(1);
    expect(savedBody.data.renewalState).toBe("upcoming");
    expect(savedBody.data.planName).toBe("Coaching");

    const attention = await app.request(
      "/subscriptions/attention",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(attention.status).toBe(200);
    const attentionBody = (await attention.json()) as {
      data: { items: Array<{ coachingRelationshipId: string; renewalState: string }> };
    };
    expect(attentionBody.data.items).toEqual([
      expect.objectContaining({
        coachingRelationshipId: relationshipId,
        renewalState: "upcoming",
      }),
    ]);

    const history = await app.request(
      `/history/relationships/${relationshipId}`,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    const historyBody = (await history.json()) as {
      data: { items: Array<{ kind: string; summary: string }> };
    };
    const revision = historyBody.data.items.find(
      (item) => item.kind === "subscription_revision",
    );
    expect(revision?.summary).toContain("Coaching");
    expect(revision?.summary).toContain(renewsOn);

    const evaluated = await app.request(
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
    expect(evaluated.status).toBe(200);
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
          domainEntityType: string;
          domainEntityId: string;
          dedupeKey: string;
          createdAt: string;
        }>;
      };
    };
    const reminder = listedBody.data.items.find(
      (item) => item.type === "subscription_renewal_reminder",
    );
    expect(reminder?.domainEntityType).toBe("coaching_relationship");
    expect(reminder?.domainEntityId).toBe(relationshipId);
    expect(reminder?.dedupeKey).toBe(
      `subscription_renewal_reminder:${relationshipId}:${renewsOn}:upcoming`,
    );
    const payload = routingPayloadForNotification({
      notificationId: reminder!.id,
      notificationType: "subscription_renewal_reminder",
      domainEntityType: "coaching_relationship",
      domainEntityId: reminder!.domainEntityId,
      createdAt: reminder!.createdAt,
    });
    expect(pushPayloadSchema.parse(payload)).toEqual(payload);
    expect(pushPayloadHasOnlySafeKeys(payload)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("Coaching");

    const again = await app.request(
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
    const againBody = (await again.json()) as {
      data: { notificationsCreated: number; notificationsDeduped: number };
    };
    expect(againBody.data.notificationsCreated).toBe(0);
    expect(againBody.data.notificationsDeduped).toBeGreaterThanOrEqual(1);
  });
});
