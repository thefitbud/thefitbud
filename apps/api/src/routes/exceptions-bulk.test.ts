import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BULK_RESOLVE_UNDO_WINDOW_MS } from "@fitbud/contracts";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { sha256Hex } from "../lib/crypto.js";
import * as schema from "../db/schema.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import {
  BULK_UNDONE_OPERATION,
  classifyBulkResolve,
} from "../domain/exception-bulk.js";

/**
 * Race hook: runs once, right after the bulk route has read the selected rows
 * and before it writes, so a test can commit another request in between (the
 * domain module's own re-read after the batch is not affected).
 */
const raceHook = vi.hoisted(() => ({ fn: null as null | (() => Promise<void>) }));
vi.mock("../domain/exception-bulk.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../domain/exception-bulk.js")>();
  return {
    ...actual,
    loadRelationshipExceptions: async (
      ...args: Parameters<typeof actual.loadRelationshipExceptions>
    ) => {
      const rows = await actual.loadRelationshipExceptions(...args);
      const fn = raceHook.fn;
      if (fn) {
        raceHook.fn = null;
        await fn();
      }
      return rows;
    },
  };
});

/**
 * Z6-10 (SPB, D11): bulk Resolve for one client's compatible exceptions with a
 * 5 s undo. Real relationships are created through the production invite,
 * onboarding and configuration routes; exceptions are persisted rows on them.
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
    ENVIRONMENT: "local",
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

/** Invite → accept → onboarding → review → configure → activate. */
async function reachActive(trainerEmail: string, suffix: string) {
  const cookie = await createTrainerSession(trainerEmail);
  const trainer = { Cookie: cookie };
  const created = await post(
    "/invitations",
    trainer,
    { recipientEmail: `bulk-trainee-${suffix}@example.com` },
    `inv-bulk-${suffix}`,
  );
  const { data: invite } = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `bulk-trainee-${suffix}`,
    `bulk-trainee-${suffix}@example.com`,
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
    `submit-bulk-${suffix}`,
  );
  await post(
    `/onboarding/relationships/${relationshipId}/review`,
    trainer,
    { outcome: "coaching_ready" },
    `review-bulk-${suffix}`,
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
    `cfg-bulk-${suffix}`,
  );
  const activated = await post(
    `/configurations/relationships/${relationshipId}/activate`,
    trainer,
    { expectedVersion: 1 },
    `act-bulk-${suffix}`,
  );
  expect(activated.status).toBe(200);
  return { trainer, trainee, relationshipId };
}

const detectedAt = "2026-01-05T08:00:00.000Z";
const reviewedAt = "2026-01-05T10:00:00.000Z";

type ExceptionInsert = typeof schema.exceptions.$inferInsert;

function exceptionRow(
  relationshipId: string,
  id: string,
  overrides: Partial<ExceptionInsert> & Pick<ExceptionInsert, "type" | "status">,
): ExceptionInsert {
  const mealish = /meal/.test(overrides.type);
  const checkin = overrides.type === "overdue_checkin";
  return {
    id,
    coachingRelationshipId: relationshipId,
    severity: "critical",
    ruleVersion: "mvp.v2",
    sourceEntityType: checkin
      ? "checkin"
      : mealish
        ? "meal_assignment"
        : "workout_assignment",
    sourceEntityId: id.replace(/^(.{9})..../, "$1aaaa"),
    summary: "Missed workout",
    detailsJson: null,
    detectedAt,
    activatedAt: detectedAt,
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionOutcome: null,
    resolutionNote: null,
    closedReason: null,
    sourceLoggedLateAt: null,
    createdAt: detectedAt,
    updatedAt: detectedAt,
    ...overrides,
  };
}

const id = (n: number) => `0b0b0b0b-0001-4000-8000-${String(n).padStart(12, "0")}`;

/** One client's mix of compatible and incompatible items, plus history. */
function clientRows(relationshipId: string) {
  return {
    activeWorkout: exceptionRow(relationshipId, id(1), {
      type: "missed_workout",
      status: "active",
    }),
    detectedMeal: exceptionRow(relationshipId, id(2), {
      type: "overdue_meal",
      status: "detected",
      activatedAt: null,
      summary: "Required meal still unlogged: Lunch",
    }),
    reviewedSkippedMeal: exceptionRow(relationshipId, id(3), {
      type: "skipped_meal",
      status: "acknowledged",
      acknowledgedAt: reviewedAt,
      updatedAt: reviewedAt,
      summary: "Skipped required meal: Dinner",
    }),
    overdueCheckin: exceptionRow(relationshipId, id(4), {
      type: "overdue_checkin",
      status: "active",
      severity: "attention",
      summary: "Overdue check-in",
    }),
    mealChange: exceptionRow(relationshipId, id(5), {
      type: "meal_deviation",
      status: "active",
      severity: "attention",
      summary: "Meal deviation: Lunch",
    }),
    alreadyResolved: exceptionRow(relationshipId, id(6), {
      type: "skipped_workout",
      status: "resolved",
      severity: "attention",
      acknowledgedAt: reviewedAt,
      resolvedAt: reviewedAt,
      resolutionOutcome: "talked",
      closedReason: "trainer",
      updatedAt: reviewedAt,
      summary: "Skipped workout",
    }),
  } satisfies Record<string, ExceptionInsert>;
}

describe("Z6-10 bulk resolve and undo", () => {
  let db: Db;
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    db = memory.db;
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    closeDb();
  });

  async function snapshot(relationshipIds: string[]) {
    const exceptionRows = await db
      .select()
      .from(schema.exceptions)
      .where(inArray(schema.exceptions.coachingRelationshipId, relationshipIds));
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
      .where(inArray(schema.interventions.coachingRelationshipId, relationshipIds));
    const sortById = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    return {
      exceptions: sortById(exceptionRows),
      actions: sortById(actions),
      interventions: sortById(interventionRows),
    };
  }

  async function seedClient(suffix: string, trainerEmail = `bulk-coach-${suffix}@example.com`) {
    const client = await reachActive(trainerEmail, suffix);
    const rows = clientRows(client.relationshipId);
    await db.insert(schema.exceptions).values(Object.values(rows));
    return { ...client, rows };
  }

  type ResolveBody = {
    data: {
      bulkId: string | null;
      relationshipId: string;
      resolvedCount: number;
      skippedCount: number;
      items: Array<{ id: string; status: string; reason?: string }>;
      resolvedAt: string | null;
      undoExpiresAt: string | null;
    };
  };

  it("mixed input resolves only this client's compatible open items and returns a reason for the rest", async () => {
    const coach = "bulk-coach-mixed@example.com";
    const { trainer, relationshipId, rows } = await seedClient("mixed", coach);
    // Another client of the same trainer.
    const other = await reachActive(coach, "mixed-other");
    const otherRow = exceptionRow(other.relationshipId, id(50), {
      type: "missed_workout",
      status: "active",
    });
    await db.insert(schema.exceptions).values(otherRow);
    const notAnException = "0c0c0c0c-0001-4000-8000-000000000099";

    const before = await snapshot([relationshipId, other.relationshipId]);
    const requested = [
      rows.activeWorkout.id,
      rows.mealChange.id,
      otherRow.id,
      rows.detectedMeal.id,
      rows.alreadyResolved.id,
      notAnException,
      rows.reviewedSkippedMeal.id,
      rows.overdueCheckin.id,
    ];
    const response = await post(
      "/exceptions/bulk/resolve",
      trainer,
      {
        relationshipId,
        exceptionIds: requested,
        outcome: "talked",
        note: "  Spoke on Monday call  ",
      },
      "bulk-mixed-1",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as ResolveBody;
    expect(body.data.items).toEqual([
      { id: rows.activeWorkout.id, status: "resolved" },
      { id: rows.mealChange.id, status: "skipped", reason: "incompatible_type" },
      { id: otherRow.id, status: "skipped", reason: "not_found" },
      { id: rows.detectedMeal.id, status: "resolved" },
      { id: rows.alreadyResolved.id, status: "skipped", reason: "already_resolved" },
      { id: notAnException, status: "skipped", reason: "not_found" },
      { id: rows.reviewedSkippedMeal.id, status: "resolved" },
      { id: rows.overdueCheckin.id, status: "resolved" },
    ]);
    expect(body.data.resolvedCount).toBe(4);
    expect(body.data.skippedCount).toBe(4);
    expect(body.data.relationshipId).toBe(relationshipId);
    expect(body.data.bulkId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      Date.parse(body.data.undoExpiresAt!) - Date.parse(body.data.resolvedAt!),
    ).toBe(BULK_RESOLVE_UNDO_WINDOW_MS);

    const after = await snapshot([relationshipId, other.relationshipId]);
    const resolvedIds = new Set([
      rows.activeWorkout.id,
      rows.detectedMeal.id,
      rows.reviewedSkippedMeal.id,
      rows.overdueCheckin.id,
    ]);
    // Everything not resolved is byte-for-byte unchanged.
    expect(after.exceptions.filter((row) => !resolvedIds.has(row.id))).toEqual(
      before.exceptions.filter((row) => !resolvedIds.has(row.id)),
    );
    const trainerUserId = (
      await db
        .select()
        .from(schema.coachingRelationships)
        .where(eq(schema.coachingRelationships.id, relationshipId))
    )[0]!.trainerUserId;
    for (const row of after.exceptions.filter((r) => resolvedIds.has(r.id))) {
      expect(row.status).toBe("resolved");
      expect(row.resolutionOutcome).toBe("talked");
      expect(row.resolutionNote).toBe("Spoke on Monday call");
      expect(row.closedReason).toBe("trainer");
      expect(row.resolvedAt).toBe(body.data.resolvedAt);
    }
    // A reviewed item keeps its original review time.
    expect(
      after.exceptions.find((r) => r.id === rows.reviewedSkippedMeal.id)!.acknowledgedAt,
    ).toBe(reviewedAt);

    // One resolution row per resolved exception, with outcome, note, actor and time.
    const newActions = after.actions.filter(
      (a) => !before.actions.some((b) => b.id === a.id),
    );
    const resolveActions = newActions.filter((a) => a.action === "resolve");
    expect(resolveActions).toHaveLength(4);
    for (const action of resolveActions) {
      expect(resolvedIds.has(action.exceptionId)).toBe(true);
      expect(action).toMatchObject({
        note: "Spoke on Monday call",
        trainerUserId,
        createdAt: body.data.resolvedAt,
      });
    }
    // D-W6-15: items not yet reviewed also get the Mark reviewed rows; the item
    // that was already reviewed does not get a second review.
    const unreviewed = [rows.activeWorkout.id, rows.detectedMeal.id, rows.overdueCheckin.id].sort();
    const reviewActions = newActions.filter((a) => a.action === "acknowledge");
    expect(reviewActions.map((a) => a.exceptionId).sort()).toEqual(unreviewed);
    for (const action of reviewActions) {
      expect(action).toMatchObject({ note: null, trainerUserId, createdAt: body.data.resolvedAt });
    }
    expect(newActions).toHaveLength(7);
    for (const id of unreviewed) {
      expect(after.exceptions.find((r) => r.id === id)!.acknowledgedAt).toBe(body.data.resolvedAt);
    }
    const newInterventions = after.interventions.filter(
      (a) => !before.interventions.some((b) => b.id === a.id),
    );
    expect(newInterventions.filter((i) => i.kind === "resolve")).toHaveLength(4);
    expect(newInterventions.filter((i) => i.kind === "note")).toHaveLength(4);
    const reviewInterventions = newInterventions.filter((i) => i.kind === "acknowledge");
    expect(reviewInterventions.map((i) => i.exceptionId).sort()).toEqual(unreviewed);
    expect(
      reviewInterventions.find((i) => i.exceptionId === rows.activeWorkout.id)!.summary,
    ).toBe("Acknowledged: Missed workout");
    expect(newInterventions).toHaveLength(11);
    expect(
      newInterventions.every(
        (i) => i.coachingRelationshipId === relationshipId && resolvedIds.has(i.exceptionId!),
      ),
    ).toBe(true);
    expect(
      newInterventions.find(
        (i) => i.kind === "resolve" && i.exceptionId === rows.activeWorkout.id,
      )!.summary,
    ).toBe("Resolved (talked): Missed workout");
  });

  it("without a note writes no note intervention (review + resolve rows only)", async () => {
    const { trainer, relationshipId, rows } = await seedClient("nonote");
    const response = await post(
      "/exceptions/bulk/resolve",
      trainer,
      {
        relationshipId,
        exceptionIds: [rows.activeWorkout.id, rows.detectedMeal.id],
        outcome: "no_action",
      },
      "bulk-nonote-1",
    );
    expect(response.status).toBe(200);
    const after = await snapshot([relationshipId]);
    expect(after.interventions.map((i) => i.kind).sort()).toEqual([
      "acknowledge",
      "acknowledge",
      "resolve",
      "resolve",
    ]);
    expect(after.actions.every((a) => a.note === null)).toBe(true);
  });

  it("returns no bulk id when nothing was resolvable, and writes nothing", async () => {
    const { trainer, relationshipId, rows } = await seedClient("none");
    const before = await snapshot([relationshipId]);
    const response = await post(
      "/exceptions/bulk/resolve",
      trainer,
      {
        relationshipId,
        exceptionIds: [rows.mealChange.id, rows.alreadyResolved.id],
        outcome: "other",
      },
      "bulk-none-1",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as ResolveBody;
    expect(body.data).toMatchObject({
      bulkId: null,
      resolvedCount: 0,
      skippedCount: 2,
      resolvedAt: null,
      undoExpiresAt: null,
    });
    expect(await snapshot([relationshipId])).toEqual(before);
  });

  it("repeat with the same Idempotency-Key returns the first result and writes nothing more", async () => {
    const { trainer, relationshipId, rows } = await seedClient("idem");
    const request = {
      relationshipId,
      exceptionIds: [rows.activeWorkout.id, rows.detectedMeal.id],
      outcome: "plan_adjusted",
      note: "Moved to evenings",
    };
    const first = await post("/exceptions/bulk/resolve", trainer, request, "bulk-idem-1");
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    const afterFirst = await snapshot([relationshipId]);

    const second = await post("/exceptions/bulk/resolve", trainer, request, "bulk-idem-1");
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstBody);
    expect(await snapshot([relationshipId])).toEqual(afterFirst);

    // Same key, different request: rejected, nothing written.
    const reused = await post(
      "/exceptions/bulk/resolve",
      trainer,
      { ...request, outcome: "talked" },
      "bulk-idem-1",
    );
    expect(reused.status).toBe(409);
    expect(((await reused.json()) as { error: { code: string } }).error.code).toBe(
      "IDEMPOTENCY_KEY_REUSE",
    );
    expect(await snapshot([relationshipId])).toEqual(afterFirst);

    // A new key on the same items now skips them as already resolved.
    const fresh = await post("/exceptions/bulk/resolve", trainer, request, "bulk-idem-2");
    const freshBody = (await fresh.json()) as ResolveBody;
    expect(freshBody.data.items.map((i) => i.reason)).toEqual([
      "already_resolved",
      "already_resolved",
    ]);
    expect(await snapshot([relationshipId])).toEqual(afterFirst);
  });

  it("requires an Idempotency-Key and a valid body", async () => {
    const { trainer, relationshipId, rows } = await seedClient("valid");
    const before = await snapshot([relationshipId]);
    const valid = {
      relationshipId,
      exceptionIds: [rows.activeWorkout.id],
      outcome: "talked",
    };
    const noKey = await post("/exceptions/bulk/resolve", trainer, valid);
    expect(noKey.status).toBe(400);
    expect(((await noKey.json()) as { error: { code: string } }).error.code).toBe(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    for (const [n, body] of [
      { ...valid, exceptionIds: [] },
      { ...valid, exceptionIds: [rows.activeWorkout.id, rows.activeWorkout.id] },
      { relationshipId, exceptionIds: [rows.activeWorkout.id] },
      { ...valid, outcome: "auto" },
      { ...valid, exceptionIds: Array.from({ length: 51 }, (_, i) => id(100 + i)) },
    ].entries()) {
      const response = await post("/exceptions/bulk/resolve", trainer, body, `bulk-valid-${n}`);
      expect(response.status).toBe(400);
      const error = ((await response.json()) as { error: { code: string; message: string } })
        .error;
      expect(error.code).toBe("INVALID_REQUEST");
      expect(error.message).toBe("Invalid bulk resolve request.");
    }
    expect(await snapshot([relationshipId])).toEqual(before);
  });

  describe("undo", () => {
    async function resolveMixed(suffix: string) {
      const client = await seedClient(suffix);
      const { rows } = client;
      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
      const before = await snapshot([client.relationshipId]);
      const response = await post(
        "/exceptions/bulk/resolve",
        client.trainer,
        {
          relationshipId: client.relationshipId,
          exceptionIds: [
            rows.activeWorkout.id,
            rows.detectedMeal.id,
            rows.reviewedSkippedMeal.id,
            rows.mealChange.id,
          ],
          outcome: "talked",
          note: "Weekly call",
        },
        `bulk-undo-${suffix}`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as ResolveBody;
      return { ...client, before, bulkId: body.data.bulkId! };
    }

    function stripUpdatedAt<T extends { updatedAt: string }>(rows: T[]) {
      return rows.map((row) => ({ ...row, updatedAt: undefined }));
    }

    it("within 5 s restores each item's prior status, removes the resolution rows and logs the undo", async () => {
      const { trainer, relationshipId, rows, before, bulkId } = await resolveMixed("within");
      vi.setSystemTime(Date.now() + BULK_RESOLVE_UNDO_WINDOW_MS - 100);

      const response = await post("/exceptions/bulk/undo", trainer, { bulkId }, "undo-within-1");
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { bulkId: string; restoredCount: number; items: Array<{ id: string; status: string }> };
      };
      expect(body.data.bulkId).toBe(bulkId);
      expect(body.data.restoredCount).toBe(3);
      expect(body.data.items).toEqual([
        { id: rows.activeWorkout.id, status: "active" },
        { id: rows.detectedMeal.id, status: "detected" },
        { id: rows.reviewedSkippedMeal.id, status: "acknowledged" },
      ]);

      const after = await snapshot([relationshipId]);
      // Status, review time and resolution fields are back; only updatedAt moved.
      expect(stripUpdatedAt(after.exceptions)).toEqual(stripUpdatedAt(before.exceptions));
      expect(after.actions).toEqual(before.actions);
      expect(after.interventions).toEqual(before.interventions);

      // The undo itself is logged (actor, bulk id, restored items).
      const [trainerRow] = await db
        .select({ trainerUserId: schema.coachingRelationships.trainerUserId })
        .from(schema.coachingRelationships)
        .where(eq(schema.coachingRelationships.id, relationshipId));
      const log = await db
        .select()
        .from(schema.idempotencyRecords)
        .where(eq(schema.idempotencyRecords.operation, BULK_UNDONE_OPERATION));
      expect(log).toHaveLength(1);
      expect(log[0]!.actorUserId).toBe(trainerRow!.trainerUserId);
      expect(log[0]!.keyHash).toBe(await sha256Hex(bulkId));
      expect(JSON.parse(log[0]!.responseBody)).toMatchObject({
        bulkId,
        restoredCount: 3,
      });

      // Same key replays; a new key cannot undo twice.
      const replay = await post("/exceptions/bulk/undo", trainer, { bulkId }, "undo-within-1");
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(body);
      const twice = await post("/exceptions/bulk/undo", trainer, { bulkId }, "undo-within-2");
      expect(twice.status).toBe(409);
      expect(((await twice.json()) as { error: { code: string } }).error.code).toBe(
        "BULK_ALREADY_UNDONE",
      );
      expect(await snapshot([relationshipId])).toEqual(after);
    });

    it("after 5 s answers 409 undo_expired and changes nothing", async () => {
      const { trainer, relationshipId, bulkId } = await resolveMixed("expired");
      const resolved = await snapshot([relationshipId]);
      vi.setSystemTime(Date.now() + BULK_RESOLVE_UNDO_WINDOW_MS + 1);

      const response = await post("/exceptions/bulk/undo", trainer, { bulkId }, "undo-expired-1");
      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("undo_expired");
      expect(body.error.message).toBe("Undo window has passed.");
      expect(await snapshot([relationshipId])).toEqual(resolved);
    });

    it("an unknown bulk id is not found; a missing key or bad body is rejected", async () => {
      const { trainer, bulkId } = await resolveMixed("unknown");
      const unknown = await post(
        "/exceptions/bulk/undo",
        trainer,
        { bulkId: "0d0d0d0d-0001-4000-8000-000000000001" },
        "undo-unknown-1",
      );
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as { error: { code: string } }).error.code).toBe(
        "BULK_NOT_FOUND",
      );
      const noKey = await post("/exceptions/bulk/undo", trainer, { bulkId });
      expect(noKey.status).toBe(400);
      const bad = await post("/exceptions/bulk/undo", trainer, { bulkId: "x" }, "undo-bad-1");
      expect(bad.status).toBe(400);
    });
  });

  describe("races and partial undo", () => {
    afterEach(() => {
      raceHook.fn = null;
    });

    async function singleReview(trainer: Record<string, string>, id: string, key: string) {
      const acked = await post(`/exceptions/${id}/acknowledge`, trainer, { note: null }, `${key}-ack`);
      expect(acked.status).toBe(200);
    }

    async function singleResolve(trainer: Record<string, string>, id: string, key: string) {
      await singleReview(trainer, id, key);
      const resolved = await post(
        `/exceptions/${id}/resolve`,
        trainer,
        { outcome: "no_action" },
        `${key}-resolve`,
      );
      expect(resolved.status).toBe(200);
    }

    it("an item resolved singly between the read and the batch gets no bulk rows and is reported already_resolved; undo restores exactly", async () => {
      const { trainer, relationshipId, rows } = await seedClient("race");
      const t0 = Date.now();
      vi.useFakeTimers({ toFake: ["Date"], now: t0 });
      const before = await snapshot([relationshipId]);
      let reviewedElsewhereAt = "";
      raceHook.fn = async () => {
        vi.setSystemTime(t0 + 1_000);
        // Another tab resolves one item and marks another reviewed.
        await singleResolve(trainer, rows.activeWorkout.id, "race-single");
        await singleReview(trainer, rows.detectedMeal.id, "race-review");
        reviewedElsewhereAt = new Date(t0 + 1_000).toISOString();
        vi.setSystemTime(t0 + 2_000);
      };
      const afterSingle = async () => snapshot([relationshipId]);

      const request = {
        relationshipId,
        exceptionIds: [rows.activeWorkout.id, rows.detectedMeal.id, rows.overdueCheckin.id],
        outcome: "talked",
        note: "Weekly call",
      };
      const response = await post("/exceptions/bulk/resolve", trainer, request, "race-bulk");
      expect(response.status).toBe(200);
      const body = (await response.json()) as ResolveBody;
      expect(raceHook.fn).toBeNull();
      expect(body.data.items).toEqual([
        { id: rows.activeWorkout.id, status: "skipped", reason: "already_resolved" },
        { id: rows.detectedMeal.id, status: "resolved" },
        { id: rows.overdueCheckin.id, status: "resolved" },
      ]);
      expect(body.data.resolvedCount).toBe(2);
      expect(body.data.skippedCount).toBe(1);
      const bulkAt = body.data.resolvedAt!;
      expect(bulkAt).toBe(new Date(t0 + 2_000).toISOString());

      const after = await afterSingle();
      // The singly resolved item keeps only the single resolve's rows.
      const raced = after.exceptions.find((r) => r.id === rows.activeWorkout.id)!;
      expect(raced.resolutionOutcome).toBe("no_action");
      expect(raced.resolvedAt).not.toBe(bulkAt);
      expect(after.actions.filter((a) => a.exceptionId === rows.activeWorkout.id).map((a) => a.action).sort()).toEqual([
        "acknowledge",
        "resolve",
      ]);
      expect(
        after.actions.filter((a) => a.exceptionId === rows.activeWorkout.id && a.createdAt === bulkAt),
      ).toEqual([]);
      expect(
        after.interventions.filter((i) => i.exceptionId === rows.activeWorkout.id && i.createdAt === bulkAt),
      ).toEqual([]);
      // The item reviewed elsewhere keeps that review time and gets no second review.
      const reviewed = after.exceptions.find((r) => r.id === rows.detectedMeal.id)!;
      expect(reviewed.status).toBe("resolved");
      expect(reviewed.acknowledgedAt).toBe(reviewedElsewhereAt);
      expect(
        after.actions.filter((a) => a.exceptionId === rows.detectedMeal.id).map((a) => a.action).sort(),
      ).toEqual(["acknowledge", "resolve"]);
      expect(
        after.actions.find((a) => a.exceptionId === rows.detectedMeal.id && a.action === "acknowledge")!
          .createdAt,
      ).toBe(reviewedElsewhereAt);
      // The untouched item is reviewed + resolved by the bulk.
      expect(
        after.actions.filter((a) => a.exceptionId === rows.overdueCheckin.id).map((a) => a.action).sort(),
      ).toEqual(["acknowledge", "resolve"]);

      // A replay returns the corrected result.
      const replay = await post("/exceptions/bulk/resolve", trainer, request, "race-bulk");
      expect(await replay.json()).toEqual(body);

      // Undo restores what the bulk changed and nothing else.
      vi.setSystemTime(t0 + 4_000);
      const undo = await post("/exceptions/bulk/undo", trainer, { bulkId: body.data.bulkId }, "race-undo");
      expect(undo.status).toBe(200);
      const undoBody = (await undo.json()) as {
        data: { restoredCount: number; items: Array<{ id: string; status: string }> };
      };
      expect(undoBody.data.items).toEqual([
        { id: rows.detectedMeal.id, status: "acknowledged" },
        { id: rows.overdueCheckin.id, status: "active" },
      ]);
      const undone = await snapshot([relationshipId]);
      const reviewedRow = undone.exceptions.find((r) => r.id === rows.detectedMeal.id)!;
      expect(reviewedRow).toMatchObject({
        status: "acknowledged",
        acknowledgedAt: reviewedElsewhereAt,
        resolvedAt: null,
        resolutionOutcome: null,
        resolutionNote: null,
        closedReason: null,
      });
      const checkinRow = undone.exceptions.find((r) => r.id === rows.overdueCheckin.id)!;
      const checkinBefore = before.exceptions.find((r) => r.id === rows.overdueCheckin.id)!;
      expect({ ...checkinRow, updatedAt: null }).toEqual({ ...checkinBefore, updatedAt: null });
      expect(undone.exceptions.find((r) => r.id === rows.activeWorkout.id)).toEqual(raced);
      // Only the bulk's rows were removed: the single requests' rows remain.
      const bulkRows = (list: Array<{ createdAt: string }>) => list.filter((r) => r.createdAt === bulkAt);
      expect(bulkRows(undone.actions)).toEqual([]);
      expect(bulkRows(undone.interventions)).toEqual([]);
      expect(undone.actions.filter((a) => a.createdAt !== bulkAt)).toEqual(
        after.actions.filter((a) => a.createdAt !== bulkAt),
      );
    });

    it("when every item was resolved elsewhere first, nothing is written and there is nothing to undo", async () => {
      const { trainer, relationshipId, rows } = await seedClient("raceall");
      const t0 = Date.now();
      vi.useFakeTimers({ toFake: ["Date"], now: t0 });
      raceHook.fn = async () => {
        vi.setSystemTime(t0 + 1_000);
        await singleResolve(trainer, rows.activeWorkout.id, "raceall-single");
        vi.setSystemTime(t0 + 2_000);
      };
      const response = await post(
        "/exceptions/bulk/resolve",
        trainer,
        { relationshipId, exceptionIds: [rows.activeWorkout.id], outcome: "talked" },
        "raceall-bulk",
      );
      const body = (await response.json()) as ResolveBody;
      expect(body.data).toMatchObject({
        bulkId: null,
        resolvedCount: 0,
        resolvedAt: null,
        undoExpiresAt: null,
        items: [{ id: rows.activeWorkout.id, status: "skipped", reason: "already_resolved" }],
      });
      const after = await snapshot([relationshipId]);
      expect(after.actions.filter((a) => a.createdAt === new Date(t0 + 2_000).toISOString())).toEqual([]);
      const stateRows = await db
        .select()
        .from(schema.idempotencyRecords)
        .where(eq(schema.idempotencyRecords.operation, "exception.bulk_resolve.state"));
      expect(stateRows).toEqual([]);
    });

    it("undo restores only the items still carrying this bulk's resolution and keeps the rows of the rest", async () => {
      const { trainer, relationshipId, rows } = await seedClient("partial");
      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
      const resolved = await post(
        "/exceptions/bulk/resolve",
        trainer,
        {
          relationshipId,
          exceptionIds: [rows.activeWorkout.id, rows.detectedMeal.id],
          outcome: "talked",
        },
        "partial-bulk",
      );
      const { data } = (await resolved.json()) as ResolveBody;
      // One item changed in between (a later resolution elsewhere).
      const laterAt = new Date(Date.now() + 1_000).toISOString();
      await db
        .update(schema.exceptions)
        .set({ resolvedAt: laterAt, updatedAt: laterAt })
        .where(eq(schema.exceptions.id, rows.detectedMeal.id));
      const beforeUndo = await snapshot([relationshipId]);
      vi.setSystemTime(Date.now() + 2_000);

      const undo = await post("/exceptions/bulk/undo", trainer, { bulkId: data.bulkId }, "partial-undo");
      expect(undo.status).toBe(200);
      const body = (await undo.json()) as {
        data: { restoredCount: number; items: Array<{ id: string; status: string }> };
      };
      expect(body.data.restoredCount).toBe(1);
      expect(body.data.items).toEqual([{ id: rows.activeWorkout.id, status: "active" }]);
      const after = await snapshot([relationshipId]);
      expect(after.exceptions.find((r) => r.id === rows.detectedMeal.id)).toEqual(
        beforeUndo.exceptions.find((r) => r.id === rows.detectedMeal.id),
      );
      const keep = (list: Array<{ exceptionId: string | null }>) =>
        list.filter((r) => r.exceptionId === rows.detectedMeal.id);
      expect(keep(after.actions)).toEqual(keep(beforeUndo.actions));
      expect(keep(after.interventions)).toEqual(keep(beforeUndo.interventions));
      expect(keep(after.actions)).toHaveLength(2);
      expect(after.actions.filter((a) => a.exceptionId === rows.activeWorkout.id)).toEqual([]);
      expect(after.interventions.filter((i) => i.exceptionId === rows.activeWorkout.id)).toEqual([]);
      const active = after.exceptions.find((r) => r.id === rows.activeWorkout.id)!;
      expect(active).toMatchObject({ status: "active", acknowledgedAt: null, resolvedAt: null });
    });

    it("the same Idempotency-Key from another trainer does not replay the first trainer's result", async () => {
      const first = await seedClient("keya", "bulk-coach-keya@example.com");
      const second = await reachActive("bulk-coach-keyb@example.com", "keyb");
      const theirs = exceptionRow(second.relationshipId, id(60), {
        type: "missed_workout",
        status: "active",
      });
      await db.insert(schema.exceptions).values(theirs);

      const a = await post(
        "/exceptions/bulk/resolve",
        first.trainer,
        { relationshipId: first.relationshipId, exceptionIds: [first.rows.activeWorkout.id], outcome: "talked" },
        "shared-key",
      );
      expect(a.status).toBe(200);
      const aBody = (await a.json()) as ResolveBody;

      const b = await post(
        "/exceptions/bulk/resolve",
        second.trainer,
        { relationshipId: second.relationshipId, exceptionIds: [theirs.id], outcome: "no_action" },
        "shared-key",
      );
      expect(b.status).toBe(200);
      const bBody = (await b.json()) as ResolveBody;
      expect(bBody.data.relationshipId).toBe(second.relationshipId);
      expect(bBody.data.bulkId).not.toBe(aBody.data.bulkId);
      expect(bBody.data.items).toEqual([{ id: theirs.id, status: "resolved" }]);
      const [row] = await db.select().from(schema.exceptions).where(eq(schema.exceptions.id, theirs.id));
      expect(row!.resolutionOutcome).toBe("no_action");

      // And trainer B sending A's request under the shared key gets B's own answer (404), not A's replay.
      const bAsA = await post(
        "/exceptions/bulk/resolve",
        second.trainer,
        { relationshipId: first.relationshipId, exceptionIds: [first.rows.activeWorkout.id], outcome: "talked" },
        "shared-key-2",
      );
      expect(bAsA.status).toBe(404);
    });
  });

  it("classifyBulkResolve ignores rows from another relationship even if passed in", () => {
    const row = exceptionRow("0e0e0e0e-0001-4000-8000-000000000001", id(7), {
      type: "missed_workout",
      status: "active",
    }) as typeof schema.exceptions.$inferSelect;
    expect(
      classifyBulkResolve([row.id], [row], "0e0e0e0e-0001-4000-8000-000000000002"),
    ).toEqual([{ id: row.id, status: "skip", reason: "not_found" }]);
    expect(classifyBulkResolve([row.id], [row], row.coachingRelationshipId)[0]!.status).toBe(
      "resolve",
    );
  });
});
