import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema, setTestDbOverride } from "../db/client.js";
import { createId } from "../lib/crypto.js";
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
 * Z14-1 (Diagnosis #15): the trainer's check-in inbox and a client's coach
 * notes answer in the same number of D1 round trips however many check-ins or
 * notes there are (no per-item reads).
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";

describe("check-in inbox and coach notes: flat round trips (Z14-1)", () => {
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
    headers = await loginHeaders(DEMO_TRAINER, "trainer");
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  async function trainerRelationships(): Promise<Array<{ id: string; trainerUserId: string }>> {
    const [trainer] = await handle.db
      .select({ userId: schema.userIdentities.userId })
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.emailNorm, DEMO_TRAINER));
    return handle.db
      .select({
        id: schema.coachingRelationships.id,
        trainerUserId: schema.coachingRelationships.trainerUserId,
      })
      .from(schema.coachingRelationships)
      .where(
        and(
          eq(schema.coachingRelationships.trainerUserId, trainer!.userId),
          eq(schema.coachingRelationships.status, "active"),
        ),
      );
  }

  it("GET /checkins/inbox takes the same round trips with many more submitted check-ins", async () => {
    const baseline = await measureRequest(counter, "/checkins/inbox", { headers });
    expect(baseline.status).toBe(200);
    const baseItems = (baseline.body as { data: { items: unknown[] } }).data.items.length;

    // Three more submitted check-ins for each active client that has one, on
    // earlier dates (one check-in per client per day), copied from that
    // client's own submitted check-in.
    const rels = await trainerRelationships();
    const [info] = handle.sqlite.exec("SELECT name FROM pragma_table_info('checkins')");
    const columns = (info?.values ?? []).map((row) => String(row[0]));
    expect(columns.length).toBeGreaterThan(0);
    for (const rel of rels) {
      for (const days of [37, 44, 51]) {
        const select = columns
          .map((column) => {
            if (column === "id") return "?";
            if (column === "local_date") return `date(local_date, '-${days} days')`;
            if (column === "window_starts_at" || column === "window_ends_at" || column === "submitted_at") {
              return `strftime('%Y-%m-%dT%H:%M:%fZ', "${column}", '-${days} days')`;
            }
            return `"${column}"`;
          })
          .join(", ");
        handle.sqlite.run(
          `INSERT INTO checkins (${columns.map((c) => `"${c}"`).join(", ")})
           SELECT ${select} FROM checkins
           WHERE coaching_relationship_id = ? AND record_status = 'submitted'
           ORDER BY local_date DESC LIMIT 1`,
          [createId(), rel.id],
        );
      }
    }

    const grown = await measureRequest(counter, "/checkins/inbox", { headers });
    expect(grown.status).toBe(200);
    const grownItems = (grown.body as { data: { items: unknown[] } }).data.items.length;
    expect(grownItems).toBeGreaterThan(baseItems);
    expect(grown.roundTrips, describeTrips(grown.trips)).toBe(baseline.roundTrips);
    expect(grown.roundTrips).toBeLessThanOrEqual(2);
  });

  it("GET /checkins/relationships/:id/notes takes the same round trips with many more notes", async () => {
    const [rel] = await handle.db
      .select({
        id: schema.coachingRelationships.id,
        trainerUserId: schema.coachingRelationships.trainerUserId,
      })
      .from(schema.coachingRelationships)
      .innerJoin(
        schema.userIdentities,
        eq(schema.userIdentities.userId, schema.coachingRelationships.traineeUserId),
      )
      .where(eq(schema.userIdentities.emailNorm, DEMO_TRAINEE))
      .limit(1);
    const path = `/checkins/relationships/${rel!.id}/notes`;
    const baseline = await measureRequest(counter, path, { headers });
    expect(baseline.status).toBe(200);
    const baseItems = (baseline.body as { data: { items: unknown[] } }).data.items.length;

    for (let i = 0; i < 25; i += 1) {
      const at = new Date(Date.parse(SEED) - i * 3_600_000).toISOString();
      await handle.db.insert(schema.trainerNotes).values({
        id: createId(),
        coachingRelationshipId: rel!.id,
        trainerUserId: rel!.trainerUserId,
        checkinId: null,
        body: `Hit protein most days this week (${i + 1}).`,
        visibility: i % 3 === 0 ? "client" : "private",
        createdAt: at,
        updatedAt: at,
      });
    }

    const grown = await measureRequest(counter, path, { headers });
    expect(grown.status).toBe(200);
    expect((grown.body as { data: { items: unknown[] } }).data.items).toHaveLength(baseItems + 25);
    expect(grown.roundTrips, describeTrips(grown.trips)).toBe(baseline.roundTrips);
    expect(grown.roundTrips).toBeLessThanOrEqual(2);
  });
});
