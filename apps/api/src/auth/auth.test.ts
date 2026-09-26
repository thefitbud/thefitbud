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
import {
  ensureRoleAndProfile,
  findOrCreateUserFromFirebase,
} from "../auth/identity.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const identityMigration = join(drizzleDir, "0000_identity.sql");
const relationshipMigration = join(
  drizzleDir,
  "0001_relationship_onboarding.sql",
);
const configurationMigration = join(
  drizzleDir,
  "0002_coaching_configuration.sql",
);
const plansMigration = join(drizzleDir, "0003_plans.sql");
const syncMigration = join(drizzleDir, "0009_sync.sql");
const notificationsMigration = join(drizzleDir, "0010_notifications.sql");

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  sqlite.exec(readFileSync(identityMigration, "utf8"));
  sqlite.exec(readFileSync(relationshipMigration, "utf8"));
  sqlite.exec(readFileSync(configurationMigration, "utf8"));
  sqlite.exec(readFileSync(plansMigration, "utf8"));
  sqlite.exec(readFileSync(syncMigration, "utf8"));
  sqlite.exec(readFileSync(notificationsMigration, "utf8"));
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

async function createTrainerSession(email = "coach@example.com") {
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
  return {
    cookie: setCookie!.split(";")[0]!,
    token,
  };
}

describe("identity authorization", () => {
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  it("returns 401 for unauthenticated /me", async () => {
    const response = await app.request("/me", {}, testEnv());
    expect(response.status).toBe(401);
    const body = (await response.json()) as {
      error: { code: string; requestId: string };
    };
    expect(body).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
    expect(body.error.requestId).toBeTruthy();
  });

  it("returns 403 when a trainee creates an invitation", async () => {
    const identity = { uid: "trainee-firebase-1", email: "trainee@example.com" };
    const { createDb } = await import("../db/client.js");
    const db = createDb(dummyD1());
    const { userId } = await findOrCreateUserFromFirebase(db, identity);
    await ensureRoleAndProfile(db, {
      userId,
      role: "trainee",
      displayName: "Trainee",
    });

    const token = createTestIdToken(identity.uid, identity.email);
    const response = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "invite-1",
          "x-fitbud-role": "trainee",
        },
        body: JSON.stringify({
          recipientEmail: "someone@example.com",
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({
      error: { code: "FORBIDDEN_ROLE" },
    });
  });

  it("exchanges a Firebase test token for a web session and serves /me", async () => {
    const { cookie } = await createTrainerSession();
    const meResponse = await app.request(
      "/me",
      { headers: { Cookie: cookie } },
      testEnv(),
    );

    expect(meResponse.status).toBe(200);
    const meBody = (await meResponse.json()) as {
      data: {
        firebaseUid: string;
        permittedRoles: string[];
        selectedRole: string;
        surface: string;
        timezone: string;
        trainerProfileId: string | null;
      };
    };
    expect(meBody.data).toMatchObject({
      firebaseUid: "trainer-coach@example.com",
      permittedRoles: ["trainer"],
      selectedRole: "trainer",
      surface: "trainer_web",
      timezone: "Asia/Kolkata",
    });
    expect(meBody.data.trainerProfileId).toBeTruthy();
  });

  it("returns healthy envelope", async () => {
    const response = await app.request("/health", {}, testEnv());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { status: "ok", service: "fitbud-api" },
    });
  });
});

describe("invitations and coaching relationships", () => {
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  it("creates an invitation idempotently and isolates trainers", async () => {
    const trainerA = await createTrainerSession("a@example.com");
    const createBody = {
      recipientEmail: "Client@Example.com",
      recipientDisplayName: "Client One",
    };

    const first = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: trainerA.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-key-1",
        },
        body: JSON.stringify(createBody),
      },
      testEnv(),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: { id: string; token: string; recipientEmail: string; onboardingStatus: string };
    };
    expect(firstBody.data.recipientEmail).toBe("client@example.com");
    expect(firstBody.data.onboardingStatus).toBe("invited");
    expect(firstBody.data.token).toBeTruthy();

    const replay = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: trainerA.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-key-1",
        },
        body: JSON.stringify(createBody),
      },
      testEnv(),
    );
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { data: { id: string; token: string } };
    expect(replayBody.data.id).toBe(firstBody.data.id);
    expect(replayBody.data.token).toBe(firstBody.data.token);

    const trainerB = await createTrainerSession("b@example.com");
    const foreign = await app.request(
      `/invitations/${firstBody.data.id}`,
      { headers: { Cookie: trainerB.cookie } },
      testEnv(),
    );
    expect(foreign.status).toBe(404);

    const listB = await app.request(
      "/invitations",
      { headers: { Cookie: trainerB.cookie } },
      testEnv(),
    );
    expect(listB.status).toBe(200);
    const listBody = (await listB.json()) as { data: { items: unknown[] } };
    expect(listBody.data.items).toHaveLength(0);
  });

  it("accepts an invitation and creates a trainee-linked relationship", async () => {
    const trainer = await createTrainerSession("coach2@example.com");
    const created = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-accept-1",
        },
        body: JSON.stringify({ recipientEmail: "trainee2@example.com" }),
      },
      testEnv(),
    );
    const createdBody = (await created.json()) as {
      data: { token: string; id: string };
    };

    const traineeToken = createTestIdToken(
      "trainee-firebase-accept",
      "trainee2@example.com",
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
          displayName: "Trainee Two",
          timezone: "America/New_York",
        }),
      },
      testEnv(),
    );
    expect(accept.status).toBe(200);
    const acceptBody = (await accept.json()) as {
      data: {
        invitation: { status: string; onboardingStatus: string };
        relationship: {
          id: string;
          status: string;
          onboardingStatus: string;
          traineeUserId: string;
        };
      };
    };
    expect(acceptBody.data.invitation.status).toBe("accepted");
    expect(acceptBody.data.relationship.status).toBe("onboarding_pending");
    expect(acceptBody.data.relationship.onboardingStatus).toBe(
      "onboarding_pending",
    );

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
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      data: { permittedRoles: string[]; traineeProfileId: string | null };
    };
    expect(meBody.data.permittedRoles).toContain("trainee");
    expect(meBody.data.traineeProfileId).toBeTruthy();

    const foreignTrainer = await createTrainerSession("other@example.com");
    const foreignRel = await app.request(
      `/relationships/${acceptBody.data.relationship.id}`,
      { headers: { Cookie: foreignTrainer.cookie } },
      testEnv(),
    );
    expect(foreignRel.status).toBe(404);
  });
});

describe("intake and onboarding", () => {
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  async function inviteAndAccept() {
    const trainer = await createTrainerSession("intake-coach@example.com");
    const created = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-intake-1",
        },
        body: JSON.stringify({ recipientEmail: "intake-trainee@example.com" }),
      },
      testEnv(),
    );
    const createdBody = (await created.json()) as { data: { token: string } };
    const traineeToken = createTestIdToken(
      "intake-trainee-fb",
      "intake-trainee@example.com",
    );
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
    const acceptBody = (await accept.json()) as {
      data: { relationship: { id: string } };
    };
    return {
      trainerCookie: trainer.cookie,
      traineeToken,
      relationshipId: acceptBody.data.relationship.id,
    };
  }

  it("walks Invited → Pending → Submitted → Coaching Ready without silent overwrite", async () => {
    const { trainerCookie, traineeToken, relationshipId } = await inviteAndAccept();

    const definition = await app.request(
      "/intake/definitions/current",
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(definition.status).toBe(200);
    const definitionBody = (await definition.json()) as {
      data: { key: string; version: number; fields: Array<{ id: string }> };
    };
    expect(definitionBody.data.key).toBe("mvp");
    expect(definitionBody.data.version).toBe(1);
    expect(definitionBody.data.fields.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        "goals",
        "relevant_history",
        "preferences",
        "schedule",
        "limitations",
      ]),
    );

    const draft = await app.request(
      `/intake/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          answers: { goals: "Strength", schedule: "" },
        }),
      },
      testEnv(),
    );
    expect(draft.status).toBe(201);
    const draftBody = (await draft.json()) as {
      data: { version: number; status: string };
    };
    expect(draftBody.data.status).toBe("draft");
    expect(draftBody.data.version).toBe(1);

    const incomplete = await app.request(
      `/intake/relationships/${relationshipId}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-incomplete",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(incomplete.status).toBe(422);

    const draft2 = await app.request(
      `/intake/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 1,
          answers: {
            goals: "Strength",
            schedule: "Mon/Wed/Fri evenings",
            limitations: "Knee pain",
          },
        }),
      },
      testEnv(),
    );
    expect(draft2.status).toBe(200);
    const draft2Body = (await draft2.json()) as { data: { version: number } };

    const submit = await app.request(
      `/intake/relationships/${relationshipId}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-ok",
        },
        body: JSON.stringify({ expectedVersion: draft2Body.data.version }),
      },
      testEnv(),
    );
    expect(submit.status).toBe(200);
    const submitBody = (await submit.json()) as {
      data: { status: string; submittedAt: string | null };
    };
    expect(submitBody.data.status).toBe("submitted");
    expect(submitBody.data.submittedAt).toBeTruthy();

    const overwrite = await app.request(
      `/intake/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: draft2Body.data.version + 1,
          answers: { goals: "Silent overwrite attempt", schedule: "Nope" },
        }),
      },
      testEnv(),
    );
    expect(overwrite.status).toBe(409);
    const overwriteBody = (await overwrite.json()) as { error: { code: string } };
    expect(["INTAKE_NOT_EDITABLE", "INTAKE_ALREADY_SUBMITTED"]).toContain(
      overwriteBody.error.code,
    );

    const rel = await app.request(
      `/relationships/${relationshipId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(rel.status).toBe(200);
    const relBody = (await rel.json()) as {
      data: { status: string; onboardingStatus: string };
    };
    expect(relBody.data.status).toBe("onboarding_submitted");
    expect(relBody.data.onboardingStatus).toBe("onboarding_submitted");

    const review = await app.request(
      `/intake/relationships/${relationshipId}/review`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "review-1",
        },
        body: JSON.stringify({ outcome: "coaching_ready" }),
      },
      testEnv(),
    );
    expect(review.status).toBe(200);
    const reviewBody = (await review.json()) as {
      data: {
        onboardingStatus: string;
        relationship: { status: string };
      };
    };
    expect(reviewBody.data.onboardingStatus).toBe("coaching_ready");
    expect(reviewBody.data.relationship.status).toBe("coaching_ready");

    const trainerIntake = await app.request(
      `/intake/relationships/${relationshipId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(trainerIntake.status).toBe(200);
    const trainerIntakeBody = (await trainerIntake.json()) as {
      data: { answers: Record<string, string> };
    };
    expect(trainerIntakeBody.data.answers.goals).toBe("Strength");
  });
});

const SAMPLE_DRAFT = {
  primaryGoal: "Build strength",
  notes: "Focus on compound lifts",
  workout: { sessionsPerWeek: 4, completionWindowHours: 24 },
  nutrition: {
    mealsPerDay: 3,
    confirmationWindowHours: 6,
    photoRequirement: "selected_meals" as const,
  },
  checkin: { cadence: "weekly" as const, dueWindowHours: 48 },
  tracking: {
    requireBodyWeight: true,
    requireProgressPhotos: false,
    requireSessionRpe: true,
  },
};

describe("coaching configuration", () => {
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  async function readyRelationship(trainerEmail: string, traineeEmail: string) {
    const trainer = await createTrainerSession(trainerEmail);
    const created = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": `inv-${traineeEmail}`,
        },
        body: JSON.stringify({ recipientEmail: traineeEmail }),
      },
      testEnv(),
    );
    const createdBody = (await created.json()) as { data: { token: string } };
    const traineeToken = createTestIdToken(
      `fb-${traineeEmail}`,
      traineeEmail,
    );
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
    const acceptBody = (await accept.json()) as {
      data: { relationship: { id: string } };
    };
    const relationshipId = acceptBody.data.relationship.id;

    await app.request(
      `/intake/relationships/${relationshipId}/draft`,
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
            goals: "Strength",
            schedule: "Evenings",
            limitations: "None",
          },
        }),
      },
      testEnv(),
    );
    const submit = await app.request(
      `/intake/relationships/${relationshipId}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": `submit-${traineeEmail}`,
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(submit.status).toBe(200);

    const review = await app.request(
      `/intake/relationships/${relationshipId}/review`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": `review-${traineeEmail}`,
        },
        body: JSON.stringify({ outcome: "coaching_ready" }),
      },
      testEnv(),
    );
    expect(review.status).toBe(200);

    return { trainerCookie: trainer.cookie, relationshipId, traineeToken };
  }

  it("returns 401 when unauthenticated", async () => {
    const response = await app.request(
      "/configurations/relationships/00000000-0000-4000-8000-000000000099",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("walks Draft → Configured → Active and rejects wrong trainer", async () => {
    const owner = await readyRelationship(
      "config-owner@example.com",
      "config-trainee@example.com",
    );
    const other = await createTrainerSession("config-other@example.com");

    const unauthDraft = await app.request(
      `/configurations/relationships/${owner.relationshipId}/draft`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 0, ...SAMPLE_DRAFT }),
      },
      testEnv(),
    );
    expect(unauthDraft.status).toBe(401);

    const forbidden = await app.request(
      `/configurations/relationships/${owner.relationshipId}`,
      { headers: { Cookie: other.cookie } },
      testEnv(),
    );
    expect(forbidden.status).toBe(404);
    const forbiddenBody = await forbidden.json();
    expect(forbiddenBody).toMatchObject({
      error: { code: "RELATIONSHIP_NOT_FOUND" },
    });

    const draft = await app.request(
      `/configurations/relationships/${owner.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: owner.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expectedVersion: 0, ...SAMPLE_DRAFT }),
      },
      testEnv(),
    );
    expect(draft.status).toBe(201);
    const draftBody = (await draft.json()) as {
      data: {
        status: string;
        version: number;
        primaryGoal: string;
        workout: { sessionsPerWeek: number };
        nutrition: { photoRequirement: string };
        tracking: { requireSessionRpe: boolean };
      };
    };
    expect(draftBody.data.status).toBe("draft");
    expect(draftBody.data.version).toBe(1);
    expect(draftBody.data.primaryGoal).toBe("Build strength");
    expect(draftBody.data.workout.sessionsPerWeek).toBe(4);
    expect(draftBody.data.nutrition.photoRequirement).toBe("selected_meals");
    expect(draftBody.data.tracking.requireSessionRpe).toBe(true);

    const incomplete = await app.request(
      `/configurations/relationships/${owner.relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: owner.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "cfg-incomplete",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    // primary goal is present — should succeed
    expect(incomplete.status).toBe(200);
    const configuredBody = (await incomplete.json()) as {
      data: { status: string; version: number; configuredAt: string | null };
    };
    expect(configuredBody.data.status).toBe("configured");
    expect(configuredBody.data.configuredAt).toBeTruthy();

    const activate = await app.request(
      `/configurations/relationships/${owner.relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: owner.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "cfg-activate",
        },
        body: JSON.stringify({
          expectedVersion: configuredBody.data.version,
        }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(200);
    const activateBody = (await activate.json()) as {
      data: { status: string; activatedAt: string | null };
    };
    expect(activateBody.data.status).toBe("active");
    expect(activateBody.data.activatedAt).toBeTruthy();

    const get = await app.request(
      `/configurations/relationships/${owner.relationshipId}`,
      { headers: { Cookie: owner.trainerCookie } },
      testEnv(),
    );
    expect(get.status).toBe(200);
    const getBody = (await get.json()) as {
      data: { status: string; primaryGoal: string };
    };
    expect(getBody.data.status).toBe("active");
    expect(getBody.data.primaryGoal).toBe("Build strength");

    const editActive = await app.request(
      `/configurations/relationships/${owner.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: owner.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: configuredBody.data.version + 1,
          ...SAMPLE_DRAFT,
          primaryGoal: "Should fail",
        }),
      },
      testEnv(),
    );
    expect(editActive.status).toBe(409);
  });

  it("rejects configure without primary goal", async () => {
    const owner = await readyRelationship(
      "config-goal@example.com",
      "config-goal-trainee@example.com",
    );

    const draft = await app.request(
      `/configurations/relationships/${owner.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: owner.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          ...SAMPLE_DRAFT,
          primaryGoal: null,
        }),
      },
      testEnv(),
    );
    expect(draft.status).toBe(201);
    const draftBody = (await draft.json()) as { data: { version: number } };

    const configure = await app.request(
      `/configurations/relationships/${owner.relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: owner.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "cfg-no-goal",
        },
        body: JSON.stringify({ expectedVersion: draftBody.data.version }),
      },
      testEnv(),
    );
    expect(configure.status).toBe(422);
    const body = await configure.json();
    expect(body).toMatchObject({
      error: { code: "CONFIGURATION_INCOMPLETE" },
    });
  });
});
