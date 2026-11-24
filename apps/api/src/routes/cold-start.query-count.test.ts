import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { meResponseSchema, relationshipListResponseSchema } from "@fitbud/contracts";
import * as schema from "../db/schema.js";
import { setTestDbOverride } from "../db/client.js";
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

  // Fix round 1: the batched list must return the same content as the single
  // read for every item, even when other trainers' relationships are newer than
  // the actor's and would crowd a page subquery that lost its ownership or
  // cursor condition.
  async function addUser(role: "trainer" | "trainee", name: string, whatsapp: string | null) {
    const id = createId();
    const stamp = "2026-10-26T06:00:00.000Z";
    await handle.db.insert(schema.users).values({
      id,
      firebaseUid: `fb-${id}`,
      accountState: "active",
      timezone: "Asia/Kolkata",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await handle.db.insert(schema.userRoles).values({ id: createId(), userId: id, role, createdAt: stamp });
    if (role === "trainer") {
      await handle.db.insert(schema.trainerProfiles).values({
        id: createId(),
        userId: id,
        displayName: name,
        whatsappE164: whatsapp,
        createdAt: stamp,
        updatedAt: stamp,
      });
    } else {
      await handle.db.insert(schema.traineeProfiles).values({
        id: createId(),
        userId: id,
        displayName: name,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }
    return id;
  }

  async function addRelationship(trainerUserId: string, traineeUserId: string, createdAt: string) {
    await handle.db.insert(schema.coachingRelationships).values({
      id: createId(),
      trainerUserId,
      traineeUserId,
      status: "active",
      invitationId: null,
      startedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  }

  it("GET /relationships pages carry the same content as GET /relationships/:id with newer foreign relationships", async () => {
    const demoTrainer = await handle.db.query.userIdentities.findFirst({
      where: (t, { eq }) => eq(t.email, DEMO_TRAINER),
    });
    const demoTrainee = await handle.db.query.userIdentities.findFirst({
      where: (t, { eq }) => eq(t.email, DEMO_TRAINEE),
    });
    expect(demoTrainer && demoTrainee).toBeTruthy();

    const trainerB = await addUser("trainer", "Meera Iyer", "+919800000001");
    const trainerC = await addUser("trainer", "Karan Shah", "+919800000002");
    // Newer than every demo relationship: more than limit + 1 of them, so a
    // page subquery without the ownership filter would fill with these rows.
    for (let i = 0; i < 4; i += 1) {
      const trainee = await addUser("trainee", `Foreign client ${i}`, null);
      await addRelationship(trainerB, trainee, `2026-10-26T12:0${i}:00.000Z`);
    }
    // The demo trainee also has newer relationships with two other trainers.
    await addRelationship(trainerB, demoTrainee!.userId, "2026-10-26T13:00:00.000Z");
    await addRelationship(trainerC, demoTrainee!.userId, "2026-10-26T14:00:00.000Z");

    type Item = {
      id: string;
      trainerUserId: string;
      traineeUserId: string;
      onboardingStatus: string;
      trainerDisplayName: string | null;
      trainerWhatsappE164: string | null;
    };
    const cases = [
      ["trainer", DEMO_TRAINER, demoTrainer!.userId],
      ["trainee", DEMO_TRAINEE, demoTrainee!.userId],
    ] as const;
    for (const [role, email, userId] of cases) {
      const headers = await loginHeaders(email, role);
      const seen: Item[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 4; page += 1) {
        const qs = `limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const res = await measureRequest(counter, `/relationships?${qs}`, { headers });
        expect(res.status).toBe(200);
        const data = (res.body as { data: { items: Item[]; nextCursor: string | null } }).data;
        expect(data.items).toHaveLength(1);
        seen.push(...data.items);
        cursor = data.nextCursor;
        if (!cursor) break;
      }
      expect(seen.length, `${role} pages`).toBeGreaterThanOrEqual(3);
      expect(new Set(seen.map((i) => i.id)).size).toBe(seen.length);
      for (const item of seen) {
        expect(role === "trainer" ? item.trainerUserId : item.traineeUserId).toBe(userId);
        const single = await measureRequest(counter, `/relationships/${item.id}`, { headers });
        expect(single.status).toBe(200);
        const one = (single.body as { data: Item }).data;
        expect(item.onboardingStatus).toBe(one.onboardingStatus);
        expect(item.trainerDisplayName).toBe(one.trainerDisplayName);
        expect(item.trainerWhatsappE164).toBe(one.trainerWhatsappE164);
        expect(item.trainerDisplayName, "trainer profile resolved").toBeTruthy();
      }
    }
  }, 60_000);
});
