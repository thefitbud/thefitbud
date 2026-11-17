import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { FUTURE_DAY_ERROR } from "../domain/future-day.js";

/**
 * Z12-39 / D-W12-7: the day boundary is the trainee's civil midnight in their
 * stored zone, never UTC midnight.
 *
 * The coaching is built through the real workflow (invite → onboarding →
 * configuration → published plan → generated assignments), so windows open at
 * local midnight. For each zone, at 23:30 on Wed 11 Nov Thursday's meal and
 * workout are refused with FUTURE_DAY; at 00:30 on Thu 12 Nov the same items
 * log normally.
 *
 * - Asia/Kolkata (UTC+05:30): 00:30 Thu is 19:00 Wed UTC, so a UTC rule would
 *   wrongly keep Thursday shut.
 * - America/New_York (UTC−05:00 in November): 23:30 Wed is 04:30 Thu UTC, so
 *   a UTC rule would wrongly open Thursday early.
 *
 * The execution routes (sets, pause, resume, complete) are covered by a
 * session started on its day whose day is later ahead of the trainee's
 * stored zone (the stored zone moved west after the start).
 */

const OFFSETS: Record<string, string> = {
  "Asia/Kolkata": "+05:30",
  "America/New_York": "-05:00",
};
const at = (localDateTime: string, timeZone: string) =>
  new Date(`2026-11-${localDateTime}:00.000${OFFSETS[timeZone]}`);

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
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

type Headers = Record<string, string>;

let keySeq = 0;
async function send(method: "POST" | "PUT", path: string, headers: Headers, body: unknown) {
  keySeq += 1;
  return app.request(
    path,
    {
      method,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": `fd-edge-${keySeq}`,
      },
      body: JSON.stringify(body),
    },
    testEnv(),
  );
}
const post = (path: string, headers: Headers, body: unknown = {}) =>
  send("POST", path, headers, body);

function planContent() {
  return {
    workoutDays: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        order: 1,
        name: "Lower body",
        weekday: 1,
        exercises: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            order: 1,
            name: "Squat",
            instructions: "Depth to parallel",
            setTargets: [
              { id: "33333333-3333-4333-8333-333333333331", order: 1, reps: 5, loadLabel: "60kg", rpe: 7 },
              { id: "33333333-3333-4333-8333-333333333332", order: 2, reps: 5, loadLabel: "60kg", rpe: 7 },
            ],
          },
        ],
      },
      {
        id: "11111111-1111-4111-8111-111111111112",
        order: 2,
        name: "Upper body",
        weekday: 4,
        exercises: [
          {
            id: "22222222-2222-4222-8222-222222222223",
            order: 1,
            name: "Bench press",
            instructions: "Controlled descent",
            setTargets: [
              { id: "33333333-3333-4333-8333-333333333334", order: 1, reps: 5, loadLabel: "40kg", rpe: 7 },
              { id: "33333333-3333-4333-8333-333333333335", order: 2, reps: 5, loadLabel: "40kg", rpe: 7 },
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

async function reachCoaching(db: Db, timeZone: string, tag: string) {
  const session = await post("/auth/session", {}, {
    idToken: createTestIdToken(`trainer-fd-${tag}`, `fd-coach-${tag}@example.com`),
    timezone: timeZone,
  });
  expect(session.status).toBe(200);
  const trainer = { Cookie: session.headers.get("set-cookie")!.split(";")[0]! };

  const invite = await post("/invitations", trainer, { recipientEmail: `fd-trainee-${tag}@example.com` });
  expect(invite.status).toBe(200);
  const { data: invitation } = (await invite.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(`fd-trainee-${tag}`, `fd-trainee-${tag}@example.com`);
  const trainee = { Authorization: `Bearer ${traineeToken}`, "x-fitbud-role": "trainee" };
  const accept = await post(
    "/invitations/accept",
    { Authorization: `Bearer ${traineeToken}` },
    { token: invitation.token, timezone: timeZone },
  );
  expect(accept.status).toBe(200);
  const accepted = (await accept.json()) as {
    data: { relationship: { id: string; traineeUserId: string } };
  };
  const relationshipId = accepted.data.relationship.id;
  const traineeUserId = accepted.data.relationship.traineeUserId;

  expect(
    (
      await send("PUT", `/onboarding/relationships/${relationshipId}/draft`, trainee, {
        expectedVersion: 0,
        answers: {
          goals: "Get stronger",
          relevant_history: "None",
          preferences: "Gym",
          schedule: "Mornings",
          limitations: "None",
        },
      })
    ).status,
  ).toBe(201);
  await post(`/onboarding/relationships/${relationshipId}/submit`, trainee, { expectedVersion: 1 });
  await post(`/onboarding/relationships/${relationshipId}/review`, trainer, { outcome: "coaching_ready" });
  await send("PUT", `/configurations/relationships/${relationshipId}/draft`, trainer, {
    expectedVersion: 0,
    goalShort: "Strength",
    workout: { sessionsPerWeek: 2, completionWindowHours: 24 },
    nutrition: { mealsPerDay: 1, confirmationWindowHours: 24, photoRequirement: "none" },
    checkin: { cadence: "weekly", dueWindowHours: 48 },
    tracking: { requireBodyWeight: false, requireProgressPhotos: false, requireSessionRpe: false },
  });
  await post(`/configurations/relationships/${relationshipId}/configure`, trainer, { expectedVersion: 1 });
  expect(
    (await post(`/configurations/relationships/${relationshipId}/activate`, trainer, { expectedVersion: 1 })).status,
  ).toBe(200);

  const plan = await post(`/plans/relationships/${relationshipId}`, trainer, {
    title: "Foundation",
    content: planContent(),
  });
  expect(plan.status).toBe(201);
  const planBody = (await plan.json()) as {
    data: { plan: { id: string }; version: { id: string; recordVersion: number } };
  };
  const published = await post(
    `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
    trainer,
    { expectedRecordVersion: planBody.data.version.recordVersion, mode: "immediate" },
  );
  expect(published.status).toBe(200);
  for (const kind of ["workouts", "meals"] as const) {
    const generated = await post(`/${kind}/relationships/${relationshipId}/assignments/generate`, trainer, {
      fromDate: "2026-11-09",
      toDate: "2026-11-15",
    });
    expect(generated.status).toBe(200);
  }

  const [workout] = await db
    .select()
    .from(schema.workoutAssignments)
    .where(
      and(
        eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
        eq(schema.workoutAssignments.localDate, "2026-11-12"),
        eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
      ),
    );
  const [lunch] = await db
    .select()
    .from(schema.mealAssignments)
    .where(
      and(
        eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
        eq(schema.mealAssignments.localDate, "2026-11-12"),
        eq(schema.mealAssignments.scheduleStatus, "scheduled"),
      ),
    );
  expect(workout, "Thursday workout").toBeTruthy();
  expect(lunch, "Thursday lunch").toBeTruthy();
  return { trainee, traineeUserId, relationshipId, workout: workout!, lunch: lunch! };
}

async function expectFutureDay(response: Response, label: string) {
  expect(response.status, label).toBe(422);
  const body = (await response.json()) as { error: { code: string; message: string } };
  expect(body.error.code, label).toBe("FUTURE_DAY");
  expect(body.error.message, label).toBe(FUTURE_DAY_ERROR.message);
}

describe("Z12-39 future-day boundary is the trainee's civil midnight", () => {
  let db: Db;
  let closeDb: () => void;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const memory = await createMemoryDb();
    db = memory.db;
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
    vi.useRealTimers();
  });

  for (const [timeZone, tag] of [
    ["Asia/Kolkata", "ist"],
    ["America/New_York", "nyc"],
  ] as const) {
    it(`${timeZone}: Thursday is shut at 23:30 Wed and opens at 00:30 Thu`, async () => {
      vi.setSystemTime(at("09T09:00", timeZone));
      const story = await reachCoaching(db, timeZone, tag);
      const { trainee, workout, lunch } = story;

      vi.setSystemTime(at("11T23:30", timeZone));
      await expectFutureDay(await post(`/meals/assignments/${lunch.id}/confirm`, trainee), "meal confirm 23:30");
      await expectFutureDay(
        await post(`/meals/assignments/${lunch.id}/deviate`, trainee, { deviationKind: "restaurant" }),
        "meal deviate 23:30",
      );
      await expectFutureDay(await post(`/meals/assignments/${lunch.id}/skip`, trainee), "meal skip 23:30");
      await expectFutureDay(await post(`/workouts/assignments/${workout.id}/start`, trainee), "workout start 23:30");
      await expectFutureDay(await post(`/workouts/assignments/${workout.id}/skip`, trainee), "workout skip 23:30");
      await expectFutureDay(
        await post(`/progress/relationships/${story.relationshipId}/measurements`, trainee, {
          type: "body_weight_kg",
          value: 70,
          unit: "kg",
          observedAt: at("12T00:10", timeZone).toISOString(),
        }),
        "measurement dated 00:10 Thu, sent 23:30 Wed",
      );

      vi.setSystemTime(at("12T00:30", timeZone));
      const confirmed = await post(`/meals/assignments/${lunch.id}/confirm`, trainee);
      expect(confirmed.status, "meal confirm 00:30").toBe(200);
      const started = await post(`/workouts/assignments/${workout.id}/start`, trainee);
      expect(started.status, "workout start 00:30").toBe(200);
      const execution = ((await started.json()) as {
        data: { id: string; exercises: Array<{ sets: Array<{ id: string }> }> };
      }).data;
      const [firstSet, secondSet] = execution.exercises[0]!.sets;
      expect(
        (await post(`/workouts/executions/${execution.id}/sets/${firstSet!.id}/complete`, trainee)).status,
        "set complete 00:30",
      ).toBe(200);
      expect(
        (await post(`/workouts/executions/${execution.id}/sets/${secondSet!.id}/skip`, trainee)).status,
        "set skip 00:30",
      ).toBe(200);
      expect(
        (await post(`/workouts/executions/${execution.id}/complete`, trainee)).status,
        "complete 00:30",
      ).toBe(200);
      const measured = await post(`/progress/relationships/${story.relationshipId}/measurements`, trainee, {
        type: "body_weight_kg",
        value: 70,
        unit: "kg",
        observedAt: at("12T00:10", timeZone).toISOString(),
      });
      expect(measured.status, "measurement 00:30").toBe(200);
    });
  }

  it("an open session whose day is ahead of the stored zone takes no sets, pause, resume or completion", async () => {
    vi.setSystemTime(at("09T09:00", "Asia/Kolkata"));
    const story = await reachCoaching(db, "Asia/Kolkata", "moved");
    const { trainee, traineeUserId, workout } = story;

    // Started at 00:30 Thu in Kolkata, on its own day.
    vi.setSystemTime(at("12T00:30", "Asia/Kolkata"));
    const started = await post(`/workouts/assignments/${workout.id}/start`, trainee);
    expect(started.status).toBe(200);
    const execution = ((await started.json()) as {
      data: { id: string; exercises: Array<{ sets: Array<{ id: string }> }> };
    }).data;
    const [firstSet, secondSet] = execution.exercises[0]!.sets;

    // The stored zone moves to New York, where it is 14:00 on Wed 11 Nov.
    await db.update(schema.users).set({ timezone: "America/New_York" }).where(eq(schema.users.id, traineeUserId));
    const base = `/workouts/executions/${execution.id}`;
    await expectFutureDay(await post(`${base}/sets/${firstSet!.id}/complete`, trainee), "set complete");
    await expectFutureDay(await post(`${base}/sets/${secondSet!.id}/skip`, trainee), "set skip");
    await expectFutureDay(await post(`${base}/pause`, trainee), "pause");
    await expectFutureDay(await post(`${base}/resume`, trainee), "resume");
    await expectFutureDay(await post(`${base}/complete`, trainee), "complete");
    const [stored] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.id, execution.id));
    expect(stored!.status).toBe("started");

    // Back in Kolkata the day has begun again and the session carries on.
    await db.update(schema.users).set({ timezone: "Asia/Kolkata" }).where(eq(schema.users.id, traineeUserId));
    expect((await post(`${base}/sets/${firstSet!.id}/complete`, trainee)).status).toBe(200);
  });
});
