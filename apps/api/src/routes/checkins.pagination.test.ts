import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
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
 * Z14-20 (D-W14-26): the trainer's check-in inbox and a client's coach notes
 * read one cursor page at a time when asked (`limit`, `cursor`, inbox
 * `segment`), and answer exactly as before when not.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";
const SECOND_TRAINER = "priya.coach@demo.fitbud.test";

type InboxItem = {
  checkin: {
    id: string;
    localDate: string;
    status: string;
    submittedAt: string | null;
    review: { createdAt: string } | null;
  };
  coachingRelationshipId: string;
};
type Page<T> = { items: T[]; nextCursor: string | null };
type Note = { id: string; createdAt: string; coachingRelationshipId: string };

describe("check-in inbox and coach notes: cursor pages (Z14-20)", () => {
  let handle: MemoryDbHandle;
  let counter: RoundTripCounter;
  let trainer: Record<string, string>;

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    counter = installRoundTripCounter(handle);
    trainer = await loginHeaders(DEMO_TRAINER, "trainer");
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  async function get<T>(path: string, headers = trainer) {
    const run = await measureRequest(counter, path, { headers });
    return run as typeof run & { body: { data: T; error?: { code: string; message: string } } };
  }

  async function page<T>(path: string): Promise<Page<T>> {
    const run = await get<Page<T>>(path);
    expect(run.status, JSON.stringify(run.body).slice(0, 300)).toBe(200);
    return run.body.data;
  }

  /** Follows nextCursor to the end; returns every page. */
  async function walk<T>(path: string): Promise<Array<Page<T>>> {
    const pages: Array<Page<T>> = [];
    let cursor: string | null = null;
    const join = path.includes("?") ? "&" : "?";
    do {
      const next: Page<T> = await page<T>(
        cursor ? `${path}${join}cursor=${encodeURIComponent(cursor)}` : path,
      );
      pages.push(next);
      cursor = next.nextCursor;
      expect(pages.length).toBeLessThan(100);
    } while (cursor);
    return pages;
  }

  async function trainerRelationships() {
    const [me] = await handle.db
      .select({ userId: schema.userIdentities.userId })
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.emailNorm, DEMO_TRAINER));
    return handle.db
      .select({
        id: schema.coachingRelationships.id,
        trainerUserId: schema.coachingRelationships.trainerUserId,
        traineeUserId: schema.coachingRelationships.traineeUserId,
      })
      .from(schema.coachingRelationships)
      .where(
        and(
          eq(schema.coachingRelationships.trainerUserId, me!.userId),
          ne(schema.coachingRelationships.status, "ended"),
        ),
      );
  }

  type Rel = { id: string; trainerUserId: string };

  async function insertCheckin(rel: Rel, day: string, kind: 0 | 1 | 2): Promise<string> {
    const [template] = await handle.db
      .select({ formVersionId: schema.checkins.checkinFormVersionId })
      .from(schema.checkins)
      .limit(1);
    const id = createId();
    await handle.db.insert(schema.checkins).values({
      id,
      coachingRelationshipId: rel.id,
      checkinScheduleId: null,
      localDate: day,
      windowStartsAt: `${day}T00:00:00.000Z`,
      windowEndsAt: new Date(Date.parse(`${day}T00:00:00.000Z`) + 2 * 86_400_000).toISOString(),
      recordStatus: kind === 1 ? "draft" : "submitted",
      recordVersion: 1,
      definitionVersion: 1,
      checkinFormVersionId: template!.formVersionId,
      answersJson: null,
      submittedAt: kind === 1 ? null : `${day}T10:00:00.000Z`,
      createdAt: `${day}T00:00:00.000Z`,
      updatedAt: `${day}T10:00:00.000Z`,
    });
    if (kind === 2) {
      await handle.db.insert(schema.checkinReviews).values({
        id: createId(),
        checkinId: id,
        coachingRelationshipId: rel.id,
        trainerUserId: rel.trainerUserId,
        outcome: "acknowledged",
        notes: null,
        createdAt: `${day}T12:00:00.000Z`,
        updatedAt: `${day}T12:00:00.000Z`,
      });
    }
    return id;
  }

  const dayBefore = (days: number) =>
    new Date(Date.parse(NOW) - days * 86_400_000).toISOString().slice(0, 10);

  /**
   * `total` check-ins for the trainer's clients, long before the seed's own
   * dates: one in three submitted (To review), one overdue (draft, window
   * closed), one reviewed. Clients share dates and times in each round, so
   * the sort keys tie and the `id` tie-breaker is exercised.
   */
  async function addCheckins(total: number, firstRound = 1500) {
    const rels = await trainerRelationships();
    expect(rels.length).toBeGreaterThan(1);
    for (let i = 0; i < total; i += 1) {
      const rel = rels[i % rels.length]!;
      const round = firstRound + Math.floor(i / rels.length);
      await insertCheckin(rel, dayBefore(round), (i % 3) as 0 | 1 | 2);
    }
  }

  const ids = (items: InboxItem[]) => items.map((item) => item.checkin.id);
  const flat = <T>(pages: Array<Page<T>>) => pages.flatMap((p) => p.items);

  /**
   * The paged rows are the unpaged rows with the same bodies, in the unpaged
   * order (localDate, then createdAt, newest first). Rows that tie on both
   * have no defined order in the unpaged read; the pages break the tie by id.
   */
  async function expectSameRowsAsUnpaged(items: InboxItem[], whole: InboxItem[]) {
    expect(new Set(ids(items)).size).toBe(items.length);
    expect([...ids(items)].sort()).toEqual([...ids(whole)].sort());
    const byId = new Map(whole.map((i) => [i.checkin.id, i]));
    for (const item of items) expect(item).toEqual(byId.get(item.checkin.id));
    const createdAt = new Map<string, string>(
      (
        await handle.db
          .select({ id: schema.checkins.id, createdAt: schema.checkins.createdAt })
          .from(schema.checkins)
      ).map((row) => [row.id, row.createdAt]),
    );
    const sortKey = (i: InboxItem) => `${i.checkin.localDate}|${createdAt.get(i.checkin.id)}`;
    const keys = items.map((i) => `${sortKey(i)}|${i.checkin.id}`);
    expect(keys).toEqual([...keys].sort().reverse());
    expect(whole.map(sortKey)).toEqual(items.map(sortKey));
  }

  it("inbox without limit is unchanged; its pages concatenate to the same rows", async () => {
    const seedWhole = await page<InboxItem>("/checkins/inbox");
    expect(seedWhole.nextCursor).toBeNull();
    expect(seedWhole.items.length).toBeGreaterThan(3);
    await expectSameRowsAsUnpaged(
      flat(await walk<InboxItem>("/checkins/inbox?limit=2")),
      seedWhole.items,
    );

    // 120 more, with more ties on (localDate, createdAt) across clients.
    await addCheckins(120);
    const whole = await page<InboxItem>("/checkins/inbox");
    expect(whole.nextCursor).toBeNull();
    expect(whole.items.length).toBeGreaterThan(80);
    for (const item of whole.items) {
      expect(["due", "overdue", "submitted"]).toContain(item.checkin.status);
    }

    const pages = await walk<InboxItem>("/checkins/inbox?limit=7");
    // First and middle pages are full and carry a cursor; the last ends it.
    expect(pages.length).toBeGreaterThan(3);
    for (const p of pages.slice(0, -1)) {
      expect(p.items).toHaveLength(7);
      expect(p.nextCursor).toEqual(expect.any(String));
    }
    const last = pages[pages.length - 1]!;
    expect(last.nextCursor).toBeNull();
    expect(last.items.length).toBeGreaterThan(0);
    expect(last.items.length).toBeLessThanOrEqual(7);
    await expectSameRowsAsUnpaged(flat(pages), whole.items);
  });

  it("each segment pages on its own and holds exactly its rows, in the app's order", async () => {
    await addCheckins(120);
    const whole = (await page<InboxItem>("/checkins/inbox")).items;
    const reviewedInDb = await handle.db
      .select({ id: schema.checkinReviews.checkinId })
      .from(schema.checkinReviews)
      .innerJoin(
        schema.coachingRelationships,
        eq(schema.coachingRelationships.id, schema.checkinReviews.coachingRelationshipId),
      )
      .where(
        and(
          eq(schema.coachingRelationships.trainerUserId, (await trainerRelationships())[0]!.trainerUserId),
          ne(schema.coachingRelationships.status, "ended"),
        ),
      );

    const expected: Record<string, string[]> = {
      to_review: ids(whole.filter((i) => i.checkin.status === "submitted")),
      overdue: ids(whole.filter((i) => i.checkin.status === "overdue")),
      reviewed: reviewedInDb.map((r) => r.id),
    };
    const sortKey: Record<string, (i: InboxItem) => string> = {
      to_review: (i) => i.checkin.submittedAt ?? i.checkin.localDate,
      overdue: (i) => i.checkin.localDate,
      reviewed: (i) => i.checkin.review!.createdAt,
    };
    const direction: Record<string, 1 | -1> = { to_review: 1, overdue: 1, reviewed: -1 };

    for (const segment of ["to_review", "overdue", "reviewed"] as const) {
      expect(expected[segment]!.length, segment).toBeGreaterThan(30);
      const pages = await walk<InboxItem>(`/checkins/inbox?segment=${segment}&limit=9`);
      const items = flat(pages);
      expect(pages.length, segment).toBeGreaterThan(3);
      for (const p of pages.slice(0, -1)) expect(p.items, segment).toHaveLength(9);
      // No duplicates, no gaps, nothing from another segment.
      expect(new Set(ids(items)).size, segment).toBe(items.length);
      expect([...ids(items)].sort(), segment).toEqual([...expected[segment]!].sort());
      // Ordered by the segment's key, then id, in one direction.
      const keys = items.map((i) => `${sortKey[segment]!(i)}|${i.checkin.id}`);
      const sorted = [...keys].sort();
      expect(keys, segment).toEqual(direction[segment] === 1 ? sorted : sorted.reverse());
      // A segment without a page size is the whole segment, same order.
      const unpaged = await page<InboxItem>(`/checkins/inbox?segment=${segment}`);
      expect(unpaged.nextCursor).toBeNull();
      expect(unpaged.items, segment).toEqual(items);
    }
  });

  it("a check-in added between pages causes no duplicate and no gap", async () => {
    await addCheckins(60);
    const original = ids((await page<InboxItem>("/checkins/inbox")).items);
    const first = await page<InboxItem>("/checkins/inbox?limit=10");
    expect(first.nextCursor).toEqual(expect.any(String));

    // A submitted check-in newer than the cursor row (sorts before it: not
    // in later pages) and one older than every row (sorts after it: shows up
    // exactly once).
    const [rel] = await trainerRelationships();
    const taken = new Set(
      (
        await handle.db
          .select({ localDate: schema.checkins.localDate })
          .from(schema.checkins)
          .where(eq(schema.checkins.coachingRelationshipId, rel!.id))
      ).map((row) => row.localDate),
    );
    const cursorDate = first.items[first.items.length - 1]!.checkin.localDate;
    let freeDay = 1;
    while (taken.has(dayBefore(freeDay)) || dayBefore(freeDay) <= cursorDate) freeDay += 1;
    expect(dayBefore(freeDay) > cursorDate).toBe(true);
    const newer = await insertCheckin(rel!, dayBefore(freeDay), 0);
    const older = await insertCheckin(rel!, dayBefore(4000), 0);

    const rest: InboxItem[] = [];
    let cursor: string | null = first.nextCursor;
    while (cursor) {
      const next: Page<InboxItem> = await page<InboxItem>(
        `/checkins/inbox?limit=10&cursor=${encodeURIComponent(cursor)}`,
      );
      rest.push(...next.items);
      cursor = next.nextCursor;
    }
    const seen = [...ids(first.items), ...ids(rest)];
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of original) expect(seen).toContain(id);
    expect(seen).not.toContain(newer);
    expect(seen).toContain(older);
    expect(seen).toHaveLength(original.length + 1);
  });

  it("a bad, tampered or foreign cursor and an unknown segment get the friendly 400", async () => {
    for (const path of [
      "/checkins/inbox?limit=5&cursor=not-a-cursor",
      `/checkins/inbox?cursor=${btoa(JSON.stringify({ k: "2026-10-01", id: "x" }))}`,
      `/checkins/inbox?segment=overdue&cursor=${btoa(JSON.stringify({ k: JSON.stringify(["a", "b"]), id: "x" }))}`,
    ]) {
      const run = await get(path);
      expect(run.status, path).toBe(400);
      expect(run.body.error).toMatchObject({ code: "INVALID_CURSOR", message: "Cursor is not valid." });
    }
    const segment = await get("/checkins/inbox?segment=due&limit=5");
    expect(segment.status).toBe(400);
    expect(segment.body.error).toMatchObject({ code: "INVALID_REQUEST", message: "Invalid check-in segment." });

    const [rel] = await trainerRelationships();
    const notes = await get(`/checkins/relationships/${rel!.id}/notes?limit=5&cursor=%%%`);
    expect(notes.status).toBe(400);
    expect(notes.body.error).toMatchObject({ code: "INVALID_CURSOR", message: "Cursor is not valid." });
  });

  it("one inbox page costs the same round trips with 120 more check-ins", async () => {
    const paths = [
      "/checkins/inbox?limit=30",
      "/checkins/inbox?segment=to_review&limit=30",
      "/checkins/inbox?segment=overdue&limit=30",
      "/checkins/inbox?segment=reviewed&limit=30",
    ];
    const before = [];
    for (const path of paths) before.push(await get(path));
    const firstCursor = (before[0]!.body.data as Page<InboxItem>).nextCursor;
    await addCheckins(120);
    for (const [index, path] of paths.entries()) {
      const after = await get<Page<InboxItem>>(path);
      expect(after.status).toBe(200);
      expect(after.roundTrips, describeTrips(after.trips)).toBe(before[index]!.roundTrips);
      expect(after.roundTrips, describeTrips(after.trips)).toBeLessThanOrEqual(2);
    }
    const middle = await get<Page<InboxItem>>(
      `/checkins/inbox?limit=30&cursor=${encodeURIComponent(firstCursor ?? "")}`,
    );
    expect(middle.status).toBe(200);
    expect(middle.roundTrips).toBe(before[0]!.roundTrips);
  });

  it("ended clients stay out of every segment; the trainee and another trainer are refused", async () => {
    await addCheckins(30);
    const rels = await trainerRelationships();
    const ending = rels[0]!;
    const beforeEnd = flat(await walk<InboxItem>("/checkins/inbox?segment=reviewed&limit=20"));
    expect(beforeEnd.some((i) => i.coachingRelationshipId === ending.id)).toBe(true);
    await handle.db
      .update(schema.coachingRelationships)
      .set({ status: "ended" })
      .where(eq(schema.coachingRelationships.id, ending.id));
    for (const segment of ["", "segment=to_review&", "segment=overdue&", "segment=reviewed&"]) {
      const items = flat(await walk<InboxItem>(`/checkins/inbox?${segment}limit=20`));
      expect(items.some((i) => i.coachingRelationshipId === ending.id), segment).toBe(false);
    }

    const trainee = await loginHeaders(DEMO_TRAINEE, "trainee");
    expect((await get("/checkins/inbox?segment=to_review&limit=5", trainee)).status).toBe(403);

    const other = await loginHeaders(SECOND_TRAINER, "trainer");
    const otherNotes = await get(`/checkins/relationships/${rels[1]!.id}/notes?limit=5`, other);
    expect(otherNotes.status).toBe(404);
    expect(otherNotes.body.error).toMatchObject({ code: "RELATIONSHIP_NOT_FOUND" });
    // Another trainer's paged inbox never holds this trainer's check-ins.
    const mine = new Set(
      ids(flat(await walk<InboxItem>("/checkins/inbox?segment=reviewed&limit=20"))),
    );
    expect(mine.size).toBeGreaterThan(0);
    const theirs = (await get<Page<InboxItem>>("/checkins/inbox?segment=reviewed&limit=50", other))
      .body.data.items;
    expect(theirs.some((i) => mine.has(i.checkin.id))).toBe(false);
  });

  describe("coach notes", () => {
    async function addNotes(relationshipId: string, trainerUserId: string, count: number, startMs: number) {
      for (let i = 0; i < count; i += 1) {
        // Pairs share a timestamp, so the id tie-breaker decides their order.
        const at = new Date(startMs - Math.floor(i / 2) * 3_600_000).toISOString();
        await handle.db.insert(schema.trainerNotes).values({
          id: createId(),
          coachingRelationshipId: relationshipId,
          trainerUserId,
          checkinId: null,
          body: `Hit protein most days this week (${i + 1}).`,
          visibility: i % 3 === 0 ? "client" : "private",
          createdAt: at,
          updatedAt: at,
        });
      }
    }

    async function demoRelationship() {
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
      return rel!;
    }

    it("without limit every note comes back; pages walk them newest first with no duplicates", async () => {
      const rel = await demoRelationship();
      await addNotes(rel.id, rel.trainerUserId, 80, Date.parse(SEED) - 86_400_000);
      const path = `/checkins/relationships/${rel.id}/notes`;
      const whole = await page<Note>(path);
      expect(whole.nextCursor).toBeNull();
      expect(whole.items.length).toBeGreaterThanOrEqual(80);

      const pages = await walk<Note>(`${path}?limit=25`);
      for (const p of pages.slice(0, -1)) expect(p.items).toHaveLength(25);
      expect(pages[pages.length - 1]!.nextCursor).toBeNull();
      const items = flat(pages);
      expect(new Set(items.map((n) => n.id)).size).toBe(items.length);
      expect(items.map((n) => n.id).sort()).toEqual(whole.items.map((n) => n.id).sort());
      const keys = items.map((n) => `${n.createdAt}|${n.id}`);
      expect(keys).toEqual([...keys].sort().reverse());
      // Same note bodies as the unpaged read.
      const byId = new Map(whole.items.map((n) => [n.id, n]));
      for (const note of items) expect(note).toEqual(byId.get(note.id));
    });

    it("a note added between pages causes no duplicate and no gap", async () => {
      const rel = await demoRelationship();
      await addNotes(rel.id, rel.trainerUserId, 40, Date.parse(SEED) - 86_400_000);
      const path = `/checkins/relationships/${rel.id}/notes`;
      const original = (await page<Note>(path)).items.map((n) => n.id);
      const first = await page<Note>(`${path}?limit=10`);
      // Newer than every note: before the cursor, so not in later pages.
      await addNotes(rel.id, rel.trainerUserId, 1, Date.parse(NOW));
      // Older than every note: after the cursor, so it appears once.
      await addNotes(rel.id, rel.trainerUserId, 1, Date.parse("2025-01-01T00:00:00.000Z"));
      const rest: Note[] = [];
      let cursor = first.nextCursor;
      while (cursor) {
        const next: Page<Note> = await page<Note>(`${path}?limit=10&cursor=${encodeURIComponent(cursor)}`);
        rest.push(...next.items);
        cursor = next.nextCursor;
      }
      const seen = [...first.items, ...rest].map((n) => n.id);
      expect(new Set(seen).size).toBe(seen.length);
      for (const id of original) expect(seen).toContain(id);
      expect(seen).toHaveLength(original.length + 1);
    });

    it("one notes page costs the same round trips with 80 more notes", async () => {
      const rel = await demoRelationship();
      const path = `/checkins/relationships/${rel.id}/notes?limit=30`;
      const before = await get<Page<Note>>(path);
      expect(before.status).toBe(200);
      await addNotes(rel.id, rel.trainerUserId, 80, Date.parse(SEED) - 86_400_000);
      const after = await get<Page<Note>>(path);
      expect(after.status).toBe(200);
      expect(after.body.data.items).toHaveLength(30);
      expect(after.roundTrips, describeTrips(after.trips)).toBe(before.roundTrips);
      expect(after.roundTrips, describeTrips(after.trips)).toBeLessThanOrEqual(2);
      const middle = await get<Page<Note>>(
        `${path}&cursor=${encodeURIComponent(after.body.data.nextCursor!)}`,
      );
      expect(middle.roundTrips).toBe(before.roundTrips);
    });
  });
});
