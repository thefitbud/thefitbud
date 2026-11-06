/**
 * Z6-19 (PLAN-v2 D-P2-21, D-W6-IP R1–R5, D-W6-32, D-W6-33): a trainer logs or
 * edits a client's workout. Real routes on persisted data: invitation →
 * intake → configuration → published plan → generated assignments, then the
 * trainer's log and edit, the trainee's reads, sync pull, the activity feed
 * and the coach-updates notification.
 *
 * The clock is pinned (Date only) so "within the last 7 days" and quiet hours
 * are exact: Monday 2 Nov 2026 06:00 UTC is 11:30 in Asia/Kolkata.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDaysToLocalDate, formatLocalDate, weekdayFromLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import {
  pushTraineeCoachLogEvent,
  pushTrainerInboxEvent,
  storeInboxNotification,
} from "../domain/inbox-notify.js";
import { createId } from "../lib/crypto.js";
import type { Env } from "../types.js";

const MONDAY = "2026-11-02T06:00:00.000Z";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TZ = "Asia/Kolkata";

const EXERCISE_ID = "22222222-2222-4222-8222-222222222222";
const SET_1 = "33333333-3333-4333-8333-333333333333";
const SET_2 = "33333333-3333-4333-8333-333333333334";

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

function at(iso: string | number) {
  vi.setSystemTime(new Date(iso));
}

async function call(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = await app.request(
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
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as {
      data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      error?: { code: string; message: string };
    },
  };
}

async function trainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: TZ }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return { Cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

function planContent(weekday: number) {
  return {
    workoutDays: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        order: 1,
        name: "Lower body A",
        weekday,
        exercises: [
          {
            id: EXERCISE_ID,
            order: 1,
            name: "Back squat",
            instructions: "Depth to parallel",
            setTargets: [
              { id: SET_1, order: 1, reps: 5, loadLabel: "60kg", rpe: 7 },
              { id: SET_2, order: 2, reps: 5, loadLabel: "60kg", rpe: 7 },
            ],
          },
        ],
      },
    ],
    mealPrescriptions: [],
  };
}

type Fixture = Awaited<ReturnType<typeof coachingWithPlan>>;

/** An active client with a published plan whose workout falls on Mondays. */
async function coachingWithPlan(suffix: string) {
  const trainer = await trainerSession(`coach-log-${suffix}@example.com`);
  const invite = await call("/invitations", {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `inv-${suffix}` },
    body: { recipientEmail: `coach-log-client-${suffix}@example.com` },
  });
  const traineeToken = createTestIdToken(
    `coach-log-client-${suffix}`,
    `coach-log-client-${suffix}@example.com`,
  );
  const trainee = { Authorization: `Bearer ${traineeToken}`, "x-fitbud-role": "trainee" };
  const accepted = await call("/invitations/accept", {
    method: "POST",
    headers: { Authorization: `Bearer ${traineeToken}` },
    body: { token: invite.body.data.token, timezone: TZ },
  });
  const relationshipId: string = accepted.body.data.relationship.id;

  await call(`/onboarding/relationships/${relationshipId}/draft`, {
    method: "PUT",
    headers: trainee,
    body: {
      expectedVersion: 0,
      answers: {
        goals: "Get stronger",
        relevant_history: "None",
        preferences: "Gym",
        schedule: "Mornings",
        limitations: "None",
      },
    },
  });
  await call(`/onboarding/relationships/${relationshipId}/submit`, {
    method: "POST",
    headers: { ...trainee, "Idempotency-Key": `submit-${suffix}` },
    body: { expectedVersion: 1 },
  });
  await call(`/onboarding/relationships/${relationshipId}/review`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `review-${suffix}` },
    body: { outcome: "coaching_ready" },
  });
  await call(`/configurations/relationships/${relationshipId}/draft`, {
    method: "PUT",
    headers: trainer,
    body: {
      expectedVersion: 0,
      goalShort: "Strength",
      workout: { sessionsPerWeek: 1, completionWindowHours: 24 },
      nutrition: { mealsPerDay: 3, confirmationWindowHours: 6, photoRequirement: "none" },
      checkin: { cadence: "weekly", dueWindowHours: 48 },
      tracking: { requireBodyWeight: false, requireProgressPhotos: false, requireSessionRpe: false },
    },
  });
  await call(`/configurations/relationships/${relationshipId}/configure`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `cfg-${suffix}` },
    body: { expectedVersion: 1 },
  });
  await call(`/configurations/relationships/${relationshipId}/activate`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `act-${suffix}` },
    body: { expectedVersion: 1 },
  });

  const today = formatLocalDate(new Date(), TZ);
  const plan = await call(`/plans/relationships/${relationshipId}`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `plan-${suffix}` },
    body: { title: "Foundation", content: planContent(weekdayFromLocalDate(today)) },
  });
  const published = await call(
    `/plans/${plan.body.data.plan.id}/versions/${plan.body.data.version.id}/publish`,
    {
      method: "POST",
      headers: { ...trainer, "Idempotency-Key": `pub-${suffix}` },
      body: { expectedRecordVersion: plan.body.data.version.recordVersion, mode: "immediate" },
    },
  );
  expect(published.status).toBe(200);
  const generated = await call(`/workouts/relationships/${relationshipId}/assignments/generate`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `gen-${suffix}` },
    body: { fromDate: today, toDate: addDaysToLocalDate(today, 13) },
  });
  expect(generated.status).toBe(200);
  const assignments = (generated.body.data.assignments as Array<{ id: string; localDate: string }>)
    .slice()
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  expect(assignments.map((a) => a.localDate)).toEqual([today, addDaysToLocalDate(today, 7)]);

  return {
    trainer,
    trainee,
    relationshipId,
    thisMonday: assignments[0]!,
    nextMonday: assignments[1]!,
  };
}

function fullLog(performedAt: string, overrides: { set1?: object; set2?: object } = {}) {
  return {
    performedAt,
    sessionRpe: 7,
    exercises: [
      {
        exerciseId: EXERCISE_ID,
        sets: [
          { setTargetId: SET_1, status: "completed", ...overrides.set1 },
          { setTargetId: SET_2, status: "completed", actualLoadKg: 62.5, ...overrides.set2 },
        ],
      },
    ],
  };
}

describe("trainer logs and edits a client's workout (Z6-19)", () => {
  let db: Db;
  let close: () => void;
  let f: Fixture;

  async function logWorkout(body: unknown, key = "coach-log-1", headers: Record<string, string> = f.trainer) {
    return call(`/workouts/assignments/${f.thisMonday.id}/log`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": key },
      body,
    });
  }

  async function editWorkout(executionId: string, body: unknown, headers: Record<string, string> = f.trainer) {
    return call(`/workouts/executions/${executionId}`, { method: "PATCH", headers, body });
  }

  async function auditRows(entityId: string) {
    return db
      .select()
      .from(schema.logEditEvents)
      .where(eq(schema.logEditEvents.entityId, entityId))
      .orderBy(schema.logEditEvents.createdAt);
  }

  async function traineeUserId() {
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, f.relationshipId));
    return { traineeUserId: rel!.traineeUserId, trainerUserId: rel!.trainerUserId };
  }

  async function coachNotifications() {
    const { traineeUserId: recipient } = await traineeUserId();
    return db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientUserId, recipient),
          eq(schema.notifications.notificationType, "coach_log_updated"),
        ),
      )
      .orderBy(schema.notifications.createdAt);
  }

  async function deliveries(notificationId: string) {
    return db
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.notificationId, notificationId));
  }

  async function registerTraineePhone() {
    const res = await call("/notifications/device-tokens", {
      method: "POST",
      headers: f.trainee,
      body: {
        token: "ExponentPushToken[coach-log-phone]",
        platform: "android",
        provider: "expo",
        installationId: "coach-log-install",
      },
    });
    expect(res.status).toBeLessThan(300);
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(MONDAY);
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
    f = await coachingWithPlan(createId().slice(0, 8));
    // Thursday 5 Nov, 11:30 in Kolkata: Monday's workout is three days back.
    at(Date.parse(MONDAY) + 3 * DAY);
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    close();
  });

  it("creates one completed coach execution, audited, readable by the trainee and pulled by sync", async () => {
    // The trainee has synced before (bootstrap), so the coach entry arrives as a change.
    const firstPull = await call("/sync/pull", { headers: f.trainee });
    expect(firstPull.status).toBe(200);
    const cursor: string = firstPull.body.data.nextCursor;

    const performedAt = new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString();
    const res = await logWorkout(fullLog(performedAt));
    expect(res.status).toBe(201);
    const execution = res.body.data;
    expect(execution).toMatchObject({
      assignmentId: f.thisMonday.id,
      status: "modified",
      loggedByRole: "coach",
      lastEditedByRole: null,
      startedAt: performedAt,
      completedAt: performedAt,
      sessionRpe: 7,
    });
    const sets = execution.exercises[0].sets;
    expect(sets.map((s: { status: string }) => s.status)).toEqual(["completed", "modified"]);
    expect(sets.map((s: { actualLoadLabel: string }) => s.actualLoadLabel)).toEqual(["60kg", "62.5 kg"]);

    const [row] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.id, execution.id));
    const { trainerUserId, traineeUserId: clientId } = await traineeUserId();
    expect(row).toMatchObject({
      loggedByRole: "coach",
      loggedByUserId: trainerUserId,
      traineeUserId: clientId,
      lastEditedByRole: null,
    });
    const [setRow] = await db
      .select()
      .from(schema.setExecutions)
      .where(and(eq(schema.setExecutions.setTargetId, SET_2)));
    expect(setRow).toMatchObject({ actualLoadKg: 62.5, prescribedLoadKg: 60, loadKind: "kg" });

    const audit = await auditRows(execution.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "create",
      actorRole: "coach",
      actorUserId: trainerUserId,
      entityType: "workout_execution",
      beforeJson: null,
    });
    expect(JSON.parse(audit[0]!.afterJson)).toMatchObject({
      workoutDayName: "Lower body A",
      localDate: f.thisMonday.localDate,
    });

    const read = await call(`/workouts/executions/${execution.id}`, { headers: f.trainee });
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ loggedByRole: "coach", lastEditedByRole: null });
    const assignment = await call(`/workouts/assignments/${f.thisMonday.id}`, { headers: f.trainee });
    expect(assignment.body.data).toMatchObject({
      status: "modified",
      execution: { id: execution.id, loggedByRole: "coach" },
    });

    const pull = await call(`/sync/pull?cursor=${encodeURIComponent(cursor)}`, { headers: f.trainee });
    expect(pull.status).toBe(200);
    type Change = { entityType: string; recordId: string; payload: Record<string, unknown> };
    const change = (pull.body.data.changes as Change[])
      .find((c) => c.entityType === "workout_execution" && c.recordId === execution.id);
    // D-W6-36: the sync payload carries authorship for the trainee's labels.
    expect(change?.payload).toMatchObject({
      id: execution.id,
      status: "modified",
      loggedByRole: "coach",
      lastEditedByRole: null,
    });

    // After a coach edit, the next pull shows it as edited by the coach.
    const afterCreate: string = pull.body.data.nextCursor;
    const edit = await editWorkout(execution.id, {
      recordVersion: 0,
      sets: [{ setExecutionId: sets[1].id, status: "completed", actualLoadKg: 65 }],
    });
    expect(edit.status).toBe(200);
    const pullAfterEdit = await call(`/sync/pull?cursor=${encodeURIComponent(afterCreate)}`, {
      headers: f.trainee,
    });
    const edited = (pullAfterEdit.body.data.changes as Change[])
      .find((c) => c.entityType === "workout_execution" && c.recordId === execution.id);
    expect(edited?.payload).toMatchObject({
      id: execution.id,
      recordVersion: 1,
      loggedByRole: "coach",
      lastEditedByRole: "coach",
    });
  });

  it("sync pull shows a trainee-logged workout the coach edited as the trainee's, edited by the coach", async () => {
    at(MONDAY);
    const firstPull = await call("/sync/pull", { headers: f.trainee });
    const started = await call(`/workouts/assignments/${f.thisMonday.id}/start`, {
      method: "POST",
      headers: { ...f.trainee, "Idempotency-Key": "sync-start" },
    });
    const completed = await call(`/workouts/executions/${started.body.data.id}/complete`, {
      method: "POST",
      headers: { ...f.trainee, "Idempotency-Key": "sync-complete" },
      body: {},
    });
    expect(completed.status).toBe(200);
    at(Date.parse(MONDAY) + DAY);
    const edit = await editWorkout(started.body.data.id, {
      recordVersion: completed.body.data.recordVersion,
      sets: [{ setExecutionId: completed.body.data.exercises[0].sets[0].id, status: "completed" }],
    });
    expect(edit.status).toBe(200);
    const pull = await call(
      `/sync/pull?cursor=${encodeURIComponent(firstPull.body.data.nextCursor as string)}`,
      { headers: f.trainee },
    );
    const changes = (pull.body.data.changes as Array<{ entityType: string; recordId: string; payload: Record<string, unknown> }>)
      .filter((c) => c.entityType === "workout_execution" && c.recordId === started.body.data.id);
    expect(changes.at(-1)?.payload).toMatchObject({
      loggedByRole: "trainee",
      lastEditedByRole: "coach",
    });
  });

  it("a retried log returns the stored response and adherence counts the workout once", async () => {
    const body = fullLog(new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString());
    const first = await logWorkout(body, "retry-key");
    const retry = await logWorkout(body, "retry-key");
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);

    const otherKey = await logWorkout(body, "another-key");
    expect(otherKey.status).toBe(409);
    expect(otherKey.body.error?.code).toBe("WORKOUT_ALREADY_FINISHED");
    const reused = await logWorkout(fullLog(body.performedAt, { set1: { actualReps: 4 } }), "retry-key");
    expect(reused.body.error?.code).toBe("IDEMPOTENCY_KEY_REUSE");

    expect(await auditRows(first.body.data.id)).toHaveLength(1);
    const executions = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.assignmentId, f.thisMonday.id));
    expect(executions).toHaveLength(1);

    const edit = await editWorkout(first.body.data.id, {
      recordVersion: 0,
      sets: [{ setExecutionId: first.body.data.exercises[0].sets[0].id, status: "completed", actualReps: 4 }],
    });
    expect(edit.status).toBe(200);

    const adherence = await call(
      `/workouts/relationships/${f.relationshipId}/adherence?fromDate=${f.thisMonday.localDate}&toDate=${f.thisMonday.localDate}`,
      { headers: f.trainer },
    );
    expect(adherence.body.data.items).toHaveLength(1);
    expect(adherence.body.data.totals).toMatchObject({ completed: 0, modified: 1, missed: 0 });
  });

  it("rejects a log dated more than 7 days back or in the future with 422 BACKDATE_LIMIT", async () => {
    const eightDaysBack = new Date(Date.now() - 8 * DAY).toISOString();
    const old = await logWorkout(fullLog(eightDaysBack), "old");
    expect(old.status).toBe(422);
    expect(old.body.error).toMatchObject({
      code: "BACKDATE_LIMIT",
      message: "A trainer log must be dated within the last 7 days and not in the future.",
    });

    const inAnHour = new Date(Date.now() + HOUR).toISOString();
    const future = await logWorkout(fullLog(inAnHour), "future");
    expect(future.status).toBe(422);
    expect(future.body.error?.code).toBe("BACKDATE_LIMIT");

    // Next Monday's workout cannot be logged on Thursday, even with a past time.
    const nextWeek = await call(`/workouts/assignments/${f.nextMonday.id}/log`, {
      method: "POST",
      headers: { ...f.trainer, "Idempotency-Key": "next-week" },
      body: fullLog(new Date(Date.now() - HOUR).toISOString()),
    });
    expect(nextWeek.status).toBe(422);
    expect(nextWeek.body.error?.code).toBe("BACKDATE_LIMIT");

    // Eight days after Monday, Monday's workout is out of reach.
    at(Date.parse(MONDAY) + 8 * DAY);
    const late = await logWorkout(fullLog(new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString()), "late");
    expect(late.body.error?.code).toBe("BACKDATE_LIMIT");

    const executions = await db.select().from(schema.workoutExecutions);
    expect(executions).toHaveLength(0);
    expect(await db.select().from(schema.logEditEvents)).toHaveLength(0);
  });

  it("requires every set exactly once, done or skipped", async () => {
    const performedAt = new Date(Date.now() - HOUR).toISOString();
    const missing = await logWorkout(
      {
        performedAt,
        exercises: [{ exerciseId: EXERCISE_ID, sets: [{ setTargetId: SET_1, status: "completed" }] }],
      },
      "missing",
    );
    expect(missing.status).toBe(422);
    expect(missing.body.error?.code).toBe("COACH_LOG_SETS_MISMATCH");

    const twice = await logWorkout(
      {
        performedAt,
        exercises: [
          {
            exerciseId: EXERCISE_ID,
            sets: [
              { setTargetId: SET_1, status: "completed" },
              { setTargetId: SET_1, status: "skipped" },
            ],
          },
        ],
      },
      "twice",
    );
    expect(twice.body.error?.code).toBe("COACH_LOG_SETS_MISMATCH");

    const both = await logWorkout(
      fullLog(performedAt, { set1: { actualLoadKg: 50, bodyweight: true } }),
      "both",
    );
    expect(both.status).toBe(400);

    const skipped = await logWorkout(
      fullLog(performedAt, { set1: { bodyweight: true }, set2: { status: "skipped", actualLoadKg: undefined } }),
      "bodyweight",
    );
    expect(skipped.status).toBe(201);
    const sets = skipped.body.data.exercises[0].sets;
    expect(sets[0]).toMatchObject({ status: "modified", actualLoadLabel: "Bodyweight" });
    expect(sets[1]).toMatchObject({ status: "skipped", actualReps: null, actualLoadLabel: null });
  });

  it("an edit changes the sets, writes one audit row with before and after, and sets last_edited_*", async () => {
    const created = await logWorkout(fullLog(new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString()));
    const execution = created.body.data;
    const set2 = execution.exercises[0].sets[1];

    const edited = await editWorkout(execution.id, {
      recordVersion: 0,
      sets: [{ setExecutionId: set2.id, status: "completed", actualLoadKg: 60 }],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      status: "completed",
      recordVersion: 1,
      loggedByRole: "coach",
      lastEditedByRole: "coach",
    });
    // Same kg as prescribed is completed, not modified (D-W6-23); reps were kept.
    expect(edited.body.data.exercises[0].sets[1]).toMatchObject({
      status: "completed",
      actualReps: 5,
      actualLoadLabel: "60 kg",
    });

    const [row] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.id, execution.id));
    const { trainerUserId } = await traineeUserId();
    expect(row).toMatchObject({
      lastEditedByRole: "coach",
      lastEditedByUserId: trainerUserId,
      lastEditedAt: new Date(Date.now()).toISOString(),
    });

    const audit = await auditRows(execution.id);
    expect(audit.map((a) => a.action)).toEqual(["create", "edit"]);
    const before = JSON.parse(audit[1]!.beforeJson!);
    const after = JSON.parse(audit[1]!.afterJson);
    expect(before.sets[1]).toMatchObject({ status: "modified", load: "62.5 kg" });
    expect(after.sets[1]).toMatchObject({ status: "completed", load: "60 kg" });

    // A stale version is a conflict, never an overwrite.
    const stale = await editWorkout(execution.id, {
      recordVersion: 0,
      sets: [{ setExecutionId: set2.id, status: "skipped" }],
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error?.code).toBe("VERSION_CONFLICT");

    // An edit that changes nothing writes nothing.
    const same = await editWorkout(execution.id, { recordVersion: 1, sessionRpe: 7 });
    expect(same.status).toBe(200);
    expect(same.body.data.recordVersion).toBe(1);
    expect(await auditRows(execution.id)).toHaveLength(2);

    // performedAt can move within the window but not past it.
    const tooOld = await editWorkout(execution.id, {
      recordVersion: 1,
      performedAt: new Date(Date.now() - 8 * DAY).toISOString(),
    });
    expect(tooOld.body.error?.code).toBe("BACKDATE_LIMIT");
  });

  it("an edit of a trainee-logged workout keeps it the trainee's; edits close after 7 days", async () => {
    at(MONDAY);
    const started = await call(`/workouts/assignments/${f.thisMonday.id}/start`, {
      method: "POST",
      headers: { ...f.trainee, "Idempotency-Key": "client-start" },
    });
    expect(started.status).toBe(200);
    // The client records only the first set, then finishes.
    const firstSet = (started.body.data.exercises[0].sets as Array<{ id: string }>)[0]!;
    const done = await call(`/workouts/executions/${started.body.data.id}/sets/${firstSet.id}/complete`, {
      method: "POST",
      headers: f.trainee,
      body: {},
    });
    expect(done.status).toBe(200);
    const completed = await call(`/workouts/executions/${started.body.data.id}/complete`, {
      method: "POST",
      headers: { ...f.trainee, "Idempotency-Key": "client-complete" },
      body: {},
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data.loggedByRole).toBe("trainee");

    at(Date.parse(MONDAY) + 2 * DAY);
    const setId = completed.body.data.exercises[0].sets[0].id;
    const pendingSetId = completed.body.data.exercises[0].sets[1].id;
    expect(completed.body.data.exercises[0].status).toBe("pending");
    const edit = await editWorkout(started.body.data.id, {
      recordVersion: completed.body.data.recordVersion,
      sets: [
        { setExecutionId: setId, status: "completed", actualReps: 4 },
        { setExecutionId: pendingSetId, status: "completed" },
      ],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({
      loggedByRole: "trainee",
      lastEditedByRole: "coach",
      status: "modified",
    });
    // Reps and load the client logged are kept unless the trainer changes them.
    expect(edit.body.data.exercises[0].sets[0]).toMatchObject({ actualReps: 4, actualLoadLabel: "60kg" });
    // The set the client left open takes the prescription; the exercise is now complete.
    expect(edit.body.data.exercises[0].sets[1]).toMatchObject({ status: "completed", actualReps: 5 });
    expect(edit.body.data.exercises[0].status).toBe("completed");
    const [row] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.id, started.body.data.id));
    expect(row!.loggedByUserId).toBeNull();

    at(Date.parse(MONDAY) + 8 * DAY);
    const late = await editWorkout(started.body.data.id, {
      recordVersion: edit.body.data.recordVersion,
      sets: [{ setExecutionId: setId, status: "completed", actualReps: 5 }],
    });
    expect(late.status).toBe(422);
    expect(late.body.error?.code).toBe("BACKDATE_LIMIT");
  });

  it("the activity feed lists the create and the edit with the actor and a short summary", async () => {
    const created = await logWorkout(fullLog(new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString()));
    at(Date.now() + 60_000);
    const set2 = created.body.data.exercises[0].sets[1];
    await editWorkout(created.body.data.id, {
      recordVersion: 0,
      sets: [{ setExecutionId: set2.id, status: "completed", actualLoadKg: 65 }],
    });

    const feed = await call("/activity/feed?limit=50", { headers: f.trainer });
    expect(feed.status).toBe(200);
    const coachEvents = (feed.body.data.events as Array<{ type: string; summary: string; relationshipId: string }>)
      .filter((e) => e.type === "coach_logged" || e.type === "coach_edited");
    expect(coachEvents.map((e) => e.type)).toEqual(["coach_edited", "coach_logged"]);
    expect(coachEvents.every((e) => e.relationshipId === f.relationshipId)).toBe(true);
    expect(coachEvents[1]!.summary).toMatch(/ logged Lower body A for Mon 2 Nov$/);
    expect(coachEvents[0]!.summary).toMatch(
      / edited Lower body A for Mon 2 Nov: Back squat set 2: 5 reps at 62\.5 kg → 5 reps at 65 kg$/,
    );
    // No raw ids or enum tokens in the summary.
    for (const event of coachEvents) {
      expect(event.summary).not.toMatch(/_|[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });

  it("notifies the trainee once per entry within 10 minutes, routing only, with create or edit in the key", async () => {
    await registerTraineePhone();
    const created = await logWorkout(fullLog(new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString()));
    const executionId: string = created.body.data.id;
    const set2Id: string = created.body.data.exercises[0].sets[1].id;

    let rows = await coachNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      domainEntityType: "workout_assignment",
      domainEntityId: f.thisMonday.id,
      mergeGroup: executionId,
      payloadJson: null,
    });
    expect(rows[0]!.dedupeKey).toMatch(/^coach_log_updated:create:workout_execution:/);
    const firstDeliveries = await deliveries(rows[0]!.id);
    expect(firstDeliveries).toHaveLength(1);
    expect(firstDeliveries[0]!.providerStatus).toBe("accepted");

    // Two more edits within 10 minutes of the first notification merge into it.
    at(Date.now() + 2 * 60_000);
    await editWorkout(executionId, { recordVersion: 0, sets: [{ setExecutionId: set2Id, status: "completed", actualLoadKg: 65 }] });
    at(Date.now() + 5 * 60_000);
    await editWorkout(executionId, { recordVersion: 1, sets: [{ setExecutionId: set2Id, status: "completed", actualLoadKg: 67.5 }] });
    rows = await coachNotifications();
    expect(rows).toHaveLength(1);
    expect(await deliveries(rows[0]!.id)).toHaveLength(1);
    expect(await auditRows(executionId)).toHaveLength(3);

    // After the window, the next edit is a new notification and push.
    at(Date.now() + 11 * 60_000);
    await editWorkout(executionId, { recordVersion: 2, sets: [{ setExecutionId: set2Id, status: "skipped" }] });
    rows = await coachNotifications();
    expect(rows).toHaveLength(2);
    expect(rows[1]!.dedupeKey).toMatch(/^coach_log_updated:edit:workout_execution:/);
    expect(await deliveries(rows[1]!.id)).toHaveLength(1);

    // The trainee's inbox lists it; the routing carries ids only.
    const inbox = await call("/notifications", { headers: f.trainee });
    const listed = (inbox.body.data.items as Array<{ type: string; routing: Record<string, unknown> }>)
      .filter((n) => n.type === "coach_log_updated");
    expect(listed).toHaveLength(2);
    for (const item of listed) {
      expect(Object.keys(item.routing).sort()).toEqual(
        ["createdAt", "domainEntityId", "domainEntityType", "notificationId", "notificationType"],
      );
    }
  });

  it("coach updates off: no notification and no push; the setting round-trips through preferences", async () => {
    await registerTraineePhone();
    const initial = await call("/notifications/preferences", { headers: f.trainee });
    expect(initial.body.data.coachLogUpdates).toBe(true);
    const put = await call("/notifications/preferences", {
      method: "PUT",
      headers: f.trainee,
      body: { coachLogUpdates: false },
    });
    expect(put.status).toBe(200);
    expect(put.body.data.coachLogUpdates).toBe(false);
    const read = await call("/notifications/preferences", { headers: f.trainee });
    expect(read.body.data.coachLogUpdates).toBe(false);
    // Another field's update leaves it alone.
    const other = await call("/notifications/preferences", {
      method: "PUT",
      headers: f.trainee,
      body: { pushEnabled: true },
    });
    expect(other.body.data.coachLogUpdates).toBe(false);

    const created = await logWorkout(fullLog(new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString()));
    expect(created.status).toBe(201);
    expect(await coachNotifications()).toHaveLength(0);
    expect(await db.select().from(schema.notificationDeliveries)).toHaveLength(0);
    // The audit and the activity event do not depend on the setting.
    expect(await auditRows(created.body.data.id)).toHaveLength(1);

    // The push sender checks the setting too, for an event already stored.
    const { traineeUserId: clientId } = await traineeUserId();
    const stored = await storeInboxNotification(db, {
      recipientUserId: clientId,
      relationshipId: f.relationshipId,
      notificationType: "coach_log_updated",
      domainEntityType: "workout_assignment",
      domainEntityId: f.thisMonday.id,
      dedupeKey: `test-coach-off-${createId()}`,
      mergeGroup: created.body.data.id,
    });
    expect(stored.inserted).toBe(true);
    if (!stored.inserted) return;
    await pushTraineeCoachLogEvent(db, stored.notificationId, { pushProviderMode: "test" });
    expect(await deliveries(stored.notificationId)).toHaveLength(0);
  });

  it("push off or quiet hours: the notification is stored but not pushed", async () => {
    await registerTraineePhone();
    await call("/notifications/preferences", {
      method: "PUT",
      headers: f.trainee,
      body: { pushEnabled: false },
    });
    const created = await logWorkout(fullLog(new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString()));
    let rows = await coachNotifications();
    expect(rows).toHaveLength(1);
    expect(await deliveries(rows[0]!.id)).toHaveLength(0);

    await call("/notifications/preferences", {
      method: "PUT",
      headers: f.trainee,
      body: { pushEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
    });
    // 23:30 in Kolkata, past the merge window.
    at(Date.parse(MONDAY) + 3 * DAY + 12 * HOUR);
    const set2Id = created.body.data.exercises[0].sets[1].id;
    const edit = await editWorkout(created.body.data.id, {
      recordVersion: 0,
      sets: [{ setExecutionId: set2Id, status: "skipped" }],
    });
    expect(edit.status).toBe(200);
    rows = await coachNotifications();
    expect(rows).toHaveLength(2);
    expect(await deliveries(rows[1]!.id)).toHaveLength(0);
  });

  it("R1: trainee writes on a coach-created workout return 409 COACH_LOGGED_READ_ONLY", async () => {
    const created = await logWorkout(fullLog(new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString()));
    const execution = created.body.data;
    const attempts = [
      call(`/workouts/assignments/${f.thisMonday.id}/start`, {
        method: "POST",
        headers: { ...f.trainee, "Idempotency-Key": "r1-start" },
      }),
      call(`/workouts/assignments/${f.thisMonday.id}/skip`, {
        method: "POST",
        headers: { ...f.trainee, "Idempotency-Key": "r1-skip" },
      }),
      call(`/workouts/executions/${execution.id}/pause`, { method: "POST", headers: f.trainee }),
      call(`/workouts/executions/${execution.id}/resume`, { method: "POST", headers: f.trainee }),
      call(`/workouts/executions/${execution.id}/sets/${execution.exercises[0].sets[0].id}/complete`, {
        method: "POST",
        headers: f.trainee,
        body: {},
      }),
      call(`/workouts/executions/${execution.id}/sets/${execution.exercises[0].sets[0].id}/skip`, {
        method: "POST",
        headers: f.trainee,
      }),
      call(`/workouts/executions/${execution.id}/complete`, {
        method: "POST",
        headers: { ...f.trainee, "Idempotency-Key": "r1-complete" },
        body: {},
      }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: "COACH_LOGGED_READ_ONLY",
        message: "This workout was logged by your coach and cannot be changed.",
      });
    }
    // The trainee cannot use the trainer routes either.
    const traineeEdit = await editWorkout(execution.id, { recordVersion: 0, sessionRpe: 5 }, f.trainee);
    expect(traineeEdit.status).toBe(403);
    const after = await call(`/workouts/executions/${execution.id}`, { headers: f.trainee });
    expect(after.body.data).toMatchObject({ recordVersion: 0, status: "modified" });
  });

  it("another trainer gets 403 and an ended client 409, for log and edit", async () => {
    const created = await logWorkout(fullLog(new Date(Date.parse(MONDAY) + 7 * HOUR).toISOString()));
    const other = await trainerSession("coach-log-other-trainer@example.com");

    const otherLog = await call(`/workouts/assignments/${f.nextMonday.id}/log`, {
      method: "POST",
      headers: { ...other, "Idempotency-Key": "other-log" },
      body: fullLog(new Date(Date.now() - HOUR).toISOString()),
    });
    expect(otherLog.status).toBe(403);
    expect(otherLog.body.error?.code).toBe("FORBIDDEN");
    const otherEdit = await editWorkout(created.body.data.id, { recordVersion: 0, sessionRpe: 5 }, other);
    expect(otherEdit.status).toBe(403);

    const ended = await call(`/relationships/${f.relationshipId}/end`, {
      method: "POST",
      headers: f.trainer,
      body: {},
    });
    expect(ended.status).toBe(200);
    const endedEdit = await editWorkout(created.body.data.id, { recordVersion: 0, sessionRpe: 5 });
    expect(endedEdit.status).toBe(409);
    expect(endedEdit.body.error?.code).toBe("RELATIONSHIP_ENDED");
    const endedLog = await call(`/workouts/assignments/${f.nextMonday.id}/log`, {
      method: "POST",
      headers: { ...f.trainer, "Idempotency-Key": "ended-log" },
      body: fullLog(new Date(Date.now() - HOUR).toISOString()),
    });
    expect(endedLog.status).toBe(409);
    expect(await auditRows(created.body.data.id)).toHaveLength(1);
  });

  it("keeps the trainer inbox push unchanged: each sender pushes only its own types", async () => {
    await registerTraineePhone();
    const { traineeUserId: clientId, trainerUserId } = await traineeUserId();
    const config = { pushProviderMode: "test" as const };

    // A coach-log event is never pushed by the trainer sender.
    const coachEvent = await storeInboxNotification(db, {
      recipientUserId: clientId,
      relationshipId: f.relationshipId,
      notificationType: "coach_log_updated",
      domainEntityType: "workout_assignment",
      domainEntityId: f.thisMonday.id,
      dedupeKey: `test-coach-${createId()}`,
      mergeGroup: createId(),
    });
    expect(coachEvent.inserted).toBe(true);
    if (!coachEvent.inserted) return;
    await pushTrainerInboxEvent(db, coachEvent.notificationId, config);
    expect(await deliveries(coachEvent.notificationId)).toHaveLength(0);
    await pushTraineeCoachLogEvent(db, coachEvent.notificationId, config);
    expect(await deliveries(coachEvent.notificationId)).toHaveLength(1);
    // At most once.
    await pushTraineeCoachLogEvent(db, coachEvent.notificationId, config);
    expect(await deliveries(coachEvent.notificationId)).toHaveLength(1);

    // A trainer event is never pushed by the coach-log sender, and still is by its own.
    await db.insert(schema.deviceTokens).values({
      id: createId(),
      userId: trainerUserId,
      platform: "ios",
      provider: "expo",
      token: "ExponentPushToken[coach-log-trainer]",
      installationId: "coach-log-trainer-install",
      status: "active",
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const trainerEvent = await storeInboxNotification(db, {
      recipientUserId: trainerUserId,
      relationshipId: f.relationshipId,
      notificationType: "trainer_meal_times_changed",
      domainEntityId: f.relationshipId,
      dedupeKey: `test-trainer-${createId()}`,
    });
    expect(trainerEvent.inserted).toBe(true);
    if (!trainerEvent.inserted) return;
    const [stored] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, trainerEvent.notificationId));
    expect(stored!.mergeGroup).toBeNull();
    await pushTraineeCoachLogEvent(db, trainerEvent.notificationId, config);
    expect(await deliveries(trainerEvent.notificationId)).toHaveLength(0);
    await pushTrainerInboxEvent(db, trainerEvent.notificationId, config);
    expect(await deliveries(trainerEvent.notificationId)).toHaveLength(1);
  });
});
