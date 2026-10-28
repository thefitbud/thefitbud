import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";



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
  return { cookie: setCookie!.split(";")[0]!, token };
}

async function reachCoachingReady(suffix: string) {
  const trainer = await createTrainerSession(`config-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-config-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `config-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `config-trainee-${suffix}`,
    `config-trainee-${suffix}@example.com`,
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
          goals: "Strength",
          relevant_history: "None",
          preferences: "Gym",
          schedule: "Evenings",
          limitations: "Knee",
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
        "Idempotency-Key": `submit-config-${suffix}`,
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
        "Idempotency-Key": `review-config-${suffix}`,
      },
      body: JSON.stringify({ outcome: "coaching_ready" }),
    },
    testEnv(),
  );

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
  };
}

const draftBody = {
  expectedVersion: 0,
  goalShort: "Build strength",
  notes: "Focus on lower body recovery",
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

  it("returns 401 for unauthenticated configuration reads", async () => {
    const response = await app.request(
      "/configurations/relationships/00000000-0000-4000-8000-000000000099",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("walks Draft → Active directly and rejects edits after activate", async () => {
    const { trainerCookie, traineeToken, relationshipId } =
      await reachCoachingReady("c1");

    const missing = await app.request(
      `/configurations/relationships/${relationshipId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(missing.status).toBe(200);
    const missingBody = (await missing.json()) as { data: unknown };
    expect(missingBody.data).toBeNull();

    const draft = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftBody),
      },
      testEnv(),
    );
    expect(draft.status).toBe(201);
    const draftParsed = (await draft.json()) as {
      data: {
        status: string;
        recordVersion: number;
        versionNumber: number;
        workout: { sessionsPerWeek: number };
        missingSections: string[];
      };
    };
    expect(draftParsed.data.status).toBe("draft");
    expect(draftParsed.data.recordVersion).toBe(1);
    expect(draftParsed.data.versionNumber).toBe(1);
    expect(draftParsed.data.workout.sessionsPerWeek).toBe(4);
    expect(draftParsed.data.missingSections).toEqual([]);

    const traineeRead = await app.request(
      `/configurations/relationships/${relationshipId}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(traineeRead.status).toBe(200);
    const traineeBody = (await traineeRead.json()) as {
      data: { missingSections: string[] };
    };
    expect(traineeBody.data.missingSections).toEqual([]);

    const configure = await app.request(
      `/configurations/relationships/${relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "configure-1",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(configure.status).toBe(200);
    const configured = (await configure.json()) as {
      data: { status: string; recordVersion: number; configuredAt: string | null };
    };
    expect(configured.data.status).toBe("draft");
    expect(configured.data.recordVersion).toBe(1);
    expect(configured.data.configuredAt).toBeNull();

    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-1",
        },
        body: JSON.stringify({ expectedVersion: configured.data.recordVersion }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(200);
    const activated = (await activate.json()) as {
      data: { status: string; recordVersion: number; missingSections: string[] };
    };
    expect(activated.data.status).toBe("active");
    expect(activated.data.missingSections).toEqual([]);

    const locked = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...draftBody,
          expectedVersion: activated.data.recordVersion,
          goalShort: "Should fail",
        }),
      },
      testEnv(),
    );
    expect(locked.status).toBe(409);
    const lockedBody = (await locked.json()) as { error: { code: string } };
    expect(lockedBody.error.code).toBe("CONFIGURATION_NOT_EDITABLE");
  });

  it("returns missingSections on GET and rejects activate until a short goal is saved", async () => {
    const { trainerCookie, relationshipId } = await reachCoachingReady("goal");
    const saved = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...draftBody,
          goalShort: null,
          goalDescription: "A longer description does not satisfy the short goal.",
        }),
      },
      testEnv(),
    );
    expect(saved.status).toBe(201);
    const draft = (await saved.json()) as {
      data: { recordVersion: number; missingSections: string[] };
    };
    expect(draft.data.missingSections).toEqual(["goal"]);

    const get = await app.request(
      `/configurations/relationships/${relationshipId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(get.status).toBe(200);
    const getBody = (await get.json()) as {
      data: { missingSections: string[] };
    };
    expect(getBody.data.missingSections).toEqual(["goal"]);

    const configure = await app.request(
      `/configurations/relationships/${relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "configure-missing-goal",
        },
        body: JSON.stringify({ expectedVersion: draft.data.recordVersion }),
      },
      testEnv(),
    );
    expect(configure.status).toBe(200);
    const configureBody = (await configure.json()) as {
      data: { status: string; recordVersion: number; missingSections: string[] };
    };
    expect(configureBody.data.status).toBe("draft");
    expect(configureBody.data.recordVersion).toBe(draft.data.recordVersion);
    expect(configureBody.data.missingSections).toEqual(["goal"]);

    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-missing-goal",
        },
        body: JSON.stringify({ expectedVersion: draft.data.recordVersion }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(422);
    const activateBody = (await activate.json()) as {
      error: { code: string; details: { missingSections: string[] } };
    };
    expect(activateBody.error.code).toBe("CONFIGURATION_INCOMPLETE");
    expect(activateBody.error.details.missingSections).toEqual(["goal"]);
  });

  it("isolates configuration across trainers", async () => {
    const first = await reachCoachingReady("iso-a");
    await app.request(
      `/configurations/relationships/${first.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: first.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftBody),
      },
      testEnv(),
    );

    const otherTrainer = await createTrainerSession("other-config@example.com");
    const forbidden = await app.request(
      `/configurations/relationships/${first.relationshipId}`,
      { headers: { Cookie: otherTrainer.cookie } },
      testEnv(),
    );
    expect(forbidden.status).toBe(404);
    const forbiddenBody = (await forbidden.json()) as { error: { code: string } };
    expect(forbiddenBody.error.code).toBe("RELATIONSHIP_NOT_FOUND");
  });

  it("creates a draft from core defaults and copies settings into a new draft", async () => {
    const source = await reachCoachingReady("defaults");
    const created = await app.request(
      `/configurations/relationships/${source.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          goalShort: "Build strength",
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: {
        id: string;
        workout: { sessionsPerWeek: number; completionWindowHours: number };
        nutrition: {
          mealsPerDay: number;
          confirmationWindowHours: number;
          photoRequirement: string;
        };
        checkin: { cadence: string; dueWindowHours: number };
        tracking: {
          requireBodyWeight: boolean;
          requireProgressPhotos: boolean;
          requireSessionRpe: boolean;
        };
      };
    };
    expect(createdBody.data.workout).toEqual({
      sessionsPerWeek: 3,
      completionWindowHours: 24,
    });
    expect(createdBody.data.nutrition).toEqual({
      mealsPerDay: 3,
      confirmationWindowHours: 6,
      photoRequirement: "none",
    });
    expect(createdBody.data.checkin).toEqual({
      cadence: "weekly",
      dueWindowHours: 48,
      formVersionId: null,
    });
    expect(createdBody.data.tracking).toEqual({
      requireBodyWeight: false,
      requireProgressPhotos: false,
      requireSessionRpe: false,
    });

    const configured = await app.request(
      `/configurations/relationships/${source.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...draftBody,
          expectedVersion: 1,
          goalShort: "Build strength",
        }),
      },
      testEnv(),
    );
    expect(configured.status).toBe(200);
    const saved = (await configured.json()) as { data: { recordVersion: number } };
    const mark = await app.request(
      `/configurations/relationships/${source.relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "configure-copy-source",
        },
        body: JSON.stringify({ expectedVersion: saved.data.recordVersion }),
      },
      testEnv(),
    );
    expect(mark.status).toBe(200);
    const marked = (await mark.json()) as { data: { recordVersion: number } };
    const activate = await app.request(
      `/configurations/relationships/${source.relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-copy-source",
        },
        body: JSON.stringify({ expectedVersion: marked.data.recordVersion }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(200);

    const other = await reachCoachingReady("copy-other");
    const unownedSource = await app.request(
      `/configurations/relationships/${source.relationshipId}/copy`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "copy-unowned-source",
        },
        body: JSON.stringify({ sourceRelationshipId: other.relationshipId }),
      },
      testEnv(),
    );
    expect(unownedSource.status).toBe(404);

    const createdInvite = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-copy-second",
        },
        body: JSON.stringify({
          recipientEmail: "config-trainee-copy-second@example.com",
        }),
      },
      testEnv(),
    );
    const createdInviteBody = (await createdInvite.json()) as {
      data: { token: string };
    };
    const traineeToken = createTestIdToken(
      "config-trainee-copy-second",
      "config-trainee-copy-second@example.com",
    );
    const accept = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: createdInviteBody.data.token }),
      },
      testEnv(),
    );
    const acceptBody = (await accept.json()) as {
      data: { relationship: { id: string } };
    };
    const second = acceptBody.data.relationship.id;
    await app.request(
      `/onboarding/relationships/${second}/draft`,
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
            relevant_history: "None",
            preferences: "Gym",
            schedule: "Evenings",
            limitations: "Knee",
          },
        }),
      },
      testEnv(),
    );
    const intake = await app.request(
      `/onboarding/relationships/${second}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-copy-second",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(intake.status).toBe(200);
    const review = await app.request(
      `/onboarding/relationships/${second}/review`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "review-copy-second",
        },
        body: JSON.stringify({ outcome: "coaching_ready" }),
      },
      testEnv(),
    );
    expect(review.status).toBe(200);

    const copied = await app.request(
      `/configurations/relationships/${second}/copy`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "copy-settings",
        },
        body: JSON.stringify({ sourceRelationshipId: source.relationshipId }),
      },
      testEnv(),
    );
    expect(copied.status).toBe(201);
    const copiedBody = (await copied.json()) as {
      data: {
        id: string;
        status: string;
        coachingRelationshipId: string;
        workout: { sessionsPerWeek: number };
      };
    };
    expect(copiedBody.data.id).not.toBe(createdBody.data.id);
    expect(copiedBody.data.status).toBe("draft");
    expect(copiedBody.data.coachingRelationshipId).toBe(second);
    expect(copiedBody.data.workout.sessionsPerWeek).toBe(4);

    const edited = await app.request(
      `/configurations/relationships/${second}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 1,
          workout: { sessionsPerWeek: 2, completionWindowHours: 24 },
        }),
      },
      testEnv(),
    );
    expect(edited.status).toBe(200);

    const sourceAfter = await app.request(
      `/configurations/relationships/${source.relationshipId}`,
      { headers: { Cookie: source.trainerCookie } },
      testEnv(),
    );
    const sourceAfterBody = (await sourceAfter.json()) as {
      data: { id: string; status: string; workout: { sessionsPerWeek: number } };
    };
    expect(sourceAfterBody.data.status).toBe("active");
    expect(sourceAfterBody.data.id).not.toBe(copiedBody.data.id);
    expect(sourceAfterBody.data.workout.sessionsPerWeek).toBe(4);

    const presets = await app.request(
      "/configurations/presets",
      { headers: { Cookie: source.trainerCookie } },
      testEnv(),
    );
    expect(presets.status).toBe(404);
  });

  it("rolls back activate on version conflict and keeps the previous active row", async () => {
    const { trainerCookie, relationshipId } = await reachCoachingReady("conflict");
    const draft = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftBody),
      },
      testEnv(),
    );
    expect(draft.status).toBe(201);
    const first = (await draft.json()) as {
      data: { id: string; recordVersion: number };
    };
    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-conflict-v1",
        },
        body: JSON.stringify({ expectedVersion: first.data.recordVersion }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(200);
    const active = (await activate.json()) as {
      data: { id: string; recordVersion: number; status: string };
    };
    expect(active.data.status).toBe("active");

    const opened = await app.request(
      `/configurations/relationships/${relationshipId}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "versions-conflict-1",
        },
        body: JSON.stringify({ expectedVersion: active.data.recordVersion }),
      },
      testEnv(),
    );
    expect(opened.status).toBe(201);
    const next = (await opened.json()) as {
      data: { id: string; recordVersion: number; versionNumber: number };
    };
    expect(next.data.versionNumber).toBe(2);

    const stale = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-stale-version",
        },
        body: JSON.stringify({ expectedVersion: 0 }),
      },
      testEnv(),
    );
    expect(stale.status).toBe(409);
    const staleBody = (await stale.json()) as { error: { code: string } };
    expect(staleBody.error.code).toBe("CONFIGURATION_VERSION_CONFLICT");

    const after = await app.request(
      `/configurations/relationships/${relationshipId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const afterBody = (await after.json()) as {
      data: { id: string; status: string; versionNumber: number };
    };
    expect(afterBody.data.status).toBe("draft");
    expect(afterBody.data.id).toBe(next.data.id);
    expect(afterBody.data.versionNumber).toBe(2);
  });

  it("discards an open vN+1 draft and returns the active configuration", async () => {
    const { trainerCookie, relationshipId } = await reachCoachingReady("discard");
    await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftBody),
      },
      testEnv(),
    );
    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-for-discard",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    const active = (await activate.json()) as {
      data: { id: string; recordVersion: number };
    };
    const opened = await app.request(
      `/configurations/relationships/${relationshipId}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "versions-for-discard",
        },
        body: JSON.stringify({ expectedVersion: active.data.recordVersion }),
      },
      testEnv(),
    );
    expect(opened.status).toBe(201);
    const draft = (await opened.json()) as { data: { id: string } };
    expect(draft.data.id).not.toBe(active.data.id);

    const discarded = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "DELETE",
        headers: { Cookie: trainerCookie },
      },
      testEnv(),
    );
    expect(discarded.status).toBe(200);
    const discardedBody = (await discarded.json()) as {
      data: { id: string; status: string; versionNumber: number };
    };
    expect(discardedBody.data.id).toBe(active.data.id);
    expect(discardedBody.data.status).toBe("active");
    expect(discardedBody.data.versionNumber).toBe(1);
  });

  it("materialises assignments immediately after activate when a plan is published", async () => {
    const { trainerCookie, relationshipId } = await reachCoachingReady("schedule");
    await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftBody),
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
          "Idempotency-Key": "plan-before-activate",
        },
        body: JSON.stringify({
          title: "Foundation",
          content: {
            workoutDays: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                order: 1,
                name: "Day A",
                weekday: 1,
                exercises: [],
              },
            ],
            mealPrescriptions: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                order: 1,
                name: "Breakfast",
                mealType: "breakfast",
                applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
                localTime: "08:00",
                scheduleHint: "Morning",
                instructions: null,
                photoRequired: false,
              },
            ],
          },
        }),
      },
      testEnv(),
    );
    expect(plan.status).toBe(201);
    const planBody = (await plan.json()) as {
      data: {
        plan: { id: string };
        version: { id: string; recordVersion: number };
      };
    };
    const published = await app.request(
      `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "pub-before-activate",
        },
        body: JSON.stringify({
          expectedRecordVersion: planBody.data.version.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(published.status).toBe(200);

    const before = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=2020-01-01&toDate=2099-01-01`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const beforeBody = (await before.json()) as { data: { items: unknown[] } };
    expect(beforeBody.data.items).toHaveLength(0);

    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-with-plan",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(200);

    const workouts = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=2020-01-01&toDate=2099-01-01`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(workouts.status).toBe(200);
    const workoutBody = (await workouts.json()) as { data: { items: unknown[] } };
    expect(workoutBody.data.items.length).toBeGreaterThan(0);

    const meals = await app.request(
      `/meals/relationships/${relationshipId}/assignments?fromDate=2020-01-01&toDate=2099-01-01`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(meals.status).toBe(200);
    const mealBody = (await meals.json()) as { data: { items: unknown[] } };
    expect(mealBody.data.items.length).toBeGreaterThan(0);
  });
});
