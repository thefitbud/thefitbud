import initSqlJs from "sql.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sql-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
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

async function reachActiveConfig(suffix: string) {
  const trainer = await createTrainerSession(`hist-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-hist-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `hist-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `hist-trainee-${suffix}`,
    `hist-trainee-${suffix}@example.com`,
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
        "Idempotency-Key": `submit-hist-${suffix}`,
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
        "Idempotency-Key": `review-hist-${suffix}`,
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
        goalShort: "Adherence",
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
        "Idempotency-Key": `cfg-hist-${suffix}`,
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
        "Idempotency-Key": `act-hist-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 2 }),
    },
    testEnv(),
  );

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
  };
}

describe("history view", () => {
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

  it("returns 401 for unauthenticated history", async () => {
    const response = await app.request(
      "/history/relationships/00000000-0000-4000-8000-000000000099",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects wrong trainer with 404", async () => {
    const owned = await reachActiveConfig("iso");
    const other = await createTrainerSession("hist-other@example.com");

    const response = await app.request(
      `/history/relationships/${owned.relationshipId}`,
      { headers: { Cookie: other.cookie } },
      testEnv(),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RELATIONSHIP_NOT_FOUND");
  });

  it("rejects trainee reading trainer history with 403", async () => {
    const { traineeToken, relationshipId } = await reachActiveConfig("trainee");

    const response = await app.request(
      `/history/relationships/${relationshipId}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(response.status).toBe(403);
  });

  it("assembles readable chronological entries from real domain records", async () => {
    const { trainerCookie, traineeToken, relationshipId } =
      await reachActiveConfig("assemble");

    const note = await app.request(
      `/checkins/relationships/${relationshipId}/notes`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "note-hist-1",
        },
        body: JSON.stringify({ body: "Keep mornings consistent." }),
      },
      testEnv(),
    );
    expect(note.status).toBe(200);

    const measurement = await app.request(
      `/progress/relationships/${relationshipId}/measurements`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "meas-hist-1",
        },
        body: JSON.stringify({
          type: "body_weight_kg",
          value: 71,
          unit: "kg",
          observedAt: "2026-09-26T08:00:00.000Z",
        }),
      },
      testEnv(),
    );
    expect(measurement.status).toBe(200);

    const response = await app.request(
      `/history/relationships/${relationshipId}?limit=50`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        items: Array<{
          kind: string;
          title: string;
          summary: string;
          occurredAt: string;
        }>;
        nextCursor: string | null;
      };
    };

    const kinds = new Set(body.data.items.map((item) => item.kind));
    expect(kinds.has("onboarding_submitted")).toBe(true);
    expect(kinds.has("onboarding_reviewed")).toBe(true);
    expect(kinds.has("configuration_activated")).toBe(true);
    expect(kinds.has("trainer_note")).toBe(true);
    expect(kinds.has("measurement")).toBe(true);

    for (const item of body.data.items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.summary.length).toBeGreaterThan(0);
      expect(item.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    for (let i = 1; i < body.data.items.length; i += 1) {
      const prev = body.data.items[i - 1]!;
      const curr = body.data.items[i]!;
      expect(prev.occurredAt >= curr.occurredAt).toBe(true);
    }

    // No fabricated analytics/risk kinds.
    expect(kinds.has("risk_score")).toBe(false);
    expect(kinds.has("ai_recommendation")).toBe(false);

    const notes = await app.request(
      `/history/relationships/${relationshipId}?kind=trainer_note`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(notes.status).toBe(200);
    const notesBody = (await notes.json()) as {
      data: { items: Array<{ kind: string }> };
    };
    expect(notesBody.data.items.length).toBeGreaterThan(0);
    expect(notesBody.data.items.every((item) => item.kind === "trainer_note")).toBe(
      true,
    );

    const empty = await app.request(
      `/history/relationships/${relationshipId}?kind=measurement&occurredFrom=1990-01-01T00:00:00.000Z&occurredTo=1990-01-02T00:00:00.000Z`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as {
      data: { items: unknown[]; nextCursor: string | null };
    };
    expect(emptyBody.data.items).toEqual([]);
    expect(emptyBody.data.nextCursor).toBeNull();

    const invalid = await app.request(
      `/history/relationships/${relationshipId}?kind=risk_score`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(invalid.status).toBe(400);
  });

  it("applies a date filter before the per-source cap", async () => {
    const { trainerCookie, relationshipId } = await reachActiveConfig("cap");
    const relationship = (
      await db
        .select()
        .from(schema.coachingRelationships)
        .where(eq(schema.coachingRelationships.id, relationshipId))
        .limit(1)
    )[0]!;

    const oldIds = [
      "11111111-1111-4111-8111-111111111101",
      "11111111-1111-4111-8111-111111111102",
      "11111111-1111-4111-8111-111111111103",
    ];
    for (const [index, id] of oldIds.entries()) {
      await db.insert(schema.measurements).values({
        id,
        coachingRelationshipId: relationshipId,
        traineeUserId: relationship.traineeUserId,
        type: "body_weight_kg",
        value: 70 + index,
        unit: "kg",
        observedAt: `2020-01-0${index + 1}T00:00:00.000Z`,
        source: "trainee_entry",
        checkinId: null,
        mediaAssetId: null,
        recordVersion: 0,
        createdAt: `2020-01-0${index + 1}T00:00:00.000Z`,
        updatedAt: `2020-01-0${index + 1}T00:00:00.000Z`,
      });
    }
    for (let index = 0; index < 100; index += 1) {
      const observedAt = new Date(Date.UTC(2026, 5, 1, 0, index)).toISOString();
      await db.insert(schema.measurements).values({
        id: crypto.randomUUID(),
        coachingRelationshipId: relationshipId,
        traineeUserId: relationship.traineeUserId,
        type: "body_weight_kg",
        value: 80,
        unit: "kg",
        observedAt,
        source: "trainee_entry",
        checkinId: null,
        mediaAssetId: null,
        recordVersion: 0,
        createdAt: observedAt,
        updatedAt: observedAt,
      });
    }

    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const params = new URLSearchParams({
        kind: "measurement",
        occurredFrom: "2020-01-01T00:00:00.000Z",
        occurredTo: "2020-01-03T23:59:59.000Z",
        limit: "1",
      });
      if (cursor) params.set("cursor", cursor);
      const response = await app.request(
        `/history/relationships/${relationshipId}?${params.toString()}`,
        { headers: { Cookie: trainerCookie } },
        testEnv(),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { items: Array<{ id: string; kind: string }>; nextCursor: string | null };
      };
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0]?.kind).toBe("measurement");
      seen.add(body.data.items[0]!.id);
      cursor = body.data.nextCursor;
      if (!cursor) break;
    }
    expect(cursor).toBeNull();
    expect([...seen].sort()).toEqual([...oldIds].sort());
  });
});
