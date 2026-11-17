import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatLocalDate, weekdayFromLocalDate } from "@fitbud/core";
import type { SyncMutationRequest, SyncMutationResult } from "@fitbud/contracts";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import {
  failedSyncResult,
  isTransientDispatchStatus,
  recordSyncResult,
  resolveWorkoutMutationPayload,
} from "../domain/sync.js";
import { nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import type { Env } from "../types.js";

/**
 * Z12-41: nothing is duplicated or lost.
 *
 * - One mutation id is one row, however often it is delivered.
 * - A refusal is not a verdict to replay: the same mutation is processed again
 *   and goes through once the reason is gone.
 * - A workout opened with no network logs sets against ids the phone made up.
 *   With the plan's own ids on the mutation, the server finds the real set.
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

/** A trainee with an active coach and, optionally, a published plan with a workout today. */
async function reachCoaching(suffix: string, withPlan: boolean) {
  const email = `off-coach-${suffix}@example.com`;
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
    headers: { ...trainer, "Idempotency-Key": `inv-off-${suffix}` },
    body: { recipientEmail: `off-trainee-${suffix}@example.com` },
  });
  const { data: invitation } = (await invited.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `off-trainee-${suffix}`,
    `off-trainee-${suffix}@example.com`,
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
    headers: { ...trainee, "Idempotency-Key": `submit-off-${suffix}` },
    body: { expectedVersion: 1 },
  });
  await request(`/onboarding/relationships/${relationshipId}/review`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `review-off-${suffix}` },
    body: { outcome: "coaching_ready" },
  });
  if (!withPlan) return { trainee, relationshipId, assignmentId: "" };

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
    headers: { ...trainer, "Idempotency-Key": `cfg-off-${suffix}` },
    body: { expectedVersion: 1 },
  });
  await request(`/configurations/relationships/${relationshipId}/activate`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `act-off-${suffix}` },
    body: { expectedVersion: 1 },
  });

  const today = formatLocalDate(new Date(), "Asia/Kolkata");
  const plan = await request(`/plans/relationships/${relationshipId}`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `plan-off-${suffix}` },
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
      headers: { ...trainer, "Idempotency-Key": `pub-off-${suffix}` },
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
      headers: { ...trainer, "Idempotency-Key": `gen-off-${suffix}` },
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
    entityType: operation.startsWith("workout.") ? "workout_execution" : "measurement",
    recordId,
    operation,
    expectedServerVersion: null,
    clientOccurredAt: new Date().toISOString(),
    payload,
  };
}

function weight(n: number, relationshipId: string): SyncMutationRequest {
  const id = uuid(1000 + n);
  return mutation(n, "measurement.create", id, {
    coachingRelationshipId: relationshipId,
    id,
    body: { id, type: "body_weight_kg", value: 78.3, unit: "kg" },
  });
}

describe("sync push: nothing duplicated, nothing lost (Z12-41)", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  const completedSets = async (assignmentId: string) =>
    db
      .select({ id: schema.setExecutions.id, setTargetId: schema.setExecutions.setTargetId })
      .from(schema.setExecutions)
      .innerJoin(
        schema.exerciseExecutions,
        eq(schema.exerciseExecutions.id, schema.setExecutions.exerciseExecutionId),
      )
      .innerJoin(
        schema.workoutExecutions,
        eq(schema.workoutExecutions.id, schema.exerciseExecutions.workoutExecutionId),
      )
      .where(
        and(
          eq(schema.workoutExecutions.assignmentId, assignmentId),
          eq(schema.setExecutions.status, "completed"),
        ),
      );

  it("duplicate delivery of one mutation id creates one row, in one request or several", async () => {
    const { trainee, relationshipId } = await reachCoaching("dup", false);
    const log = weight(1, relationshipId);

    const first = await push(trainee, [log, log]);
    // A duplicate is answered from the record: it is not dispatched again, so
    // it leaves no second trace anywhere (here, the change log).
    const changes = () =>
      db
        .select()
        .from(schema.changeLog)
        .where(eq(schema.changeLog.recordId, log.recordId));
    const changesAfterFirst = (await changes()).length;
    expect(changesAfterFirst).toBeGreaterThan(0);
    const second = await push(trainee, [log]);
    expect(await changes()).toHaveLength(changesAfterFirst);
    const third = await push(trainee, [log]);

    expect(first.map((result) => result.status)).toEqual(["applied", "already_applied"]);
    expect(second[0]?.status).toBe("already_applied");
    expect(third[0]?.status).toBe("already_applied");
    expect(await db.select().from(schema.measurements)).toHaveLength(1);
    const stored = await db.select().from(schema.syncMutations);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ mutationId: log.mutationId, resultStatus: "applied" });
  });

  it("a different mutation id may not reuse an idempotency key", async () => {
    const { trainee, relationshipId } = await reachCoaching("key", false);
    const log = weight(1, relationshipId);
    await push(trainee, [log]);

    const [result] = await push(trainee, [
      { ...weight(2, relationshipId), idempotencyKey: log.idempotencyKey },
    ]);

    expect(result).toMatchObject({
      status: "rejected",
      error: { code: "IDEMPOTENCY_KEY_REUSE" },
    });
    expect(await db.select().from(schema.measurements)).toHaveLength(1);
  });

  it("a refusal is not replayed: the same mutation goes through once the reason is gone", async () => {
    const { trainee, relationshipId } = await reachCoaching("refused", false);
    const endedAt = nowIso();
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt, updatedAt: endedAt })
      .where(eq(schema.coachingRelationships.id, relationshipId));
    const log = weight(1, relationshipId);

    const [refused] = await push(trainee, [log]);
    expect(refused).toMatchObject({
      status: "conflicted",
      error: { code: "RELATIONSHIP_ENDED" },
    });
    expect(refused?.retryable).toBeUndefined();
    // Still refused while the reason stands, with no row written.
    expect((await push(trainee, [log]))[0]?.status).toBe("conflicted");
    expect(await db.select().from(schema.measurements)).toHaveLength(0);

    await db
      .update(schema.coachingRelationships)
      .set({ status: "active", endedAt: null, updatedAt: nowIso() })
      .where(eq(schema.coachingRelationships.id, relationshipId));

    expect((await push(trainee, [log]))[0]?.status).toBe("applied");
    expect((await push(trainee, [log]))[0]?.status).toBe("already_applied");
    expect(await db.select().from(schema.measurements)).toHaveLength(1);
    const stored = await db.select().from(schema.syncMutations);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.resultStatus).toBe("applied");
  });

  it("offline workout: sets logged against the phone's own ids land on the real sets, once", async () => {
    const { trainee, assignmentId } = await reachCoaching("offline", true);
    // What the phone made up while it had no network.
    const phoneExecutionId = uuid(9001);
    const start = mutation(1, "workout.start", assignmentId, { assignmentId });
    const set = (n: number, phoneSetId: string, setTargetId: string) =>
      mutation(n, "workout.complete_set", phoneExecutionId, {
        executionId: phoneExecutionId,
        setExecutionId: phoneSetId,
        assignmentId,
        setTargetId,
        body: { actualReps: 5 },
      });
    const queue = [
      start,
      set(2, uuid(9002), SET_TARGET_1),
      set(3, uuid(9003), SET_TARGET_2),
      mutation(4, "workout.complete", phoneExecutionId, {
        executionId: phoneExecutionId,
        assignmentId,
        body: { sessionRpe: null },
      }),
    ];

    const results = await push(trainee, queue);

    expect(results.map((result) => [result.status, result.error?.code ?? null])).toEqual([
      ["applied", null],
      ["applied", null],
      ["applied", null],
      ["applied", null],
    ]);
    expect((await completedSets(assignmentId)).map((row) => row.setTargetId).sort()).toEqual([
      SET_TARGET_1,
      SET_TARGET_2,
    ]);
    const [execution] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, assignmentId));
    expect(execution?.status).toBe("completed");
    // The server's own id, not the phone's.
    expect(execution?.id).not.toBe(phoneExecutionId);

    // Reconnect delivered the whole queue twice: nothing is applied twice.
    const again = await push(trainee, queue);
    expect(again.map((result) => result.status)).toEqual([
      "already_applied",
      "already_applied",
      "already_applied",
      "already_applied",
    ]);
    expect(await completedSets(assignmentId)).toHaveLength(2);
    expect(
      await db
        .select()
        .from(schema.workoutExecutions)
        .where(eq(schema.workoutExecutions.assignmentId, assignmentId)),
    ).toHaveLength(1);
  });

  it("offline workout from a build that sends no plan ids: refused with the reason, and it goes through once they are sent", async () => {
    const { trainee, assignmentId } = await reachCoaching("old-build", true);
    const phoneExecutionId = uuid(9001);
    const bare = mutation(2, "workout.complete_set", phoneExecutionId, {
      executionId: phoneExecutionId,
      setExecutionId: uuid(9002),
      body: { actualReps: 5 },
    });

    const results = await push(trainee, [
      mutation(1, "workout.start", assignmentId, { assignmentId }),
      bare,
    ]);
    expect(results[1]).toMatchObject({
      status: "rejected",
      error: { code: "EXECUTION_NOT_FOUND" },
    });
    expect(await completedSets(assignmentId)).toHaveLength(0);

    // Same mutation id, now with the plan's ids: the stored refusal is not
    // replayed (this is the Retry that used to answer EXECUTION_NOT_FOUND
    // for ever).
    const [retried] = await push(trainee, [
      {
        ...bare,
        payload: { ...bare.payload, assignmentId, setTargetId: SET_TARGET_1 },
      },
    ]);
    expect(retried?.status).toBe("applied");
    expect(await completedSets(assignmentId)).toHaveLength(1);
  });

  it("the plan ids never reach another trainee's workout", async () => {
    const owner = await reachCoaching("owner", true);
    const other = await reachCoaching("other", false);
    await push(owner.trainee, [
      mutation(1, "workout.start", owner.assignmentId, {
        assignmentId: owner.assignmentId,
      }),
    ]);

    const [result] = await push(other.trainee, [
      mutation(2, "workout.complete_set", uuid(9001), {
        executionId: uuid(9001),
        setExecutionId: uuid(9002),
        assignmentId: owner.assignmentId,
        setTargetId: SET_TARGET_1,
        body: { actualReps: 5 },
      }),
    ]);

    expect(result?.status).toBe("rejected");
    expect(await completedSets(owner.assignmentId)).toHaveLength(0);

    // The lookup itself is scoped to the actor: for anyone but the owner the
    // payload comes back untouched, before any route is asked.
    const payload = {
      executionId: uuid(9001),
      setExecutionId: uuid(9002),
      assignmentId: owner.assignmentId,
      setTargetId: SET_TARGET_1,
    };
    const actorOf = async (relationshipId: string) =>
      (
        await db
          .select({ id: schema.coachingRelationships.traineeUserId })
          .from(schema.coachingRelationships)
          .where(eq(schema.coachingRelationships.id, relationshipId))
      )[0]!.id;
    expect(
      await resolveWorkoutMutationPayload(db, {
        actorUserId: await actorOf(other.relationshipId),
        operation: "workout.complete_set",
        payload,
      }),
    ).toEqual(payload);
    const forOwner = await resolveWorkoutMutationPayload(db, {
      actorUserId: await actorOf(owner.relationshipId),
      operation: "workout.complete_set",
      payload,
    });
    expect(forOwner.executionId).not.toBe(payload.executionId);
    expect(forOwner.setExecutionId).not.toBe(payload.setExecutionId);
  });

  it("started online, continued offline: the server's execution id with the phone's set ids still lands", async () => {
    const { trainee, assignmentId } = await reachCoaching("continued", true);
    await push(trainee, [mutation(1, "workout.start", assignmentId, { assignmentId })]);
    const [execution] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, assignmentId));

    const [result] = await push(trainee, [
      mutation(2, "workout.complete_set", execution!.id, {
        executionId: execution!.id,
        setExecutionId: uuid(9002),
        assignmentId,
        setTargetId: SET_TARGET_1,
        body: { actualReps: 5 },
      }),
    ]);

    expect(result?.status).toBe("applied");
    expect((await completedSets(assignmentId)).map((row) => row.setTargetId)).toEqual([
      SET_TARGET_1,
    ]);
  });

  it("real ids are used as they are: the plan ids never redirect a set the server knows", async () => {
    const { trainee, assignmentId } = await reachCoaching("known", true);
    await push(trainee, [mutation(1, "workout.start", assignmentId, { assignmentId })]);
    const sets = await db
      .select({ id: schema.setExecutions.id, setTargetId: schema.setExecutions.setTargetId })
      .from(schema.setExecutions);
    const second = sets.find((row) => row.setTargetId === SET_TARGET_2)!;
    const [execution] = await db.select().from(schema.workoutExecutions);

    // The set id says set 2; a (wrong) target id says set 1. The id wins.
    const [result] = await push(trainee, [
      mutation(2, "workout.complete_set", execution!.id, {
        executionId: execution!.id,
        setExecutionId: second.id,
        assignmentId,
        setTargetId: SET_TARGET_1,
        body: { actualReps: 5 },
      }),
    ]);

    expect(result?.status).toBe("applied");
    expect((await completedSets(assignmentId)).map((row) => row.setTargetId)).toEqual([
      SET_TARGET_2,
    ]);
  });

  it("a transient failure is retryable and leaves no verdict behind", async () => {
    const { trainee, relationshipId } = await reachCoaching("transient", false);
    const [actor] = await db
      .select({ id: schema.coachingRelationships.traineeUserId })
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    const log = weight(1, relationshipId);

    expect([500, 502, 503, 408, 429].every(isTransientDispatchStatus)).toBe(true);
    expect([400, 401, 403, 404, 409, 422].some(isTransientDispatchStatus)).toBe(false);
    const transient = failedSyncResult(log, 503, { code: "INTERNAL", message: "Server error." });
    expect(transient).toMatchObject({ status: "rejected", retryable: true });
    expect(failedSyncResult(log, 409, null)).toMatchObject({
      status: "conflicted",
      error: { code: "SYNC_MUTATION_FAILED" },
    });

    const answered = await recordSyncResult(db, {
      actorUserId: actor!.id,
      mutation: log,
      result: transient,
    });

    expect(answered.retryable).toBe(true);
    expect(await db.select().from(schema.syncMutations)).toHaveLength(0);
    // The phone sends it again with the same ids, and it is applied.
    expect((await push(trainee, [log]))[0]?.status).toBe("applied");
  });

  it("an applied result on record wins over a later conflict for the same mutation", async () => {
    const { trainee, relationshipId } = await reachCoaching("race", false);
    const [actor] = await db
      .select({ id: schema.coachingRelationships.traineeUserId })
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    const log = weight(1, relationshipId);
    await push(trainee, [log]);

    // A second delivery raced the first and lost inside the route.
    const answered = await recordSyncResult(db, {
      actorUserId: actor!.id,
      mutation: log,
      result: failedSyncResult(log, 409, { code: "CONFLICT", message: "Conflict." }),
    });

    expect(answered.status).toBe("already_applied");
    const stored = await db.select().from(schema.syncMutations);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.resultStatus).toBe("applied");
  });
});
