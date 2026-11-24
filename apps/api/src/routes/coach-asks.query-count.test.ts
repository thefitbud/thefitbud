import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema, setTestDbOverride } from "../db/client.js";
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
 * Z14-1: the coach-ask list, the trainer activity feed and the responsiveness
 * read cost a fixed number of D1 round trips however many asks, feed items or
 * days there are. Auth is included in each count.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";

describe("coach asks, activity feed and responsiveness: flat round trips (Z14-1)", () => {
  let handle: MemoryDbHandle;
  let counter: RoundTripCounter;
  let trainer: Record<string, string>;
  let trainee: Record<string, string>;
  let relationshipId: string;
  let traineeUserId: string;

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    counter = installRoundTripCounter(handle);
    trainer = await loginHeaders(DEMO_TRAINER, "trainer");
    trainee = await loginHeaders(DEMO_TRAINEE, "trainee");
    const [rel] = await handle.db
      .select({
        id: schema.coachingRelationships.id,
        traineeUserId: schema.coachingRelationships.traineeUserId,
      })
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
    if (!rel) throw new Error("demo seed has no relationship for the demo trainee");
    relationshipId = rel.id;
    traineeUserId = rel.traineeUserId;
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  async function addAsks(count: number) {
    const meals = await handle.db
      .select({ id: schema.mealAssignments.id })
      .from(schema.mealAssignments)
      .where(eq(schema.mealAssignments.coachingRelationshipId, relationshipId))
      .limit(count);
    expect(meals.length).toBeGreaterThan(0);
    const note = await handle.db.select({ id: schema.trainerNotes.id }).from(schema.trainerNotes).limit(1);
    for (let i = 0; i < count; i += 1) {
      const at = new Date(Date.parse(NOW) - (i + 1) * 60_000).toISOString();
      await handle.db.insert(schema.coachAsks).values({
        id: crypto.randomUUID(),
        relationshipId,
        traineeUserId,
        itemType: "meal_assignment",
        itemId: meals[i % meals.length]!.id,
        topic: "swap",
        askedAt: at,
        lastAskedAt: at,
        askCount: 1,
        status: "open",
        answeredAt: null,
        answeredBy: null,
        trainerNoteId: i % 2 === 0 ? (note[0]?.id ?? null) : null,
      });
    }
  }

  async function trips(path: string, headers: Record<string, string>) {
    const run = await measureRequest(counter, path, { headers });
    expect(run.status, JSON.stringify(run.body).slice(0, 300)).toBe(200);
    return run;
  }

  it("coach asks: trainer and trainee lists do not grow with the number of asks", async () => {
    const before = {
      trainer: await trips("/coach-asks?status=open", trainer),
      trainee: await trips("/coach-asks", trainee),
    };
    await addAsks(12);
    const after = {
      trainer: await trips("/coach-asks?status=open", trainer),
      trainee: await trips("/coach-asks", trainee),
    };
    const items = (after.trainer.body as { data: { items: unknown[] } }).data.items;
    expect(items.length).toBeGreaterThanOrEqual(12);
    for (const key of ["trainer", "trainee"] as const) {
      expect(after[key].roundTrips, describeTrips(after[key].trips)).toBe(before[key].roundTrips);
      expect(after[key].roundTrips, describeTrips(after[key].trips)).toBeLessThanOrEqual(3);
    }
  });

  it("activity feed: more asks in the feed keep the same round trips", async () => {
    const before = await trips("/activity/feed", trainer);
    await addAsks(12);
    const after = await trips("/activity/feed", trainer);
    const events = (after.body as { data: { events: Array<{ type: string }> } }).data.events;
    expect(events.filter((e) => e.type === "coach_ask").length).toBeGreaterThan(0);
    expect(after.roundTrips, describeTrips(after.trips)).toBe(before.roundTrips);
    expect(after.roundTrips, describeTrips(after.trips)).toBeLessThanOrEqual(4);
  });

  it("responsiveness: a longer window keeps the same round trips", async () => {
    const short = await trips(`/notifications/relationships/${relationshipId}/responsiveness?days=1`, trainer);
    const long = await trips(`/notifications/relationships/${relationshipId}/responsiveness?days=90`, trainer);
    expect(long.roundTrips, describeTrips(long.trips)).toBe(short.roundTrips);
    expect(long.roundTrips, describeTrips(long.trips)).toBeLessThanOrEqual(3);
  });

  it("responsiveness: another trainer's relationship is still not found", async () => {
    const other = await loginHeaders("priya.coach@demo.fitbud.test", "trainer");
    const run = await measureRequest(
      counter,
      `/notifications/relationships/${relationshipId}/responsiveness?days=14`,
      { headers: other },
    );
    expect(run.status).toBe(404);
  });
});
