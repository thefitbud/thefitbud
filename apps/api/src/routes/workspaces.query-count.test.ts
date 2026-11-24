import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import { schema, setTestDbOverride } from "../db/client.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import {
  createDemoSeededDb,
  prepareDemoSeededDb,
} from "../test-support/seeded-db.js";
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
 * Z14-1: the workspace, week and history reads answer in a fixed number of D1
 * round trips that does not grow with the client's history.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";

type Body = { data: Record<string, unknown> };

describe("trainer client reads: flat D1 round trips (Z14-1)", () => {
  let handle: MemoryDbHandle;
  let counter: RoundTripCounter;
  let headers: Record<string, string>;
  let relationshipId: string;

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    counter = installRoundTripCounter(handle);
    headers = await loginHeaders(DEMO_TRAINER, "trainer");
    const [rel] = await handle.db
      .select({ id: schema.coachingRelationships.id })
      .from(schema.coachingRelationships)
      .innerJoin(
        schema.userIdentities,
        eq(
          schema.userIdentities.userId,
          schema.coachingRelationships.traineeUserId,
        ),
      )
      .where(
        and(
          eq(schema.userIdentities.emailNorm, DEMO_TRAINEE),
          eq(schema.coachingRelationships.status, "active"),
        ),
      )
      .limit(1);
    if (!rel)
      throw new Error("demo seed has no relationship for the demo trainee");
    relationshipId = rel.id;
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  /** Copies the client's measurements and progress entries `times` over with new ids. */
  async function addHistory(times: number) {
    const measurements = await handle.db
      .select()
      .from(schema.measurements)
      .where(eq(schema.measurements.coachingRelationshipId, relationshipId));
    const entries = await handle.db
      .select()
      .from(schema.progressEntries)
      .where(eq(schema.progressEntries.coachingRelationshipId, relationshipId));
    expect(measurements.length + entries.length).toBeGreaterThan(0);
    for (let i = 0; i < times; i += 1) {
      for (const row of measurements) {
        await handle.db
          .insert(schema.measurements)
          .values({ ...row, id: crypto.randomUUID() });
      }
      for (const row of entries) {
        await handle.db
          .insert(schema.progressEntries)
          .values({ ...row, id: crypto.randomUUID() });
      }
    }
  }

  async function history() {
    const run = await measureRequest(
      counter,
      `/history/relationships/${relationshipId}?limit=50`,
      { headers },
    );
    expect(run.status).toBe(200);
    const items = (run.body as { data: { items: unknown[] } }).data.items;
    return {
      trips: run.roundTrips,
      items: items.length,
      described: describeTrips(run.trips),
    };
  }

  it("history is 3 round trips and does not grow with more history", async () => {
    const before = await history();
    expect(before.trips, before.described).toBeLessThanOrEqual(3);
    await addHistory(3);
    const after = await history();
    expect(after.trips).toBe(before.trips);
  });

  it("history keeps the joined sources' own fields (workout, meal, plan version)", async () => {
    const rels = await handle.db
      .select({ id: schema.coachingRelationships.id })
      .from(schema.coachingRelationships);
    const seen = new Set<string>();
    for (const rel of rels) {
      for (const kind of [
        "workout_execution",
        "meal_compliance",
        "plan_version",
      ]) {
        const run = await measureRequest(
          counter,
          `/history/relationships/${rel.id}?limit=50&kind=${kind}`,
          { headers },
        );
        if (run.status !== 200) continue;
        const items = (
          run.body as {
            data: {
              items: Array<{ kind: string; title: string; occurredAt: string }>;
            };
          }
        ).data.items;
        for (const item of items) {
          if (
            !["workout_execution", "meal_compliance", "plan_version"].includes(
              item.kind,
            )
          )
            continue;
          seen.add(item.kind);
          expect(item.title.length, `${item.kind} title`).toBeGreaterThan(0);
          expect(item.title, `${item.kind} title`).not.toBe("undefined");
          expect(
            Number.isNaN(Date.parse(item.occurredAt)),
            `${item.kind} date`,
          ).toBe(false);
        }
      }
    }
    expect([...seen].sort()).toEqual([
      "meal_compliance",
      "plan_version",
      "workout_execution",
    ]);
  });

  it("workspace is 3 round trips and does not grow with more history", async () => {
    const path = `/workspaces/relationships/${relationshipId}`;
    const before = await measureRequest(counter, path, { headers });
    expect(before.status).toBe(200);
    expect(before.roundTrips, describeTrips(before.trips)).toBeLessThanOrEqual(
      3,
    );
    await addHistory(3);
    const after = await measureRequest(counter, path, { headers });
    expect(after.status).toBe(200);
    expect(after.roundTrips).toBe(before.roundTrips);
  });

  it("week is 3 round trips", async () => {
    const run = await measureRequest(
      counter,
      `/workspaces/relationships/${relationshipId}/week`,
      { headers },
    );
    expect(run.status).toBe(200);
    expect(run.roundTrips, describeTrips(run.trips)).toBeLessThanOrEqual(3);
    expect((run.body as Body).data.days).toHaveLength(7);
  });

  it("an unknown or foreign relationship is still a 404 on all three reads", async () => {
    for (const path of [
      "/workspaces/relationships/missing-id",
      "/workspaces/relationships/missing-id/week",
      "/history/relationships/missing-id",
    ]) {
      const run = await measureRequest(counter, path, { headers });
      expect(run.status, path).toBe(404);
    }
  });
});
