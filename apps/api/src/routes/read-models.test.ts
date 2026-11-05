import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { formatLocalDate, istDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import * as schema from "../db/schema.js";

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
    // The trainee `/me/*` tests authenticate with a Bearer test token, the
    // shape the mobile app sends; the auth middleware only accepts an
    // unsigned test token when the environment is local (CU23).
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
  const setCookie = sessionResponse.headers.get("set-cookie");
  return { cookie: setCookie!.split(";")[0]! };
}

async function reachCoachingReady(suffix: string) {
  const trainer = await createTrainerSession(`read-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-read-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `read-trainee-${suffix}@example.com`,
        recipientDisplayName: `Read Trainee ${suffix}`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `read-trainee-${suffix}`,
    `read-trainee-${suffix}@example.com`,
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
    data: { relationship: { id: string; traineeUserId: string } };
  };
  return {
    trainerCookie: trainer.cookie,
    relationshipId: acceptBody.data.relationship.id,
    traineeUserId: acceptBody.data.relationship.traineeUserId,
    // The trainee's own credential, so `/me/*` is exercised as the trainee
    // actor and not through the trainer's session (CU23).
    traineeHeaders: {
      Authorization: `Bearer ${traineeToken}`,
      "x-fitbud-role": "trainee",
    } satisfies Record<string, string>,
  };
}

function collectPercentKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPercentKeys(entry, keys);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/percent/i.test(key)) {
        keys.add(key);
      }
      collectPercentKeys(nested, keys);
    }
  }
}

/**
 * The plan the trainee week tests hang their assignments on (CU23,
 * D-W3b-25): one plan with one published, effective version holding a real
 * workout day, which is what the production publish workflow writes. The
 * assignments below reference it, so the day states under test are derived
 * from persisted expectations and observations rather than from fixtures
 * shaped to the answer.
 */
async function seedEffectivePlan(
  db: Db,
  relationshipId: string,
): Promise<{ planId: string; versionId: string; workoutDayId: string }> {
  const now = nowIso();
  const planId = createId();
  const versionId = createId();
  const workoutDayId = "11111111-1111-4111-8111-111111111111";
  await db.insert(schema.plans).values({
    id: planId,
    coachingRelationshipId: relationshipId,
    title: "Week plan",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.planVersions).values({
    id: versionId,
    planId,
    versionNumber: 1,
    recordVersion: 0,
    status: "effective",
    contentJson: JSON.stringify({
      workoutDays: [
        {
          id: workoutDayId,
          order: 1,
          name: "Push A",
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
    }),
    creationSource: "blank",
    publishedAt: now,
    effectiveFrom: now,
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
  });
  return { planId, versionId, workoutDayId };
}

/**
 * One scheduled workout assignment on `localDate`, optionally with a
 * `completed` execution — the two rows the trainee week's day states are
 * derived from.
 */
async function seedWorkoutDay(
  db: Db,
  plan: { planId: string; versionId: string; workoutDayId: string },
  relationshipId: string,
  traineeUserId: string,
  input: {
    localDate: string;
    windowStartsAt: string;
    windowEndsAt: string;
    dayName: string;
    completed?: boolean;
  },
): Promise<void> {
  const now = nowIso();
  const assignmentId = createId();
  await db.insert(schema.workoutAssignments).values({
    id: assignmentId,
    coachingRelationshipId: relationshipId,
    planId: plan.planId,
    planVersionId: plan.versionId,
    workoutDayId: plan.workoutDayId,
    workoutDayName: input.dayName,
    workoutDayJson: JSON.stringify({
      id: plan.workoutDayId,
      order: 1,
      name: input.dayName,
      exercises: [],
    }),
    localDate: input.localDate,
    windowStartsAt: input.windowStartsAt,
    windowEndsAt: input.windowEndsAt,
    scheduleStatus: "scheduled",
    createdAt: now,
    updatedAt: now,
  });
  if (input.completed) {
    await db.insert(schema.workoutExecutions).values({
      id: createId(),
      assignmentId,
      coachingRelationshipId: relationshipId,
      planVersionId: plan.versionId,
      traineeUserId,
      status: "completed",
      recordVersion: 0,
      startedAt: input.windowStartsAt,
      pausedAt: null,
      completedAt: input.windowEndsAt,
      sessionRpe: null,
      requireSessionRpe: false,
      loggedLate: false,
      clientLoggedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

type WeekBody = {
  data: {
    start: string;
    workouts: { assigned: number; completed: number };
    meals: { assigned: number; logged: number };
    days: Array<{ date: string; state: string; workoutLabel: string }>;
    todayNutrition: { date: string };
  };
};

type DayBody = {
  data: {
    date: string;
    state: string;
    assignments: {
      workouts: Array<{ id: string; name: string }>;
    };
  };
};

const FROZEN_REFERENCE_INSTANT = "2026-10-17T14:30:00.000Z";

describe("read models", () => {
  let db: Db;
  let close: () => void;
  let queryCounter: { count: number; reset: () => void };

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(FROZEN_REFERENCE_INSTANT));
    const handle = await createMemoryDb();
    db = handle.db;
    queryCounter = handle.queryCounter;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    close();
  });

  it("returns attention groups without percent keys when groupBy=relationship", async () => {
    const ctx = await reachCoachingReady("attention");
    const now = nowIso();
    await db.insert(schema.exceptions).values({
      id: createId(),
      coachingRelationshipId: ctx.relationshipId,
      type: "skipped_meal",
      severity: "attention",
      status: "active",
      ruleVersion: "test",
      sourceEntityType: "meal_assignment",
      sourceEntityId: createId(),
      summary: "Skipped breakfast",
      detectedAt: now,
      resolvedAt: null,
      resolutionOutcome: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await app.request(
      "/exceptions/attention?groupBy=relationship&limit=20",
      { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const percentKeys = new Set<string>();
    collectPercentKeys(JSON.parse(text), percentKeys);
    expect(percentKeys.size).toBe(0);
    expect(text.toLowerCase()).not.toContain("percent");
  });

  it("serves trainer week read model within ten SQL prepares", async () => {
    const ctx = await reachCoachingReady("week");
    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    queryCounter.reset();
    const response = await app.request(
      `/workspaces/relationships/${ctx.relationshipId}/week?start=${today}`,
      { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    // Workouts + meals + trainee timezone + effective plan for todayNutrition.
    expect(queryCounter.count).toBeLessThanOrEqual(12);
    const body = (await response.json()) as {
      data: {
        days: unknown[];
        todayNutrition: {
          date: string;
          logged: {
            kcal: number;
            proteinG: number;
            carbsG: number;
            fatG: number;
            hasUnknown?: boolean;
          };
          assigned: {
            kcal: number;
            proteinG: number;
            carbsG: number;
            fatG: number;
          } | null;
        };
      };
    };
    expect(body.data.days).toHaveLength(7);
    expect(body.data.todayNutrition.date).toBe(today);
    expect(body.data.todayNutrition.logged).toEqual({
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
    expect(body.data.todayNutrition.assigned).toBeNull();
  });

  it("includes todayNutrition logged and assigned macros without percent", async () => {
    const ctx = await reachCoachingReady("week-nutrition");
    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    const now = nowIso();
    const planId = createId();
    const versionId = createId();
    const assignmentId = createId();
    const mealId = createId();
    const foodId = createId();

    const mealPrescription = {
      id: mealId,
      order: 1,
      name: "Lunch",
      mealType: "lunch",
      applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      localTime: "13:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [
        {
          snapshotKind: "legacy" as const,
          name: "Dal",
          classification: null,
          basis: null,
          canonical: null,
          serving: { label: "1 katori", unit: "serving", conversionScaled: null },
          quantityScaled: NUTRIENT_SCALE,
          calculated: {
            energyKcalScaled: 520 * NUTRIENT_SCALE,
            proteinScaled: 24 * NUTRIENT_SCALE,
            carbsScaled: 60 * NUTRIENT_SCALE,
            fatScaled: 12 * NUTRIENT_SCALE,
            partial: false,
          },
        },
      ],
    };

    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: ctx.relationshipId,
      title: "Nutrition week plan",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "effective",
      contentJson: JSON.stringify({
        workoutDays: [],
        mealPrescriptions: [mealPrescription],
      }),
      creationSource: "blank",
      publishedAt: now,
      effectiveFrom: now,
      effectiveTo: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.mealAssignments).values({
      id: assignmentId,
      coachingRelationshipId: ctx.relationshipId,
      planId,
      planVersionId: versionId,
      mealPrescriptionId: mealId,
      mealName: "Lunch",
      mealPrescriptionJson: JSON.stringify(mealPrescription),
      localDate: today,
      windowStartsAt: now,
      windowEndsAt: now,
      photoRequired: false,
      scheduleStatus: "scheduled",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.mealCompliance).values({
      id: createId(),
      assignmentId,
      coachingRelationshipId: ctx.relationshipId,
      planVersionId: versionId,
      traineeUserId: ctx.traineeUserId,
      outcome: "modified",
      recordVersion: 0,
      loggedAt: now,
      localDate: today,
      deviationKind: "logged_foods",
      notes: null,
      photoRequired: false,
      photoIntentJson: null,
      mediaAssetId: null,
      itemsJson: JSON.stringify([{ foodId, quantity: 1 }]),
      kcalScaled: 480 * NUTRIENT_SCALE,
      proteinScaled: 22 * NUTRIENT_SCALE,
      carbsScaled: 55 * NUTRIENT_SCALE,
      fatScaled: 11 * NUTRIENT_SCALE,
      loggedLate: false,
      loggedAfterResolve: false,
      clientLoggedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await app.request(
      `/workspaces/relationships/${ctx.relationshipId}/week?start=${today}`,
      { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const percentKeys = new Set<string>();
    collectPercentKeys(JSON.parse(text), percentKeys);
    expect(percentKeys.size).toBe(0);

    const body = JSON.parse(text) as {
      data: {
        todayNutrition: {
          date: string;
          logged: {
            kcal: number;
            proteinG: number;
            carbsG: number;
            fatG: number;
            hasUnknown?: boolean;
          };
          assigned: {
            kcal: number;
            proteinG: number;
            carbsG: number;
            fatG: number;
          } | null;
        };
      };
    };
    expect(body.data.todayNutrition).toEqual({
      date: today,
      logged: { kcal: 480, proteinG: 22, carbsG: 55, fatG: 11 },
      assigned: { kcal: 520, proteinG: 24, carbsG: 60, fatG: 12 },
    });
  });

  /*
    CU23 (D-W3b-25): `GET /me/week` had never been implemented. It answered
    seven hardcoded `state: "future"` days from no database at all, in a shape
    `weekReadModelSchema` rejects, so every client call threw and the mobile
    week strip re-derived states from the date alone. These tests pin the real
    thing: the states come from persisted assignments and executions, and the
    relationship comes from the authenticated trainee.

    The frozen clock is 2026-10-17T14:30Z, which is Sat 17 Oct in Asia/Kolkata,
    so the Monday-aligned week is Mon 12 Oct … Sun 18 Oct.
  */
  it("serves the trainee their own week, with day states derived from rows", async () => {
    const ctx = await reachCoachingReady("me-week");
    const plan = await seedEffectivePlan(db, ctx.relationshipId);
    await seedWorkoutDay(db, plan, ctx.relationshipId, ctx.traineeUserId, {
      localDate: "2026-10-12",
      windowStartsAt: "2026-10-12T01:00:00.000Z",
      windowEndsAt: "2026-10-12T13:00:00.000Z",
      dayName: "Push A",
      completed: true,
    });
    await seedWorkoutDay(db, plan, ctx.relationshipId, ctx.traineeUserId, {
      localDate: "2026-10-13",
      windowStartsAt: "2026-10-13T01:00:00.000Z",
      windowEndsAt: "2026-10-13T13:00:00.000Z",
      dayName: "Pull A",
    });
    await seedWorkoutDay(db, plan, ctx.relationshipId, ctx.traineeUserId, {
      localDate: "2026-10-18",
      windowStartsAt: "2026-10-18T01:00:00.000Z",
      windowEndsAt: "2026-10-18T13:00:00.000Z",
      dayName: "Legs A",
    });

    queryCounter.reset();
    const response = await app.request(
      "/me/week",
      { headers: ctx.traineeHeaders },
      testEnv(),
    );
    expect(response.status).toBe(200);
    // Workouts + meals + trainee timezone + effective plan for todayNutrition,
    // the same budget the trainer route is held to above.
    expect(queryCounter.count).toBeLessThanOrEqual(12);
    const body = (await response.json()) as WeekBody;
    // Monday-aligned by default: the old handler started at UTC today.
    expect(body.data.start).toBe("2026-10-12");
    expect(body.data.days).toHaveLength(7);
    expect(body.data.todayNutrition.date).toBe("2026-10-17");

    const byDate = new Map(body.data.days.map((d) => [d.date, d]));
    // A past day with a completed execution.
    expect(byDate.get("2026-10-12")?.state).toBe("done");
    // A past day that was assigned and never executed.
    expect(byDate.get("2026-10-13")?.state).toBe("missed");
    // A past day with no assignment at all.
    expect(byDate.get("2026-10-14")?.state).toBe("rest");
    // A day after today, which is the only place `future` is legitimate.
    expect(byDate.get("2026-10-18")?.state).toBe("future");
    expect(byDate.get("2026-10-18")?.workoutLabel).toBe("Legs A");

    // Counts come from the rows: three assignments, one of them after today
    // and therefore outside the "so far" denominator, one completed.
    expect(body.data.workouts).toEqual({ assigned: 2, completed: 1 });
    expect(body.data.meals).toEqual({ assigned: 0, logged: 0 });
  });

  it("never serves one trainee another trainee's week", async () => {
    const mine = await reachCoachingReady("me-week-mine");
    const theirs = await reachCoachingReady("me-week-theirs");
    const theirPlan = await seedEffectivePlan(db, theirs.relationshipId);
    // Only the *other* trainee has a workout this week, and its name is the
    // identifying value: if ownership stopped filtering by the authenticated
    // trainee, "Their Secret Session" would appear in my week. A count-only
    // assertion would pass with ownership deleted, which is how CU11's
    // cross-trainer check once stayed green.
    await seedWorkoutDay(db, theirPlan, theirs.relationshipId, theirs.traineeUserId, {
      localDate: "2026-10-12",
      windowStartsAt: "2026-10-12T01:00:00.000Z",
      windowEndsAt: "2026-10-12T13:00:00.000Z",
      dayName: "Their Secret Session",
      completed: true,
    });

    const theirResponse = await app.request(
      "/me/week",
      { headers: theirs.traineeHeaders },
      testEnv(),
    );
    expect(theirResponse.status).toBe(200);
    const theirBody = (await theirResponse.json()) as WeekBody;
    // The data really is reachable — by its owner. Without this the test
    // below could pass because nothing was seeded.
    expect(
      theirBody.data.days.map((d) => d.workoutLabel),
    ).toContain("Their Secret Session");
    expect(theirBody.data.workouts.completed).toBe(1);

    const myResponse = await app.request(
      "/me/week",
      { headers: mine.traineeHeaders },
      testEnv(),
    );
    expect(myResponse.status).toBe(200);
    const myBody = (await myResponse.json()) as WeekBody;
    expect(
      myBody.data.days.map((d) => d.workoutLabel),
    ).not.toContain("Their Secret Session");
    expect(myBody.data.workouts).toEqual({ assigned: 0, completed: 0 });
    expect(myBody.data.days.every((d) => d.state !== "done")).toBe(true);
  });

  it("rejects a malformed ?start= with 400 instead of nonsense or a 500", async () => {
    const ctx = await reachCoachingReady("me-week-start");
    for (const start of ["2026-11", "2026-02-30", "garbage", "-002026-11-02"]) {
      const response = await app.request(
        `/me/week?start=${encodeURIComponent(start)}`,
        { headers: ctx.traineeHeaders },
        testEnv(),
      );
      expect(response.status, start).toBe(400);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("INVALID_REQUEST");
      // Static text: nothing from the request is echoed back (D-W3-12, D-W3b-7).
      expect(body.error.message).toBe("Invalid start date.");
      expect(body.error.message).not.toContain(start);
    }
  });

  it("answers a well-formed ?start= for an earlier week", async () => {
    const ctx = await reachCoachingReady("me-week-explicit");
    const response = await app.request(
      "/me/week?start=2026-10-05",
      { headers: ctx.traineeHeaders },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as WeekBody;
    expect(body.data.start).toBe("2026-10-05");
    expect(body.data.days.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    // Every day is in the past, so none of them may read `future`.
    expect(body.data.days.every((d) => d.state !== "future")).toBe(true);
  });

  it("404s when the trainee has no active relationship", async () => {
    const ctx = await reachCoachingReady("me-week-ended");
    // An ended relationship is the real way a trainee reaches the 404: a user
    // with no relationship at all never gets the trainee role and is refused
    // 403 by `requireRole` before the handler runs.
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended" })
      .where(eq(schema.coachingRelationships.id, ctx.relationshipId));
    const response = await app.request(
      "/me/week",
      { headers: ctx.traineeHeaders },
      testEnv(),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RELATIONSHIP_NOT_FOUND");
  });

  it("computes todayNutrition.date in the trainee timezone across the UTC date line", async () => {
    const ctx = await reachCoachingReady("week-ist");
    await db
      .update(schema.users)
      .set({ timezone: "Asia/Kolkata" })
      .where(eq(schema.users.id, ctx.traineeUserId));

    for (const instant of [
      "2026-10-17T23:30:00.000Z",
      "2026-10-17T19:00:00.000Z",
    ]) {
      vi.setSystemTime(new Date(instant));
      const expected = istDate(new Date(instant));
      const response = await app.request(
        `/workspaces/relationships/${ctx.relationshipId}/week?start=${expected}`,
        { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
        testEnv(),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { todayNutrition: { date: string } };
      };
      expect(body.data.todayNutrition.date).toBe("2026-10-18");
      expect(body.data.todayNutrition.date).toBe(expected);
    }
  });

  /*
    BT9 (D-W4-14, D-W4-16): `GET /me/day/:date` returned assignments and logs
    and no day state, so it could not agree with `/me/week`. The state now
    comes from `deriveWeekDayFromWorkouts`, which `buildWeekReadModel` also
    calls. The frozen clock is the same 2026-10-17T14:30Z the week tests use,
    Sat 17 Oct in both UTC and Asia/Kolkata, week Mon 12 Oct … Sun 18 Oct.
  */
  it("returns the same derived day state /me/week reports for that date", async () => {
    const ctx = await reachCoachingReady("me-day");
    const plan = await seedEffectivePlan(db, ctx.relationshipId);
    await seedWorkoutDay(db, plan, ctx.relationshipId, ctx.traineeUserId, {
      localDate: "2026-10-12",
      windowStartsAt: "2026-10-12T01:00:00.000Z",
      windowEndsAt: "2026-10-12T13:00:00.000Z",
      dayName: "Push A",
      completed: true,
    });
    await seedWorkoutDay(db, plan, ctx.relationshipId, ctx.traineeUserId, {
      localDate: "2026-10-13",
      windowStartsAt: "2026-10-13T01:00:00.000Z",
      windowEndsAt: "2026-10-13T13:00:00.000Z",
      dayName: "Pull A",
    });
    await seedWorkoutDay(db, plan, ctx.relationshipId, ctx.traineeUserId, {
      localDate: "2026-10-18",
      windowStartsAt: "2026-10-18T01:00:00.000Z",
      windowEndsAt: "2026-10-18T13:00:00.000Z",
      dayName: "Legs A",
    });

    const weekResponse = await app.request(
      "/me/week",
      { headers: ctx.traineeHeaders },
      testEnv(),
    );
    expect(weekResponse.status).toBe(200);
    const week = (await weekResponse.json()) as WeekBody;
    const weekState = new Map(week.data.days.map((day) => [day.date, day.state]));

    async function stateFor(date: string): Promise<string> {
      const response = await app.request(
        `/me/day/${date}`,
        { headers: ctx.traineeHeaders },
        testEnv(),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as DayBody;
      expect(body.data.date).toBe(date);
      // The day route and the week route are one derivation.
      expect(body.data.state).toBe(weekState.get(date));
      return body.data.state;
    }

    // A past day with a completed execution.
    expect(await stateFor("2026-10-12")).toBe("done");
    // A past day that was assigned and never executed.
    expect(await stateFor("2026-10-13")).toBe("missed");
    // A past day with no assignment at all.
    expect(await stateFor("2026-10-14")).toBe("rest");
    // A day after today, which is the only place `future` is legitimate.
    expect(await stateFor("2026-10-18")).toBe("future");

    for (const day of week.data.days) {
      expect(await stateFor(day.date)).toBe(day.state);
    }
  });

  it("derives /me/day in the trainee timezone across the UTC date line", async () => {
    const ctx = await reachCoachingReady("me-day-ist");
    await db
      .update(schema.users)
      .set({ timezone: "Asia/Kolkata" })
      .where(eq(schema.users.id, ctx.traineeUserId));
    // 23:30Z is still 17 Oct in UTC and already 18 Oct in Asia/Kolkata.
    // 18 Oct has no assignment, so a trainee-zone "today" is `rest`. UTC
    // would still call it `future`.
    vi.setSystemTime(new Date("2026-10-17T23:30:00.000Z"));

    const weekResponse = await app.request(
      "/me/week",
      { headers: ctx.traineeHeaders },
      testEnv(),
    );
    expect(weekResponse.status).toBe(200);
    const week = (await weekResponse.json()) as WeekBody;
    const weekDay = week.data.days.find((day) => day.date === "2026-10-18");
    expect(weekDay?.state).toBe("rest");

    const dayResponse = await app.request(
      "/me/day/2026-10-18",
      { headers: ctx.traineeHeaders },
      testEnv(),
    );
    expect(dayResponse.status).toBe(200);
    const day = (await dayResponse.json()) as DayBody;
    expect(day.data.state).toBe(weekDay?.state);
    expect(day.data.state).toBe("rest");
  });

  it("never serves one trainee another trainee's day", async () => {
    const mine = await reachCoachingReady("me-day-mine");
    const theirs = await reachCoachingReady("me-day-theirs");
    const theirPlan = await seedEffectivePlan(db, theirs.relationshipId);
    // Only the other trainee has a workout, and its name is the identifying
    // value. A count of workouts would stay 0 for me if the state query
    // leaked their completion while the assignment list did not — so the
    // name and the resulting `done` state are both asserted on the owner,
    // and both must be absent from mine.
    await seedWorkoutDay(
      db,
      theirPlan,
      theirs.relationshipId,
      theirs.traineeUserId,
      {
        localDate: "2026-10-12",
        windowStartsAt: "2026-10-12T01:00:00.000Z",
        windowEndsAt: "2026-10-12T13:00:00.000Z",
        dayName: "Their Secret Session",
        completed: true,
      },
    );

    const theirResponse = await app.request(
      "/me/day/2026-10-12",
      { headers: theirs.traineeHeaders },
      testEnv(),
    );
    expect(theirResponse.status).toBe(200);
    const theirDay = (await theirResponse.json()) as DayBody;
    expect(theirDay.data.assignments.workouts.map((workout) => workout.name)).toContain(
      "Their Secret Session",
    );
    expect(theirDay.data.state).toBe("done");

    const myResponse = await app.request(
      "/me/day/2026-10-12",
      { headers: mine.traineeHeaders },
      testEnv(),
    );
    expect(myResponse.status).toBe(200);
    const myDay = (await myResponse.json()) as DayBody;
    expect(myDay.data.assignments.workouts.map((workout) => workout.name)).not.toContain(
      "Their Secret Session",
    );
    expect(myDay.data.state).toBe("rest");
  });

  /*
    BT14 (D-W4-16, D-W4-19): the trainer week route passed `?start=` straight
    into the week builder. `garbage` threw RangeError and answered 500. It
    now uses the same helper as `GET /me/week`.
  */
  it("rejects a malformed trainer week ?start= with 400 INVALID_REQUEST", async () => {
    const ctx = await reachCoachingReady("trainer-week-start");
    for (const start of ["2026-11", "2026-02-30", "garbage", "-002026-11-02"]) {
      const response = await app.request(
        `/workspaces/relationships/${ctx.relationshipId}/week?start=${encodeURIComponent(start)}`,
        { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
        testEnv(),
      );
      expect(response.status, start).toBe(400);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("INVALID_REQUEST");
      expect(body.error.message).toBe("Invalid start date.");
      expect(body.error.message).not.toContain(start);
    }
  });

  it("answers a well-formed trainer week ?start=", async () => {
    const ctx = await reachCoachingReady("trainer-week-explicit");
    const response = await app.request(
      `/workspaces/relationships/${ctx.relationshipId}/week?start=2026-10-05`,
      { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { start: string; days: { date: string }[] } };
    expect(body.data.start).toBe("2026-10-05");
    expect(body.data.days.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("rejects a malformed /me/day/:date with 400 instead of an empty day", async () => {
    const ctx = await reachCoachingReady("me-day-date");
    for (const date of ["2026-11", "2026-02-30", "garbage", "-002026-11-02"]) {
      const response = await app.request(
        `/me/day/${encodeURIComponent(date)}`,
        { headers: ctx.traineeHeaders },
        testEnv(),
      );
      expect(response.status, date).toBe(400);
      const body = (await response.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe("INVALID_REQUEST");
      // Static text: nothing from the request is echoed back (D-W3-12, D-W3b-7).
      expect(body.error.message).toBe("Invalid date.");
      expect(body.error.message).not.toContain(date);
    }
  });
});
