import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatLocalDate, weekdayFromLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createId } from "../lib/crypto.js";
import * as schema from "../db/schema.js";



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
  const trainer = await createTrainerSession(`ex-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-ex-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `ex-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `ex-trainee-${suffix}`,
    `ex-trainee-${suffix}@example.com`,
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
    data: { relationship: { id: string; traineeUserId: string } };
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
        "Idempotency-Key": `submit-ex-${suffix}`,
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
        "Idempotency-Key": `review-ex-${suffix}`,
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
        checkin: { cadence: "weekly", dueWindowHours: 1 },
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
        "Idempotency-Key": `cfg-ex-${suffix}`,
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
        "Idempotency-Key": `act-ex-${suffix}`,
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

describe("intervention loop", () => {
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

  it("returns 401 for unauthenticated attention feed", async () => {
    const response = await app.request("/exceptions/attention", {}, testEnv());
    expect(response.status).toBe(401);
  });

  it("rejects trainee exception acknowledge with 403", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveConfig("authz");

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "sched-authz",
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
          "Idempotency-Key": "eval-authz",
        },
        body: "{}",
      },
      testEnv(),
    );
    expect(evaluate.status).toBe(200);
    const evaluateBody = (await evaluate.json()) as {
      data: { exceptions: Array<{ id: string }> };
    };
    expect(evaluateBody.data.exceptions.length).toBeGreaterThan(0);
    const exceptionId = evaluateBody.data.exceptions[0]!.id;

    const traineeAck = await app.request(
      `/exceptions/${exceptionId}/acknowledge`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "trainee-ack",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(traineeAck.status).toBe(403);
  });

  it("detects overdue check-in, surfaces attention, acknowledge/resolve without rewriting source", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveConfig("lifecycle");

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "sched-life",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string; recordStatus: string; windowEndsAt: string } };
    };
    const checkinId = scheduledBody.data.checkin.id;
    const originalEnds = scheduledBody.data.checkin.windowEndsAt;

    await db
      .update(schema.checkins)
      .set({
        windowStartsAt: "2020-01-01T00:00:00.000Z",
        windowEndsAt: "2020-01-02T00:00:00.000Z",
      })
      .where(eq(schema.checkins.id, checkinId));

    const evaluate = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-life",
        },
        body: "{}",
      },
      testEnv(),
    );
    expect(evaluate.status).toBe(200);
    const evaluateBody = (await evaluate.json()) as {
      data: {
        created: number;
        activated: number;
        exceptions: Array<{
          id: string;
          type: string;
          severity: string;
          status: string;
          sourceEntityId: string;
        }>;
      };
    };
    expect(evaluateBody.data.created).toBeGreaterThanOrEqual(1);
    expect(evaluateBody.data.exceptions[0]?.type).toBe("overdue_checkin");
    expect(evaluateBody.data.exceptions[0]?.severity).toBe("attention");
    expect(evaluateBody.data.exceptions[0]?.status).toBe("active");
    expect(evaluateBody.data.exceptions[0]?.sourceEntityId).toBe(checkinId);
    const exceptionId = evaluateBody.data.exceptions[0]!.id;

    const again = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-life-2",
        },
        body: "{}",
      },
      testEnv(),
    );
    const againBody = (await again.json()) as { data: { created: number } };
    expect(againBody.data.created).toBe(0);

    const attention = await app.request(
      "/exceptions/attention",
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(attention.status).toBe(200);
    const attentionBody = (await attention.json()) as {
      data: { items: Array<{ exception: { id: string } }> };
    };
    expect(
      attentionBody.data.items.some(
        (item) => item.exception.id === exceptionId,
      ),
    ).toBe(true);

    const context = await app.request(
      `/checkins/${checkinId}/review-context`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(context.status).toBe(200);
    const contextBody = (await context.json()) as {
      data: {
        activeExceptions: Array<{ id: string; type: string }>;
        checkin: { id: string; recordStatus: string };
      };
    };
    expect(contextBody.data.activeExceptions.some((e) => e.id === exceptionId)).toBe(
      true,
    );
    expect(contextBody.data.checkin.recordStatus).toBe("draft");

    const ack = await app.request(
      `/exceptions/${exceptionId}/acknowledge`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ack-life",
        },
        body: JSON.stringify({ note: "Saw the miss" }),
      },
      testEnv(),
    );
    expect(ack.status).toBe(200);
    const ackBody = (await ack.json()) as {
      data: { status: string };
    };
    expect(ackBody.data.status).toBe("acknowledged");

    const checkinAfterAck = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, checkinId))
      .limit(1);
    expect(checkinAfterAck[0]?.recordStatus).toBe("draft");
    expect(checkinAfterAck[0]?.windowEndsAt).toBe("2020-01-02T00:00:00.000Z");
    expect(originalEnds).not.toBe("2020-01-02T00:00:00.000Z");

    const resolveTooEarly = await app.request(
      `/exceptions/${exceptionId}/resolve`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "resolve-early",
        },
        body: JSON.stringify({
          outcome: "plan_adjusted",
          note: "Adjusted next week",
        }),
      },
      testEnv(),
    );
    // Already acknowledged — resolve should succeed
    expect(resolveTooEarly.status).toBe(200);
    const resolveBody = (await resolveTooEarly.json()) as {
      data: { status: string; closedReason: string | null };
    };
    expect(resolveBody.data.status).toBe("resolved");
    expect(resolveBody.data.closedReason).toBe("trainer");

    const [resolvedRow] = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.id, exceptionId))
      .limit(1);
    expect(resolvedRow?.resolutionOutcome).toBe("plan_adjusted");
    expect(resolvedRow?.resolutionNote).toBe("Adjusted next week");
    expect(resolvedRow?.closedReason).toBe("trainer");

    const interventionRows = await db
      .select()
      .from(schema.interventions)
      .where(eq(schema.interventions.exceptionId, exceptionId));
    expect(interventionRows.some((row) => row.kind === "resolve")).toBe(true);
    expect(interventionRows.some((row) => row.kind === "note")).toBe(true);
    expect(
      interventionRows.find((row) => row.kind === "resolve")?.summary,
    ).toContain("plan_adjusted");
    expect(
      interventionRows.find((row) => row.kind === "note")?.summary,
    ).toBe("Adjusted next week");

    // Re-evaluate must not recreate an active exception for the same source.
    const reEval = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-after-resolve",
        },
        body: "{}",
      },
      testEnv(),
    );
    expect(reEval.status).toBe(200);
    const reEvalBody = (await reEval.json()) as {
      data: { created: number; exceptions: Array<{ sourceEntityId: string; status: string }> };
    };
    expect(
      reEvalBody.data.exceptions.some(
        (ex) => ex.sourceEntityId === checkinId && ex.status !== "resolved",
      ),
    ).toBe(false);

    const checkinAfterResolve = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, checkinId))
      .limit(1);
    expect(checkinAfterResolve[0]?.recordStatus).toBe("draft");

    const attentionAfter = await app.request(
      "/exceptions/attention",
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const attentionAfterBody = (await attentionAfter.json()) as {
      data: { items: Array<{ exception: { id: string } }> };
    };
    expect(
      attentionAfterBody.data.items.some(
        (item) => item.exception.id === exceptionId,
      ),
    ).toBe(false);
  });

  it("isolates another trainer from exception ownership", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveConfig("iso-a");
    const other = await createTrainerSession("ex-other@example.com");

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "sched-iso",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
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
          "Idempotency-Key": "eval-iso",
        },
        body: "{}",
      },
      testEnv(),
    );
    const evaluateBody = (await evaluate.json()) as {
      data: { exceptions: Array<{ id: string }> };
    };
    const exceptionId = evaluateBody.data.exceptions[0]!.id;

    const otherGet = await app.request(
      `/exceptions/${exceptionId}`,
      { headers: { Cookie: other.cookie } },
      testEnv(),
    );
    expect(otherGet.status).toBe(404);

    const otherEval = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: other.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-other",
        },
        body: "{}",
      },
      testEnv(),
    );
    expect(otherEval.status).toBe(404);
  });

  it("stores severity defaults, keeps acknowledged exceptions open, and resolves only when the signal clears", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveConfig("severity");
    const weekday = weekdayFromLocalDate(today);
    const exercise = {
      id: "22222222-2222-4222-8222-222222222222",
      order: 1,
      name: "Squat",
      instructions: "Depth to parallel",
      setTargets: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          order: 1,
          reps: 5,
          loadLabel: "60kg",
          rpe: 7,
        },
      ],
    };
    const plan = await app.request(
      `/plans/relationships/${relationshipId}`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-severity",
        },
        body: JSON.stringify({
          title: "Severity block",
          content: {
            workoutDays: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                order: 1,
                name: "Strength",
                weekday,
                exercises: [exercise],
              },
              {
                id: "11111111-1111-4111-8111-111111111112",
                order: 2,
                name: "Conditioning",
                weekday,
                exercises: [
                  {
                    ...exercise,
                    id: "22222222-2222-4222-8222-222222222223",
                    setTargets: [
                      {
                        ...exercise.setTargets[0],
                        id: "33333333-3333-4333-8333-333333333334",
                      },
                    ],
                  },
                ],
              },
            ],
            mealPrescriptions: [
              ["Breakfast", "breakfast", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"],
              ["Lunch", "lunch", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"],
              ["Snack", "snack", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3"],
              ["Dinner", "dinner", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4"],
            ].map(([name, mealType, id], index) => ({
              id,
              order: index + 1,
              name,
              mealType,
              applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
              localTime: "08:00",
              scheduleHint: null,
              instructions: null,
              photoRequired: false,
            })),
          },
        }),
      },
      testEnv(),
    );
    const planText = await plan.text();
    expect(plan.status, planText).toBe(201);
    const planBody = JSON.parse(planText) as {
      data: { plan: { id: string }; version: { id: string; recordVersion: number } };
    };
    const published = await app.request(
      `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "pub-severity",
        },
        body: JSON.stringify({
          expectedRecordVersion: planBody.data.version.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(published.status, await published.text()).toBe(200);

    const generateBody = JSON.stringify({ fromDate: today, toDate: today });
    for (const [path, key] of [
      [`/workouts/relationships/${relationshipId}/assignments/generate`, "gen-wo-severity"],
      [`/meals/relationships/${relationshipId}/assignments/generate`, "gen-meal-severity"],
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
      expect(generated.status, await generated.text()).toBe(200);
    }

    const workouts = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${today}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const workoutItems = (
      (await workouts.json()) as {
        data: { items: Array<{ id: string; workoutDayName: string }> };
      }
    ).data.items;
    const strength = workoutItems.find((item) => item.workoutDayName === "Strength");
    const conditioning = workoutItems.find(
      (item) => item.workoutDayName === "Conditioning",
    );
    expect(strength).toBeTruthy();
    expect(conditioning).toBeTruthy();

    const meals = await app.request(
      `/meals/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${today}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const mealItems = (
      (await meals.json()) as {
        data: { items: Array<{ id: string; mealName: string }> };
      }
    ).data.items;
    const byMeal = (name: string) => mealItems.find((item) => item.mealName === name);
    const breakfast = byMeal("Breakfast");
    const lunch = byMeal("Lunch");
    const snack = byMeal("Snack");
    const dinner = byMeal("Dinner");
    expect(breakfast && lunch && snack && dinner).toBeTruthy();

    const traineeHeaders = {
      Authorization: `Bearer ${traineeToken}`,
      "x-fitbud-role": "trainee",
      "Content-Type": "application/json",
    };
    const skippedWorkout = await app.request(
      `/workouts/assignments/${strength!.id}/skip`,
      {
        method: "POST",
        headers: { ...traineeHeaders, "Idempotency-Key": "skip-strength" },
      },
      testEnv(),
    );
    expect(skippedWorkout.status, await skippedWorkout.text()).toBe(200);
    const skippedMeal = await app.request(
      `/meals/assignments/${breakfast!.id}/skip`,
      {
        method: "POST",
        headers: { ...traineeHeaders, "Idempotency-Key": "skip-breakfast" },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(skippedMeal.status, await skippedMeal.text()).toBe(200);
    const deviated = await app.request(
      `/meals/assignments/${lunch!.id}/deviate`,
      {
        method: "POST",
        headers: { ...traineeHeaders, "Idempotency-Key": "deviate-lunch" },
        body: JSON.stringify({ deviationKind: "restaurant" }),
      },
      testEnv(),
    );
    expect(deviated.status, await deviated.text()).toBe(200);

    await db
      .update(schema.workoutAssignments)
      .set({
        windowStartsAt: "2020-01-01T00:00:00.000Z",
        windowEndsAt: "2020-01-01T01:00:00.000Z",
      })
      .where(eq(schema.workoutAssignments.id, conditioning!.id));
    await db
      .update(schema.mealAssignments)
      .set({
        windowStartsAt: "2020-01-01T00:00:00.000Z",
        windowEndsAt: "2020-01-01T01:00:00.000Z",
      })
      .where(eq(schema.mealAssignments.id, dinner!.id));

    const evaluate = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-severity",
        },
        body: "{}",
      },
      testEnv(),
    );
    const evaluateText = await evaluate.text();
    expect(evaluate.status, evaluateText).toBe(200);
    const evaluateBody = JSON.parse(evaluateText) as {
      data: {
        exceptions: Array<{
          id: string;
          type: string;
          severity: string;
          status: string;
          sourceEntityId: string;
        }>;
      };
    };
    const bySource = new Map(
      evaluateBody.data.exceptions.map((item) => [item.sourceEntityId, item]),
    );
    expect(bySource.get(strength!.id)).toMatchObject({
      type: "skipped_workout",
      severity: "attention",
      status: "active",
    });
    expect(bySource.get(conditioning!.id)).toMatchObject({
      type: "missed_workout",
      severity: "critical",
      status: "active",
    });
    expect(bySource.get(breakfast!.id)).toMatchObject({
      type: "skipped_meal",
      severity: "critical",
    });
    expect(bySource.get(lunch!.id)).toMatchObject({
      type: "meal_deviation",
      severity: "attention",
    });
    expect(bySource.get(dinner!.id)).toMatchObject({
      type: "overdue_meal",
      severity: "critical",
    });
    expect(bySource.has(snack!.id)).toBe(false);

    const dinnerCompliance = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, dinner!.id));
    expect(dinnerCompliance).toEqual([]);
    const breakfastCompliance = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, breakfast!.id));
    expect(breakfastCompliance[0]?.outcome).toBe("skipped");
    const strengthExecution = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, strength!.id));
    expect(strengthExecution[0]?.status).toBe("skipped");

    const missed = bySource.get(conditioning!.id)!;
    const ack = await app.request(
      `/exceptions/${missed.id}/acknowledge`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ack-missed",
        },
        body: JSON.stringify({ note: "Still missed" }),
      },
      testEnv(),
    );
    expect(ack.status).toBe(200);

    const stillTrue = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-still-true",
        },
        body: "{}",
      },
      testEnv(),
    );
    const stillBody = (await stillTrue.json()) as { data: { resolved: number } };
    expect(stillBody.data.resolved).toBe(0);
    const missedRow = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.id, missed.id));
    expect(missedRow[0]?.status).toBe("acknowledged");
    const conditioningExecution = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, conditioning!.id));
    expect(conditioningExecution).toEqual([]);

    const confirmed = await app.request(
      `/meals/assignments/${dinner!.id}/confirm`,
      {
        method: "POST",
        headers: { ...traineeHeaders, "Idempotency-Key": "confirm-dinner" },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(confirmed.status, await confirmed.text()).toBe(200);

    const cleared = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-cleared",
        },
        body: "{}",
      },
      testEnv(),
    );
    const clearedText = await cleared.text();
    expect(cleared.status, clearedText).toBe(200);
    const clearedBody = JSON.parse(clearedText) as {
      data: {
        resolved: number;
        exceptions: Array<{ type: string; severity: string; sourceEntityId: string }>;
      };
    };
    expect(clearedBody.data.resolved).toBe(0);
    const dinnerAfter = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, dinner!.id));
    expect(dinnerAfter[0]?.outcome).toBe("confirmed");
    const dinnerExceptionId = bySource.get(dinner!.id)!.id;
    const overdueRow = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.id, dinnerExceptionId));
    // Late log keeps the same open row and moves it to Client logged later.
    expect(overdueRow[0]?.status).toBe("active");
    expect(overdueRow[0]?.type).toBe("meal_logged_later");
    expect(overdueRow[0]?.severity).toBe("attention");
    expect(overdueRow[0]?.closedReason).toBeNull();
    expect(overdueRow[0]?.sourceLoggedLateAt).toBeTruthy();
    expect(
      clearedBody.data.exceptions.some(
        (item) => item.sourceEntityId === dinner!.id,
      ),
    ).toBe(false);

    const lateDetail = await app.request(
      `/exceptions/${dinnerExceptionId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(lateDetail.status).toBe(200);
    const lateDetailBody = (await lateDetail.json()) as {
      data: {
        status: string;
        type: string;
        severity: string;
        closedReason: string | null;
      };
    };
    expect(lateDetailBody.data).toMatchObject({
      status: "active",
      type: "meal_logged_later",
      severity: "attention",
      closedReason: null,
    });

    const attention = await app.request(
      "/exceptions/attention",
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const attentionBody = (await attention.json()) as {
      data: {
        items: Array<{ exception: { id: string; status: string; type: string } }>;
      };
    };
    expect(
      attentionBody.data.items.some((item) => item.exception.id === missed.id),
    ).toBe(true);
    expect(
      attentionBody.data.items.some(
        (item) =>
          item.exception.id === dinnerExceptionId &&
          item.exception.type === "meal_logged_later",
      ),
    ).toBe(true);

    const history = await app.request(
      `/exceptions/relationships/${relationshipId}?status=resolved`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const historyBody = (await history.json()) as {
      data: { items: Array<{ id: string; status: string }> };
    };
    expect(
      historyBody.data.items.some((item) => item.id === dinnerExceptionId),
    ).toBe(false);
  });

  it("maps trainer and coaching_ended close paths to closedReason", async () => {
    const { trainerCookie, relationshipId } =
      await reachActiveConfig("closed-reason");

    const coachingEndedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const trainerResolveId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const now = new Date().toISOString();
    await db.insert(schema.exceptions).values([
      {
        id: coachingEndedId,
        coachingRelationshipId: relationshipId,
        type: "missed_workout",
        severity: "attention",
        status: "active",
        ruleVersion: "mvp.v2",
        sourceEntityType: "workout_assignment",
        sourceEntityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        summary: "Missed workout",
        detailsJson: null,
        detectedAt: now,
        activatedAt: now,
        acknowledgedAt: null,
        resolvedAt: null,
        resolutionOutcome: null,
        resolutionNote: null,
        closedReason: null,
        sourceLoggedLateAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: trainerResolveId,
        coachingRelationshipId: relationshipId,
        type: "overdue_meal",
        severity: "attention",
        status: "acknowledged",
        ruleVersion: "mvp.v2",
        sourceEntityType: "meal_assignment",
        sourceEntityId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        summary: "Missed meal",
        detailsJson: null,
        detectedAt: now,
        activatedAt: now,
        acknowledgedAt: now,
        resolvedAt: null,
        resolutionOutcome: null,
        resolutionNote: null,
        closedReason: null,
        sourceLoggedLateAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Clearing the underlying condition must not system-resolve.
    const noopEval = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-no-auto-resolve",
        },
        body: "{}",
      },
      testEnv(),
    );
    expect(noopEval.status).toBe(200);
    const noopBody = (await noopEval.json()) as { data: { resolved: number } };
    expect(noopBody.data.resolved).toBe(0);
    const stillOpen = await app.request(
      `/exceptions/${coachingEndedId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const stillOpenBody = (await stillOpen.json()) as {
      data: { status: string; closedReason: string | null };
    };
    expect(stillOpenBody.data.status).toBe("active");
    expect(stillOpenBody.data.closedReason).toBeNull();

    const trainerResolve = await app.request(
      `/exceptions/${trainerResolveId}/resolve`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "resolve-closed-reason",
        },
        body: JSON.stringify({ outcome: "talked", note: null }),
      },
      testEnv(),
    );
    expect(trainerResolve.status).toBe(200);
    const trainerBody = (await trainerResolve.json()) as {
      data: { status: string; closedReason: string | null };
    };
    expect(trainerBody.data.status).toBe("resolved");
    expect(trainerBody.data.closedReason).toBe("trainer");

    const ended = await app.request(
      `/relationships/${relationshipId}/end`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "end-closed-reason",
        },
        body: JSON.stringify({ reason: "done" }),
      },
      testEnv(),
    );
    expect(ended.status).toBe(200);

    const coachingEnded = await app.request(
      `/exceptions/${coachingEndedId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(coachingEnded.status).toBe(200);
    const coachingBody = (await coachingEnded.json()) as {
      data: { status: string; closedReason: string | null };
    };
    expect(coachingBody.data.status).toBe("resolved");
    expect(coachingBody.data.closedReason).toBe("coaching_ended");

    // Trainer-resolved row keeps its close reason after the end write.
    const trainerAfterEnd = await app.request(
      `/exceptions/${trainerResolveId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const trainerAfterBody = (await trainerAfterEnd.json()) as {
      data: { closedReason: string | null };
    };
    expect(trainerAfterBody.data.closedReason).toBe("trainer");
  });

  it("keeps a client in Needs you until every open item is reviewed, and undo restores on the server", async () => {
    const { trainerCookie, traineeToken, relationshipId } =
      await reachActiveConfig("review-undo");
    const now = new Date().toISOString();
    const older = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const criticalId = createId();
    const attentionId = createId();

    await db.insert(schema.exceptions).values([
      {
        id: criticalId,
        coachingRelationshipId: relationshipId,
        type: "missed_workout",
        severity: "critical",
        status: "active",
        ruleVersion: "test",
        sourceEntityType: "workout_assignment",
        sourceEntityId: createId(),
        summary: "Missed workout",
        detectedAt: older,
        activatedAt: older,
        acknowledgedAt: null,
        resolvedAt: null,
        createdAt: older,
        updatedAt: older,
      },
      {
        id: attentionId,
        coachingRelationshipId: relationshipId,
        type: "skipped_meal",
        severity: "attention",
        status: "active",
        ruleVersion: "test",
        sourceEntityType: "meal_assignment",
        sourceEntityId: createId(),
        summary: "Skipped lunch",
        detectedAt: now,
        activatedAt: now,
        acknowledgedAt: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    type Group = {
      relationshipId: string;
      bucket?: string;
      items: Array<{ id: string; status: string }>;
    };
    async function grouped() {
      const response = await app.request(
        "/exceptions/attention?groupBy=relationship&limit=20",
        { headers: { Cookie: trainerCookie, "x-fitbud-role": "trainer" } },
        testEnv(),
      );
      const text = await response.text();
      expect(response.status, text).toBe(200);
      return JSON.parse(text) as {
        data: { groups: Group[]; needsYou: Group[]; reviewed: Group[] };
      };
    }

    function clientGroups(list: Group[]) {
      return list.filter((group) => group.relationshipId === relationshipId);
    }

    const before = await grouped();
    expect(clientGroups(before.data.needsYou)).toHaveLength(1);
    expect(clientGroups(before.data.reviewed)).toHaveLength(0);
    expect(
      clientGroups(before.data.groups)[0]?.bucket,
    ).toBe("needs_you");
    expect(
      clientGroups(before.data.needsYou)[0]?.items.map((item) => item.id).sort(),
    ).toEqual([attentionId, criticalId].sort());

    const markReviewed = await app.request(
      `/exceptions/${criticalId}/acknowledge`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "mark-reviewed-critical",
        },
        body: JSON.stringify({ note: null }),
      },
      testEnv(),
    );
    const markReviewedText = await markReviewed.text();
    expect(markReviewed.status, markReviewedText).toBe(200);
    expect(
      (JSON.parse(markReviewedText) as { data: { status: string } }).data.status,
    ).toBe("acknowledged");

    const partial = await grouped();
    expect(clientGroups(partial.data.needsYou)).toHaveLength(1);
    expect(clientGroups(partial.data.reviewed)).toHaveLength(0);
    expect(
      clientGroups(partial.data.needsYou)[0]?.items.map((item) => item.id),
    ).toEqual([attentionId]);

    const markSecond = await app.request(
      `/exceptions/${attentionId}/acknowledge`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "mark-reviewed-attention",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(markSecond.status, await markSecond.clone().text()).toBe(200);

    const reviewed = await grouped();
    expect(clientGroups(reviewed.data.needsYou)).toHaveLength(0);
    expect(clientGroups(reviewed.data.reviewed)).toHaveLength(1);
    expect(clientGroups(reviewed.data.reviewed)[0]?.bucket).toBe("reviewed");
    expect(
      clientGroups(reviewed.data.reviewed)[0]?.items.every(
        (item) => item.status === "acknowledged",
      ),
    ).toBe(true);

    const undo = await app.request(`/exceptions/${attentionId}/undo`, {
      method: "POST",
      headers: {
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": "undo-attention",
      },
      body: "{}",
    }, testEnv());
    const undoText = await undo.text();
    expect(undo.status, undoText).toBe(200);
    const undoBody = JSON.parse(undoText) as {
      data: { status: string; acknowledgedAt: string | null };
    };
    expect(undoBody.data.status).toBe("active");
    expect(undoBody.data.acknowledgedAt).toBeNull();

    const replay = await app.request(`/exceptions/${attentionId}/undo`, {
      method: "POST",
      headers: {
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": "undo-attention",
      },
      body: "{}",
    }, testEnv());
    expect(replay.status).toBe(200);
    expect(
      ((await replay.json()) as { data: { status: string } }).data.status,
    ).toBe("active");

    const [restoredRow] = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.id, attentionId))
      .limit(1);
    expect(restoredRow?.status).toBe("active");
    expect(restoredRow?.acknowledgedAt).toBeNull();

    const afterUndo = await grouped();
    expect(clientGroups(afterUndo.data.needsYou)).toHaveLength(1);
    expect(clientGroups(afterUndo.data.reviewed)).toHaveLength(0);
    expect(
      clientGroups(afterUndo.data.needsYou)[0]?.items.some(
        (item) => item.id === attentionId && item.status === "active",
      ),
    ).toBe(true);

    const undoAgain = await app.request(`/exceptions/${attentionId}/undo`, {
      method: "POST",
      headers: {
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": "undo-attention-again",
      },
      body: "{}",
    }, testEnv());
    expect(undoAgain.status).toBe(409);

    const resolve = await app.request(`/exceptions/${criticalId}/resolve`, {
      method: "POST",
      headers: {
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": "resolve-critical",
      },
      body: JSON.stringify({ outcome: "talked" }),
    }, testEnv());
    expect(resolve.status, await resolve.clone().text()).toBe(200);

    const undoResolved = await app.request(`/exceptions/${criticalId}/undo`, {
      method: "POST",
      headers: {
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": "undo-resolved",
      },
      body: "{}",
    }, testEnv());
    expect(undoResolved.status).toBe(409);

    const traineeUndo = await app.request(`/exceptions/${attentionId}/undo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
        "Idempotency-Key": "trainee-undo",
      },
      body: "{}",
    }, testEnv());
    expect(traineeUndo.status).toBe(403);
  });
});
