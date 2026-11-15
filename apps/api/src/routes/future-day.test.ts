import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, gt, isNull, lt } from "drizzle-orm";
import { formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import { FUTURE_DAY_ERROR } from "../domain/future-day.js";

/**
 * Z12-39 / D-W12-7: future days are view only, on the full demo seed.
 *
 * Every trainee log endpoint (meal confirm, deviate and skip; workout start
 * and skip; measurements; progress entries) and the offline sync push answer
 * 422 FUTURE_DAY with the one static body for an item dated after the
 * trainee's today in their stored zone, and write nothing. Ownership is
 * resolved first, so another trainee still gets 404 and learns nothing about
 * the day. A past day stays loggable as a late log.
 *
 * Frozen at Wed 11 Nov 2026 12:00 in Asia/Kolkata (06:30 UTC).
 */
const FROZEN = "2026-11-11T06:30:00.000Z";
const AARAV = "aarav.ontrack@demo.fitbud.test";
const ROHAN = "rohan.slipping@demo.fitbud.test";

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
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "dev_sink",
  };
}

type Headers = Record<string, string>;

async function signIn(email: string, role: "trainee" | "trainer" = "trainee"): Promise<Headers> {
  const login = await app.request(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email, password: DEMO_PASSWORD_PLAINTEXT }),
    },
    testEnv(),
  );
  expect(login.status, email).toBe(200);
  const { data } = (await login.json()) as { data: { token: string } };
  return { Authorization: `Bearer ${data.token}`, "x-fitbud-role": role };
}

let keySeq = 0;
function post(path: string, headers: Headers, body: unknown = {}) {
  keySeq += 1;
  return app.request(
    path,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": `future-day-${keySeq}`,
      },
      body: JSON.stringify(body),
    },
    testEnv(),
  );
}

async function expectFutureDay(response: Response, label: string) {
  expect(response.status, label).toBe(422);
  const body = (await response.json()) as { error: { code: string; message: string } };
  expect(body.error.code, label).toBe("FUTURE_DAY");
  // Static text only (AGENTS.md API errors): no date, id or zone in it.
  expect(body.error.message, label).toBe(FUTURE_DAY_ERROR.message);
}

describe("Z12-39 future days are view only (demo seed)", () => {
  let db: Db;
  let close: () => void = () => {};

  beforeAll(async () => {
    await prepareDemoSeededDb(FROZEN);
  });

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(FROZEN));
    const handle = await createDemoSeededDb(FROZEN);
    close = handle.close;
    db = handle.db;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
    vi.useRealTimers();
  });

  async function trainee(email: string) {
    const [row] = await db
      .select({ user: schema.users })
      .from(schema.users)
      .innerJoin(schema.userIdentities, eq(schema.userIdentities.userId, schema.users.id))
      .where(eq(schema.userIdentities.emailNorm, email));
    expect(row, email).toBeTruthy();
    const user = row?.user;
    const [relationship] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(
        and(
          eq(schema.coachingRelationships.traineeUserId, user!.id),
          eq(schema.coachingRelationships.status, "active"),
        ),
      );
    expect(relationship, `${email} relationship`).toBeTruthy();
    const today = formatLocalDate(new Date(FROZEN), user!.timezone);
    return { user: user!, relationship: relationship!, today };
  }

  async function nextFutureMeal(relationshipId: string, today: string) {
    const [row] = await db
      .select()
      .from(schema.mealAssignments)
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          gt(schema.mealAssignments.localDate, today),
        ),
      )
      .orderBy(asc(schema.mealAssignments.localDate), asc(schema.mealAssignments.windowStartsAt))
      .limit(1);
    expect(row, "a future meal in the seed").toBeTruthy();
    return row!;
  }

  async function nextFutureWorkout(relationshipId: string, today: string) {
    const [row] = await db
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gt(schema.workoutAssignments.localDate, today),
        ),
      )
      .orderBy(asc(schema.workoutAssignments.localDate))
      .limit(1);
    expect(row, "a future workout in the seed").toBeTruthy();
    return row!;
  }

  it("the seed trainee is in a non-UTC zone and has plan items after today", async () => {
    const { user, relationship, today } = await trainee(AARAV);
    expect(user.timezone).toBe("Asia/Kolkata");
    expect(today).toBe("2026-11-11");
    expect((await nextFutureMeal(relationship.id, today)).localDate > today).toBe(true);
    expect((await nextFutureWorkout(relationship.id, today)).localDate > today).toBe(true);
  });

  it("meal confirm, deviate and skip on a future day are 422 FUTURE_DAY and write nothing", async () => {
    const { relationship, today } = await trainee(AARAV);
    const meal = await nextFutureMeal(relationship.id, today);
    const headers = await signIn(AARAV);

    await expectFutureDay(await post(`/meals/assignments/${meal.id}/confirm`, headers), "confirm");
    await expectFutureDay(
      await post(`/meals/assignments/${meal.id}/deviate`, headers, {
        deviationKind: "restaurant",
        notes: "Planning ahead",
      }),
      "deviate",
    );
    await expectFutureDay(await post(`/meals/assignments/${meal.id}/skip`, headers), "skip");
    // A client time inside that day's window does not open it early.
    await expectFutureDay(
      await post(`/meals/assignments/${meal.id}/confirm`, headers, {
        clientLoggedAt: new Date(Date.parse(meal.windowStartsAt) + 60_000).toISOString(),
      }),
      "confirm with a client time on that day",
    );

    const stored = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, meal.id));
    expect(stored).toHaveLength(0);
  });

  it("workout start and skip on a future day are 422 FUTURE_DAY, with or without a client time", async () => {
    const { relationship, today } = await trainee(AARAV);
    const workout = await nextFutureWorkout(relationship.id, today);
    const headers = await signIn(AARAV);

    await expectFutureDay(await post(`/workouts/assignments/${workout.id}/start`, headers), "start");
    // Skip without a client time skips the window bounds; the day guard still holds.
    await expectFutureDay(await post(`/workouts/assignments/${workout.id}/skip`, headers), "skip");
    await expectFutureDay(
      await post(`/workouts/assignments/${workout.id}/skip`, headers, {
        clientLoggedAt: FROZEN,
      }),
      "skip with a client time",
    );

    const executions = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, workout.id));
    expect(executions).toHaveLength(0);
  });

  it("a measurement or progress entry dated after today is 422 FUTURE_DAY; today's is accepted", async () => {
    const { relationship } = await trainee(AARAV);
    const headers = await signIn(AARAV);
    // 00:30 tomorrow in Asia/Kolkata.
    const tomorrow = "2026-11-11T19:00:00.000Z";

    await expectFutureDay(
      await post(`/progress/relationships/${relationship.id}/measurements`, headers, {
        type: "body_weight_kg",
        value: 72.4,
        unit: "kg",
        observedAt: tomorrow,
      }),
      "measurement",
    );
    await expectFutureDay(
      await post(`/progress/relationships/${relationship.id}/entries`, headers, {
        entryType: "note",
        body: "Felt strong",
        observedAt: tomorrow,
      }),
      "progress entry",
    );
    const stored = await db
      .select()
      .from(schema.measurements)
      .where(
        and(
          eq(schema.measurements.coachingRelationshipId, relationship.id),
          eq(schema.measurements.observedAt, tomorrow),
        ),
      );
    expect(stored).toHaveLength(0);

    // 23:30 today in Asia/Kolkata is still today.
    const lateToday = "2026-11-11T18:00:00.000Z";
    const measured = await post(`/progress/relationships/${relationship.id}/measurements`, headers, {
      type: "body_weight_kg",
      value: 72.4,
      unit: "kg",
      observedAt: lateToday,
    });
    expect(measured.status).toBe(200);
    const entry = await post(`/progress/relationships/${relationship.id}/entries`, headers, {
      entryType: "note",
      body: "Felt strong",
      observedAt: lateToday,
    });
    expect(entry.status).toBe(200);
  });

  it("the progress-entry guard is the trainee's: the coach's own post is not refused with FUTURE_DAY", async () => {
    const { relationship } = await trainee(AARAV);
    const coach = await signIn("rahul.coach@demo.fitbud.test", "trainer");
    const response = await post(`/progress/relationships/${relationship.id}/entries`, coach, {
      entryType: "milestone",
      title: "Deload week",
      observedAt: "2026-11-11T19:00:00.000Z",
    });
    expect(response.status).toBe(200);
  });

  it("synced offline logs for a future day come back rejected with FUTURE_DAY", async () => {
    const { relationship, today } = await trainee(AARAV);
    const meal = await nextFutureMeal(relationship.id, today);
    const workout = await nextFutureWorkout(relationship.id, today);
    const headers = await signIn(AARAV);
    const base = (operation: string, entityType: string, payload: Record<string, unknown>) => ({
      mutationId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      recordId: crypto.randomUUID(),
      entityType,
      operation,
      clientOccurredAt: FROZEN,
      payload,
    });
    const mutations = [
      base("meal.confirm", "meal_compliance", { assignmentId: meal.id, body: {} }),
      base("meal.deviate", "meal_compliance", {
        assignmentId: meal.id,
        body: { deviationKind: "restaurant" },
      }),
      base("meal.skip", "meal_compliance", { assignmentId: meal.id, body: {} }),
      base("workout.start", "workout_execution", { assignmentId: workout.id }),
      base("workout.skip", "workout_execution", { assignmentId: workout.id }),
      base("measurement.create", "measurement", {
        coachingRelationshipId: relationship.id,
        body: {
          type: "body_weight_kg",
          value: 72.4,
          unit: "kg",
          observedAt: "2026-11-12T03:00:00.000Z",
        },
      }),
    ];
    const pushed = await post("/sync/push", headers, { mutations });
    expect(pushed.status).toBe(200);
    const { data } = (await pushed.json()) as {
      data: { results: Array<{ mutationId: string; status: string; error: { code: string; message: string } | null }> };
    };
    expect(data.results).toHaveLength(mutations.length);
    for (const [index, result] of data.results.entries()) {
      const label = mutations[index]!.operation;
      expect(result.mutationId, label).toBe(mutations[index]!.mutationId);
      expect(result.status, label).toBe("rejected");
      expect(result.error?.code, label).toBe("FUTURE_DAY");
      expect(result.error?.message, label).toBe(FUTURE_DAY_ERROR.message);
    }
    expect(
      await db
        .select()
        .from(schema.mealCompliance)
        .where(eq(schema.mealCompliance.assignmentId, meal.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.assignmentId, workout.id)),
    ).toHaveLength(0);
  });

  it("ownership is resolved before the day: another trainee gets 404, not FUTURE_DAY", async () => {
    const { relationship, today } = await trainee(AARAV);
    const meal = await nextFutureMeal(relationship.id, today);
    const workout = await nextFutureWorkout(relationship.id, today);
    const rohan = await signIn(ROHAN);

    for (const path of [
      `/meals/assignments/${meal.id}/confirm`,
      `/meals/assignments/${meal.id}/skip`,
      `/workouts/assignments/${workout.id}/start`,
      `/workouts/assignments/${workout.id}/skip`,
    ]) {
      const response = await post(path, rohan);
      expect(response.status, path).toBe(404);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code, path).toBe("ASSIGNMENT_NOT_FOUND");
    }
    const measurement = await post(`/progress/relationships/${relationship.id}/measurements`, rohan, {
      type: "body_weight_kg",
      value: 80,
      unit: "kg",
      observedAt: "2026-11-12T03:00:00.000Z",
    });
    expect(measurement.status).toBe(404);
  });

  it("a past day stays loggable as a late log", async () => {
    const { relationship, today } = await trainee(ROHAN);
    // Rohan is slipping: an unlogged meal from an earlier day is in the seed.
    const unlogged = await db
      .select({ assignment: schema.mealAssignments })
      .from(schema.mealAssignments)
      .leftJoin(
        schema.mealCompliance,
        eq(schema.mealCompliance.assignmentId, schema.mealAssignments.id),
      )
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationship.id),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          lt(schema.mealAssignments.localDate, today),
          lt(schema.mealAssignments.windowEndsAt, FROZEN),
          isNull(schema.mealCompliance.id),
        ),
      )
      .orderBy(asc(schema.mealAssignments.localDate));
    const recent = unlogged
      .map((row) => row.assignment)
      .filter((row) => row.localDate >= "2026-11-08")
      .at(-1);
    expect(recent, "an unlogged past meal").toBeTruthy();

    const headers = await signIn(ROHAN);
    const logged = await post(`/meals/assignments/${recent!.id}/confirm`, headers);
    expect(logged.status).toBe(200);
    const body = (await logged.json()) as { data: { assignmentId: string; outcome: string } };
    expect(body.data.assignmentId).toBe(recent!.id);
    expect(body.data.outcome).toBe("confirmed");

    const stored = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, recent!.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.localDate).toBe(recent!.localDate);
    expect(stored[0]!.loggedLate).toBe(true);
  });
});
