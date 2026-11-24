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
 * Z14-20 (D-W14-26): `GET /coach-asks` reads one cursor page at a time per
 * status when asked (`limit`, `cursor`), and answers exactly as before
 * (every ask, no `nextCursor`) when not.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";
const SECOND_TRAINER = "priya.coach@demo.fitbud.test";

type Ask = {
  id: string;
  status: string;
  lastAskedAt: string;
  relationshipId: string;
  itemLabel?: string | null;
};
type AskList = { items: Ask[]; nextCursor?: string | null };

describe("coach asks: cursor pages per status (Z14-20)", () => {
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

  /**
   * `count` asks on the demo trainee's planned meals: two in three open, one
   * answered. Pairs share `lastAskedAt`, so the `id` tie-breaker is used.
   */
  async function addAsks(count: number, startMs = Date.parse(NOW) - 60_000) {
    const meals = await handle.db
      .select({ id: schema.mealAssignments.id })
      .from(schema.mealAssignments)
      .where(eq(schema.mealAssignments.coachingRelationshipId, relationshipId))
      .limit(count);
    expect(meals.length).toBeGreaterThan(0);
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const at = new Date(startMs - Math.floor(i / 2) * 60_000).toISOString();
      const answered = i % 3 === 2;
      const id = crypto.randomUUID();
      ids.push(id);
      await handle.db.insert(schema.coachAsks).values({
        id,
        relationshipId,
        traineeUserId,
        itemType: "meal_assignment",
        itemId: meals[i % meals.length]!.id,
        topic: "swap",
        askedAt: at,
        lastAskedAt: at,
        askCount: 1,
        status: answered ? "answered" : "open",
        answeredAt: answered ? at : null,
        answeredBy: null,
        trainerNoteId: null,
      });
    }
    return ids;
  }

  async function get(path: string, headers = trainer) {
    const run = await measureRequest(counter, path, { headers });
    return run as typeof run & {
      body: { data: AskList; error?: { code: string; message: string } };
    };
  }

  async function list(path: string, headers = trainer): Promise<AskList> {
    const run = await get(path, headers);
    expect(run.status, JSON.stringify(run.body).slice(0, 300)).toBe(200);
    return run.body.data;
  }

  async function walk(path: string, headers = trainer): Promise<AskList[]> {
    const pages: AskList[] = [];
    let cursor: string | null | undefined = null;
    do {
      const next: AskList = await list(
        cursor ? `${path}&cursor=${encodeURIComponent(cursor)}` : path,
        headers,
      );
      pages.push(next);
      cursor = next.nextCursor;
      expect(pages.length).toBeLessThan(100);
    } while (cursor);
    return pages;
  }

  it("without limit the list is unchanged (every ask, no nextCursor key)", async () => {
    await addAsks(60);
    for (const path of ["/coach-asks", "/coach-asks?status=open", "/coach-asks?status=answered"]) {
      const run = await get(path);
      expect(run.status).toBe(200);
      expect(Object.keys(run.body.data)).toEqual(["items"]);
    }
  });

  it("pages per status hold exactly that status's asks, newest first, no duplicates", async () => {
    await addAsks(60);
    for (const [status, headers] of [
      ["open", trainer],
      ["answered", trainer],
      ["open", trainee],
    ] as const) {
      const whole = await list(`/coach-asks?status=${status}`, headers);
      expect(whole.items.length, status).toBeGreaterThan(15);
      const pages = await walk(`/coach-asks?status=${status}&limit=8`, headers);
      expect(pages.length).toBeGreaterThan(2);
      for (const p of pages.slice(0, -1)) {
        expect(p.items).toHaveLength(8);
        expect(p.nextCursor).toEqual(expect.any(String));
      }
      expect(pages[pages.length - 1]!.nextCursor).toBeNull();
      const items = pages.flatMap((p) => p.items);
      expect(items.every((ask) => ask.status === status)).toBe(true);
      expect(new Set(items.map((a) => a.id)).size).toBe(items.length);
      expect(items.map((a) => a.id).sort()).toEqual(whole.items.map((a) => a.id).sort());
      // Same bodies (labels included) as the unpaged read.
      const byId = new Map(whole.items.map((a) => [a.id, a]));
      for (const ask of items) expect(ask).toEqual(byId.get(ask.id));
      expect(items.every((ask) => ask.itemLabel)).toBe(true);
      const keys = items.map((a) => `${a.lastAskedAt}|${a.id}`);
      expect(keys).toEqual([...keys].sort().reverse());
    }
  });

  it("page size: 500 reads at most 50 with a cursor; 0 and negatives read 1; abc reads 30", async () => {
    // 120 asks: 80 open, so more than one 50-row page.
    await addAsks(120);
    for (const headers of [trainer, trainee]) {
      const big = await list("/coach-asks?status=open&limit=500", headers);
      expect(big.items).toHaveLength(50);
      expect(big.nextCursor).toEqual(expect.any(String));
      for (const tiny of ["0", "-3"]) {
        const one = await list(`/coach-asks?status=open&limit=${tiny}`, headers);
        expect(one.items, tiny).toHaveLength(1);
        expect(one.nextCursor).toEqual(expect.any(String));
      }
      const fallback = await list("/coach-asks?status=open&limit=abc", headers);
      expect(fallback.items).toHaveLength(30);
      expect(fallback.nextCursor).toEqual(expect.any(String));
      const next = await list(
        `/coach-asks?status=open&cursor=${encodeURIComponent(fallback.nextCursor!)}`,
        headers,
      );
      expect(next.items).toHaveLength(30);
    }
  });

  it("an ask added between pages causes no duplicate and no gap", async () => {
    await addAsks(30);
    const original = (await list("/coach-asks?status=open")).items.map((a) => a.id);
    const first = await list("/coach-asks?status=open&limit=6");
    const [newer] = await addAsks(1, Date.parse(NOW));
    const [older] = await addAsks(1, Date.parse("2025-01-01T00:00:00.000Z"));
    const rest: Ask[] = [];
    let cursor = first.nextCursor;
    while (cursor) {
      const next = await list(`/coach-asks?status=open&limit=6&cursor=${encodeURIComponent(cursor)}`);
      rest.push(...next.items);
      cursor = next.nextCursor;
    }
    const seen = [...first.items, ...rest].map((a) => a.id);
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of original) expect(seen).toContain(id);
    expect(seen).not.toContain(newer);
    expect(seen).toContain(older);
  });

  it("a bad or tampered cursor gets the friendly 400", async () => {
    for (const cursor of [
      "not-a-cursor",
      btoa(JSON.stringify({ k: "2026-10-01T00:00:00.000Z", id: "x" })),
      btoa(JSON.stringify({ k: JSON.stringify(["a", "b"]), id: "x" })),
    ]) {
      const run = await get(`/coach-asks?status=open&limit=5&cursor=${encodeURIComponent(cursor)}`);
      expect(run.status, cursor).toBe(400);
      expect(run.body.error).toMatchObject({ code: "INVALID_CURSOR", message: "Cursor is not valid." });
    }
  });

  it("one page costs the same round trips with 60 more asks", async () => {
    const paths = ["/coach-asks?status=open&limit=30", "/coach-asks?status=answered&limit=30"];
    const before = [];
    for (const path of paths) before.push(await get(path));
    await addAsks(60);
    for (const [index, path] of paths.entries()) {
      const after = await get(path);
      expect(after.status).toBe(200);
      expect(after.roundTrips, describeTrips(after.trips)).toBe(before[index]!.roundTrips);
      expect(after.roundTrips, describeTrips(after.trips)).toBeLessThanOrEqual(3);
    }
    const first = await list(paths[0]!);
    expect(first.items).toHaveLength(30);
    const middle = await get(`${paths[0]}&cursor=${encodeURIComponent(first.nextCursor!)}`);
    expect(middle.roundTrips).toBe(before[0]!.roundTrips);
  });

  it("another trainer's pages never hold this trainer's asks", async () => {
    const added = new Set(await addAsks(20));
    const other = await loginHeaders(SECOND_TRAINER, "trainer");
    const theirs = (await walk("/coach-asks?status=open&limit=10", other)).flatMap((p) => p.items);
    expect(theirs.some((ask) => added.has(ask.id) || ask.relationshipId === relationshipId)).toBe(false);
  });
});
