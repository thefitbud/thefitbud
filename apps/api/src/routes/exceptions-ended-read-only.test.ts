import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDaysToLocalDate, formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import * as schema from "../db/schema.js";
import { createMemoryDb } from "../test-support/memory-db.js";

/**
 * EC1b (rule 5): once coaching has ended the relationship is read-only for the
 * trainer on the server, matching the read-only Configure screen. Every trainer
 * write under /exceptions is rejected with 409 RELATIONSHIP_ENDED (the same
 * error the other relationship-scoped writes use); reads keep working; a
 * reactivated relationship is writable again.
 */

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
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0]!;
}

async function post(
  path: string,
  headers: Record<string, string>,
  body: unknown,
  key?: string,
) {
  return app.request(
    path,
    {
      method: "POST",
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

async function reachActive(suffix: string) {
  const cookie = await createTrainerSession(`ec1b-coach-${suffix}@example.com`);
  const trainer = { Cookie: cookie };
  const created = await post(
    "/invitations",
    trainer,
    { recipientEmail: `ec1b-trainee-${suffix}@example.com` },
    `inv-ec1b-${suffix}`,
  );
  const { data: invite } = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `ec1b-trainee-${suffix}`,
    `ec1b-trainee-${suffix}@example.com`,
  );
  const trainee = {
    Authorization: `Bearer ${traineeToken}`,
    "x-fitbud-role": "trainee",
  };
  const accept = await post(
    "/invitations/accept",
    { Authorization: `Bearer ${traineeToken}` },
    { token: invite.token, timezone: "Asia/Kolkata" },
  );
  const relationshipId = (
    (await accept.json()) as { data: { relationship: { id: string } } }
  ).data.relationship.id;

  await app.request(
    `/onboarding/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: { ...trainee, "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 0,
        answers: {
          goals: "Consistency",
          relevant_history: "None",
          preferences: "Home",
          schedule: "Mornings",
          limitations: "None",
        },
      }),
    },
    testEnv(),
  );
  await post(
    `/onboarding/relationships/${relationshipId}/submit`,
    trainee,
    { expectedVersion: 1 },
    `submit-ec1b-${suffix}`,
  );
  await post(
    `/onboarding/relationships/${relationshipId}/review`,
    trainer,
    { outcome: "coaching_ready" },
    `review-ec1b-${suffix}`,
  );
  await app.request(
    `/configurations/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: { ...trainer, "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 0,
        goalShort: "Adherence",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 2,
          confirmationWindowHours: 24,
          photoRequirement: "none",
        },
        checkin: { cadence: "weekly", dueWindowHours: 1 },
        tracking: {
          requireBodyWeight: false,
          requireProgressPhotos: false,
          requireSessionRpe: false,
        },
      }),
    },
    testEnv(),
  );
  await post(
    `/configurations/relationships/${relationshipId}/configure`,
    trainer,
    { expectedVersion: 1 },
    `cfg-ec1b-${suffix}`,
  );
  const activated = await post(
    `/configurations/relationships/${relationshipId}/activate`,
    trainer,
    { expectedVersion: 2 },
    `act-ec1b-${suffix}`,
  );
  expect(activated.status).toBe(200);
  return { trainer, trainee, relationshipId };
}

const earlier = "2026-01-05T08:00:00.000Z";
const earlierAck = "2026-01-05T10:00:00.000Z";

/**
 * Open exceptions as they exist on ended relationships in environments that
 * predate EC1a (detected/acknowledged rows left open at the end). Sources have
 * no live row so evaluation cannot touch them.
 */
function openRows(relationshipId: string, prefix: string) {
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
    severity: "attention",
  } as const;
  return {
    active: {
      ...base,
      id: `${prefix}-0001-4000-8000-000000000001`,
      type: "missed_workout",
      status: "active",
      sourceEntityType: "workout_assignment",
      sourceEntityId: `${prefix}-0002-4000-8000-000000000001`,
      summary: "Active missed workout",
    },
    detected: {
      ...base,
      id: `${prefix}-0001-4000-8000-000000000002`,
      type: "overdue_meal",
      status: "detected",
      activatedAt: null,
      sourceEntityType: "meal_assignment",
      sourceEntityId: `${prefix}-0002-4000-8000-000000000002`,
      summary: "Detected overdue meal",
    },
    acknowledged: {
      ...base,
      id: `${prefix}-0001-4000-8000-000000000003`,
      type: "skipped_meal",
      status: "acknowledged",
      acknowledgedAt: earlierAck,
      updatedAt: earlierAck,
      sourceEntityType: "meal_assignment",
      sourceEntityId: `${prefix}-0002-4000-8000-000000000003`,
      summary: "Acknowledged skipped meal",
    },
  } satisfies Record<string, typeof schema.exceptions.$inferInsert>;
}

describe("EC1b ended relationships are read-only for exception writes", () => {
  let db: Db;
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    db = memory.db;
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  async function endCoaching(trainer: Record<string, string>, id: string, key: string) {
    const ended = await post(`/relationships/${id}/end`, trainer, { reason: "paused" }, key);
    expect(ended.status).toBe(200);
  }

  async function reactivate(
    trainer: Record<string, string>,
    trainee: Record<string, string>,
    id: string,
    key: string,
  ) {
    const requested = await post(`/relationships/${id}/reactivate`, trainer, {}, key);
    expect(requested.status).toBe(200);
    const confirmed = await post(`/relationships/${id}/reactivate/confirm`, trainee, {});
    expect(confirmed.status).toBe(200);
    const [row] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, id));
    expect(row!.status).toBe("active");
  }

  async function snapshot(relationshipId: string) {
    const exceptionRows = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.coachingRelationshipId, relationshipId));
    const ids = exceptionRows.map((row) => row.id);
    const actions = ids.length
      ? await db
          .select()
          .from(schema.exceptionActions)
          .where(inArray(schema.exceptionActions.exceptionId, ids))
      : [];
    const interventionRows = await db
      .select()
      .from(schema.interventions)
      .where(eq(schema.interventions.coachingRelationshipId, relationshipId));
    const sortById = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    return {
      exceptions: sortById(exceptionRows),
      actions: sortById(actions),
      interventions: sortById(interventionRows),
    };
  }

  async function expectEnded(response: Response) {
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("RELATIONSHIP_ENDED");
    expect(body.error.message).toBe("Coaching relationship has ended.");
  }

  type Rows = ReturnType<typeof openRows>;
  const writes: Array<{
    name: string;
    send: (trainer: Record<string, string>, relationshipId: string, rows: Rows) => Promise<Response>;
  }> = [
    {
      name: "acknowledge an active exception",
      send: (t, _r, rows) =>
        post(`/exceptions/${rows.active.id}/acknowledge`, t, { note: "Saw it" }, "ec1b-ack-active"),
    },
    {
      name: "acknowledge a detected exception",
      send: (t, _r, rows) =>
        post(`/exceptions/${rows.detected.id}/acknowledge`, t, {}, "ec1b-ack-detected"),
    },
    {
      name: "resolve an acknowledged exception",
      send: (t, _r, rows) =>
        post(
          `/exceptions/${rows.acknowledged.id}/resolve`,
          t,
          { outcome: "plan_adjusted", note: "Adjusted" },
          "ec1b-resolve",
        ),
    },
    {
      name: "evaluate the relationship",
      send: (t, r) => post(`/exceptions/relationships/${r}/evaluate`, t, {}, "ec1b-eval"),
    },
    {
      name: "add an intervention linked to an exception",
      send: (t, r, rows) =>
        post(
          `/exceptions/relationships/${r}/interventions`,
          t,
          { kind: "note", summary: "Linked note", exceptionId: rows.active.id },
          "ec1b-int-linked",
        ),
    },
    {
      name: "add a free intervention note",
      send: (t, r) =>
        post(
          `/exceptions/relationships/${r}/interventions`,
          t,
          { kind: "note", summary: "Free note" },
          "ec1b-int-free",
        ),
    },
  ];

  it.each(writes)(
    "ended: $name → 409 RELATIONSHIP_ENDED, nothing written, retry with the same key still 409",
    async ({ send }) => {
      const { trainer, relationshipId } = await reachActive("ended");
      await endCoaching(trainer, relationshipId, "ec1b-end");
      const rows = openRows(relationshipId, "eeeeeeee");
      await db.insert(schema.exceptions).values(Object.values(rows));
      const before = await snapshot(relationshipId);

      await expectEnded(await send(trainer, relationshipId, rows));
      // Exceptions, exception actions and interventions are untouched.
      expect(await snapshot(relationshipId)).toEqual(before);
      // A rejected write is not cached under its idempotency key.
      await expectEnded(await send(trainer, relationshipId, rows));
      expect(await snapshot(relationshipId)).toEqual(before);
    },
  );

  it("keeps every exception read working on an ended relationship without writing", async () => {
    const { trainer, relationshipId } = await reachActive("reads");
    await endCoaching(trainer, relationshipId, "ec1b-reads-end");
    const rows = openRows(relationshipId, "ffffffff");
    await db.insert(schema.exceptions).values(Object.values(rows));
    const before = await snapshot(relationshipId);

    const get = (path: string) =>
      app.request(path, { headers: trainer }, testEnv());

    const detail = await get(`/exceptions/${rows.active.id}`);
    expect(detail.status).toBe(200);
    expect(((await detail.json()) as { data: { id: string } }).data.id).toBe(rows.active.id);

    const list = await get(`/exceptions/relationships/${relationshipId}`);
    expect(list.status).toBe(200);
    const listIds = ((await list.json()) as { data: { items: Array<{ id: string }> } }).data.items
      .map((item) => item.id)
      .sort();
    expect(listIds).toEqual([rows.active.id, rows.detected.id].sort());

    const acked = await get(`/exceptions/relationships/${relationshipId}?status=acknowledged`);
    expect(acked.status).toBe(200);
    expect(
      ((await acked.json()) as { data: { items: Array<{ id: string }> } }).data.items.map((i) => i.id),
    ).toEqual([rows.acknowledged.id]);

    expect((await get(`/exceptions/relationships/${relationshipId}/interventions`)).status).toBe(200);
    expect((await get("/exceptions/attention")).status).toBe(200);
    expect((await get("/exceptions/attention?groupBy=relationship")).status).toBe(200);

    expect(await snapshot(relationshipId)).toEqual(before);
  });

  it("does not let the read path evaluate (and so write) an ended relationship", async () => {
    const { trainer, relationshipId } = await reachActive("readeval");
    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    const scheduled = await post(
      `/checkins/relationships/${relationshipId}/schedule`,
      trainer,
      { localDate: today },
      "ec1b-readeval-sched",
    );
    expect(scheduled.status).toBe(200);
    // Move it to yesterday and make it overdue, so ending (which only stops
    // today and later) keeps it and detection would pick it up if the read
    // path evaluated the ended relationship.
    await db
      .update(schema.checkins)
      .set({
        localDate: addDaysToLocalDate(today, -1),
        windowStartsAt: "2020-01-01T00:00:00.000Z",
        windowEndsAt: "2020-01-02T00:00:00.000Z",
      })
      .where(eq(schema.checkins.coachingRelationshipId, relationshipId));
    // Control: on an active relationship this check-in is detectable.
    const control = await post(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      trainer,
      {},
      "ec1b-readeval-control",
    );
    expect(control.status).toBe(200);
    const controlBody = (await control.json()) as { data: { created: number } };
    expect(controlBody.data.created).toBeGreaterThan(0);
    // Forget the detected rows again so only a fresh evaluation could recreate them.
    await db
      .delete(schema.exceptions)
      .where(eq(schema.exceptions.coachingRelationshipId, relationshipId));
    await endCoaching(trainer, relationshipId, "ec1b-readeval-end");
    const remaining = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.coachingRelationshipId, relationshipId));
    expect(remaining.length).toBeGreaterThan(0);
    const before = await snapshot(relationshipId);

    const list = await app.request(
      `/exceptions/relationships/${relationshipId}`,
      { headers: trainer },
      testEnv(),
    );
    expect(list.status).toBe(200);
    expect(await snapshot(relationshipId)).toEqual(before);
  });

  it("still answers 404 (not 409) to another trainer on every exception write of an ended relationship", async () => {
    const { trainer, relationshipId } = await reachActive("owner");
    const stranger = { Cookie: await createTrainerSession("ec1b-stranger@example.com") };
    await endCoaching(trainer, relationshipId, "ec1b-owner-end");
    const rows = openRows(relationshipId, "abcdabcd");
    await db.insert(schema.exceptions).values(Object.values(rows));
    const before = await snapshot(relationshipId);

    const expectNotFound = async (response: Response, code: string) => {
      expect(response.status).toBe(404);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(code);
    };
    await expectNotFound(
      await post(`/exceptions/${rows.active.id}/acknowledge`, stranger, {}, "ec1b-stranger-ack"),
      "EXCEPTION_NOT_FOUND",
    );
    await expectNotFound(
      await post(
        `/exceptions/${rows.acknowledged.id}/resolve`,
        stranger,
        { outcome: "plan_adjusted" },
        "ec1b-stranger-resolve",
      ),
      "EXCEPTION_NOT_FOUND",
    );
    await expectNotFound(
      await post(`/exceptions/relationships/${relationshipId}/evaluate`, stranger, {}, "ec1b-stranger-eval"),
      "RELATIONSHIP_NOT_FOUND",
    );
    await expectNotFound(
      await post(
        `/exceptions/relationships/${relationshipId}/interventions`,
        stranger,
        { kind: "note", summary: "Free note" },
        "ec1b-stranger-int",
      ),
      "RELATIONSHIP_NOT_FOUND",
    );
    expect(await snapshot(relationshipId)).toEqual(before);
  });

  it("checks ended before the transition rule: ack/resolve of an already-resolved row → RELATIONSHIP_ENDED", async () => {
    const { trainer, relationshipId } = await reachActive("order-transition");
    await endCoaching(trainer, relationshipId, "ec1b-order-transition-end");
    const resolvedRow = {
      ...openRows(relationshipId, "56565656").acknowledged,
      status: "resolved" as const,
      resolvedAt: earlierAck,
      resolutionOutcome: "plan_adjusted" as const,
    };
    await db.insert(schema.exceptions).values(resolvedRow);
    const before = await snapshot(relationshipId);

    await expectEnded(
      await post(`/exceptions/${resolvedRow.id}/acknowledge`, trainer, {}, "ec1b-order-ack"),
    );
    await expectEnded(
      await post(
        `/exceptions/${resolvedRow.id}/resolve`,
        trainer,
        { outcome: "plan_adjusted" },
        "ec1b-order-resolve",
      ),
    );
    expect(await snapshot(relationshipId)).toEqual(before);
  });

  it("checks ended before the linked-exception lookup on interventions", async () => {
    const { trainer, relationshipId } = await reachActive("order-linked");
    await endCoaching(trainer, relationshipId, "ec1b-order-linked-end");
    const before = await snapshot(relationshipId);

    await expectEnded(
      await post(
        `/exceptions/relationships/${relationshipId}/interventions`,
        trainer,
        // A linked exception that does not exist would otherwise be a 404.
        { kind: "note", summary: "Linked note", exceptionId: "78787878-0001-4000-8000-000000000001" },
        "ec1b-order-linked",
      ),
    );
    expect(await snapshot(relationshipId)).toEqual(before);
  });

  it("replays a write made before the end with its original 200 and writes nothing (resolve, ack, interventions)", async () => {
    const { trainer, relationshipId } = await reachActive("replay");
    const rows = openRows(relationshipId, "9a9a9a9a");
    await db.insert(schema.exceptions).values(Object.values(rows));
    const writes = [
      () =>
        post(
          `/exceptions/${rows.acknowledged.id}/resolve`,
          trainer,
          { outcome: "plan_adjusted", note: "Adjusted" },
          "ec1b-replay-resolve",
        ),
      () => post(`/exceptions/${rows.active.id}/acknowledge`, trainer, {}, "ec1b-replay-ack"),
      () =>
        post(
          `/exceptions/relationships/${relationshipId}/interventions`,
          trainer,
          { kind: "note", summary: "Free note" },
          "ec1b-replay-int",
        ),
    ];
    const originals: unknown[] = [];
    for (const write of writes) {
      const response = await write();
      expect(response.status).toBe(200);
      originals.push(await response.json());
    }

    await endCoaching(trainer, relationshipId, "ec1b-replay-end");
    const before = await snapshot(relationshipId);
    for (const [index, write] of writes.entries()) {
      const replay = await write();
      expect(replay.status, `write ${index}`).toBe(200);
      expect(await replay.json(), `write ${index}`).toEqual(originals[index]);
    }
    expect(await snapshot(relationshipId)).toEqual(before);
  });

  it("allows every exception write on an active relationship and again after reactivation", async () => {
    const { trainer, trainee, relationshipId } = await reachActive("react");

    async function writeAll(prefix: string, tag: string) {
      const rows = openRows(relationshipId, prefix);
      await db.insert(schema.exceptions).values(Object.values(rows));
      const ack = await post(`/exceptions/${rows.active.id}/acknowledge`, trainer, {}, `${tag}-ack`);
      expect(ack.status).toBe(200);
      expect(((await ack.json()) as { data: { status: string } }).data.status).toBe("acknowledged");
      const resolved = await post(
        `/exceptions/${rows.acknowledged.id}/resolve`,
        trainer,
        { outcome: "plan_adjusted" },
        `${tag}-resolve`,
      );
      expect(resolved.status).toBe(200);
      expect(((await resolved.json()) as { data: { status: string } }).data.status).toBe("resolved");
      const evaluate = await post(
        `/exceptions/relationships/${relationshipId}/evaluate`,
        trainer,
        {},
        `${tag}-eval`,
      );
      expect(evaluate.status).toBe(200);
      const note = await post(
        `/exceptions/relationships/${relationshipId}/interventions`,
        trainer,
        { kind: "note", summary: "Linked note", exceptionId: rows.detected.id },
        `${tag}-int`,
      );
      expect(note.status).toBe(200);
    }

    // Active: unchanged behaviour.
    await writeAll("12121212", "ec1b-active");

    await endCoaching(trainer, relationshipId, "ec1b-react-end");
    await reactivate(trainer, trainee, relationshipId, "ec1b-react-req");

    // Reactivated: writable again.
    await writeAll("34343434", "ec1b-reactivated");
  });
});
