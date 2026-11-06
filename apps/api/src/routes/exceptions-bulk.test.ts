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
    expect(newActions).toHaveLength(4);
    for (const action of newActions) {
      expect(resolvedIds.has(action.exceptionId)).toBe(true);
      expect(action).toMatchObject({
        action: "resolve",
        note: "Spoke on Monday call",
        trainerUserId,
        createdAt: body.data.resolvedAt,
      });
    }
    const newInterventions = after.interventions.filter(
      (a) => !before.interventions.some((b) => b.id === a.id),
    );
    expect(newInterventions.filter((i) => i.kind === "resolve")).toHaveLength(4);
    expect(newInterventions.filter((i) => i.kind === "note")).toHaveLength(4);
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

  it("without a note writes only the resolve intervention per item", async () => {
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
    expect(after.interventions.map((i) => i.kind).sort()).toEqual(["resolve", "resolve"]);
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
