import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { meResponseSchema, relationshipListResponseSchema } from "@fitbud/contracts";
import { setTestDbOverride } from "../db/client.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import {
  DEMO_TRAINEE,
  DEMO_TRAINER,
  describeTrips,
  installRoundTripCounter,
  loginHeaders,
  measureRequest,
  type RoundTripCounter,
} from "../test-support/query-count.js";

/**
 * Z14-28: the mobile cold-start reads, GET /me and GET /relationships, answer
 * in at most two D1 round trips including auth, flat in the list size.
 * Before/after table: docs/qa/Z14-28/query-counts.md.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";

describe("cold start reads: D1 round trips (Z14-28)", () => {
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

  const personas = [
    ["trainer", DEMO_TRAINER],
    ["trainee", DEMO_TRAINEE],
  ] as const;

  for (const [role, who] of personas) {
    it(`GET /me (${role}) takes at most 2 round trips`, async () => {
      const headers = await loginHeaders(who, role);
      const run = await measureRequest(counter, "/me", { headers });
      expect(run.status).toBe(200);
      const me = meResponseSchema.parse((run.body as { data: unknown }).data);
      expect(me.email).toBe(who);
      if (role === "trainer") expect(me.trainerProfile?.displayName).toBeTruthy();
      expect(run.roundTrips, describeTrips(run.trips)).toBeLessThanOrEqual(2);
    });

    it(`GET /relationships?limit=50 (${role}) takes at most 2 round trips`, async () => {
      const headers = await loginHeaders(who, role);
      const run = await measureRequest(counter, "/relationships?limit=50", { headers });
      expect(run.status).toBe(200);
      const list = relationshipListResponseSchema.parse((run.body as { data: unknown }).data);
      expect(list.items.length).toBeGreaterThan(0);
      expect(run.roundTrips, describeTrips(run.trips)).toBeLessThanOrEqual(2);
    });
  }

  it("GET /relationships is flat in the page size (trainer)", async () => {
    const headers = await loginHeaders(DEMO_TRAINER, "trainer");
    const small = await measureRequest(counter, "/relationships?limit=1", { headers });
    const large = await measureRequest(counter, "/relationships?limit=50", { headers });
    expect(small.status).toBe(200);
    expect(large.status).toBe(200);
    const smallItems = (small.body as { data: { items: unknown[] } }).data.items;
    const largeItems = (large.body as { data: { items: unknown[] } }).data.items;
    expect(largeItems.length).toBeGreaterThan(smallItems.length);
    expect(large.roundTrips, describeTrips(large.trips)).toBe(small.roundTrips);
  });
});
