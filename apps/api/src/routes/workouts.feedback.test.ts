import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLocalDate, weekdayFromLocalDate } from "@fitbud/core";
import type { SyncMutationRequest, SyncMutationResult } from "@fitbud/contracts";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import { describeTrips, installRoundTripCounter } from "../test-support/query-count.js";
import type { Env } from "../types.js";

/**
 * Z14-11 (D-W14-20): the trainee sets, changes or clears the session RPE of a
 * finished workout for 48 hours, through REST and sync push. Real routes on
 * persisted data; the clock moves only after the workout is finished.
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
  return { trainee, trainer, relationshipId, assignmentId: assignment!.id };
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



const HOUR = 60 * 60 * 1000;

function mutationAt(
  n: number,
  operation: SyncMutationRequest["operation"],
  recordId: string,
  payload: Record<string, unknown>,
  clientOccurredAt: string,
): SyncMutationRequest {
  return { ...mutation(n, operation, recordId, payload), clientOccurredAt };
}

describe("the trainee rates a finished workout for 48 hours (Z14-11)", () => {
  let db: Db;
  let handle: MemoryDbHandle;
  let close: () => void;

  beforeEach(async () => {
    handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    close();
  });

  async function patchFeedback(
    headers: Record<string, string>,
    executionId: string,
    body: unknown,
    key = `fb-${Math.random().toString(36).slice(2)}`,
  ) {
    const response = await request(`/workouts/executions/${executionId}/feedback`, {
      method: "PATCH",
      headers: { ...headers, "Idempotency-Key": key },
      body,
    });
    const json = (await response.json()) as {
      data?: ExecutionBody & { feedbackEditableUntil?: string | null; lastEditedByRole?: string | null };
      error?: { code: string; message: string };
    };
    return { status: response.status, ...json };
  }

  /** Start, log both sets as planned and finish with no rating (the plan does not require one). */
  async function finished(suffix: string) {
    const coached = await reachWorkoutToday(suffix);
    const { trainee, assignmentId } = coached;
    const started = await post(trainee, `/workouts/assignments/${assignmentId}/start`, {}, `start-${suffix}`);
    expect(started.status).toBe(200);
    for (const set of started.data!.exercises[0]!.sets) {
      await post(trainee, `/workouts/executions/${started.data!.id}/sets/${set.id}/complete`, {});
    }
    const done = await post(
      trainee,
      `/workouts/executions/${started.data!.id}/complete`,
      {},
      `complete-${suffix}`,
    );
    expect(done.status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    return {
      ...coached,
      execution: done.data as ExecutionBody & { feedbackEditableUntil?: string | null },
      completedAt: (
        await db
          .select()
          .from(schema.workoutExecutions)
          .where(eq(schema.workoutExecutions.id, done.data!.id))
      )[0]!.completedAt!,
    };
  }

  const auditOf = (executionId: string) =>
    db
      .select()
      .from(schema.logEditEvents)
      .where(eq(schema.logEditEvents.entityId, executionId))
      .orderBy(schema.logEditEvents.createdAt);

  it("sets, changes and clears the RPE; the version moves, the change is audited and shows in the coach's feed", async () => {
    const { trainee, trainer, execution, completedAt } = await finished("fb1");
    expect(execution.feedbackEditableUntil).toBe(
      new Date(Date.parse(completedAt) + 48 * HOUR).toISOString(),
    );

    const set = await patchFeedback(trainee, execution.id, { rpe: 7, recordVersion: execution.recordVersion });
    expect(set.status).toBe(200);
    expect(set.data).toMatchObject({
      sessionRpe: 7,
      recordVersion: execution.recordVersion + 1,
      lastEditedByRole: "trainee",
    });
    expect(set.data!.feedbackEditableUntil).toBe(execution.feedbackEditableUntil);

    const changed = await patchFeedback(trainee, execution.id, { rpe: 9, recordVersion: execution.recordVersion + 1 });
    expect(changed.data!.sessionRpe).toBe(9);
    const cleared = await patchFeedback(trainee, execution.id, { rpe: null, recordVersion: execution.recordVersion + 2 });
    expect(cleared.data!.sessionRpe).toBeNull();

    const rows = await auditOf(execution.id);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ actorRole: "trainee", entityType: "workout_execution", action: "edit" });
    expect(JSON.parse(rows[0]!.beforeJson!).sessionRpe).toBeNull();
    expect(JSON.parse(rows[0]!.afterJson).sessionRpe).toBe(7);

    const feed = await request("/activity/feed", { headers: trainer });
    const events = ((await feed.json()) as { data: { events: Array<{ type: string; subtype: string; summary: string }> } })
      .data.events;
    const ratings = events.filter((event) => event.subtype === "Rating");
    expect(ratings).toHaveLength(3);
    expect(ratings.map((event) => event.summary).sort()).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Rated .*: RPE 9$/), expect.stringMatching(/^Cleared the rating for /)]),
    );
  });

  it("the 48 h boundary: 47:59 after finishing is accepted, 48:01 is a friendly 422", async () => {
    const { trainee, execution, completedAt } = await finished("fb2");
    vi.setSystemTime(Date.parse(completedAt) + 48 * HOUR - 60_000);
    const inside = await patchFeedback(trainee, execution.id, { rpe: 6, recordVersion: execution.recordVersion });
    expect(inside.status).toBe(200);
    vi.setSystemTime(Date.parse(completedAt) + 48 * HOUR + 60_000);
    const late = await patchFeedback(trainee, execution.id, { rpe: 5, recordVersion: execution.recordVersion + 1 });
    expect(late.status).toBe(422);
    expect(late.error).toEqual({
      code: "FEEDBACK_EDIT_WINDOW_CLOSED",
      message: "Ratings can be changed for 48 hours after a workout.",
      requestId: expect.any(String),
    });
    const [stored] = await db
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.id, execution.id));
    expect(stored!.sessionRpe).toBe(6);
  });

  it("refuses a stale version, an empty or out-of-range body, another trainee, and a workout still in progress", async () => {
    const { trainee, execution } = await finished("fb3");
    const stale = await patchFeedback(trainee, execution.id, { rpe: 7, recordVersion: execution.recordVersion + 3 });
    expect(stale.status).toBe(409);
    expect(stale.error?.code).toBe("VERSION_CONFLICT");
    expect((await patchFeedback(trainee, execution.id, { recordVersion: execution.recordVersion })).status).toBe(400);
    expect((await patchFeedback(trainee, execution.id, { rpe: 11, recordVersion: execution.recordVersion })).status).toBe(400);
    expect((await patchFeedback(trainee, execution.id, { rpe: 0, recordVersion: execution.recordVersion })).status).toBe(400);

    const other = await reachWorkoutToday("fb3-other");
    const notMine = await patchFeedback(other.trainee, execution.id, { rpe: 7, recordVersion: execution.recordVersion });
    expect(notMine.status).toBe(404);

    const open = await post(other.trainee, `/workouts/assignments/${other.assignmentId}/start`, {}, "start-fb3-open");
    const notFinished = await patchFeedback(other.trainee, open.data!.id, { rpe: 7, recordVersion: open.data!.recordVersion });
    expect(notFinished.status).toBe(409);
  });

  it("a retry with the same key returns the stored answer once; the same RPE changes nothing", async () => {
    const { trainee, execution } = await finished("fb4");
    const key = "fb-retry-key";
    const first = await patchFeedback(trainee, execution.id, { rpe: 8, recordVersion: execution.recordVersion }, key);
    const retry = await patchFeedback(trainee, execution.id, { rpe: 8, recordVersion: execution.recordVersion }, key);
    expect(retry.status).toBe(200);
    expect(retry.data).toEqual(first.data);
    expect(await auditOf(execution.id)).toHaveLength(1);

    const same = await patchFeedback(trainee, execution.id, { rpe: 8, recordVersion: execution.recordVersion + 1 });
    expect(same.status).toBe(200);
    expect(same.data!.recordVersion).toBe(execution.recordVersion + 1);
    expect(await auditOf(execution.id)).toHaveLength(1);

    const reused = await patchFeedback(trainee, execution.id, { rpe: 2, recordVersion: execution.recordVersion + 1 }, key);
    expect(reused.status).toBe(409);
    expect(reused.error?.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  it("a coach-logged workout cannot be rated by the trainee, and a plan that requires an RPE keeps one", async () => {
    const { trainee, execution } = await finished("fb5");
    await db
      .update(schema.workoutExecutions)
      .set({ requireSessionRpe: true, sessionRpe: 6 })
      .where(eq(schema.workoutExecutions.id, execution.id));
    const clear = await patchFeedback(trainee, execution.id, { rpe: null, recordVersion: execution.recordVersion });
    expect(clear.status).toBe(422);
    expect(clear.error?.code).toBe("SESSION_RPE_REQUIRED");

    await db
      .update(schema.workoutExecutions)
      .set({ loggedByRole: "coach" })
      .where(eq(schema.workoutExecutions.id, execution.id));
    const coachLogged = await patchFeedback(trainee, execution.id, { rpe: 3, recordVersion: execution.recordVersion });
    expect(coachLogged.status).toBe(409);
    expect(coachLogged.error?.code).toBe("COACH_LOGGED_READ_ONLY");
  });

  it("works offline through sync: inside the window two hours late is applied, 80 hours late is refused, a retry is a no-op", async () => {
    const { trainee, execution, completedAt } = await finished("fb6");
    const madeAt = new Date(Date.parse(completedAt) + HOUR).toISOString();
    vi.setSystemTime(Date.parse(completedAt) + 50 * HOUR);
    const send = (n: number, version: number, rpe: number | null, at: string) =>
      push(trainee, [
        mutationAt(n, "workout.feedback", execution.id, { executionId: execution.id, body: { rpe, recordVersion: version } }, at),
      ]);
    const [applied] = await send(61, execution.recordVersion, 8, madeAt);
    expect(applied).toMatchObject({ status: "applied", recordId: execution.id, serverVersion: execution.recordVersion + 1 });
    const [again] = await send(61, execution.recordVersion, 8, madeAt);
    expect(again!.status).toBe("already_applied");
    expect(await auditOf(execution.id)).toHaveLength(1);

    vi.setSystemTime(Date.parse(completedAt) + 48 * HOUR + 80 * HOUR);
    const [late] = await send(62, execution.recordVersion + 1, 5, madeAt);
    expect(late).toMatchObject({ status: "rejected", error: { code: "FEEDBACK_EDIT_WINDOW_CLOSED" } });
    const [stale] = await (async () => {
      vi.setSystemTime(Date.parse(completedAt) + 3 * HOUR);
      return send(63, execution.recordVersion + 7, 4, new Date().toISOString());
    })();
    expect(stale).toMatchObject({ status: "conflicted", error: { code: "VERSION_CONFLICT" } });
    const [row] = await db.select().from(schema.workoutExecutions).where(eq(schema.workoutExecutions.id, execution.id));
    expect(row!.sessionRpe).toBe(8);
  });

  it("refuses a note (or any unknown key) instead of silently dropping it, over REST and sync", async () => {
    const { trainee, execution } = await finished("fb8");
    const rest = await patchFeedback(trainee, execution.id, {
      rpe: 6,
      note: "Felt heavy",
      recordVersion: execution.recordVersion,
    });
    expect(rest.status).toBe(400);
    expect(rest.error?.code).toBe("INVALID_REQUEST");
    const response = await request("/sync/push", {
      method: "POST",
      headers: trainee,
      body: {
        mutations: [
          mutationAt(
            81,
            "workout.feedback",
            execution.id,
            { executionId: execution.id, body: { rpe: 6, note: "Felt heavy", recordVersion: execution.recordVersion } },
            new Date().toISOString(),
          ),
        ],
      },
    });
    const json = (await response.json()) as { data?: { results: Array<{ status: string }> } };
    const status = response.status === 200 ? json.data!.results[0]!.status : "http-400";
    expect(["rejected", "http-400"]).toContain(status);
    const [row] = await db.select().from(schema.workoutExecutions).where(eq(schema.workoutExecutions.id, execution.id));
    expect(row!.sessionRpe).toBeNull();
  });

  it("commits in one batch of at most 4 statements", async () => {
    const { trainee, execution } = await finished("fb7");
    const counter = installRoundTripCounter(handle);
    counter.reset();
    const res = await patchFeedback(trainee, execution.id, { rpe: 7, recordVersion: execution.recordVersion });
    expect(res.status).toBe(200);
    const sizes = counter.trips.filter((trip) => trip.kind === "batch" && trip.sql.some((statement) => statement.includes("log_edit_events"))).map((trip) => trip.sql.length);
    expect(Math.max(...sizes), describeTrips(counter.trips)).toBeLessThanOrEqual(4);
  });
});
