/**
 * Cross-domain authorization matrix (D8).
 *
 * Covers unauthenticated 401, trainer isolation (wrong owner → 404), and
 * trainee role rejection (403) across major protected surfaces.
 * Domain lifecycle tests remain in per-route suites.
 */
import initSqlJs from "sql.js";
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

const MIGRATIONS = [
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
] as const;

const UNKNOWN_RELATIONSHIP = "00000000-0000-4000-8000-000000000099";
const UNKNOWN_MEDIA = "00000000-0000-4000-8000-000000000098";

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  for (const file of MIGRATIONS) {
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

async function reachCoachingReady(suffix: string) {
  const trainer = await createTrainerSession(`matrix-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-matrix-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `matrix-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  expect(created.status).toBe(200);
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `matrix-trainee-${suffix}`,
    `matrix-trainee-${suffix}@example.com`,
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
  expect(accept.status).toBe(200);
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
        "Idempotency-Key": `submit-matrix-${suffix}`,
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
        "Idempotency-Key": `review-matrix-${suffix}`,
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
        "Idempotency-Key": `cfg-matrix-${suffix}`,
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
        "Idempotency-Key": `act-matrix-${suffix}`,
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

type RequestSpec = {
  domain: string;
  method?: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
};

async function requestAs(
  spec: RequestSpec,
  auth?: { cookie?: string; bearer?: string; role?: string },
) {
  const headers: Record<string, string> = { ...(spec.headers ?? {}) };
  if (spec.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth?.cookie) headers.Cookie = auth.cookie;
  if (auth?.bearer) {
    headers.Authorization = `Bearer ${auth.bearer}`;
    if (auth.role) headers["x-fitbud-role"] = auth.role;
  }
  return app.request(
    spec.path,
    {
      method: spec.method ?? "GET",
      headers,
      body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined,
    },
    testEnv(),
  );
}

describe("authorization matrix", () => {
  let closeDb: () => void;
  let owned: Awaited<ReturnType<typeof reachCoachingReady>>;
  let otherTrainerCookie: string;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
    owned = await reachCoachingReady("owner");
    const other = await createTrainerSession("matrix-other@example.com");
    otherTrainerCookie = other.cookie;
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  const relationshipScopedReads = (): RequestSpec[] => {
    const id = owned.relationshipId;
    return [
      { domain: "relationships", path: `/relationships/${id}` },
      { domain: "configurations", path: `/configurations/relationships/${id}` },
      { domain: "plans", path: `/plans/relationships/${id}` },
      { domain: "workouts", path: `/workouts/relationships/${id}/assignments` },
      { domain: "meals", path: `/meals/relationships/${id}/assignments` },
      { domain: "checkins", path: `/checkins/relationships/${id}` },
      { domain: "exceptions", path: `/exceptions/relationships/${id}` },
      { domain: "progress", path: `/progress/relationships/${id}` },
      { domain: "history", path: `/history/relationships/${id}` },
      { domain: "workspaces", path: `/workspaces/relationships/${id}` },
      {
        domain: "workspaces",
        path: `/workspaces/relationships/${id}/activity?type=checkin`,
      },
      {
        domain: "realtime",
        path: `/realtime/relationships/${id}/connection`,
      },
      {
        domain: "notifications",
        path: `/notifications/relationships/${id}/reminder-rules`,
      },
    ];
  };

  it("returns 401 for unauthenticated access across protected domains", async () => {
    const cases: RequestSpec[] = [
      { domain: "me", path: "/me" },
      { domain: "invitations", path: "/invitations" },
      { domain: "relationships", path: "/relationships" },
      { domain: "templates", path: "/templates" },
      { domain: "libraries", path: "/libraries/exercises" },
      { domain: "exceptions", path: "/exceptions/attention" },
      { domain: "checkins", path: "/checkins/inbox" },
      { domain: "notifications", path: "/notifications" },
      {
        domain: "notifications",
        method: "POST",
        path: "/notifications/device-tokens",
        body: {
          token: "fcm-test-token-abcdefgh",
          platform: "ios",
          installationId: "install-matrix-1",
        },
      },
      {
        domain: "sync",
        method: "POST",
        path: "/sync/push",
        body: { mutations: [] },
      },
      { domain: "sync", path: "/sync/pull" },
      { domain: "files", path: `/files/${UNKNOWN_MEDIA}` },
      {
        domain: "history",
        path: `/history/relationships/${UNKNOWN_RELATIONSHIP}`,
      },
      {
        domain: "realtime",
        path: `/realtime/relationships/${UNKNOWN_RELATIONSHIP}/connection`,
      },
      ...relationshipScopedReads(),
    ];

    for (const spec of cases) {
      const response = await requestAs(spec);
      expect(response.status, `${spec.domain} ${spec.method ?? "GET"} ${spec.path}`).toBe(
        401,
      );
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("UNAUTHENTICATED");
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/Bearer |idToken|objectKey|answers|sig=/i);
    }
  });

  it("isolates trainer ownership on relationship-scoped reads (wrong trainer → 404)", async () => {
    for (const spec of relationshipScopedReads()) {
      const response = await requestAs(spec, { cookie: otherTrainerCookie });
      expect(
        response.status,
        `${spec.domain} wrong trainer ${spec.path}`,
      ).toBe(404);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toMatch(/NOT_FOUND|RELATIONSHIP_NOT_FOUND/);
    }
  });

  it("rejects trainee role on trainer-only list surfaces (403)", async () => {
    const cases: RequestSpec[] = [
      { domain: "invitations", path: "/invitations" },
      { domain: "templates", path: "/templates" },
      { domain: "exceptions", path: "/exceptions/attention" },
      { domain: "checkins", path: "/checkins/inbox" },
      { domain: "history", path: `/history/relationships/${owned.relationshipId}` },
      {
        domain: "workspaces",
        path: `/workspaces/relationships/${owned.relationshipId}`,
      },
      {
        domain: "workspaces",
        path: `/workspaces/relationships/${owned.relationshipId}/activity?type=workout`,
      },
    ];

    for (const spec of cases) {
      const response = await requestAs(spec, {
        bearer: owned.traineeToken,
        role: "trainee",
      });
      expect(
        response.status,
        `${spec.domain} trainee ${spec.path}`,
      ).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN_ROLE");
    }
  });

  it("keeps invitation and template lists isolated between trainers", async () => {
    const ownerInvites = await requestAs(
      { domain: "invitations", path: "/invitations" },
      { cookie: owned.trainerCookie },
    );
    expect(ownerInvites.status).toBe(200);
    const ownerInviteBody = (await ownerInvites.json()) as {
      data: { items: Array<{ id: string }> };
    };
    expect(ownerInviteBody.data.items.length).toBeGreaterThan(0);

    const otherInvites = await requestAs(
      { domain: "invitations", path: "/invitations" },
      { cookie: otherTrainerCookie },
    );
    expect(otherInvites.status).toBe(200);
    const otherInviteBody = (await otherInvites.json()) as {
      data: { items: Array<{ id: string }> };
    };
    const ownerIds = new Set(ownerInviteBody.data.items.map((item) => item.id));
    for (const item of otherInviteBody.data.items) {
      expect(ownerIds.has(item.id)).toBe(false);
    }

    const createTemplate = await requestAs(
      {
        domain: "templates",
        method: "POST",
        path: "/templates",
        headers: { "Idempotency-Key": "matrix-template-1" },
        body: {
          title: "Matrix template",
          templateType: "workout",
          content: {
            workoutDays: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                order: 1,
                name: "Day A",
                exercises: [
                  {
                    id: "22222222-2222-4222-8222-222222222222",
                    order: 1,
                    name: "Squat",
                    instructions: "Depth to parallel",
                    setTargets: [
                      {
                        id: "33333333-3333-4333-8333-333333333333",
                        order: 1,
                        reps: 5,
                        loadLabel: "RPE 7",
                        rpe: 7,
                      },
                    ],
                  },
                ],
              },
            ],
            mealPrescriptions: [],
          },
        },
      },
      { cookie: owned.trainerCookie },
    );
    expect(createTemplate.status).toBe(201);
    const created = (await createTemplate.json()) as { data: { id: string } };

    const stolen = await requestAs(
      { domain: "templates", path: `/templates/${created.data.id}` },
      { cookie: otherTrainerCookie },
    );
    expect(stolen.status).toBe(404);
  });

  it("rejects trainer role on trainee-only sync push", async () => {
    const response = await requestAs(
      {
        domain: "sync",
        method: "POST",
        path: "/sync/push",
        body: { mutations: [] },
      },
      { cookie: owned.trainerCookie },
    );
    expect(response.status).toBe(403);
  });

  it("allows trainee sync pull for own actor and rejects unauthenticated pull", async () => {
    const unauth = await requestAs({ domain: "sync", path: "/sync/pull" });
    expect(unauth.status).toBe(401);

    const pull = await requestAs(
      { domain: "sync", path: "/sync/pull" },
      { bearer: owned.traineeToken, role: "trainee" },
    );
    expect(pull.status).toBe(200);
  });
});
