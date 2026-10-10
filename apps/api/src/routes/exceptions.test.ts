import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatLocalDate, weekdayFromLocalDate } from "@fitbud/core";
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
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    // Already acknowledged — resolve should succeed
    expect(resolveTooEarly.status).toBe(200);
    const resolveBody = (await resolveTooEarly.json()) as {
      data: { status: string };
    };
    expect(resolveBody.data.status).toBe("resolved");

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
    expect(clearedBody.data.resolved).toBeGreaterThanOrEqual(1);
    const dinnerAfter = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, dinner!.id));
    expect(dinnerAfter[0]?.outcome).toBe("confirmed");
    const overdueRow = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.id, bySource.get(dinner!.id)!.id));
    expect(overdueRow[0]?.status).toBe("resolved");
    expect(
      clearedBody.data.exceptions.some(
        (item) =>
          item.sourceEntityId === dinner!.id &&
          item.type === "meal_logged_later" &&
          item.severity === "attention",
      ),
    ).toBe(true);

    const attention = await app.request(
      "/exceptions/attention",
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const attentionBody = (await attention.json()) as {
      data: { items: Array<{ exception: { id: string; status: string } }> };
    };
    expect(
      attentionBody.data.items.some((item) => item.exception.id === missed.id),
    ).toBe(true);
    expect(
      attentionBody.data.items.some(
        (item) => item.exception.id === bySource.get(dinner!.id)!.id,
      ),
    ).toBe(false);

    const history = await app.request(
      `/exceptions/relationships/${relationshipId}?status=resolved`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const historyBody = (await history.json()) as {
      data: { items: Array<{ id: string; status: string }> };
    };
    expect(
      historyBody.data.items.some(
        (item) => item.id === bySource.get(dinner!.id)!.id && item.status === "resolved",
      ),
    ).toBe(true);
  });
});
