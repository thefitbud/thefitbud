import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { drizzle } from "drizzle-orm/d1";
import {
  getTestDbOverride,
  setTestDbOverride,
  type Db,
} from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { addDaysToLocalDate, formatLocalDate, weekdayFromLocalDate } from "@fitbud/core";
import { handleScheduledReplenishment } from "../jobs/replenishment.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";



import {
  createMemoryDb as createSharedMemoryDb,
  type SqlJsCompatDatabase,
} from "../test-support/memory-db.js";


/**
 * Concurrent-edit ordering for this file's tests only (Z7-22). Returns a copy
 * of `db` whose first `parties` reads of `table` each run, then hold their
 * result until all `parties` have read. Every handler has its recordVersion
 * snapshot before any of them writes, so a 409 can only come from the
 * versioned update missing the row. Later reads pass straight through.
 */
function holdFirstReadsOf(db: Db, table: string, parties: number): Db {
  // drizzle() keeps the D1 binding on `$client`; the `Db` type omits it.
  const d1 = (db as Db & { $client: D1Database }).$client;
  const reads = new RegExp(`^select\\b[\\s\\S]*\\bfrom "${table}"`, "i");
  let arrived = 0;
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  async function hold<T>(result: T): Promise<T> {
    if (arrived >= parties) return result;
    arrived += 1;
    if (arrived >= parties) open();
    await opened;
    return result;
  }
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return {
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      all: async () => hold(await statement.all()),
      raw: async () => hold(await statement.raw()),
      first: async (column?: string) => hold(await statement.first(column as string)),
      run: () => statement.run(),
    } as unknown as D1PreparedStatement;
  }
  const gated = {
    prepare: (query: string) => {
      const statement = d1.prepare(query);
      return reads.test(query) ? wrap(statement) : statement;
    },
    batch: (statements: D1PreparedStatement[]) => d1.batch(statements),
    exec: (query: string) => d1.exec(query),
    dump: () => d1.dump(),
  } as unknown as D1Database;
  return drizzle(gated, { schema });
}

async function createMemoryDb(): Promise<{
  db: Db;
  close: () => void;
  sqlite: SqlJsCompatDatabase;
}> {
  const handle = await createSharedMemoryDb();
  return { db: handle.db, close: handle.close, sqlite: handle.sqlite };
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

function windowOpen(item: { windowStartsAt: string }): boolean {
  return Date.parse(item.windowStartsAt) <= Date.now();
}

function pinServerNow(iso: string): () => void {
  const globals = globalThis as { FITBUD_NOW?: string };
  const previous = globals.FITBUD_NOW;
  globals.FITBUD_NOW = iso;
  return () => {
    if (previous === undefined) delete globals.FITBUD_NOW;
    else globals.FITBUD_NOW = previous;
  };
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

function sampleContent(weekday = 1) {
  return {
    workoutDays: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        order: 1,
        name: "Day A",
        weekday,
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
              {
                id: "33333333-3333-4333-8333-333333333334",
                order: 2,
                reps: 5,
                loadLabel: "60kg",
                rpe: 7,
              },
            ],
          },
        ],
      },
    ],
    mealPrescriptions: [],
  };
}

async function reachEffectivePlan(
  suffix: string,
  requireSessionRpe = false,
  sessionToday = false,
  horizonDays = 13,
) {
  const trainer = await createTrainerSession(`wo-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-wo-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `wo-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `wo-trainee-${suffix}`,
    `wo-trainee-${suffix}@example.com`,
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
        "Idempotency-Key": `submit-wo-${suffix}`,
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
        "Idempotency-Key": `review-wo-${suffix}`,
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
          requireSessionRpe,
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
        "Idempotency-Key": `cfg-wo-${suffix}`,
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
        "Idempotency-Key": `act-wo-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
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
        "Idempotency-Key": `plan-wo-${suffix}`,
      },
      body: JSON.stringify({
        title: "Foundation",
        content: sampleContent(
          sessionToday
            ? weekdayFromLocalDate(formatLocalDate(new Date(), "Asia/Kolkata"))
            : 1,
        ),
      }),
    },
    testEnv(),
  );
  const planBody = (await plan.json()) as {
    data: {
      plan: { id: string };
      version: { id: string; recordVersion: number };
    };
  };
  await app.request(
    `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `pub-wo-${suffix}`,
      },
      body: JSON.stringify({
        expectedRecordVersion: planBody.data.version.recordVersion,
        mode: "immediate",
      }),
    },
    testEnv(),
  );

  const today = formatLocalDate(new Date(), "Asia/Kolkata");
  const toDate = addDaysToLocalDate(today, horizonDays);
  const generated = await app.request(
    `/workouts/relationships/${relationshipId}/assignments/generate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `gen-wo-${suffix}`,
      },
      body: JSON.stringify({ fromDate: today, toDate }),
    },
    testEnv(),
  );
  expect(generated.status).toBe(200);

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
    planId: planBody.data.plan.id,
    versionId: planBody.data.version.id,
    today,
    toDate,
  };
}

describe("workout assignment and execution", () => {
  let closeDb: () => void;
  let db: Db;
  let sqlite: SqlJsCompatDatabase;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    db = memory.db;
    sqlite = memory.sqlite;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  it("returns 401 for unauthenticated assignment list", async () => {
    const response = await app.request(
      "/workouts/relationships/00000000-0000-4000-8000-000000000099/assignments",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects trainer starting a trainee workout", async () => {
    const { trainerCookie, relationshipId, today, toDate } =
      await reachEffectivePlan("auth");
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      data: { items: Array<{ id: string }> };
    };
    expect(listBody.data.items.length).toBeGreaterThan(0);

    const start = await app.request(
      `/workouts/assignments/${listBody.data.items[0]!.id}/start`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Idempotency-Key": "trainer-start",
        },
      },
      testEnv(),
    );
    expect(start.status).toBe(403);
  });

  it("runs start → set complete without re-entry → complete; trainer adherence matches", async () => {
    const { trainerCookie, traineeToken, relationshipId, today, toDate } =
      await reachEffectivePlan("loop", false, true);

    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      data: { items: Array<{ id: string; status: string; windowStartsAt: string }> };
    };
    const assignment = listBody.data.items.find(
      (item) => item.status === "assigned" && windowOpen(item),
    );
    expect(assignment).toBeTruthy();
    const assignmentId = assignment!.id;

    const started = await app.request(
      `/workouts/assignments/${assignmentId}/start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Idempotency-Key": "start-1",
        },
      },
      testEnv(),
    );
    expect(started.status).toBe(200);
    const startedBody = (await started.json()) as {
      data: {
        id: string;
        status: string;
        loggedByRole?: string;
        lastEditedByRole?: string | null;
        exercises: Array<{ sets: Array<{ id: string }> }>;
      };
    };
    expect(startedBody.data.status).toBe("started");
    // Z6-19 (R1): a workout the trainee logs reads as theirs, not edited by the coach.
    expect(startedBody.data.loggedByRole).toBe("trainee");
    expect(startedBody.data.lastEditedByRole).toBeNull();
    const executionId = startedBody.data.id;
    const setIds = startedBody.data.exercises[0]!.sets.map((set) => set.id);

    for (const setId of setIds) {
      const done = await app.request(
        `/workouts/executions/${executionId}/sets/${setId}/complete`,
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
      expect(done.status).toBe(200);
    }

    const completed = await app.request(
      `/workouts/executions/${executionId}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "complete-1",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(completed.status).toBe(200);
    const completedBody = (await completed.json()) as {
      data: { status: string };
    };
    expect(completedBody.data.status).toBe("completed");

    const adherence = await app.request(
      `/workouts/relationships/${relationshipId}/adherence?fromDate=${today}&toDate=${toDate}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(adherence.status).toBe(200);
    const adherenceBody = (await adherence.json()) as {
      data: {
        items: Array<{ assignmentId: string; status: string }>;
        totals: { completed: number };
      };
    };
    const match = adherenceBody.data.items.find(
      (item) => item.assignmentId === assignmentId,
    );
    expect(match?.status).toBe("completed");
    expect(adherenceBody.data.totals.completed).toBeGreaterThanOrEqual(1);
  });

  it("marks modified when set values change and requires session RPE when configured", async () => {
    const { traineeToken, relationshipId, today, toDate } =
      await reachEffectivePlan("rpe", true, true);
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const listBody = (await listed.json()) as {
      data: { items: Array<{ id: string; status: string; windowStartsAt: string }> };
    };
    const assignmentId = listBody.data.items.find(
      (item) => item.status === "assigned" && windowOpen(item),
    )!.id;

    const started = await app.request(
      `/workouts/assignments/${assignmentId}/start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Idempotency-Key": "start-rpe",
        },
      },
      testEnv(),
    );
    const startedBody = (await started.json()) as {
      data: {
        id: string;
        requireSessionRpe: boolean;
        exercises: Array<{ sets: Array<{ id: string }> }>;
      };
    };
    expect(startedBody.data.requireSessionRpe).toBe(true);
    const executionId = startedBody.data.id;
    const [first, second] = startedBody.data.exercises[0]!.sets;

    const modified = await app.request(
      `/workouts/executions/${executionId}/sets/${first!.id}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ actualReps: 3 }),
      },
      testEnv(),
    );
    expect(modified.status).toBe(200);

    await app.request(
      `/workouts/executions/${executionId}/sets/${second!.id}/complete`,
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

    const missingRpe = await app.request(
      `/workouts/executions/${executionId}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "complete-missing-rpe",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(missingRpe.status).toBe(422);

    const withRpe = await app.request(
      `/workouts/executions/${executionId}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "complete-with-rpe",
        },
        body: JSON.stringify({ sessionRpe: 8 }),
      },
      testEnv(),
    );
    expect(withRpe.status).toBe(200);
    const withRpeBody = (await withRpe.json()) as {
      data: { status: string; sessionRpe: number };
    };
    expect(withRpeBody.data.status).toBe("modified");
    expect(withRpeBody.data.sessionRpe).toBe(8);
  });

  it("supports pause, resume, and skip assignment", async () => {
    const { traineeToken, relationshipId, today, toDate } =
      await reachEffectivePlan("pause", false, true);
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const assignmentId = (
      (await listed.json()) as {
        data: { items: Array<{ id: string; status: string; windowStartsAt: string }> };
      }
    ).data.items.find((item) => item.status === "assigned" && windowOpen(item))!.id;

    const started = await app.request(
      `/workouts/assignments/${assignmentId}/start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Idempotency-Key": "start-pause",
        },
      },
      testEnv(),
    );
    const startedBody = (await started.json()) as {
      data: { id: string };
    };
    const executionId = startedBody.data.id;

    const paused = await app.request(
      `/workouts/executions/${executionId}/pause`,
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
    expect(paused.status).toBe(200);
    expect(((await paused.json()) as { data: { status: string } }).data.status).toBe(
      "paused",
    );

    const resume = await app.request(
      `/workouts/executions/${executionId}/resume`,
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
    expect(resume.status).toBe(200);
    expect(
      ((await resume.json()) as { data: { status: string } }).data.status,
    ).toBe("started");

    // Skip a different assignment without starting.
    const listedAgain = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const skipTarget = (
      (await listedAgain.json()) as {
        data: { items: Array<{ id: string; status: string; windowStartsAt: string }> };
      }
    ).data.items.find(
      (item) => item.status === "assigned" && item.id !== assignmentId,
    );
    expect(skipTarget).toBeTruthy();

    const skipped = await app.request(
      `/workouts/assignments/${skipTarget!.id}/skip`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Idempotency-Key": "skip-1",
        },
      },
      testEnv(),
    );
    expect(skipped.status).toBe(200);
    expect(
      ((await skipped.json()) as { data: { status: string } }).data.status,
    ).toBe("skipped");
  });

  it("rejects starting a workout before its day starts and allows today's", async () => {
    const { traineeToken, relationshipId, today, toDate } =
      await reachEffectivePlan("lt-start", false, true);
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const items = (
      (await listed.json()) as {
        data: {
          items: Array<{ id: string; localDate: string; windowStartsAt: string }>;
        };
      }
    ).data.items;
    const future = items.find((item) => !windowOpen(item))!;
    const todays = items.find((item) => item.localDate === today)!;
    expect(future).toBeTruthy();
    expect(todays).toBeTruthy();

    const start = (id: string, key: string) =>
      app.request(
        `/workouts/assignments/${id}/start`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${traineeToken}`,
            "x-fitbud-role": "trainee",
            "Idempotency-Key": key,
          },
        },
        testEnv(),
      );
    const early = await start(future.id, "lt-start-1");
    expect(early.status).toBe(422);
    expect(
      ((await early.json()) as { error: { code: string } }).error.code,
    ).toBe("LOG_TIME_BEFORE_WINDOW");
    const executions = await getTestDbOverride()!
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, future.id));
    expect(executions).toEqual([]);

    const onTime = await start(todays.id, "lt-start-2");
    expect(onTime.status).toBe(200);
  });

  it("starts and skips on the client day when the log was made before Kolkata midnight", async () => {
    const zone = "Asia/Kolkata";
    const { traineeToken, relationshipId, today, toDate } =
      await reachEffectivePlan("lt-midnight", false, true, 21);
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const items = (
      (await listed.json()) as {
        data: {
          items: Array<{ id: string; localDate: string; windowEndsAt: string }>;
        };
      }
    ).data.items.sort((a, b) => a.localDate.localeCompare(b.localDate));
    const startTarget = items.find((item) => item.localDate === today);
    const skipTarget = items.find((item) => item.localDate > today);
    expect(startTarget).toBeTruthy();
    expect(skipTarget).toBeTruthy();

    const db = getTestDbOverride()!;
    async function act(
      path: "start" | "skip",
      item: { id: string; localDate: string; windowEndsAt: string },
      key: string,
      withClientTime: boolean,
    ) {
      expect(formatLocalDate(new Date(item.windowEndsAt), zone)).toBe(
        addDaysToLocalDate(item.localDate, 1),
      );
      const clientLoggedAt = new Date(
        Date.parse(item.windowEndsAt) - 60_000,
      ).toISOString();
      const serverReceivedAt = new Date(
        Date.parse(item.windowEndsAt) + 2 * 60_000,
      ).toISOString();
      expect(formatLocalDate(new Date(clientLoggedAt), zone)).toBe(item.localDate);
      expect(formatLocalDate(new Date(serverReceivedAt), zone)).not.toBe(
        item.localDate,
      );
      const restore = pinServerNow(serverReceivedAt);
      let response: Response;
      try {
        response = await app.request(
          `/workouts/assignments/${item.id}/${path}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${traineeToken}`,
              "x-fitbud-role": "trainee",
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify(
              withClientTime ? { clientLoggedAt } : {},
            ),
          },
          testEnv(),
        );
      } finally {
        restore();
      }
      return { response, clientLoggedAt, serverReceivedAt };
    }

    const started = await act("start", startTarget!, "lt-midnight-start", true);
    expect(started.response.status).toBe(200);
    const startedBody = (await started.response.json()) as {
      data: { startedAt: string; status: string };
    };
    expect(startedBody.data.status).toBe("started");
    expect(startedBody.data.startedAt).toBe(started.clientLoggedAt);
    expect(formatLocalDate(new Date(startedBody.data.startedAt), zone)).toBe(
      startTarget!.localDate,
    );
    const [startRow] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, startTarget!.id));
    expect(startRow?.clientLoggedAt).toBe(started.clientLoggedAt);
    expect(startRow?.startedAt).toBe(started.clientLoggedAt);
    expect(formatLocalDate(new Date(startRow!.createdAt), zone)).not.toBe(
      startTarget!.localDate,
    );

    const skipped = await act("skip", skipTarget!, "lt-midnight-skip", true);
    expect(skipped.response.status).toBe(200);
    const skippedBody = (await skipped.response.json()) as {
      data: { startedAt: string; completedAt: string; status: string };
    };
    expect(skippedBody.data.status).toBe("skipped");
    expect(skippedBody.data.startedAt).toBe(skipped.clientLoggedAt);
    expect(skippedBody.data.completedAt).toBe(skipped.clientLoggedAt);
    expect(formatLocalDate(new Date(skippedBody.data.startedAt), zone)).toBe(
      skipTarget!.localDate,
    );

    const later = items.find((item) => item.localDate > skipTarget!.localDate);
    expect(later).toBeTruthy();
    const serverSkip = await act("skip", later!, "lt-midnight-skip-server", false);
    expect(serverSkip.response.status).toBe(200);
    const serverBody = (await serverSkip.response.json()) as {
      data: { startedAt: string };
    };
    expect(serverBody.data.startedAt).toBe(serverSkip.serverReceivedAt);
    expect(formatLocalDate(new Date(serverBody.data.startedAt), zone)).not.toBe(
      later!.localDate,
    );
    const [serverRow] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, later!.id));
    expect(serverRow?.clientLoggedAt).toBeNull();
  });

  it("rejects a start client time outside the bounds and a non-timestamp", async () => {
    const { traineeToken, relationshipId, today, toDate } =
      await reachEffectivePlan("lt-client", false, true);
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const items = (
      (await listed.json()) as {
        data: {
          items: Array<{ id: string; localDate: string; windowStartsAt: string }>;
        };
      }
    ).data.items;
    const todays = items.find((item) => item.localDate === today)!;
    const future = items.find((item) => item.localDate > today)!;
    const post = (id: string, key: string, body: Record<string, unknown>) =>
      app.request(
        `/workouts/assignments/${id}/start`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${traineeToken}`,
            "x-fitbud-role": "trainee",
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(body),
        },
        testEnv(),
      );

    const early = await post(todays.id, "lt-client-1", {
      clientLoggedAt: new Date(
        Date.parse(todays.windowStartsAt) - 1000,
      ).toISOString(),
    });
    expect(early.status).toBe(422);
    const earlyError = (
      (await early.json()) as { error: { code: string; message: string } }
    ).error;
    expect(earlyError.code).toBe("LOG_TIME_BEFORE_WINDOW");
    expect(earlyError.message).toBe(
      "The log time is before this item's window opened.",
    );

    const ahead = await post(future.id, "lt-client-2", {
      clientLoggedAt: new Date(Date.now() + 6 * 60_000).toISOString(),
    });
    expect(ahead.status).toBe(422);
    expect(
      ((await ahead.json()) as { error: { code: string; message: string } }).error
        .code,
    ).toBe("LOG_TIME_IN_FUTURE");

    const bad = await post(todays.id, "lt-client-3", {
      clientLoggedAt: "not-a-time",
    });
    expect(bad.status).toBe(400);
    const badError = (
      (await bad.json()) as { error: { code: string; message: string } }
    ).error;
    expect(badError.code).toBe("INVALID_REQUEST");
    expect(badError.message).toBe("Invalid start request.");
    expect(badError.message).not.toContain("not-a-time");

    const executions = await getTestDbOverride()!
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, todays.id));
    expect(executions).toEqual([]);
  });

  it("replays start and skip retries with the same client time, rejects a changed one, and bounds skip only when a client time is sent", async () => {
    const { traineeToken, relationshipId, today, toDate } =
      await reachEffectivePlan("lt-idem", false, true, 21);
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const items = (
      (await listed.json()) as {
        data: {
          items: Array<{ id: string; localDate: string; windowStartsAt: string }>;
        };
      }
    ).data.items.sort((a, b) => a.localDate.localeCompare(b.localDate));
    const todays = items.find((item) => item.localDate === today)!;
    const [future1, future2] = items.filter((item) => item.localDate > today);
    expect(todays).toBeTruthy();
    expect(future1).toBeTruthy();
    expect(future2).toBeTruthy();

    const db = getTestDbOverride()!;
    const startedAt = todays.windowStartsAt;
    const skippedAt = new Date(Date.parse(startedAt) + 60_000).toISOString();
    const serverAt = new Date(
      Math.max(Date.now(), Date.parse(startedAt) + 10 * 60_000),
    ).toISOString();
    const post = (
      path: "start" | "skip",
      id: string,
      key: string,
      body: Record<string, unknown>,
    ) =>
      app.request(
        `/workouts/assignments/${id}/${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${traineeToken}`,
            "x-fitbud-role": "trainee",
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(body),
        },
        testEnv(),
      );
    const codeOf = async (response: Response) =>
      ((await response.json()) as { error: { code: string } }).error.code;

    const restore = pinServerNow(serverAt);
    try {
      // Start: same key and body replays; a changed or missing time conflicts.
      const first = await post("start", todays.id, "lt-idem-start", {
        clientLoggedAt: startedAt,
      });
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      const replay = await post("start", todays.id, "lt-idem-start", {
        clientLoggedAt: startedAt,
      });
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(firstBody);
      for (const changed of [{ clientLoggedAt: skippedAt }, {}]) {
        const conflict = await post("start", todays.id, "lt-idem-start", changed);
        expect(conflict.status).toBe(409);
        expect(await codeOf(conflict)).toBe("IDEMPOTENCY_KEY_REUSE");
      }
      const started = await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.assignmentId, todays.id));
      expect(started).toHaveLength(1);
      expect(started[0]?.startedAt).toBe(startedAt);
      expect(started[0]?.createdAt).toBe(serverAt);

      // Skip of the open session: completedAt follows the client time.
      const skip = await post("skip", todays.id, "lt-idem-skip", {
        clientLoggedAt: skippedAt,
      });
      expect(skip.status).toBe(200);
      const skipBody = await skip.json();
      const skipReplay = await post("skip", todays.id, "lt-idem-skip", {
        clientLoggedAt: skippedAt,
      });
      expect(skipReplay.status).toBe(200);
      expect(await skipReplay.json()).toEqual(skipBody);
      const skipConflict = await post("skip", todays.id, "lt-idem-skip", {});
      expect(skipConflict.status).toBe(409);
      expect(await codeOf(skipConflict)).toBe("IDEMPOTENCY_KEY_REUSE");
      const [skippedRow] = await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.assignmentId, todays.id));
      expect(skippedRow?.status).toBe("skipped");
      expect(skippedRow?.completedAt).toBe(skippedAt);
      expect(skippedRow?.createdAt).toBe(serverAt);
      expect(skippedRow?.updatedAt).toBe(serverAt);

      // A sent skip time is bounded: before the window and too far ahead fail
      // with the static log-time errors and store nothing.
      const early = await post("skip", future1!.id, "lt-idem-early", {
        clientLoggedAt: serverAt,
      });
      expect(early.status).toBe(422);
      const earlyError = (
        (await early.json()) as { error: { code: string; message: string } }
      ).error;
      expect(earlyError).toMatchObject({
        code: "LOG_TIME_BEFORE_WINDOW",
        message: "The log time is before this item's window opened.",
      });
      const ahead = await post("skip", future2!.id, "lt-idem-ahead", {
        clientLoggedAt: new Date(Date.parse(serverAt) + 6 * 60_000).toISOString(),
      });
      expect(ahead.status).toBe(422);
      const aheadError = (
        (await ahead.json()) as { error: { code: string; message: string } }
      ).error;
      expect(aheadError).toMatchObject({
        code: "LOG_TIME_IN_FUTURE",
        message: "The log time is in the future.",
      });
      for (const id of [future1!.id, future2!.id]) {
        const none = await db
          .select()
          .from(schema.workoutExecutions)
          .where(eq(schema.workoutExecutions.assignmentId, id));
        expect(none).toEqual([]);
      }

      // Without a client time, skipping ahead of the window works as before.
      const noTime = await post("skip", future1!.id, "lt-idem-notime", {});
      expect(noTime.status).toBe(200);
      const [noTimeRow] = await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.assignmentId, future1!.id));
      expect(noTimeRow?.status).toBe("skipped");
      expect(noTimeRow?.startedAt).toBe(serverAt);
      expect(noTimeRow?.clientLoggedAt).toBeNull();
    } finally {
      restore();
    }
  });

  it("derives Missed when the window expires without execution", async () => {
    const { traineeToken, relationshipId, today, toDate } =
      await reachEffectivePlan("miss");
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const assignmentId = (
      (await listed.json()) as {
        data: { items: Array<{ id: string; status: string; windowStartsAt: string }> };
      }
    ).data.items.find((item) => item.status === "assigned")!.id;

    const db = getTestDbOverride();
    expect(db).toBeTruthy();
    await db!
      .update(schema.workoutAssignments)
      .set({ windowEndsAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(schema.workoutAssignments.id, assignmentId));

    const again = await app.request(
      `/workouts/assignments/${assignmentId}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as { data: { status: string } };
    expect(againBody.data.status).toBe("missed");
  });

  it("places sessions only on stored weekdays and does not move the plan interval", async () => {
    const { trainerCookie, relationshipId, planId, versionId, today, toDate } =
      await reachEffectivePlan("weekdays");
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const items = (
      (await listed.json()) as {
        data: { items: Array<{ localDate: string; planVersionId: string }> };
      }
    ).data.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => weekdayFromLocalDate(item.localDate) === 1)).toBe(
      true,
    );
    expect(items.every((item) => item.planVersionId === versionId)).toBe(true);

    const before = await app.request(
      `/plans/${planId}/versions/${versionId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const beforeBody = (await before.json()) as {
      data: { effectiveFrom: string | null; effectiveTo: string | null };
    };
    const replay = await app.request(
      `/workouts/relationships/${relationshipId}/assignments/generate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "gen-wo-weekdays-replay",
        },
        body: JSON.stringify({ window: "next_7_days" }),
      },
      testEnv(),
    );
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { data: { created: number } }).data.created).toBe(0);
    const after = await app.request(
      `/plans/${planId}/versions/${versionId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const afterBody = (await after.json()) as {
      data: { effectiveFrom: string | null; effectiveTo: string | null };
    };
    expect(afterBody.data.effectiveFrom).toBe(beforeBody.data.effectiveFrom);
    expect(afterBody.data.effectiveTo).toBe(beforeBody.data.effectiveTo);
  });

  it("rejects generation after the relationship ends and replenishes only active relationships", async () => {
    const { trainerCookie, relationshipId, today } = await reachEffectivePlan("ended-gen");
    const db = getTestDbOverride();
    expect(db).toBeTruthy();
    const horizonEnd = addDaysToLocalDate(today, 6);
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${horizonEnd}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const monday = (
      (await listed.json()) as { data: { items: Array<{ id: string; localDate: string }> } }
    ).data.items.find((item) => weekdayFromLocalDate(item.localDate) === 1);
    expect(monday).toBeTruthy();
    await db!.delete(schema.workoutAssignments).where(eq(schema.workoutAssignments.id, monday!.id));
    await handleScheduledReplenishment(testEnv());
    const restored = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${horizonEnd}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const restoredItems = (
      (await restored.json()) as { data: { items: Array<{ localDate: string }> } }
    ).data.items;
    expect(restoredItems.some((item) => item.localDate === monday!.localDate)).toBe(true);

    const now = new Date().toISOString();
    await db!
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt: now, updatedAt: now })
      .where(eq(schema.coachingRelationships.id, relationshipId));
    const generated = await app.request(
      `/workouts/relationships/${relationshipId}/assignments/generate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "gen-wo-ended",
        },
        body: JSON.stringify({ window: "next_7_days" }),
      },
      testEnv(),
    );
    expect(generated.status).toBe(409);
    expect(((await generated.json()) as { error: { code: string } }).error.code).toBe(
      "RELATIONSHIP_ENDED",
    );
    const again = restoredItems.find((item) => item.localDate === monday!.localDate);
    expect(again).toBeTruthy();
    const currentListed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${horizonEnd}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const current = (
      (await currentListed.json()) as {
        data: { items: Array<{ id: string; localDate: string }> };
      }
    ).data.items.find((item) => item.localDate === monday!.localDate);
    await db!.delete(schema.workoutAssignments).where(eq(schema.workoutAssignments.id, current!.id));
    await handleScheduledReplenishment(testEnv());
    const afterEnd = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${horizonEnd}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const afterItems = (
      (await afterEnd.json()) as { data: { items: Array<{ localDate: string }> } }
    ).data.items;
    expect(afterItems.some((item) => item.localDate === monday!.localDate)).toBe(false);
  });

  it("keeps a started session on its plan version when a later workout plan is published", async () => {
    const { trainerCookie, traineeToken, relationshipId, planId, versionId, today, toDate } =
      await reachEffectivePlan("protect", false, true);
    const listed = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const assignmentId = (
      (await listed.json()) as { data: { items: Array<{ id: string }> } }
    ).data.items[0]!.id;
    const started = await app.request(
      `/workouts/assignments/${assignmentId}/start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Idempotency-Key": "start-protect",
        },
      },
      testEnv(),
    );
    expect(started.status).toBe(200);

    const draft = await app.request(
      `/plans/${planId}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "draft-protect",
        },
        body: JSON.stringify({ sourceVersionId: versionId, asAdjustment: true }),
      },
      testEnv(),
    );
    expect(draft.status).toBe(201);
    const draftBody = (await draft.json()) as {
      data: { id: string; recordVersion: number };
    };
    const changed = sampleContent();
    changed.workoutDays[0]!.exercises[0]!.name = "Front squat";
    const saved = await app.request(
      `/plans/${planId}/versions/${draftBody.data.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRecordVersion: draftBody.data.recordVersion,
          content: changed,
        }),
      },
      testEnv(),
    );
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as { data: { recordVersion: number } };
    const published = await app.request(
      `/plans/${planId}/versions/${draftBody.data.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "publish-protect",
        },
        body: JSON.stringify({
          expectedRecordVersion: savedBody.data.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(published.status).toBe(200);
    const kept = await app.request(
      `/workouts/assignments/${assignmentId}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const keptBody = (await kept.json()) as {
      data: { planVersionId: string; scheduleStatus: string };
    };
    expect(keptBody.data.planVersionId).toBe(versionId);
    expect(keptBody.data.scheduleStatus).toBe("scheduled");
  });

  it("omits a superseded assignment from the trainee current list and keeps it readable for the owning trainer", async () => {
    const { trainerCookie, traineeToken, relationshipId, planId, versionId, today, toDate } =
      await reachEffectivePlan("hide-superseded");
    const before = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const beforeItems = (
      (await before.json()) as { data: { items: Array<{ id: string }> } }
    ).data.items;
    expect(beforeItems.length).toBeGreaterThan(0);
    const supersededId = beforeItems[0]!.id;

    const draft = await app.request(
      `/plans/${planId}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "draft-hide-superseded",
        },
        body: JSON.stringify({ sourceVersionId: versionId, asAdjustment: true }),
      },
      testEnv(),
    );
    expect(draft.status).toBe(201);
    const draftBody = (await draft.json()) as {
      data: { id: string; recordVersion: number };
    };
    const changed = sampleContent();
    changed.workoutDays[0]!.exercises[0]!.name = "Front squat";
    const saved = await app.request(
      `/plans/${planId}/versions/${draftBody.data.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRecordVersion: draftBody.data.recordVersion,
          content: changed,
        }),
      },
      testEnv(),
    );
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as { data: { recordVersion: number } };
    const published = await app.request(
      `/plans/${planId}/versions/${draftBody.data.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "publish-hide-superseded",
        },
        body: JSON.stringify({
          expectedRecordVersion: savedBody.data.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(published.status).toBe(200);

    const current = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const currentItems = (
      (await current.json()) as {
        data: { items: Array<{ id: string; scheduleStatus: string }> };
      }
    ).data.items;
    expect(currentItems.some((item) => item.id === supersededId)).toBe(false);
    expect(currentItems.every((item) => item.scheduleStatus === "scheduled")).toBe(true);

    const history = await app.request(
      `/workouts/assignments/${supersededId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(history.status).toBe(200);
    const historyBody = (await history.json()) as {
      data: { id: string; scheduleStatus: string; planVersionId: string };
    };
    expect(historyBody.data.id).toBe(supersededId);
    expect(historyBody.data.planVersionId).toBe(versionId);
    expect(historyBody.data.scheduleStatus).toBe("superseded");

    const db = getTestDbOverride();
    const retained = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(eq(schema.workoutAssignments.id, supersededId));
    expect(retained).toHaveLength(1);
    expect(retained[0]?.scheduleStatus).toBe("superseded");
  });

  it("warns when weekday sessions disagree with sessions per week and accepts an acknowledgement", async () => {
    const { trainerCookie, planId, versionId } = await reachEffectivePlan("warn");
    const consistency = await app.request(
      `/plans/${planId}/versions/${versionId}/consistency`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(consistency.status).toBe(200);
    const body = (await consistency.json()) as {
      data: {
        fingerprint: string;
        acknowledged: boolean;
        warnings: Array<{ code: string; message: string }>;
      };
    };
    expect(body.data.acknowledged).toBe(false);
    const warning = body.data.warnings.find((item) => item.code === "workout_sessions");
    expect(warning?.message).toContain(
      "Adjust the plan, adjust the configuration, or acknowledge the difference.",
    );
    const acknowledged = await app.request(
      `/plans/${planId}/versions/${versionId}/consistency-acknowledgement`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fingerprint: body.data.fingerprint }),
      },
      testEnv(),
    );
    expect(acknowledged.status).toBe(200);
    expect(
      ((await acknowledged.json()) as { data: { acknowledged: boolean } }).data.acknowledged,
    ).toBe(true);
    const mismatch = await app.request(
      `/plans/${planId}/versions/${versionId}/consistency-acknowledgement`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fingerprint: "workout_sessions:3:9" }),
      },
      testEnv(),
    );
    expect(mismatch.status).toBe(409);
    expect(((await mismatch.json()) as { error: { code: string } }).error.code).toBe(
      "CONSISTENCY_FINGERPRINT_MISMATCH",
    );
  });

  describe("coach log is one transaction (Z7-22)", () => {
    const exerciseId = "22222222-2222-4222-8222-222222222222";
    const set1 = "33333333-3333-4333-8333-333333333333";
    const set2 = "33333333-3333-4333-8333-333333333334";

    function logBody() {
      return {
        performedAt: new Date().toISOString(),
        exercises: [
          {
            exerciseId,
            sets: [
              { setTargetId: set1, status: "completed" },
              { setTargetId: set2, status: "completed" },
            ],
          },
        ],
      };
    }

    async function postLog(assignmentId: string, cookie: string, key: string) {
      const response = await app.request(
        `/workouts/assignments/${assignmentId}/log`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(logBody()),
        },
        testEnv(),
      );
      const text = await response.text();
      return {
        status: response.status,
        body: (text ? JSON.parse(text) : null) as {
          data?: { id: string; recordVersion: number; exercises: Array<{ sets: Array<{ id: string }> }> };
          error?: { code: string };
        },
      };
    }

    async function todayAssignment(relationshipId: string, today: string) {
      const rows = await db
        .select()
        .from(schema.workoutAssignments)
        .where(eq(schema.workoutAssignments.coachingRelationshipId, relationshipId));
      const assignment = rows.find((row) => row.localDate === today);
      expect(assignment).toBeTruthy();
      return assignment!;
    }

    it("concurrent creates on one assignment return a conflict and keep one audit", async () => {
      const { trainerCookie, relationshipId, today } = await reachEffectivePlan(
        "z722-race",
        false,
        true,
      );
      const assignment = await todayAssignment(relationshipId, today);
      const [first, second] = await Promise.all([
        postLog(assignment.id, trainerCookie, "z722-race-a"),
        postLog(assignment.id, trainerCookie, "z722-race-b"),
      ]);
      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
      const conflict = first.status === 409 ? first : second;
      expect(conflict.body.error?.code).toBe("WORKOUT_ALREADY_FINISHED");

      const executions = await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.assignmentId, assignment.id));
      expect(executions).toHaveLength(1);
      const audits = await db
        .select()
        .from(schema.logEditEvents)
        .where(eq(schema.logEditEvents.entityId, executions[0]!.id));
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ action: "create", entityType: "workout_execution" });
      const changes = await db
        .select()
        .from(schema.changeLog)
        .where(eq(schema.changeLog.recordId, executions[0]!.id));
      expect(changes).toHaveLength(1);

      const feed = await app.request(
        "/activity/feed?limit=50",
        { headers: { Cookie: trainerCookie } },
        testEnv(),
      );
      expect(feed.status).toBe(200);
      const events = (
        (await feed.json()) as { data: { events: Array<{ id: string; type: string }> } }
      ).data.events;
      expect(events.some((event) => event.id === `log_edit:${audits[0]!.id}` && event.type === "coach_logged")).toBe(
        true,
      );
    });

    it("rolls the entry back when the audit write fails, then a retry stores both", async () => {
      const { trainerCookie, relationshipId, today } = await reachEffectivePlan(
        "z722-rollback",
        false,
        true,
      );
      const assignment = await todayAssignment(relationshipId, today);
      sqlite.exec(
        "CREATE TRIGGER z722_fail_audit BEFORE INSERT ON log_edit_events BEGIN SELECT RAISE(ABORT, 'z722 injected failure'); END",
      );
      // The injected failure is logged as an unhandled error; the Z12-35 console gate
      // (D-W12-28) needs the test to expect that log line.
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const failed = await postLog(assignment.id, trainerCookie, "z722-rollback-1");
      sqlite.exec("DROP TRIGGER z722_fail_audit");
      expect(failed.status).toBe(500);
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('"message":"Unhandled API error"'));
      errors.mockRestore();
      const orphaned = await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.assignmentId, assignment.id));
      expect(orphaned).toHaveLength(0);
      const audits = await db
        .select()
        .from(schema.logEditEvents)
        .where(eq(schema.logEditEvents.coachingRelationshipId, relationshipId));
      expect(audits).toHaveLength(0);

      const retried = await postLog(assignment.id, trainerCookie, "z722-rollback-2");
      expect(retried.status).toBe(201);
      const stored = await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.assignmentId, assignment.id));
      expect(stored).toHaveLength(1);
      const audit = await db
        .select()
        .from(schema.logEditEvents)
        .where(eq(schema.logEditEvents.entityId, stored[0]!.id));
      expect(audit).toHaveLength(1);
    });

    it("concurrent edits with the same version return VERSION_CONFLICT and one edit audit", async () => {
      const { trainerCookie, relationshipId, today } = await reachEffectivePlan(
        "z722-edit",
        false,
        true,
      );
      const assignment = await todayAssignment(relationshipId, today);
      const created = await postLog(assignment.id, trainerCookie, "z722-edit-create");
      expect(created.status).toBe(201);
      const executionId = created.body.data!.id;
      const setId = created.body.data!.exercises[0]!.sets[0]!.id;

      async function patch(reps: number, recordVersion: number) {
        const response = await app.request(
          `/workouts/executions/${executionId}`,
          {
            method: "PATCH",
            headers: {
              Cookie: trainerCookie,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recordVersion,
              sets: [{ setExecutionId: setId, status: "completed", actualReps: reps }],
            }),
          },
          testEnv(),
        );
        const text = await response.text();
        return {
          status: response.status,
          body: (text ? JSON.parse(text) : null) as {
            data?: {
              recordVersion: number;
              exercises: Array<{ sets: Array<{ id: string; actualReps: number | null }> }>;
            };
            error?: { code: string };
          },
        };
      }

      const [before] = await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.id, executionId));
      const recordVersion = before!.recordVersion;
      // Both handlers read this version before either write. The 409 comes
      // from the versioned update missing the row, not from a later read.
      setTestDbOverride(holdFirstReadsOf(db, "workout_executions", 2));
      try {
        const [first, second] = await Promise.all([
          patch(8, recordVersion),
          patch(9, recordVersion),
        ]);
        const statuses = [first.status, second.status].sort((a, b) => a - b);
        expect(statuses).toEqual([200, 409]);
        const conflict = first.status === 409 ? first : second;
        const winner = first.status === 200 ? first : second;
        expect(conflict.body.error?.code).toBe("VERSION_CONFLICT");
        const [row] = await db
          .select()
          .from(schema.workoutExecutions)
          .where(eq(schema.workoutExecutions.id, executionId));
        expect(row!.recordVersion).toBe(recordVersion + 1);
        const [setRow] = await db
          .select()
          .from(schema.setExecutions)
          .where(eq(schema.setExecutions.id, setId));
        const winnerReps = winner.body.data!.exercises
          .flatMap((exercise) => exercise.sets)
          .find((set) => set.id === setId)?.actualReps;
        expect(setRow!.actualReps).toBe(winnerReps);
        expect([8, 9]).toContain(setRow!.actualReps);
        const audits = await db
          .select()
          .from(schema.logEditEvents)
          .where(eq(schema.logEditEvents.entityId, executionId));
        expect(audits.map((audit) => audit.action).sort()).toEqual(["create", "edit"]);
        const changes = await db
          .select()
          .from(schema.changeLog)
          .where(eq(schema.changeLog.recordId, executionId));
        expect(changes).toHaveLength(2);
      } finally {
        setTestDbOverride(db);
      }
    });
  });
});
