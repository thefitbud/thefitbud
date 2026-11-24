import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDaysToLocalDate, formatLocalDate } from "@fitbud/core";
import { setTestDbOverride } from "../db/client.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import {
  DEMO_TRAINEE,
  describeTrips,
  installRoundTripCounter,
  loginHeaders,
  measureRequest,
  type RoundTripCounter,
} from "../test-support/query-count.js";

/**
 * Z14-1: the trainee's Today and week reads answer in a fixed number of D1
 * round trips (auth included), whatever the number of assignments and logs.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";
const TZ = "Asia/Kolkata";

describe("GET /me/day and /me/week: D1 round trips (Z14-1)", () => {
  let handle: MemoryDbHandle;
  let counter: RoundTripCounter;
  let headers: Record<string, string>;

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    counter = installRoundTripCounter(handle);
    headers = await loginHeaders(DEMO_TRAINEE, "trainee");
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  it("/me/day/:date takes at most 3 round trips on days with and without data", async () => {
    const today = formatLocalDate(new Date(NOW), TZ);
    let withData = 0;
    for (const offset of [-7, -3, -1, 0, 1, 14]) {
      const date = addDaysToLocalDate(today, offset);
      const run = await measureRequest(counter, `/me/day/${date}`, { headers });
      expect(run.status, date).toBe(200);
      expect(run.roundTrips, describeTrips(run.trips)).toBeLessThanOrEqual(3);
      const body = run.body as {
        data: { assignments: { meals: unknown[] }; logs: { meals: number } };
      };
      if (body.data.assignments.meals.length > 0) withData += 1;
    }
    expect(withData).toBeGreaterThan(0);
  });


  it("/me/week takes at most 3 round trips for this, past and future weeks", async () => {
    for (const start of ["", "?start=2026-10-12", "?start=2026-11-09"]) {
      const run = await measureRequest(counter, `/me/week${start}`, { headers });
      expect(run.status, start).toBe(200);
      expect(run.roundTrips, describeTrips(run.trips)).toBeLessThanOrEqual(3);
    }
    const current = await measureRequest(counter, "/me/week", { headers });
    const week = (current.body as { data: { days: Array<{ mealsAssigned: number }> } }).data;
    expect(week.days).toHaveLength(7);
    expect(week.days.some((d) => d.mealsAssigned > 0)).toBe(true);
  });

  it("returns a weak ETag and answers 304 when it still matches, 200 after a change", async () => {
    const today = formatLocalDate(new Date(NOW), TZ);
    for (const path of [`/me/day/${today}`, "/me/week"]) {
      const first = await measureRequest(counter, path, { headers });
      expect(first.status).toBe(200);
      const etag = first.headers.get("etag");
      expect(etag, path).toMatch(/^W\/"[0-9a-f]{32}"$/);
      expect(first.headers.get("cache-control")).toBe("private, no-cache");

      const again = await measureRequest(counter, path, {
        headers: { ...headers, "If-None-Match": etag! },
      });
      expect(again.status, path).toBe(304);
      expect(again.body).toBe("");

      const stale = await measureRequest(counter, path, {
        headers: { ...headers, "If-None-Match": 'W/"0000"' },
      });
      expect(stale.status).toBe(200);
      expect(stale.body).toEqual(first.body);
    }
  });
});
