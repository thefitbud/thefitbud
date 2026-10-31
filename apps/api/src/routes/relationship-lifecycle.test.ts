import { and, eq, gte, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDaysToLocalDate, formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import {
  getTestDbOverride,
  setTestDbOverride,
  type Db,
} from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { handleScheduledReplenishment } from "../jobs/replenishment.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import {
  createMemoryDb as createSharedMemoryDb,
  type SqlJsCompatDatabase,
} from "../test-support/memory-db.js";
import { endCoachingRelationship } from "../domain/relationship-lifecycle.js";

let currentSqlite: SqlJsCompatDatabase | null = null;

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const handle = await createSharedMemoryDb();
  currentSqlite = handle.sqlite;
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
  return { cookie: setCookie!.split(";")[0]! };
}

function sampleContent() {
  return {
    workoutDays: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        order: 1,
        name: "Day A",
        weekday: 1,
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
                loadLabel: "60kg",
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
        mealType: "lunch",
        applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        localTime: "13:00",
        scheduleHint: "Midday",
        instructions: "Rice and dal",
        photoRequired: false,
      },
    ],
  };
}

async function reachActiveWithSchedule(suffix: string) {
  const trainer = await createTrainerSession(`life-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-life-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `life-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `life-trainee-${suffix}`,
    `life-trainee-${suffix}@example.com`,
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
        "Idempotency-Key": `submit-life-${suffix}`,
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
        "Idempotency-Key": `review-life-${suffix}`,
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
  await app.request(
    `/configurations/relationships/${relationshipId}/configure`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `cfg-life-${suffix}`,
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
        "Idempotency-Key": `act-life-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 2 }),
    },
    testEnv(),
  );

  const plan = await app.request(
    `/plans/relationships/${relationshipId}`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `plan-life-${suffix}`,
      },
      body: JSON.stringify({
        title: "Foundation",
        content: sampleContent(),
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
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `pub-life-${suffix}`,
      },
      body: JSON.stringify({
        expectedRecordVersion: planBody.data.version.recordVersion,
        mode: "immediate",
      }),
    },
    testEnv(),
  );
  expect(published.status).toBe(200);

  const today = formatLocalDate(new Date(), "Asia/Kolkata");
  const toDate = addDaysToLocalDate(today, 13);
  await app.request(
    `/workouts/relationships/${relationshipId}/assignments/generate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `gen-wo-life-${suffix}`,
      },
      body: JSON.stringify({ fromDate: today, toDate }),
    },
    testEnv(),
  );
  await app.request(
    `/meals/relationships/${relationshipId}/assignments/generate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `gen-meal-life-${suffix}`,
      },
      body: JSON.stringify({ fromDate: today, toDate }),
    },
    testEnv(),
  );

  const scheduled = await app.request(
    `/checkins/relationships/${relationshipId}/schedule`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `chk-life-${suffix}`,
      },
      body: JSON.stringify({ localDate: today }),
    },
    testEnv(),
  );
  expect(scheduled.status).toBe(200);

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
    planId: planBody.data.plan.id,
    versionId: planBody.data.version.id,
    today,
  };
}

describe("TW-30 end and reactivate scheduling", () => {
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

  it("ends coaching by stopping today+future workouts, meals, check-ins and pending reminders", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveWithSchedule("end-stop");
    const db = getTestDbOverride();
    expect(db).toBeTruthy();

    const beforeWorkouts = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    expect(beforeWorkouts.length).toBeGreaterThan(0);

    const ended = await app.request(
      `/relationships/${relationshipId}/end`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "end-stop",
        },
        body: JSON.stringify({ reason: "paused" }),
      },
      testEnv(),
    );
    expect(ended.status).toBe(200);

    const workouts = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    expect(workouts).toHaveLength(0);

    const meals = await db!
      .select()
      .from(schema.mealAssignments)
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          gte(schema.mealAssignments.localDate, today),
        ),
      );
    expect(meals).toHaveLength(0);

    const draftCheckins = await db!
      .select()
      .from(schema.checkins)
      .where(
        and(
          eq(schema.checkins.coachingRelationshipId, relationshipId),
          eq(schema.checkins.recordStatus, "draft"),
          gte(schema.checkins.localDate, today),
        ),
      );
    expect(draftCheckins).toHaveLength(0);

    const pendingNotes = await db!
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.coachingRelationshipId, relationshipId),
          eq(schema.notifications.state, "pending"),
        ),
      );
    expect(pendingNotes).toHaveLength(0);

    await handleScheduledReplenishment(testEnv());
    const afterReplenish = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    expect(afterReplenish).toHaveLength(0);

    const nudge = await app.request(
      `/notifications/relationships/${relationshipId}/nudges`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activityType: "workout",
          activityId: beforeWorkouts[0]!.id,
        }),
      },
      testEnv(),
    );
    expect(nudge.status).toBe(409);
    expect(((await nudge.json()) as { error: { code: string } }).error.code).toBe(
      "RELATIONSHIP_ENDED",
    );
  });

  it("ending coaching between 00:00 and 05:30 IST leaves yesterday's IST record alone", async () => {
    // Mon 2 Nov 2026, 11:30 IST: schedule from Monday (Day A is a Monday workout).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date("2026-11-02T06:00:00.000Z"));
      const { trainerCookie, relationshipId, planId, today: yesterday } =
        await reachActiveWithSchedule("end-early-ist");
      expect(yesterday).toBe("2026-11-02");
      const db = getTestDbOverride()!;

      // Tue 3 Nov 2026, 01:15 IST, while the UTC date is still 2 Nov.
      vi.setSystemTime(new Date("2026-11-02T19:45:00.000Z"));
      const today = formatLocalDate(new Date(), "Asia/Kolkata");
      expect(today).toBe("2026-11-03");
      const todayCheckin = await app.request(
        `/checkins/relationships/${relationshipId}/schedule`,
        {
          method: "POST",
          headers: {
            Cookie: trainerCookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "chk-end-early-ist-today",
          },
          body: JSON.stringify({ localDate: today }),
        },
        testEnv(),
      );
      expect(todayCheckin.status).toBe(200);

      const ended = await app.request(
        `/relationships/${relationshipId}/end`,
        {
          method: "POST",
          headers: {
            Cookie: trainerCookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "end-early-ist",
          },
          body: JSON.stringify({ reason: "paused" }),
        },
        testEnv(),
      );
      expect(ended.status).toBe(200);

      const workouts = await db
        .select()
        .from(schema.workoutAssignments)
        .where(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
        );
      const yesterdayWorkouts = workouts.filter(
        (row) => row.localDate === yesterday,
      );
      expect(yesterdayWorkouts.length).toBeGreaterThan(0);
      for (const row of yesterdayWorkouts) {
        expect(row.scheduleStatus).toBe("scheduled");
      }
      const laterWorkouts = workouts.filter((row) => row.localDate >= today);
      expect(laterWorkouts.length).toBeGreaterThan(0);
      for (const row of laterWorkouts) {
        expect(row.scheduleStatus).toBe("superseded");
      }

      const meals = await db
        .select()
        .from(schema.mealAssignments)
        .where(eq(schema.mealAssignments.coachingRelationshipId, relationshipId));
      const yesterdayMeals = meals.filter((row) => row.localDate === yesterday);
      expect(yesterdayMeals.length).toBeGreaterThan(0);
      for (const row of yesterdayMeals) {
        expect(row.scheduleStatus).toBe("scheduled");
      }
      const todayMeals = meals.filter((row) => row.localDate === today);
      expect(todayMeals.length).toBeGreaterThan(0);
      for (const row of todayMeals) {
        expect(row.scheduleStatus).toBe("superseded");
      }

      const drafts = await db
        .select()
        .from(schema.checkins)
        .where(
          and(
            eq(schema.checkins.coachingRelationshipId, relationshipId),
            eq(schema.checkins.recordStatus, "draft"),
          ),
        );
      expect(drafts.map((row) => row.localDate)).toEqual([yesterday]);

      // The plan horizon closes on yesterday in IST, not the day before.
      const [version] = await db
        .select()
        .from(schema.planVersions)
        .where(eq(schema.planVersions.planId, planId));
      expect(version?.effectiveTo).toBeTruthy();
      expect(
        formatLocalDate(new Date(version!.effectiveTo!), "Asia/Kolkata"),
      ).toBe(yesterday);
    } finally {
      vi.useRealTimers();
    }
  });

  it("after reactivate confirm keeps nothing scheduled until a plan is assigned", async () => {
    const { trainerCookie, traineeToken, relationshipId, planId, versionId, today } =
      await reachActiveWithSchedule("react-empty");
    const db = getTestDbOverride();
    expect(db).toBeTruthy();

    const ended = await app.request(
      `/relationships/${relationshipId}/end`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "react-empty-end",
        },
        body: JSON.stringify({ reason: "paused" }),
      },
      testEnv(),
    );
    expect(ended.status).toBe(200);

    const reactivate = await app.request(
      `/relationships/${relationshipId}/reactivate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "react-empty-req",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(reactivate.status).toBe(200);

    const confirmed = await app.request(
      `/relationships/${relationshipId}/reactivate/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(confirmed.status).toBe(200);

    await handleScheduledReplenishment(testEnv());

    const workouts = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    expect(workouts).toHaveLength(0);

    const meals = await db!
      .select()
      .from(schema.mealAssignments)
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          gte(schema.mealAssignments.localDate, today),
        ),
      );
    expect(meals).toHaveLength(0);

    const draftCheckins = await db!
      .select()
      .from(schema.checkins)
      .where(
        and(
          eq(schema.checkins.coachingRelationshipId, relationshipId),
          eq(schema.checkins.recordStatus, "draft"),
          gte(schema.checkins.localDate, today),
        ),
      );
    expect(draftCheckins).toHaveLength(0);

    // Assigning a plan restores scheduling for the chosen window.
    const assigned = await app.request(
      `/plans/${planId}/versions/${versionId}/assign`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "react-empty-assign",
        },
        body: JSON.stringify({
          effectiveFrom: new Date(`${today}T00:00:00.000+05:30`).toISOString(),
          window: 7,
          dietChangeScope: "today_onward",
          notifyClient: false,
        }),
      },
      testEnv(),
    );
    expect(assigned.status).toBe(200);
    const assignedBody = (await assigned.json()) as {
      data: { created: { workouts: number; meals: number }; dates: string[] };
    };
    expect(
      assignedBody.data.created.workouts + assignedBody.data.created.meals,
    ).toBeGreaterThan(0);

    const afterWorkouts = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    const afterMeals = await db!
      .select()
      .from(schema.mealAssignments)
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          gte(schema.mealAssignments.localDate, today),
        ),
      );
    expect(afterWorkouts.length + afterMeals.length).toBeGreaterThan(0);
  });

  it("API1: ending coaching stamps resolved_at on every exception it closes and leaves already-resolved ones alone", async () => {
    const { trainerCookie, relationshipId } =
      await reachActiveWithSchedule("end-resolves");
    const db = getTestDbOverride();
    expect(db).toBeTruthy();

    const [workout] = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(eq(schema.workoutAssignments.coachingRelationshipId, relationshipId))
      .limit(1);
    const [meal] = await db!
      .select()
      .from(schema.mealAssignments)
      .where(eq(schema.mealAssignments.coachingRelationshipId, relationshipId))
      .limit(1);
    expect(workout).toBeTruthy();
    expect(meal).toBeTruthy();

    const earlier = "2026-01-05T08:00:00.000Z";
    const earlierResolved = "2026-01-06T09:30:00.000Z";
    const base = {
      coachingRelationshipId: relationshipId,
      ruleVersion: "test-v1",
      detailsJson: null,
      detectedAt: earlier,
      activatedAt: earlier,
      acknowledgedAt: null,
      resolvedAt: null,
      resolutionOutcome: null,
      resolutionNote: null,
      closedReason: null,
      sourceLoggedLateAt: null,
      createdAt: earlier,
      updatedAt: earlier,
    } as const;
    const openIds = [
      "aaaaaaaa-0001-4000-8000-000000000001",
      "aaaaaaaa-0001-4000-8000-000000000002",
    ];
    const resolvedId = "aaaaaaaa-0001-4000-8000-000000000003";
    await db!.insert(schema.exceptions).values([
      {
        ...base,
        id: openIds[0]!,
        type: "missed_workout",
        severity: "critical",
        status: "active",
        sourceEntityType: "workout_assignment",
        sourceEntityId: workout!.id,
        summary: "Missed workout",
      },
      {
        ...base,
        id: openIds[1]!,
        type: "overdue_meal",
        severity: "attention",
        status: "active",
        sourceEntityType: "meal_assignment",
        sourceEntityId: meal!.id,
        summary: "Overdue meal",
      },
      {
        ...base,
        id: resolvedId,
        type: "skipped_meal",
        severity: "attention",
        status: "resolved",
        sourceEntityType: "meal_assignment",
        sourceEntityId: meal!.id,
        summary: "Skipped meal",
        acknowledgedAt: earlier,
        resolvedAt: earlierResolved,
        resolutionOutcome: "other",
        updatedAt: earlierResolved,
      },
    ]);
    const actionsBefore = await db!.select().from(schema.exceptionActions);

    const requestStart = new Date().toISOString();
    const ended = await app.request(
      `/relationships/${relationshipId}/end`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "end-resolves",
        },
        body: JSON.stringify({ reason: "paused" }),
      },
      testEnv(),
    );
    const requestEnd = new Date().toISOString();
    expect(ended.status).toBe(200);

    const [relationship] = await db!
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    const endedAt = relationship!.endedAt;
    expect(relationship!.status).toBe("ended");
    expect(endedAt).toBeTruthy();
    expect(endedAt! >= requestStart && endedAt! <= requestEnd).toBe(true);

    const rows = await db!
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.coachingRelationshipId, relationshipId));
    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const id of openIds) {
      const row = byId.get(id)!;
      expect(row.status).toBe("resolved");
      expect(row.closedReason).toBe("coaching_ended");
      expect(row.resolvedAt).toBe(endedAt);
      expect(row.updatedAt).toBe(endedAt);
      // A system close, not a trainer resolve: no outcome or note is invented.
      expect(row.resolutionOutcome).toBeNull();
      expect(row.resolutionNote).toBeNull();
    }

    const untouched = byId.get(resolvedId)!;
    expect(untouched.status).toBe("resolved");
    expect(untouched.resolvedAt).toBe(earlierResolved);
    expect(untouched.updatedAt).toBe(earlierResolved);
    expect(untouched.closedReason).toBeNull();
    expect(untouched.resolutionOutcome).toBe("other");

    // Matches the other system close path (auto-resolve in detectExceptions):
    // exception_actions only records trainer acknowledge/resolve, so ending
    // coaching writes no action rows.
    const actionsAfter = await db!.select().from(schema.exceptionActions);
    expect(actionsAfter).toHaveLength(actionsBefore.length);
  });
});

describe("EC1a ending coaching closes every open exception", () => {
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
    currentSqlite = null;
  });

  const earlier = "2026-01-05T08:00:00.000Z";
  const earlierAck = "2026-01-05T10:00:00.000Z";
  const earlierResolved = "2026-01-06T09:30:00.000Z";
  const priorEnd = "2026-01-07T07:00:00.000Z";

  type ExceptionInsert = typeof schema.exceptions.$inferInsert;

  /**
   * One exception per status for a relationship. Rows point at source ids with
   * no live source row, so evaluations cannot auto-resolve or re-detect them;
   * only the end path can touch them. (The relationship still has real
   * assignments, so evaluations do run real detection next to them.)
   */
  function exceptionSet(
    relationshipId: string,
    prefix: string,
  ): { open: ExceptionInsert[]; terminal: ExceptionInsert[] } {
    const base = {
      coachingRelationshipId: relationshipId,
      ruleVersion: "test-v1",
      detailsJson: null,
      detectedAt: earlier,
      activatedAt: null,
      acknowledgedAt: null,
      resolvedAt: null,
      resolutionOutcome: null,
      resolutionNote: null,
      closedReason: null,
      sourceLoggedLateAt: null,
      createdAt: earlier,
      updatedAt: earlier,
    } as const;
    const open: ExceptionInsert[] = [
      {
        ...base,
        id: `${prefix}-0001-4000-8000-000000000001`,
        type: "overdue_meal",
        severity: "attention",
        status: "detected",
        sourceEntityType: "meal_assignment",
        sourceEntityId: `${prefix}-0002-4000-8000-000000000001`,
        summary: "Detected overdue meal",
      },
      {
        ...base,
        id: `${prefix}-0001-4000-8000-000000000002`,
        type: "missed_workout",
        severity: "critical",
        status: "active",
        activatedAt: earlier,
        sourceEntityType: "workout_assignment",
        sourceEntityId: `${prefix}-0002-4000-8000-000000000002`,
        summary: "Active missed workout",
      },
      {
        ...base,
        id: `${prefix}-0001-4000-8000-000000000003`,
        type: "skipped_meal",
        severity: "attention",
        status: "acknowledged",
        activatedAt: earlier,
        acknowledgedAt: earlierAck,
        updatedAt: earlierAck,
        sourceEntityType: "meal_assignment",
        sourceEntityId: `${prefix}-0002-4000-8000-000000000003`,
        summary: "Acknowledged skipped meal",
      },
    ];
    const terminal: ExceptionInsert[] = [
      {
        ...base,
        id: `${prefix}-0001-4000-8000-000000000004`,
        type: "meal_deviation",
        severity: "attention",
        status: "resolved",
        activatedAt: earlier,
        acknowledgedAt: earlierAck,
        resolvedAt: earlierResolved,
        resolutionOutcome: "other",
        updatedAt: earlierResolved,
        sourceEntityType: "meal_assignment",
        sourceEntityId: `${prefix}-0002-4000-8000-000000000004`,
        summary: "Trainer resolved",
      },
      {
        ...base,
        id: `${prefix}-0001-4000-8000-000000000005`,
        type: "overdue_checkin",
        severity: "attention",
        status: "resolved",
        activatedAt: earlier,
        resolvedAt: priorEnd,
        closedReason: "coaching_ended",
        updatedAt: priorEnd,
        sourceEntityType: "checkin",
        sourceEntityId: `${prefix}-0002-4000-8000-000000000005`,
        summary: "Closed by an earlier end",
      },
    ];
    return { open, terminal };
  }

  function idsOf(rows: ExceptionInsert[]): string[] {
    return rows.map((row) => row.id);
  }

  async function rowsById(db: Db, ids: string[]) {
    const rows = await db
      .select()
      .from(schema.exceptions)
      .where(inArray(schema.exceptions.id, ids));
    return new Map(rows.map((row) => [row.id, row]));
  }

  async function endViaApi(cookie: string, relationshipId: string, key: string) {
    return app.request(
      `/relationships/${relationshipId}/end`,
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({ reason: "paused" }),
      },
      testEnv(),
    );
  }

  async function getJson(cookie: string, path: string) {
    const response = await app.request(
      path,
      { method: "GET", headers: { Cookie: cookie } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    return (await response.json()) as unknown;
  }

  async function relationshipRow(db: Db, relationshipId: string) {
    const [row] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    return row!;
  }

  it("closes detected, active and acknowledged at ended_at, leaves terminal rows and other relationships alone", async () => {
    const target = await reachActiveWithSchedule("ec1a-all");
    const other = await reachActiveWithSchedule("ec1a-other");
    const db = getTestDbOverride()!;

    // A second relationship for the SAME trainee with another trainer.
    const targetRel = await relationshipRow(db, target.relationshipId);
    const otherRel = await relationshipRow(db, other.relationshipId);
    const siblingId = "eeeeeeee-0001-4000-8000-0000000000aa";
    await db.insert(schema.coachingRelationships).values({
      ...targetRel,
      id: siblingId,
      trainerUserId: otherRel.trainerUserId,
    });

    const mine = exceptionSet(target.relationshipId, "aaaaaaaa");
    const theirs = exceptionSet(other.relationshipId, "bbbbbbbb");
    const sibling = exceptionSet(siblingId, "cccccccc");
    const all = [
      ...mine.open,
      ...mine.terminal,
      ...theirs.open,
      ...theirs.terminal,
      ...sibling.open,
      ...sibling.terminal,
    ];
    await db.insert(schema.exceptions).values(all);
    // Every non-terminal status is covered, not only #25's "active".
    expect(new Set(mine.open.map((row) => row.status))).toEqual(
      new Set(["detected", "active", "acknowledged"]),
    );
    const before = await rowsById(db, idsOf(all));
    const actionsBefore = await db.select().from(schema.exceptionActions);

    const ended = await endViaApi(target.trainerCookie, target.relationshipId, "ec1a-all-end");
    expect(ended.status).toBe(200);
    const endedAt = (await relationshipRow(db, target.relationshipId)).endedAt;
    expect(endedAt).toBeTruthy();

    const after = await rowsById(db, idsOf(all));
    for (const id of idsOf(mine.open)) {
      const prior = before.get(id)!;
      const row = after.get(id)!;
      expect(row.status, id).toBe("resolved");
      expect(row.closedReason, id).toBe("coaching_ended");
      expect(row.resolvedAt, id).toBe(endedAt);
      expect(row.updatedAt, id).toBe(endedAt);
      // A system close keeps the history it had and invents nothing.
      expect(row.detectedAt).toBe(prior.detectedAt);
      expect(row.activatedAt).toBe(prior.activatedAt);
      expect(row.acknowledgedAt).toBe(prior.acknowledgedAt);
      expect(row.resolutionOutcome).toBeNull();
      expect(row.resolutionNote).toBeNull();
    }
    // Already-terminal rows (trainer resolved, closed by an earlier end) and
    // every row of other relationships are byte-identical.
    for (const id of [
      ...idsOf(mine.terminal),
      ...idsOf(theirs.open),
      ...idsOf(theirs.terminal),
      ...idsOf(sibling.open),
      ...idsOf(sibling.terminal),
    ]) {
      expect(after.get(id), id).toEqual(before.get(id));
    }
    const actionsAfter = await db.select().from(schema.exceptionActions);
    expect(actionsAfter).toHaveLength(actionsBefore.length);

    // Nothing non-terminal is left on the ended relationship.
    const stillOpen = await db
      .select()
      .from(schema.exceptions)
      .where(
        and(
          eq(schema.exceptions.coachingRelationshipId, target.relationshipId),
          inArray(schema.exceptions.status, ["detected", "active", "acknowledged"]),
        ),
      );
    expect(stillOpen).toHaveLength(0);
  });

  it("ended client's Needs attention and Home stay empty, before and after reactivation", async () => {
    const target = await reachActiveWithSchedule("ec1a-react");
    const db = getTestDbOverride()!;
    const mine = exceptionSet(target.relationshipId, "dddddddd");
    await db.insert(schema.exceptions).values([...mine.open, ...mine.terminal]);

    // Sanity: before the end the open rows are visible on Home.
    const homeBefore = JSON.stringify(
      await getJson(target.trainerCookie, "/exceptions/attention?limit=50"),
    );
    expect(homeBefore).toContain(mine.open[0]!.id);

    const ended = await endViaApi(target.trainerCookie, target.relationshipId, "ec1a-react-end");
    expect(ended.status).toBe(200);
    // Includes anything the pre-end Home read detected for real sources.
    const closedRows = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.coachingRelationshipId, target.relationshipId));
    const closed = new Map(closedRows.map((row) => [row.id, row]));
    const countAfterEnd = closedRows.length;
    const endedAt = (await relationshipRow(db, target.relationshipId)).endedAt;
    for (const row of closedRows) {
      expect(row.status, row.id).toBe("resolved");
      if (!idsOf(mine.terminal).includes(row.id)) {
        expect(row.closedReason, row.id).toBe("coaching_ended");
        expect(row.resolvedAt, row.id).toBe(endedAt);
      }
    }
    const allIds = [...closed.keys()];

    async function assertNothingSurfaces() {
      for (const path of [
        "/exceptions/attention?limit=50",
        "/exceptions/attention?groupBy=relationship&limit=50",
        `/exceptions/relationships/${target.relationshipId}`,
        `/exceptions/relationships/${target.relationshipId}?status=acknowledged`,
        `/exceptions/relationships/${target.relationshipId}?status=detected`,
      ]) {
        const body = JSON.stringify(await getJson(target.trainerCookie, path));
        for (const id of allIds) expect(body, path).not.toContain(id);
      }
      const workspace = (await getJson(
        target.trainerCookie,
        `/workspaces/relationships/${target.relationshipId}`,
      )) as { data: { overview: { openException: unknown } } };
      expect(workspace.data.overview.openException).toBeNull();
      // Reads created, activated and resolved nothing for this relationship.
      const rows = await db
        .select()
        .from(schema.exceptions)
        .where(eq(schema.exceptions.coachingRelationshipId, target.relationshipId));
      expect(rows).toHaveLength(countAfterEnd);
      for (const row of rows) expect(row, row.id).toEqual(closed.get(row.id));
    }

    // First reads after the end (ended client's page and Home).
    await assertNothingSurfaces();

    const reactivate = await app.request(
      `/relationships/${target.relationshipId}/reactivate`,
      {
        method: "POST",
        headers: {
          Cookie: target.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ec1a-react-req",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(reactivate.status).toBe(200);
    const confirmed = await app.request(
      `/relationships/${target.relationshipId}/reactivate/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${target.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(confirmed.status).toBe(200);
    expect((await relationshipRow(db, target.relationshipId)).status).toBe("active");

    // After reactivation the old exceptions do not come back anywhere.
    await assertNothingSurfaces();
  });

  it("is idempotent: a second end (API or direct) restamps and reopens nothing", async () => {
    const target = await reachActiveWithSchedule("ec1a-twice");
    const db = getTestDbOverride()!;
    const mine = exceptionSet(target.relationshipId, "ffffffff");
    await db.insert(schema.exceptions).values([...mine.open, ...mine.terminal]);
    const ids = idsOf([...mine.open, ...mine.terminal]);

    expect(
      (await endViaApi(target.trainerCookie, target.relationshipId, "ec1a-twice-1")).status,
    ).toBe(200);
    const relAfterFirst = await relationshipRow(db, target.relationshipId);
    const rowsAfterFirst = await rowsById(db, ids);

    const second = await endViaApi(target.trainerCookie, target.relationshipId, "ec1a-twice-2");
    expect(second.status).toBe(409);

    // A racing second end that got past the route check: same domain call again.
    // Even a row that is somehow open on the ended relationship is not closed
    // by a call that did not end it, so resolved_at never drifts from ended_at.
    const straggler: ExceptionInsert = {
      ...mine.open[0]!,
      id: "ffffffff-0003-4000-8000-000000000001",
      sourceEntityId: "ffffffff-0004-4000-8000-000000000001",
    };
    await db.insert(schema.exceptions).values(straggler);
    ids.push(straggler.id);
    rowsAfterFirst.set(straggler.id, (await rowsById(db, [straggler.id])).get(straggler.id)!);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await endCoachingRelationship(db, {
      relationshipId: target.relationshipId,
      endedByUserId: "00000000-0000-4000-8000-00000000beef",
      reason: "second",
    });
    expect(await relationshipRow(db, target.relationshipId)).toEqual(relAfterFirst);
    expect(await rowsById(db, ids)).toEqual(rowsAfterFirst);
  });

  it("is atomic with the end: if closing exceptions fails, the relationship is not ended", async () => {
    const target = await reachActiveWithSchedule("ec1a-atomic");
    const db = getTestDbOverride()!;
    const mine = exceptionSet(target.relationshipId, "abababab");
    await db.insert(schema.exceptions).values([...mine.open, ...mine.terminal]);
    const ids = idsOf([...mine.open, ...mine.terminal]);
    const relBefore = await relationshipRow(db, target.relationshipId);
    const rowsBefore = await rowsById(db, ids);
    const scheduledBefore = await db
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, target.relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
        ),
      );
    expect(scheduledBefore.length).toBeGreaterThan(0);

    currentSqlite!.run(
      "CREATE TRIGGER ec1a_fail_close BEFORE UPDATE ON exceptions WHEN NEW.closed_reason = 'coaching_ended' BEGIN SELECT RAISE(ABORT, 'ec1a injected failure'); END",
    );
    await expect(
      endCoachingRelationship(db, {
        relationshipId: target.relationshipId,
        endedByUserId: relBefore.trainerUserId,
        reason: "paused",
      }),
    ).rejects.toThrow();
    currentSqlite!.run("DROP TRIGGER ec1a_fail_close");

    expect(await relationshipRow(db, target.relationshipId)).toEqual(relBefore);
    expect(await rowsById(db, ids)).toEqual(rowsBefore);
    const scheduledAfter = await db
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, target.relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
        ),
      );
    expect(scheduledAfter).toEqual(scheduledBefore);

    // With the failure gone, the same end closes everything in one go.
    expect(
      (await endViaApi(target.trainerCookie, target.relationshipId, "ec1a-atomic-end")).status,
    ).toBe(200);
    const endedAt = (await relationshipRow(db, target.relationshipId)).endedAt;
    const after = await rowsById(db, idsOf(mine.open));
    for (const row of after.values()) {
      expect(row.status).toBe("resolved");
      expect(row.resolvedAt).toBe(endedAt);
    }
  });
});
