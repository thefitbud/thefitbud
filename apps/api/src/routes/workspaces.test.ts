import initSqlJs from "sql.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sql-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDaysToLocalDate, formatLocalDate } from "@fitbud/core";
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
  ]) {
    sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
  }
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  return { db, close: () => sqlite.close() };
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

function sampleContent() {
  return {
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
    mealPrescriptions: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        order: 1,
        name: "Lunch",
        scheduleHint: "12:30",
        instructions: "Dal and rice",
        photoRequired: false,
      },
    ],
  };
}

async function acceptClient(suffix: string, displayName: string) {
  const trainer = await createTrainerSession(`ws-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-ws-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `ws-trainee-${suffix}@example.com`,
        recipientDisplayName: displayName,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `ws-trainee-${suffix}`,
    `ws-trainee-${suffix}@example.com`,
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
  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId: acceptBody.data.relationship.id,
  };
}

async function reachActiveConfig(suffix: string, displayName: string) {
  const client = await acceptClient(suffix, displayName);
  const { trainerCookie, traineeToken, relationshipId } = client;
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
        "Idempotency-Key": `submit-ws-${suffix}`,
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
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-ws-${suffix}`,
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
        Cookie: trainerCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: 0,
        primaryGoal: "Build strength",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 3,
          confirmationWindowHours: 12,
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
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `cfg-ws-${suffix}`,
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
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `act-ws-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 2 }),
    },
    testEnv(),
  );
  return client;
}

type WorkspaceBody = {
  header: {
    traineeDisplayName: string;
    onboardingStatus: string;
    effectivePlan: { id: string; title: string; effectiveFrom: string | null } | null;
    primaryGoal: string | null;
    renewalState: string | null;
  };
  overview: {
    openException: { id: string; type: string; status: string } | null;
    nextCheckin: { id: string; status: string } | null;
    recentActivity: Array<{ id: string; type: string; planVersionId: string | null }>;
    progress: { measurements: unknown[]; entries: unknown[]; media: unknown[] };
  };
  plan: { plan: { id: string } | null; version: { id: string } | null };
  configuration: {
    configuration: { primaryGoal: string | null } | null;
    subscription: { id: string; versionNumber: number; planName: string; renewalState: string } | null;
  };
  history: { relationshipId: string };
};

async function readWorkspace(cookie: string, relationshipId: string) {
  const response = await app.request(
    `/workspaces/relationships/${relationshipId}`,
    { headers: { Cookie: cookie } },
    testEnv(),
  );
  return response;
}

describe("client workspace", () => {
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

  it("returns an empty workspace for a newly accepted client", async () => {
    const { trainerCookie, relationshipId } = await acceptClient("new", "Asha Menon");
    const response = await readWorkspace(trainerCookie, relationshipId);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: WorkspaceBody };
    expect(body.data.header.traineeDisplayName).toBe("Asha Menon");
    expect(body.data.header.onboardingStatus).toBe("onboarding_pending");
    expect(body.data.header.effectivePlan).toBeNull();
    expect(body.data.header.primaryGoal).toBeNull();
    expect(body.data.header.renewalState).toBeNull();
    expect(body.data.overview.openException).toBeNull();
    expect(body.data.overview.nextCheckin).toBeNull();
    expect(body.data.overview.recentActivity).toEqual([]);
    expect(body.data.overview.progress).toEqual({
      measurements: [],
      entries: [],
      media: [],
    });
    expect(body.data.plan).toEqual({ plan: null, version: null });
    expect(body.data.configuration).toEqual({
      configuration: null,
      subscription: null,
    });
    expect(body.data.history.relationshipId).toBe(relationshipId);
  });

  it("composes plan, subscription, activity, and attention for an owned client", async () => {
    const { trainerCookie, traineeToken, relationshipId } = await reachActiveConfig(
      "active",
      "Asha Menon",
    );
    const today = formatLocalDate(new Date(), "Asia/Kolkata");

    const created = await app.request(
      `/plans/relationships/${relationshipId}`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ws-plan-1",
        },
        body: JSON.stringify({
          title: "Foundation block",
          content: sampleContent(),
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: {
        plan: { id: string };
        version: { id: string; recordVersion: number };
      };
    };
    const originalVersionId = createdBody.data.version.id;
    const published = await app.request(
      `/plans/${createdBody.data.plan.id}/versions/${originalVersionId}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ws-plan-publish",
        },
        body: JSON.stringify({
          expectedRecordVersion: createdBody.data.version.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(published.status).toBe(200);

    const beforeSubscription = await readWorkspace(trainerCookie, relationshipId);
    expect(beforeSubscription.status).toBe(200);
    const beforeBody = (await beforeSubscription.json()) as { data: WorkspaceBody };
    expect(beforeBody.data.header.traineeDisplayName).toBe("Asha Menon");
    expect(beforeBody.data.header.onboardingStatus).toBe("active");
    expect(beforeBody.data.header.primaryGoal).toBe("Build strength");
    expect(beforeBody.data.header.effectivePlan).toMatchObject({
      id: createdBody.data.plan.id,
      title: "Foundation block",
    });
    expect(beforeBody.data.header.renewalState).toBeNull();
    expect(beforeBody.data.configuration.subscription).toBeNull();
    expect(beforeBody.data.configuration.configuration?.primaryGoal).toBe(
      "Build strength",
    );
    expect(beforeBody.data.plan.version?.id).toBe(originalVersionId);

    const save = async (
      key: string,
      expectedVersion: number,
      planName: string,
      renewsOn: string,
    ) => {
      const response = await app.request(
        `/relationships/${relationshipId}/subscription`,
        {
          method: "PUT",
          headers: {
            Cookie: trainerCookie,
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            expectedVersion,
            planName,
            paymentFrequency: "monthly",
            startsOn: addDaysToLocalDate(today, -10),
            renewsOn,
          }),
        },
        testEnv(),
      );
      expect(response.status === 200 || response.status === 201).toBe(true);
      return (await response.json()) as {
        data: { id: string; versionNumber: number; planName: string };
      };
    };
    const firstSubscription = await save(
      "ws-sub-1",
      0,
      "Starter",
      addDaysToLocalDate(today, 40),
    );
    const latestSubscription = await save(
      "ws-sub-2",
      1,
      "Coaching",
      addDaysToLocalDate(today, 3),
    );
    expect(latestSubscription.data.versionNumber).toBe(2);

    const generated = await app.request(
      `/workouts/relationships/${relationshipId}/assignments/generate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ws-gen-workouts",
        },
        body: JSON.stringify({
          fromDate: today,
          toDate: addDaysToLocalDate(today, 13),
        }),
      },
      testEnv(),
    );
    expect(generated.status).toBe(200);
    const generatedBody = (await generated.json()) as {
      data: { created: number; assignments: Array<{ planVersionId: string }> };
    };
    expect(generatedBody.data.created).toBeGreaterThan(1);
    expect(
      generatedBody.data.assignments.every(
        (assignment) => assignment.planVersionId === originalVersionId,
      ),
    ).toBe(true);

    const nextDraft = await app.request(
      `/plans/${createdBody.data.plan.id}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ws-plan-next",
        },
        body: JSON.stringify({ sourceVersionId: originalVersionId }),
      },
      testEnv(),
    );
    const nextDraftBody = (await nextDraft.json()) as {
      data: { id: string; recordVersion: number };
    };
    const publishedNext = await app.request(
      `/plans/${createdBody.data.plan.id}/versions/${nextDraftBody.data.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ws-plan-publish-2",
        },
        body: JSON.stringify({
          expectedRecordVersion: nextDraftBody.data.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(publishedNext.status).toBe(200);

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ws-checkin",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    expect(scheduled.status).toBe(200);
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string } };
    };
    await db
      .update(schema.checkins)
      .set({
        windowStartsAt: "2020-01-01T00:00:00.000Z",
        windowEndsAt: "2020-01-02T00:00:00.000Z",
      })
      .where(eq(schema.checkins.id, scheduledBody.data.checkin.id));
    const evaluate = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ws-eval",
        },
        body: "{}",
      },
      testEnv(),
    );
    expect(evaluate.status).toBe(200);

    const response = await readWorkspace(trainerCookie, relationshipId);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: WorkspaceBody };
    expect(body.data.configuration.subscription).toMatchObject({
      id: latestSubscription.data.id,
      versionNumber: 2,
      planName: "Coaching",
      renewalState: "upcoming",
    });
    expect(body.data.header.renewalState).toBe("upcoming");
    expect(body.data.configuration.subscription?.id).not.toBe(firstSubscription.data.id);
    expect(body.data.plan.version?.id).toBe(nextDraftBody.data.id);
    expect(body.data.overview.openException).toMatchObject({
      type: "overdue_checkin",
      status: "active",
    });
    expect(body.data.overview.nextCheckin).toMatchObject({
      id: scheduledBody.data.checkin.id,
      status: "overdue",
    });
    expect(body.data.overview.recentActivity.length).toBeGreaterThan(0);
    expect(body.data.overview.recentActivity.length).toBeLessThanOrEqual(5);
    expect(
      body.data.overview.recentActivity
        .filter((item) => item.type === "workout")
        .every((item) => item.planVersionId === originalVersionId),
    ).toBe(true);

    const history = await app.request(
      `/history/relationships/${relationshipId}?kind=subscription_revision`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const historyBody = (await history.json()) as {
      data: { items: Array<{ summary: string; sourceEntityId: string }> };
    };
    const summaries = historyBody.data.items.map((item) => item.summary);
    expect(summaries.some((summary) => summary.includes("Starter"))).toBe(true);
    expect(summaries.some((summary) => summary.includes("Coaching"))).toBe(true);
    expect(historyBody.data.items.map((item) => item.sourceEntityId)).toContain(
      firstSubscription.data.id,
    );

    async function activity(query: string) {
      const activityResponse = await app.request(
        `/workspaces/relationships/${relationshipId}/activity?${query}`,
        { headers: { Cookie: trainerCookie } },
        testEnv(),
      );
      return activityResponse;
    }

    const seen = new Set<string>();
    let cursor: string | null = null;
    let sampleState: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams({ type: "workout", limit: "1" });
      if (cursor) params.set("cursor", cursor);
      const pageResponse = await activity(params.toString());
      expect(pageResponse.status).toBe(200);
      const pageBody = (await pageResponse.json()) as {
        data: {
          items: Array<{ id: string; state: string; planVersionId: string }>;
          nextCursor: string | null;
        };
      };
      expect(pageBody.data.items).toHaveLength(1);
      expect(pageBody.data.items[0]?.planVersionId).toBe(originalVersionId);
      sampleState = pageBody.data.items[0]!.state;
      seen.add(pageBody.data.items[0]!.id);
      cursor = pageBody.data.nextCursor;
      if (!cursor) break;
    }
    expect(cursor).toBeNull();
    expect(seen.size).toBe(generatedBody.data.created);

    const filtered = await activity(`type=workout&state=${sampleState}`);
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as {
      data: { items: Array<{ state: string }> };
    };
    expect(filteredBody.data.items.length).toBeGreaterThan(0);
    expect(filteredBody.data.items.every((item) => item.state === sampleState)).toBe(
      true,
    );

    const empty = await activity(
      "type=workout&occurredFrom=1999-01-01&occurredTo=1999-01-02",
    );
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as {
      data: { items: unknown[]; nextCursor: string | null };
    };
    expect(emptyBody.data.items).toEqual([]);
    expect(emptyBody.data.nextCursor).toBeNull();

    const mismatched = await activity("type=workout&state=overdue");
    expect(mismatched.status).toBe(400);
    const mismatchedBody = (await mismatched.json()) as { error: { code: string } };
    expect(mismatchedBody.error.code).toBe("INVALID_REQUEST");

    const overdue = await activity("type=checkin&state=overdue");
    expect(overdue.status).toBe(200);
    const overdueBody = (await overdue.json()) as {
      data: { items: Array<{ id: string; state: string; planVersionId: null }> };
    };
    expect(overdueBody.data.items).toEqual([
      expect.objectContaining({
        id: scheduledBody.data.checkin.id,
        state: "overdue",
        planVersionId: null,
      }),
    ]);

    const trainee = await app.request(
      `/workspaces/relationships/${relationshipId}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(trainee.status).toBe(403);

    const other = await createTrainerSession("ws-other@example.com");
    const foreign = await readWorkspace(other.cookie, relationshipId);
    expect(foreign.status).toBe(404);
    const foreignBody = (await foreign.json()) as { error: { code: string } };
    expect(foreignBody.error.code).toBe("RELATIONSHIP_NOT_FOUND");
  });

  it("returns 401 when the workspace is read without a session", async () => {
    const response = await app.request(
      "/workspaces/relationships/00000000-0000-4000-8000-000000000099",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
  });
});
