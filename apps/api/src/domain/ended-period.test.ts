import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";

/**
 * Z6-12 (EC1 rule 1): after a client is ended and reactivated, the ended
 * period stays frozen. Back-logging a meal or workout dated inside it is
 * rejected with 422 ENDED_PERIOD, re-evaluation ignores facts from before the
 * reactivation, and the exceptions closed at the end keep exactly the state
 * (and source signal) the end gave them. Logs dated after the reactivation
 * count normally, including a late log that stays open as "logged late".
 *
 * The story runs on a fake clock (Asia/Kolkata trainee):
 *   Mon 9 Nov   coaching runs, the Monday workout and lunch are missed
 *   Tue 10 Nov  01:00 evaluate → exceptions for Monday; Tuesday's lunch is
 *               missed later without an evaluation
 *   Wed 11 Nov  trainer ends coaching (open exceptions close as coaching_ended)
 *   Thu 12 Nov  reactivated; back-logs for Mon/Tue are rejected; a new plan is
 *               assigned and Thursday logs work normally
 *   Fri 13 Nov  Friday's lunch is missed, evaluated, then logged late
 */

const TZ_OFFSET = "+05:30";
const at = (localDateTime: string, offset = TZ_OFFSET) =>
  new Date(`2026-11-${localDateTime}:00.000${offset}`);

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

type Headers = Record<string, string>;

async function send(
  method: "POST" | "PUT",
  path: string,
  headers: Headers,
  body: unknown,
  key?: string,
) {
  return app.request(
    path,
    {
      method,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    },
    testEnv(),
  );
}

const post = (path: string, headers: Headers, body: unknown, key?: string) =>
  send("POST", path, headers, body, key);

function planContent() {
  const setTargets = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      order: 1,
      reps: 5,
      loadLabel: "60kg",
      rpe: 7,
    },
  ];
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
            setTargets,
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
              { ...setTargets[0]!, id: "33333333-3333-4333-8333-333333333334" },
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

async function reachCoaching(db: Db, timeZone = "Asia/Kolkata") {
  const trainerToken = createTestIdToken(
    "trainer-ended-period@example.com",
    "ended-period-coach@example.com",
  );
  const session = await post("/auth/session", {}, {
    idToken: trainerToken,
    timezone: timeZone,
  });
  expect(session.status).toBe(200);
  const trainer = { Cookie: session.headers.get("set-cookie")!.split(";")[0]! };

  const invite = await post(
    "/invitations",
    trainer,
    { recipientEmail: "ended-period-trainee@example.com" },
    "ep-inv",
  );
  expect(invite.status).toBe(200);
  const { data: invitation } = (await invite.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    "ended-period-trainee",
    "ended-period-trainee@example.com",
  );
  const trainee = {
    Authorization: `Bearer ${traineeToken}`,
    "x-fitbud-role": "trainee",
  };
  const accept = await post(
    "/invitations/accept",
    { Authorization: `Bearer ${traineeToken}` },
    { token: invitation.token, timezone: timeZone },
  );
  const relationshipId = (
    (await accept.json()) as { data: { relationship: { id: string } } }
  ).data.relationship.id;

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
  await post(
    `/onboarding/relationships/${relationshipId}/submit`,
    trainee,
    { expectedVersion: 1 },
    "ep-submit",
  );
  await post(
    `/onboarding/relationships/${relationshipId}/review`,
    trainer,
    { outcome: "coaching_ready" },
    "ep-review",
  );
  await send("PUT", `/configurations/relationships/${relationshipId}/draft`, trainer, {
    expectedVersion: 0,
    goalShort: "Strength",
    workout: { sessionsPerWeek: 2, completionWindowHours: 24 },
    nutrition: { mealsPerDay: 1, confirmationWindowHours: 24, photoRequirement: "none" },
    checkin: { cadence: "weekly", dueWindowHours: 48 },
    tracking: {
      requireBodyWeight: false,
      requireProgressPhotos: false,
      requireSessionRpe: false,
    },
  });
  await post(
    `/configurations/relationships/${relationshipId}/configure`,
    trainer,
    { expectedVersion: 1 },
    "ep-cfg",
  );
  const activated = await post(
    `/configurations/relationships/${relationshipId}/activate`,
    trainer,
    { expectedVersion: 1 },
    "ep-act",
  );
  expect(activated.status).toBe(200);

  const plan = await post(
    `/plans/relationships/${relationshipId}`,
    trainer,
    { title: "Foundation", content: planContent() },
    "ep-plan",
  );
  expect(plan.status).toBe(201);
  const planBody = (await plan.json()) as {
    data: { plan: { id: string }; version: { id: string; recordVersion: number } };
  };
  const planId = planBody.data.plan.id;
  const versionId = planBody.data.version.id;
  const published = await post(
    `/plans/${planId}/versions/${versionId}/publish`,
    trainer,
    { expectedRecordVersion: planBody.data.version.recordVersion, mode: "immediate" },
    "ep-pub",
  );
  expect(published.status).toBe(200);

  for (const kind of ["workouts", "meals"] as const) {
    const generated = await post(
      `/${kind}/relationships/${relationshipId}/assignments/generate`,
      trainer,
      { fromDate: "2026-11-09", toDate: "2026-11-15" },
      `ep-gen-${kind}`,
    );
    expect(generated.status).toBe(200);
  }

  const workoutOn = async (localDate: string) => {
    const [row] = await db
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.localDate, localDate),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
        ),
      );
    expect(row, `workout on ${localDate}`).toBeTruthy();
    return row!;
  };
  const lunchOn = async (localDate: string) => {
    const [row] = await db
      .select()
      .from(schema.mealAssignments)
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
          eq(schema.mealAssignments.localDate, localDate),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
        ),
      );
    expect(row, `lunch on ${localDate}`).toBeTruthy();
    return row!;
  };

  return { trainer, trainee, relationshipId, planId, versionId, workoutOn, lunchOn };
}

async function errorCode(response: Response) {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe("Z6-12 ended period stays frozen after reactivation", () => {
  let db: Db;
  let closeDb: () => void;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(at("09T09:00"));
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

  async function exceptionRows(relationshipId: string) {
    const rows = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.coachingRelationshipId, relationshipId));
    return [...rows].sort((a, b) => a.id.localeCompare(b.id));
  }

  async function exceptionHistory(relationshipId: string) {
    const rows = await exceptionRows(relationshipId);
    const ids = rows.map((row) => row.id);
    const actions = ids.length
      ? await db
          .select()
          .from(schema.exceptionActions)
          .where(inArray(schema.exceptionActions.exceptionId, ids))
      : [];
    return { rows, actions };
  }

  async function storedCompliance(assignmentId: string) {
    const [row] = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, assignmentId));
    return row;
  }

  it("end → reactivate → back-logs for meals and workouts are 422 ENDED_PERIOD and change no exception; later logs count normally", async () => {
    const story = await reachCoaching(db);
    const { trainer, trainee, relationshipId } = story;
    const evaluate = (key: string) =>
      post(`/exceptions/relationships/${relationshipId}/evaluate`, trainer, {}, key);

    const mondayWorkout = await story.workoutOn("2026-11-09");
    const mondayLunch = await story.lunchOn("2026-11-09");
    const tuesdayLunch = await story.lunchOn("2026-11-10");

    // Tue 01:00: Monday's windows are closed, Tuesday's lunch is still open.
    vi.setSystemTime(at("10T01:00"));
    expect(Date.parse(mondayWorkout.windowEndsAt)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(mondayLunch.windowEndsAt)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(tuesdayLunch.windowEndsAt)).toBeGreaterThan(Date.now());
    expect((await evaluate("ep-eval-1")).status).toBe(200);
    const beforeEnd = await exceptionRows(relationshipId);
    const sources = beforeEnd.map((row) => row.sourceEntityId);
    expect(sources).toContain(mondayWorkout.id);
    expect(sources).toContain(mondayLunch.id);
    expect(sources).not.toContain(tuesdayLunch.id);

    // Wed 10:00: the trainer ends coaching. Tuesday's lunch was missed but
    // never evaluated, so it has no exception.
    vi.setSystemTime(at("11T10:00"));
    const ended = await post(`/relationships/${relationshipId}/end`, trainer, { reason: "paused" }, "ep-end");
    expect(ended.status).toBe(200);
    const closedAtEnd = await exceptionHistory(relationshipId);
    for (const row of closedAtEnd.rows) {
      expect(row.status, row.id).toBe("resolved");
      expect(row.closedReason, row.id).toBe("coaching_ended");
    }
    const endedAt = closedAtEnd.rows[0]!.resolvedAt!;

    // Thu 09:00: reactivated.
    vi.setSystemTime(at("12T09:00"));
    expect(
      (await post(`/relationships/${relationshipId}/reactivate`, trainer, {}, "ep-react")).status,
    ).toBe(200);
    expect(
      (await post(`/relationships/${relationshipId}/reactivate/confirm`, trainee, {})).status,
    ).toBe(200);
    vi.setSystemTime(at("12T09:30"));

    // Back-log Monday's lunch with the time the trainee says they ate it
    // (inside Monday's window, before ended_at).
    const mondayLoggedAt = new Date(Date.parse(mondayLunch.windowStartsAt) + 60_000).toISOString();
    expect(mondayLoggedAt < endedAt).toBe(true);
    const backLog = await post(
      `/meals/assignments/${mondayLunch.id}/deviate`,
      trainee,
      { deviationKind: "restaurant", notes: "Ate out", clientLoggedAt: mondayLoggedAt },
      "ep-backlog-mon",
    );
    expect(backLog.status).toBe(422);
    expect(await errorCode(backLog)).toBe("ENDED_PERIOD");

    // Tuesday's lunch (dated before the end, no exception) logged now.
    for (const [path, key] of [
      [`/meals/assignments/${tuesdayLunch.id}/confirm`, "ep-backlog-tue-confirm"],
      [`/meals/assignments/${tuesdayLunch.id}/skip`, "ep-backlog-tue-skip"],
    ] as const) {
      const response = await post(path, trainee, {}, key);
      expect(response.status, path).toBe(422);
      expect(await errorCode(response)).toBe("ENDED_PERIOD");
    }

    // Monday's workout cannot be started or skipped.
    for (const action of ["start", "skip"] as const) {
      const response = await post(
        `/workouts/assignments/${mondayWorkout.id}/${action}`,
        trainee,
        {},
        `ep-backlog-wo-${action}`,
      );
      expect(response.status, action).toBe(422);
      expect(await errorCode(response)).toBe("ENDED_PERIOD");
    }

    // Nothing was recorded for the frozen items.
    const frozenMeals = await db
      .select()
      .from(schema.mealCompliance)
      .where(inArray(schema.mealCompliance.assignmentId, [mondayLunch.id, tuesdayLunch.id]));
    expect(frozenMeals).toHaveLength(0);
    const frozenWorkouts = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, mondayWorkout.id));
    expect(frozenWorkouts).toHaveLength(0);

    // Re-evaluating after reactivation ignores the ended period: no new
    // exception for Tuesday's missed lunch, and the closed rows are untouched.
    const reEval = await evaluate("ep-eval-2");
    expect(reEval.status).toBe(200);
    expect(((await reEval.json()) as { data: { created: number } }).data.created).toBe(0);
    expect(await exceptionHistory(relationshipId)).toEqual(closedAtEnd);

    // A new plan from Thursday: logs after reactivation count normally.
    const assigned = await post(
      `/plans/${story.planId}/versions/${story.versionId}/assign`,
      trainer,
      {
        effectiveFrom: at("12T00:00").toISOString(),
        window: 7,
        dietChangeScope: "today_onward",
        notifyClient: false,
      },
      "ep-assign",
    );
    expect(assigned.status).toBe(200);
    const thursdayLunch = await story.lunchOn("2026-11-12");
    const thursdayWorkout = await story.workoutOn("2026-11-12");
    const fridayLunch = await story.lunchOn("2026-11-13");

    // Still Thursday morning, after the reactivation, inside the lunch window.
    expect(Date.parse(thursdayLunch.windowStartsAt)).toBeLessThan(Date.now());
    expect(Date.parse(thursdayLunch.windowEndsAt)).toBeGreaterThan(Date.now());
    const thursdayLog = await post(
      `/meals/assignments/${thursdayLunch.id}/confirm`,
      trainee,
      {},
      "ep-thu-lunch",
    );
    expect(thursdayLog.status).toBe(200);
    expect((await storedCompliance(thursdayLunch.id))?.loggedLate).toBe(false);

    expect(Date.parse(thursdayWorkout.windowStartsAt)).toBeLessThan(Date.now());
    const started = await post(
      `/workouts/assignments/${thursdayWorkout.id}/start`,
      trainee,
      {},
      "ep-thu-start",
    );
    expect(started.status).toBe(200);
    const executionId = ((await started.json()) as { data: { id: string } }).data.id;
    const completed = await post(
      `/workouts/executions/${executionId}/complete`,
      trainee,
      {},
      "ep-thu-complete",
    );
    expect(completed.status).toBe(200);

    // Friday's lunch is missed: evaluation raises it as it normally would.
    vi.setSystemTime(new Date(Date.parse(fridayLunch.windowEndsAt) + 60 * 60_000));
    expect((await evaluate("ep-eval-3")).status).toBe(200);
    const fridayOpen = (await exceptionRows(relationshipId)).find(
      (row) => row.sourceEntityId === fridayLunch.id,
    );
    expect(fridayOpen?.status).toBe("active");
    expect(fridayOpen?.type).toBe("overdue_meal");

    // Logged late after reactivation: accepted, and the exception moves to
    // "logged later" but stays open for the trainer (no auto-resolve).
    const lateLog = await post(
      `/meals/assignments/${fridayLunch.id}/confirm`,
      trainee,
      {},
      "ep-fri-late",
    );
    expect(lateLog.status).toBe(200);
    expect((await storedCompliance(fridayLunch.id))?.loggedLate).toBe(true);
    expect((await evaluate("ep-eval-4")).status).toBe(200);
    const fridayAfter = (await exceptionRows(relationshipId)).find(
      (row) => row.id === fridayOpen!.id,
    );
    expect(fridayAfter?.type).toBe("meal_logged_later");
    expect(fridayAfter?.status).toBe("active");
    expect(fridayAfter?.resolvedAt).toBeNull();

    // The exceptions closed at the end still match the end exactly.
    const finalRows = await exceptionRows(relationshipId);
    for (const closed of closedAtEnd.rows) {
      expect(finalRows.find((row) => row.id === closed.id)).toEqual(closed);
    }
  });

  it("an open session started before the end cannot be continued after reactivation", async () => {
    const story = await reachCoaching(db);
    const { trainer, trainee, relationshipId } = story;
    const mondayWorkout = await story.workoutOn("2026-11-09");

    vi.setSystemTime(at("09T18:00"));
    const started = await post(
      `/workouts/assignments/${mondayWorkout.id}/start`,
      trainee,
      {},
      "ep-open-start",
    );
    expect(started.status).toBe(200);
    const execution = ((await started.json()) as {
      data: { id: string; recordVersion: number };
    }).data;

    vi.setSystemTime(at("10T10:00"));
    expect(
      (await post(`/relationships/${relationshipId}/end`, trainer, { reason: "paused" }, "ep-open-end"))
        .status,
    ).toBe(200);
    vi.setSystemTime(at("11T09:00"));
    expect(
      (await post(`/relationships/${relationshipId}/reactivate`, trainer, {}, "ep-open-react")).status,
    ).toBe(200);
    expect(
      (await post(`/relationships/${relationshipId}/reactivate/confirm`, trainee, {})).status,
    ).toBe(200);

    const [before] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.id, execution.id));
    for (const [path, key] of [
      [`/workouts/executions/${execution.id}/complete`, "ep-open-complete"],
      [`/workouts/executions/${execution.id}/pause`, "ep-open-pause"],
      [`/workouts/assignments/${mondayWorkout.id}/skip`, "ep-open-skip"],
    ] as const) {
      const response = await post(path, trainee, {}, key);
      expect(response.status, path).toBe(422);
      expect(await errorCode(response)).toBe("ENDED_PERIOD");
    }
    const [after] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.id, execution.id));
    expect(after).toEqual(before);
  });
  // A missed item dated ON the reactivation day belongs to the new period:
  // evaluation must still raise it (only earlier days are frozen).
  it.each([
    // Reactivation times chosen so the UTC date differs from the local date,
    // which proves the reactivation day is taken in the trainee's timezone.
    { timeZone: "Asia/Kolkata", offset: "+05:30", reactivateAt: "12T04:00", assignAt: "12T04:30" },
    { timeZone: "America/New_York", offset: "-05:00", reactivateAt: "12T21:00", assignAt: "12T21:30" },
  ])(
    "a missed item dated on the reactivation day still raises an exception ($timeZone)",
    async ({ timeZone, offset, reactivateAt, assignAt }) => {
      vi.setSystemTime(at("09T09:00", offset));
      const story = await reachCoaching(db, timeZone);
      const { trainer, trainee, relationshipId } = story;

      vi.setSystemTime(at("10T10:00", offset));
      expect(
        (await post(`/relationships/${relationshipId}/end`, trainer, { reason: "paused" }, "ep-day-end"))
          .status,
      ).toBe(200);

      // Reactivated on Thu 12 Nov (local), and a plan assigned from that day.
      vi.setSystemTime(at(reactivateAt, offset));
      expect(at(reactivateAt, offset).toISOString().slice(0, 10)).not.toBe("2026-11-12");
      expect(
        (await post(`/relationships/${relationshipId}/reactivate`, trainer, {}, "ep-day-react")).status,
      ).toBe(200);
      expect(
        (await post(`/relationships/${relationshipId}/reactivate/confirm`, trainee, {})).status,
      ).toBe(200);
      vi.setSystemTime(at(assignAt, offset));
      const assigned = await post(
        `/plans/${story.planId}/versions/${story.versionId}/assign`,
        trainer,
        {
          effectiveFrom: at("12T00:00", offset).toISOString(),
          window: 7,
          dietChangeScope: "today_onward",
          notifyClient: false,
        },
        "ep-day-assign",
      );
      expect(assigned.status).toBe(200);
      const reactivationDayLunch = await story.lunchOn("2026-11-12");
      const reactivationDayWorkout = await story.workoutOn("2026-11-12");

      // Nothing logged; once both windows close, evaluation raises them.
      vi.setSystemTime(
        new Date(
          Math.max(
            Date.parse(reactivationDayLunch.windowEndsAt),
            Date.parse(reactivationDayWorkout.windowEndsAt),
          ) + 60 * 60_000,
        ),
      );
      const evaluated = await post(
        `/exceptions/relationships/${relationshipId}/evaluate`,
        trainer,
        {},
        "ep-day-eval",
      );
      expect(evaluated.status).toBe(200);
      const rows = await exceptionRows(relationshipId);
      const lunchException = rows.find((row) => row.sourceEntityId === reactivationDayLunch.id);
      const workoutException = rows.find(
        (row) => row.sourceEntityId === reactivationDayWorkout.id,
      );
      expect(lunchException?.type).toBe("overdue_meal");
      expect(lunchException?.status).toBe("active");
      expect(workoutException?.type).toBe("missed_workout");
      expect(workoutException?.status).toBe("active");
    },
  );
});
