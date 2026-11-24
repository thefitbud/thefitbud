import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { schema, setTestDbOverride } from "../db/client.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import { installRoundTripCounter, type RoundTripCounter } from "../test-support/query-count.js";
import { handleScheduledExceptionEvaluation } from "./exception-evaluation.js";
import type { Env } from "../types.js";

/**
 * Z14-1 / D-W14-8: the 5-minute cron evaluates clients due for evaluation, so
 * exceptions from time passing are stored with no trainer reading Needs you.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";
const env = { DB: {} as D1Database } as Env;

describe("cron.exception_evaluation (Z14-1)", () => {
  let handle: MemoryDbHandle;
  let counter: RoundTripCounter;

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    counter = installRoundTripCounter(handle);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  async function activeIds(): Promise<string[]> {
    const rows = await handle.db
      .select({ id: schema.coachingRelationships.id })
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.status, "active"));
    return rows.map((row) => row.id);
  }

  async function openCount(ids: string[]): Promise<number> {
    const rows = await handle.db
      .select({ id: schema.exceptions.id })
      .from(schema.exceptions)
      .where(
        and(
          inArray(schema.exceptions.coachingRelationshipId, ids),
          inArray(schema.exceptions.status, ["detected", "active", "acknowledged"]),
        ),
      );
    return rows.length;
  }

  it("stores due exceptions for every active client without any read, in a fixed number of round trips", async () => {
    const ids = await activeIds();
    const before = await openCount(ids);
    const resolvedBefore = (
      await handle.db
        .select({ id: schema.exceptions.id })
        .from(schema.exceptions)
        .where(eq(schema.exceptions.status, "resolved"))
    ).length;

    const counts = await handleScheduledExceptionEvaluation(env, new Date(NOW));
    expect(counts).toEqual({
      relationshipsChecked: ids.length,
      relationshipsEvaluated: ids.length,
      pagesFailed: 0,
    });
    expect(await openCount(ids)).toBeGreaterThan(before);
    // Every active client now has a last-evaluated time.
    const markers = await handle.db
      .select({ id: schema.scheduledJobs.domainEntityId })
      .from(schema.scheduledJobs)
      .where(eq(schema.scheduledJobs.jobType, "exception_evaluation"));
    expect(new Set(markers.map((m) => m.id))).toEqual(new Set(ids));
    // Only the trainer resolves.
    const resolvedAfter = (
      await handle.db
        .select({ id: schema.exceptions.id })
        .from(schema.exceptions)
        .where(eq(schema.exceptions.status, "resolved"))
    ).length;
    expect(resolvedAfter).toBe(resolvedBefore);
  });

  it("skips clients evaluated in the last 15 minutes and picks them up after", async () => {
    await handleScheduledExceptionEvaluation(env, new Date(NOW));

    counter.reset();
    const fiveMinutes = await handleScheduledExceptionEvaluation(
      env,
      new Date(Date.parse(NOW) + 5 * 60_000),
    );
    expect(fiveMinutes.relationshipsEvaluated).toBe(0);
    // One page read, no evaluation.
    expect(counter.trips).toHaveLength(1);

    const sixteenMinutes = await handleScheduledExceptionEvaluation(
      env,
      new Date(Date.parse(NOW) + 16 * 60_000),
    );
    expect(sixteenMinutes.relationshipsEvaluated).toBe(fiveMinutes.relationshipsChecked);
  });

  it("never evaluates an ended client", async () => {
    const [ended] = await activeIds();
    await handle.db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt: SEED, updatedAt: SEED })
      .where(eq(schema.coachingRelationships.id, ended!));
    const before = await openCount([ended!]);
    await handleScheduledExceptionEvaluation(env, new Date(NOW));
    expect(await openCount([ended!])).toBe(before);
    const [marker] = await handle.db
      .select({ id: schema.scheduledJobs.id })
      .from(schema.scheduledJobs)
      .where(eq(schema.scheduledJobs.domainEntityId, ended!));
    expect(marker).toBeUndefined();
  });
});
