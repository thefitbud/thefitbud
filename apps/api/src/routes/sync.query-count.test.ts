import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { formatLocalDate } from "@fitbud/core";
import { schema, setTestDbOverride } from "../db/client.js";
import { exceptionEvaluationDedupeKey } from "../domain/exceptions.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import {
  DEMO_TRAINEE,
  installRoundTripCounter,
  loginHeaders,
  measureRequest,
  type RoundTripCounter,
} from "../test-support/query-count.js";

/**
 * Z14-1: sync push resolves the actor once for the whole push and applies each
 * mutation in-process through its REST handler (no per-mutation Firebase check
 * or identity read). Dedupe, idempotency and per-mutation verdicts unchanged.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";
const MISSING_ASSIGNMENT = "00000000-0000-4000-8000-00000000dead";

/** The one-query identity read (auth/identity.ts) for a bearer token. */
const isIdentityRead = (sql: string) => /"users"\."firebase_uid" = \?/.test(sql);

describe("POST /sync/push in-process dispatch (Z14-1)", () => {
  let handle: MemoryDbHandle;
  let counter: RoundTripCounter;
  let headers: Record<string, string>;
  let relationshipId: string;
  let mealIds: string[];

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    counter = installRoundTripCounter(handle);
    headers = await loginHeaders(DEMO_TRAINEE, "trainee");

    const [rel] = await handle.db
      .select({ id: schema.coachingRelationships.id })
      .from(schema.coachingRelationships)
      .innerJoin(
        schema.userIdentities,
        eq(schema.userIdentities.userId, schema.coachingRelationships.traineeUserId),
      )
      .where(
        and(
          eq(schema.userIdentities.emailNorm, DEMO_TRAINEE),
          eq(schema.coachingRelationships.status, "active"),
        ),
      )
      .limit(1);
    relationshipId = rel!.id;
    const today = formatLocalDate(new Date(NOW), "Asia/Kolkata");
    // Today's meals the trainee has not logged yet.
    const open = await handle.db
      .select({ id: schema.mealAssignments.id })
      .from(schema.mealAssignments)
      .leftJoin(
        schema.mealCompliance,
        eq(schema.mealCompliance.assignmentId, schema.mealAssignments.id),
      )
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
          eq(schema.mealAssignments.localDate, today),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          isNull(schema.mealCompliance.id),
        ),
      );
    mealIds = open.map((row) => row.id);
    expect(mealIds.length, "demo trainee has unlogged meals today").toBeGreaterThanOrEqual(2);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  function confirm(assignmentId: string, n: number) {
    const id = `00000000-0000-4000-8000-${String(900000000000 + n)}`;
    return {
      mutationId: id,
      idempotencyKey: id,
      entityType: "meal_compliance",
      recordId: id,
      operation: "meal.confirm",
      clientOccurredAt: NOW,
      payload: { assignmentId, body: {} },
    };
  }

  function push(mutations: unknown[]) {
    return measureRequest(counter, "/sync/push", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ mutations }),
    });
  }

  it("resolves the actor once for a mixed push and keeps per-mutation verdicts", async () => {
    const mutations = [
      confirm(mealIds[0]!, 1),
      confirm(mealIds[1]!, 2),
      confirm(MISSING_ASSIGNMENT, 3),
    ];
    const run = await push(mutations);
    expect(run.status).toBe(200);
    const results = (run.body as { data: { results: Array<{ status: string }> } }).data.results;
    expect(results.map((r) => r.status)).toEqual(["applied", "applied", "rejected"]);

    const identityReads = run.trips.flatMap((t) => t.sql).filter(isIdentityRead);
    expect(identityReads).toHaveLength(1);

    const logged = await handle.db
      .select({ assignmentId: schema.mealCompliance.assignmentId })
      .from(schema.mealCompliance)
      .where(inArray(schema.mealCompliance.assignmentId, mealIds.slice(0, 2)));
    expect(logged).toHaveLength(2);

    // The relationship's exceptions were evaluated once, after the writes.
    const [marker] = await handle.db
      .select({ updatedAt: schema.scheduledJobs.updatedAt })
      .from(schema.scheduledJobs)
      .where(eq(schema.scheduledJobs.dedupeKey, exceptionEvaluationDedupeKey(relationshipId)));
    expect(marker?.updatedAt).toBeDefined();
  });

  it("answers a replayed push from stored verdicts without dispatching again", async () => {
    const mutations = [confirm(mealIds[0]!, 11), confirm(MISSING_ASSIGNMENT, 12)];
    const first = await push(mutations);
    expect(first.status).toBe(200);

    const again = await push(mutations);
    const results = (again.body as { data: { results: Array<{ status: string }> } }).data.results;
    // Applied stays applied (never re-dispatched); a refusal is processed again (Z12-41).
    expect(results.map((r) => r.status)).toEqual(["already_applied", "rejected"]);
    expect(again.trips.flatMap((t) => t.sql).filter(isIdentityRead)).toHaveLength(1);

    const logged = await handle.db
      .select({ id: schema.mealCompliance.id })
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, mealIds[0]!));
    expect(logged).toHaveLength(1);
  });

  it("refuses an in-process route a push never reaches without a valid token", async () => {
    const run = await measureRequest(counter, "/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fitbud-role": "trainee" },
      body: JSON.stringify({ mutations: [confirm(mealIds[0]!, 21)] }),
    });
    expect(run.status).toBe(401);
  });
});
