import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLocalDate, weekdayFromLocalDate } from "@fitbud/core";
import type { SyncMutationRequest, SyncMutationResult } from "@fitbud/contracts";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import {
  createMemoryDb,
  type SqlJsCompatDatabase,
} from "../test-support/memory-db.js";
import type { Env } from "../types.js";

/**
 * Z14-7: a repeated finish, a skip after a finish, or a set that arrives after
 * the finish never creates a second record or a scary error, through REST or
 * sync push; and each trainee workout write that touches several tables is
 * one atomic batch.
 */

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

const SET_TARGET_1 = "33333333-3333-4333-8333-333333333333";
const SET_TARGET_2 = "33333333-3333-4333-8333-333333333334";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

async function request(
  path: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown },
) {
  return app.request(
    path,
    {
      method: init.method ?? "GET",
      headers: {
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    testEnv(),
  );
}

/** A coached trainee with a published plan and a workout (Squat, 2 × 5 @ 60kg) today. */
async function reachWorkoutToday(suffix: string) {
  const email = `idem-coach-${suffix}@example.com`;
  const session = await request("/auth/session", {
    method: "POST",
    headers: {},
    body: {
      idToken: createTestIdToken(`trainer-${email}`, email),
      timezone: "Asia/Kolkata",
    },
  });
  expect(session.status).toBe(200);
  const trainer = { Cookie: session.headers.get("set-cookie")!.split(";")[0]! };

  const invited = await request("/invitations", {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `inv-idem-${suffix}` },
    body: { recipientEmail: `idem-trainee-${suffix}@example.com` },
  });
  const { data: invitation } = (await invited.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `idem-trainee-${suffix}`,
    `idem-trainee-${suffix}@example.com`,
  );
  const trainee = {
    Authorization: `Bearer ${traineeToken}`,
    "x-fitbud-role": "trainee",
  };
  const accepted = await request("/invitations/accept", {
    method: "POST",
    headers: { Authorization: `Bearer ${traineeToken}` },
    body: { token: invitation.token, timezone: "Asia/Kolkata" },
  });
  const relationshipId = (
    (await accepted.json()) as { data: { relationship: { id: string } } }
  ).data.relationship.id;

  await request(`/onboarding/relationships/${relationshipId}/draft`, {
    method: "PUT",
    headers: trainee,
    body: {
      expectedVersion: 0,
      answers: {
        goals: "Strength",
        relevant_history: "None",
        preferences: "Gym",
        schedule: "Evenings",
        limitations: "None",
      },
    },
  });
  await request(`/onboarding/relationships/${relationshipId}/submit`, {
    method: "POST",
    headers: { ...trainee, "Idempotency-Key": `submit-idem-${suffix}` },
    body: { expectedVersion: 1 },
  });
  await request(`/onboarding/relationships/${relationshipId}/review`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `review-idem-${suffix}` },
    body: { outcome: "coaching_ready" },
  });
  await request(`/configurations/relationships/${relationshipId}/draft`, {
    method: "PUT",
    headers: trainer,
    body: {
      expectedVersion: 0,
      goalShort: "Strength",
      workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
      nutrition: { mealsPerDay: 3, confirmationWindowHours: 6, photoRequirement: "none" },
      checkin: { cadence: "weekly", dueWindowHours: 48 },
      tracking: {
        requireBodyWeight: false,
        requireProgressPhotos: false,
        requireSessionRpe: false,
      },
    },
  });
  await request(`/configurations/relationships/${relationshipId}/configure`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `cfg-idem-${suffix}` },
    body: { expectedVersion: 1 },
  });
  await request(`/configurations/relationships/${relationshipId}/activate`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `act-idem-${suffix}` },
    body: { expectedVersion: 1 },
  });

  const today = formatLocalDate(new Date(), "Asia/Kolkata");
  const plan = await request(`/plans/relationships/${relationshipId}`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `plan-idem-${suffix}` },
    body: {
      title: "Foundation",
      content: {
        workoutDays: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            order: 1,
            name: "Lower body B",
            weekday: weekdayFromLocalDate(today),
            exercises: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                order: 1,
                name: "Squat",
                instructions: "Depth to parallel",
                setTargets: [
                  { id: SET_TARGET_1, order: 1, reps: 5, loadLabel: "60kg", rpe: 7 },
                  { id: SET_TARGET_2, order: 2, reps: 5, loadLabel: "60kg", rpe: 7 },
                ],
              },
            ],
          },
        ],
        mealPrescriptions: [],
      },
    },
  });
  const planBody = (await plan.json()) as {
    data: { plan: { id: string }; version: { id: string; recordVersion: number } };
  };
  await request(
    `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
    {
      method: "POST",
      headers: { ...trainer, "Idempotency-Key": `pub-idem-${suffix}` },
      body: {
        expectedRecordVersion: planBody.data.version.recordVersion,
        mode: "immediate",
      },
    },
  );
  const generated = await request(
    `/workouts/relationships/${relationshipId}/assignments/generate`,
    {
      method: "POST",
      headers: { ...trainer, "Idempotency-Key": `gen-idem-${suffix}` },
      body: { fromDate: today, toDate: today },
    },
  );
  expect(generated.status).toBe(200);
  const listed = await request(
    `/workouts/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${today}`,
    { headers: trainee },
  );
  const items = (
    (await listed.json()) as {
      data: { items: Array<{ id: string; status: string; windowStartsAt: string }> };
    }
  ).data.items;
  const assignment = items.find(
    (item) => item.status === "assigned" && Date.parse(item.windowStartsAt) <= Date.now(),
  );
  expect(assignment, "a workout that can be logged now").toBeTruthy();
  return { trainee, relationshipId, assignmentId: assignment!.id };
}

type SetBody = {
  id: string;
  setTargetId: string;
  status: string;
  actualReps: number | null;
  actualLoadLabel: string | null;
};
type ExecutionBody = {
  id: string;
  status: string;
  recordVersion: number;
  sessionRpe: number | null;
  alreadyCompleted?: boolean;
  exercises: Array<{ sets: SetBody[] }>;
};
type Answer = {
  status: number;
  data?: ExecutionBody;
  error?: { code: string; message: string };
};

async function post(
  headers: Record<string, string>,
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<Answer> {
  const response = await request(path, {
    method: "POST",
    headers: idempotencyKey ? { ...headers, "Idempotency-Key": idempotencyKey } : headers,
    body,
  });
  const json = (await response.json()) as Omit<Answer, "status">;
  return { status: response.status, ...json };
}

async function push(
  headers: Record<string, string>,
  mutations: SyncMutationRequest[],
): Promise<SyncMutationResult[]> {
  const response = await request("/sync/push", {
    method: "POST",
    headers,
    body: { mutations },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: { results: SyncMutationResult[] } }).data
    .results;
}

function mutation(
  n: number,
  operation: SyncMutationRequest["operation"],
  recordId: string,
  payload: Record<string, unknown>,
): SyncMutationRequest {
  return {
    mutationId: uuid(n),
    idempotencyKey: uuid(n),
    entityType: "workout_execution",
    recordId,
    operation,
    expectedServerVersion: null,
    clientOccurredAt: new Date().toISOString(),
    payload,
  };
}

describe("workout writes are idempotent and atomic (Z14-7)", () => {
  let db: Db;
  let sqlite: SqlJsCompatDatabase;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    sqlite = handle.sqlite;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  const executionsOf = (assignmentId: string) =>
    db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, assignmentId));

  const setsOf = (executionId: string) =>
    db
      .select({
        id: schema.setExecutions.id,
        setTargetId: schema.setExecutions.setTargetId,
        status: schema.setExecutions.status,
        actualReps: schema.setExecutions.actualReps,
        updatedAt: schema.setExecutions.updatedAt,
      })
      .from(schema.setExecutions)
      .innerJoin(
        schema.exerciseExecutions,
        eq(schema.exerciseExecutions.id, schema.setExecutions.exerciseExecutionId),
      )
      .where(eq(schema.exerciseExecutions.workoutExecutionId, executionId));

  /** Start, log both sets as planned, finish with the given RPE. */
  async function finishedWorkout(suffix: string, sessionRpe: number | null = 7) {
    const coached = await reachWorkoutToday(suffix);
    const { trainee, assignmentId } = coached;
    const started = await post(
      trainee,
      `/workouts/assignments/${assignmentId}/start`,
      {},
      `start-${suffix}`,
    );
    expect(started.status).toBe(200);
    const execution = started.data!;
    for (const set of execution.exercises[0]!.sets) {
      const logged = await post(
        trainee,
        `/workouts/executions/${execution.id}/sets/${set.id}/complete`,
        {},
      );
      expect(logged.status).toBe(200);
    }
    const finished = await post(
      trainee,
      `/workouts/executions/${execution.id}/complete`,
      { sessionRpe },
      `complete-${suffix}`,
    );
    expect(finished.status).toBe(200);
    expect(finished.data?.status).toBe("completed");
    expect(finished.data?.alreadyCompleted).toBeUndefined();
    return { ...coached, execution: finished.data! };
  }

  describe("REST", () => {
    it("a repeated finish answers with the stored workout; a different RPE is a conflict", async () => {
      const { trainee, assignmentId, execution } = await finishedWorkout("finish");
      const path = `/workouts/executions/${execution.id}/complete`;

      // Same key: the stored answer, as before.
      const replay = await post(trainee, path, { sessionRpe: 7 }, "complete-finish");
      expect(replay.status).toBe(200);
      expect(replay.data?.recordVersion).toBe(execution.recordVersion);

      // New key, no RPE / same RPE / null: the same action, answered from the record.
      for (const [key, body] of [
        ["finish-again-1", {}],
        ["finish-again-2", { sessionRpe: 7 }],
        ["finish-again-3", { sessionRpe: null }],
      ] as const) {
        const again = await post(trainee, path, body, key);
        expect(again.status).toBe(200);
        expect(again.data).toMatchObject({
          id: execution.id,
          status: "completed",
          sessionRpe: 7,
          recordVersion: execution.recordVersion,
          alreadyCompleted: true,
        });
      }
      // Its own key replays the same answer.
      const replayAgain = await post(trainee, path, {}, "finish-again-1");
      expect(replayAgain.data?.alreadyCompleted).toBe(true);

      // A different RPE asks for something else: refused, nothing written.
      const changed = await post(trainee, path, { sessionRpe: 9 }, "finish-rpe-9");
      expect(changed.status).toBe(409);
      expect(changed.error).toMatchObject({
        code: "WORKOUT_ALREADY_FINISHED",
        message: "This workout is already finished.",
      });

      const rows = await executionsOf(assignmentId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "completed",
        sessionRpe: 7,
        recordVersion: execution.recordVersion,
      });
    });

    it("a skip after the finish is refused with a stable code and changes nothing; a repeated skip answers with the stored skip", async () => {
      const { trainee, assignmentId, execution } = await finishedWorkout("skip-after");
      const skipped = await post(
        trainee,
        `/workouts/assignments/${assignmentId}/skip`,
        {},
        "skip-after-1",
      );
      expect(skipped.status).toBe(409);
      expect(skipped.error).toMatchObject({
        code: "WORKOUT_ALREADY_FINISHED",
        message: "This workout is already finished, so it can't be skipped.",
      });
      const rows = await executionsOf(assignmentId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "completed", recordVersion: execution.recordVersion });

      // A workout that was skipped: skipping it again is the same action.
      const other = await reachWorkoutToday("skip-twice");
      const first = await post(
        other.trainee,
        `/workouts/assignments/${other.assignmentId}/skip`,
        {},
        "skip-twice-1",
      );
      expect(first.status).toBe(200);
      expect(first.data?.alreadyCompleted).toBeUndefined();
      const second = await post(
        other.trainee,
        `/workouts/assignments/${other.assignmentId}/skip`,
        {},
        "skip-twice-2",
      );
      expect(second.status).toBe(200);
      expect(second.data).toMatchObject({
        id: first.data!.id,
        status: "skipped",
        recordVersion: first.data!.recordVersion,
        alreadyCompleted: true,
      });
      expect(await executionsOf(other.assignmentId)).toHaveLength(1);

      // Finishing a skipped workout is a conflict, not a second record.
      const finish = await post(
        other.trainee,
        `/workouts/executions/${first.data!.id}/complete`,
        {},
        "skip-twice-finish",
      );
      expect(finish.status).toBe(409);
      expect(finish.error?.code).toBe("WORKOUT_ALREADY_FINISHED");
      expect((await executionsOf(other.assignmentId))[0]?.status).toBe("skipped");
    });

    it("a set after the finish: the same values are a no-op, other values are refused with nothing written", async () => {
      const { trainee, execution } = await finishedWorkout("set-after");
      const set = execution.exercises[0]!.sets[0]!;
      const before = await setsOf(execution.id);
      const path = `/workouts/executions/${execution.id}/sets/${set.id}/complete`;

      // What was logged (as planned: 5 × 60kg), sent again late.
      for (const body of [{}, { actualReps: 5 }, { actualReps: 5, actualLoadLabel: "60kg" }]) {
        const same = await post(trainee, path, body);
        expect(same.status).toBe(200);
        expect(same.data?.status).toBe("completed");
        expect(same.data?.recordVersion).toBe(execution.recordVersion);
      }

      for (const body of [{ actualReps: 8 }, { actualLoadKg: 62.5 }]) {
        const different = await post(trainee, path, body);
        expect(different.status).toBe(409);
        expect(different.error).toMatchObject({
          code: "WORKOUT_ALREADY_FINISHED",
          message: "This workout is already finished, so the set wasn't added.",
        });
      }

      // Nothing about the finished workout changed, not even a timestamp.
      expect(await setsOf(execution.id)).toEqual(before);
      const [row] = await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.id, execution.id));
      expect(row).toMatchObject({ status: "completed", recordVersion: execution.recordVersion });
    });
  });

  describe("sync push", () => {
    it("a skip, a start or a set after the finish is settled with a note, never a refusal, and changes nothing", async () => {
      const { trainee, assignmentId, execution } = await finishedWorkout("sync-late");
      const phoneExecutionId = uuid(9001);
      const lateSkip = mutation(1, "workout.skip", assignmentId, { assignmentId });
      const lateStart = mutation(2, "workout.start", assignmentId, { assignmentId });
      // A lock-screen set logged against the phone's own ids, with other values.
      const lateSet = mutation(3, "workout.complete_set", phoneExecutionId, {
        executionId: phoneExecutionId,
        setExecutionId: uuid(9002),
        assignmentId,
        setTargetId: SET_TARGET_2,
        body: { actualReps: 3 },
      });

      const results = await push(trainee, [lateSkip, lateStart, lateSet]);
      const settled = {
        status: "already_applied",
        recordId: execution.id,
        serverVersion: execution.recordVersion,
        entityType: "workout_execution",
        error: null,
      };
      expect(results[0]).toEqual({
        mutationId: lateSkip.mutationId,
        ...settled,
        note: {
          code: "WORKOUT_ALREADY_FINISHED",
          message: "This workout was already finished, so it wasn't skipped.",
        },
      });
      expect(results[1]).toMatchObject({
        ...settled,
        note: { code: "WORKOUT_ALREADY_FINISHED", message: "This workout was already finished." },
      });
      expect(results[2]).toMatchObject({
        ...settled,
        note: {
          code: "WORKOUT_ALREADY_FINISHED",
          message: "This set arrived after you finished the workout, so it wasn't added.",
        },
      });
      expect(results.every((result) => result.retryable === undefined)).toBe(true);

      // Delivered again: settled from the record, with its note.
      const again = await push(trainee, [lateSkip, lateSet]);
      expect(again.map((result) => [result.status, result.note?.code])).toEqual([
        ["already_applied", "WORKOUT_ALREADY_FINISHED"],
        ["already_applied", "WORKOUT_ALREADY_FINISHED"],
      ]);

      const rows = await executionsOf(assignmentId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "completed", recordVersion: execution.recordVersion });
      const sets = await setsOf(execution.id);
      expect(sets.map((set) => [set.status, set.actualReps])).toEqual([
        ["completed", 5],
        ["completed", 5],
      ]);
      // Settled, not applied: no change-log entry is added for them.
      const changes = await db
        .select()
        .from(schema.changeLog)
        .where(eq(schema.changeLog.recordId, execution.id));
      expect(changes).toHaveLength(0);
    });

    it("a set after the finish with the same values is applied as a no-op", async () => {
      const { trainee, assignmentId, execution } = await finishedWorkout("sync-same-set");
      const set = execution.exercises[0]!.sets[1]!;
      const [result] = await push(trainee, [
        mutation(1, "workout.complete_set", execution.id, {
          executionId: execution.id,
          setExecutionId: set.id,
          assignmentId,
          setTargetId: set.setTargetId,
          body: { actualReps: 5 },
        }),
      ]);
      expect(result).toMatchObject({
        status: "applied",
        recordId: execution.id,
        serverVersion: execution.recordVersion,
        error: null,
      });
      expect(result?.note).toBeUndefined();
    });

    it("a repeated finish is applied once; a finish with a different RPE is a conflict", async () => {
      const { trainee, assignmentId, execution } = await finishedWorkout("sync-finish");
      const finish = (n: number, sessionRpe: number | null) =>
        mutation(n, "workout.complete", execution.id, {
          executionId: execution.id,
          assignmentId,
          body: { sessionRpe },
        });

      const [same, none, different] = await push(trainee, [
        finish(1, 7),
        finish(2, null),
        finish(3, 4),
      ]);
      expect(same).toMatchObject({
        status: "applied",
        recordId: execution.id,
        serverVersion: execution.recordVersion,
      });
      expect(none?.status).toBe("applied");
      expect(different).toMatchObject({
        status: "conflicted",
        error: { code: "WORKOUT_ALREADY_FINISHED" },
      });
      expect(different?.retryable).toBeUndefined();

      const rows = await executionsOf(assignmentId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "completed",
        sessionRpe: 7,
        recordVersion: execution.recordVersion,
      });
    });
  });

  describe("atomic writes", () => {
    /** The injected failure is logged as an unhandled error (Z12-35 console gate). */
    async function withInjectedFailure<T>(trigger: string, run: () => Promise<T>): Promise<T> {
      sqlite.exec(trigger);
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const result = await run();
        expect(errors).toHaveBeenCalledWith(
          expect.stringContaining('"message":"Unhandled API error"'),
        );
        return result;
      } finally {
        errors.mockRestore();
        sqlite.exec("DROP TRIGGER z147_fail");
      }
    }

    it("a start that fails part-way leaves no execution, exercise or set, and the retry writes them all", async () => {
      const { trainee, assignmentId } = await reachWorkoutToday("atomic-start");
      const path = `/workouts/assignments/${assignmentId}/start`;

      // The second set's insert fails, after the execution, exercise and first set.
      const failed = await withInjectedFailure(
        `CREATE TRIGGER z147_fail BEFORE INSERT ON set_executions WHEN NEW.set_target_id = '${SET_TARGET_2}' BEGIN SELECT RAISE(ABORT, 'z147 injected failure'); END`,
        () => post(trainee, path, {}, "atomic-start-1"),
      );
      expect(failed.status).toBe(500);
      expect(await executionsOf(assignmentId)).toHaveLength(0);
      expect(await db.select().from(schema.exerciseExecutions)).toHaveLength(0);
      expect(await db.select().from(schema.setExecutions)).toHaveLength(0);

      const retried = await post(trainee, path, {}, "atomic-start-1");
      expect(retried.status).toBe(200);
      expect(await executionsOf(assignmentId)).toHaveLength(1);
      expect(
        (await setsOf(retried.data!.id)).map((set) => set.setTargetId).sort(),
      ).toEqual([SET_TARGET_1, SET_TARGET_2]);
    });

    it("a set log that fails on its exercise update leaves the set as it was", async () => {
      const { trainee, assignmentId } = await reachWorkoutToday("atomic-set");
      const started = await post(
        trainee,
        `/workouts/assignments/${assignmentId}/start`,
        {},
        "atomic-set-start",
      );
      const execution = started.data!;
      const [first, second] = execution.exercises[0]!.sets;
      const setPath = (setId: string) =>
        `/workouts/executions/${execution.id}/sets/${setId}/complete`;
      expect((await post(trainee, setPath(first!.id), {})).status).toBe(200);

      // The last open set also completes its exercise: that second write fails.
      const failed = await withInjectedFailure(
        "CREATE TRIGGER z147_fail BEFORE UPDATE ON exercise_executions BEGIN SELECT RAISE(ABORT, 'z147 injected failure'); END",
        () => post(trainee, setPath(second!.id), { actualReps: 4 }),
      );
      expect(failed.status).toBe(500);
      const afterFailure = await setsOf(execution.id);
      expect(afterFailure.find((set) => set.id === second!.id)).toMatchObject({
        status: "pending",
        actualReps: null,
      });
      const [exercise] = await db
        .select()
        .from(schema.exerciseExecutions)
        .where(eq(schema.exerciseExecutions.workoutExecutionId, execution.id));
      expect(exercise?.status).toBe("pending");

      const retried = await post(trainee, setPath(second!.id), { actualReps: 4 });
      expect(retried.status).toBe(200);
      const [done] = await db
        .select()
        .from(schema.exerciseExecutions)
        .where(
          and(
            eq(schema.exerciseExecutions.workoutExecutionId, execution.id),
            eq(schema.exerciseExecutions.status, "completed"),
          ),
        );
      expect(done).toBeTruthy();
      expect(
        (await setsOf(execution.id)).find((set) => set.id === second!.id),
      ).toMatchObject({ status: "modified", actualReps: 4 });
    });
  });
});
