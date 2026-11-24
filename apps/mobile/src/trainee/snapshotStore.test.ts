import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../lib/secureSessionStore", () => ({
  secureGet: async () => null,
  secureSet: async () => undefined,
  secureDelete: async () => undefined,
}));

import { createMemoryKeyValue, type AsyncKeyValue } from "../sync/storage";
import {
  clearDayViews,
  dayViewKey,
  getCacheEntry,
  getCached,
  setCached,
} from "./dataCache";
import {
  SNAPSHOT_LIMIT,
  SNAPSHOT_MAX_AGE_MS,
  bindTraineeSnapshots,
  clearTraineeSnapshots,
  createSnapshotStore,
  flushTraineeSnapshots,
  resetTraineeSnapshotsForTests,
  snapshotPrefixFor,
} from "./snapshotStore";

/**
 * Z14-2: the trainee's read snapshots survive an app kill in the device
 * store, owner-scoped, pruned at 14 days, and a corrupt one is never shown.
 */

const AARAV = "6f1c2f0e-8f58-4d3a-9d5c-0a4d2f1b7c11";
const PRIYA = "0b8f6a3e-2c1d-4e5f-9a7b-3c2d1e0f9a8b";
const REL = "00000000-0000-4000-8000-0000000000a1";
const OTHER_REL = "00000000-0000-4000-8000-0000000000a2";
const DAY = "2026-11-24";

const todayKey = dayViewKey("today", REL, DAY);
const workoutsKey = `workouts:${REL}:2026-11-23:2026-11-29`;
const progressKey = `progress:${REL}`;
const bundle = { meals: [{ id: "m1", mealName: "Lunch", status: "pending" }], day: null };

function store(storage: AsyncKeyValue, userId = AARAV, now = () => 10_000) {
  const errors: Array<{ scope: string; error: unknown }> = [];
  const snapshots = createSnapshotStore({
    storage,
    userId,
    now,
    writeDelayMs: 0,
    onError: (scope, error) => errors.push({ scope, error }),
  });
  return { snapshots, errors };
}

beforeEach(() => {
  resetTraineeSnapshotsForTests();
  clearDayViews();
});

describe("createSnapshotStore", () => {
  it("writes snapshots and reads them back after a restart", async () => {
    const map = new Map<string, string>();
    const first = store(createMemoryKeyValue(map));
    first.snapshots.write(todayKey, bundle, 1_000);
    first.snapshots.write(progressKey, { measurements: [] }, 2_000);
    first.snapshots.write("meals:ignored", [], 3_000);
    await first.snapshots.flush();

    // A new process: a new store over the same device storage.
    const second = store(createMemoryKeyValue(map), AARAV, () => 10_000);
    const entries = await second.snapshots.hydrate();
    expect(entries.sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: todayKey, value: bundle, savedAt: 1_000 },
      { key: progressKey, value: { measurements: [] }, savedAt: 2_000 },
    ]);
    expect(second.errors).toEqual([]);
    // Only snapshot kinds are kept; storage keys use the safe alphabet.
    for (const key of map.keys()) expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    expect([...map.keys()].some((key) => key.includes("meals"))).toBe(false);
  });

  it("coalesces writes to one key", async () => {
    const map = new Map<string, string>();
    const { snapshots } = store(createMemoryKeyValue(map));
    snapshots.write(todayKey, { v: 1 }, 1_000);
    snapshots.write(todayKey, { v: 2 }, 2_000);
    await snapshots.flush();
    const entries = await store(createMemoryKeyValue(map)).snapshots.hydrate();
    expect(entries).toEqual([{ key: todayKey, value: { v: 2 }, savedAt: 2_000 }]);
  });

  it("another user opening the store removes the previous owner's snapshots", async () => {
    const map = new Map<string, string>();
    const aarav = store(createMemoryKeyValue(map));
    aarav.snapshots.write(todayKey, bundle, 1_000);
    await aarav.snapshots.flush();
    expect([...map.keys()].some((key) => key.startsWith(snapshotPrefixFor(AARAV)))).toBe(true);

    const priya = store(createMemoryKeyValue(map), PRIYA);
    expect(await priya.snapshots.hydrate()).toEqual([]);
    expect([...map.keys()].some((key) => key.startsWith(snapshotPrefixFor(AARAV)))).toBe(false);
    expect(map.get("fitbud.snap.owner")).toBe(PRIYA);
  });

  it("prunes snapshots older than 14 days", async () => {
    const map = new Map<string, string>();
    const now = 100 * SNAPSHOT_MAX_AGE_MS;
    const { snapshots } = store(createMemoryKeyValue(map), AARAV, () => now);
    snapshots.write(todayKey, bundle, now - SNAPSHOT_MAX_AGE_MS - 1);
    snapshots.write(progressKey, { measurements: [] }, now - 60_000);
    await snapshots.flush();

    const reopened = store(createMemoryKeyValue(map), AARAV, () => now);
    const entries = await reopened.snapshots.hydrate();
    expect(entries.map((entry) => entry.key)).toEqual([progressKey]);
    // The pruned value is gone from the phone, not just skipped.
    const again = await store(createMemoryKeyValue(map), AARAV, () => now).snapshots.hydrate();
    expect(again.map((entry) => entry.key)).toEqual([progressKey]);
    expect([...map.values()].some((value) => value.includes('"Lunch"'))).toBe(false);
  });

  it("keeps at most SNAPSHOT_LIMIT, dropping the oldest", async () => {
    const map = new Map<string, string>();
    const { snapshots } = store(createMemoryKeyValue(map), AARAV, () => 10_000_000);
    for (let n = 0; n < SNAPSHOT_LIMIT + 5; n += 1) {
      snapshots.write(`workouts:${REL}:week-${n}`, { n }, 1_000 + n);
    }
    await snapshots.flush();
    const entries = await store(createMemoryKeyValue(map), AARAV, () => 10_000_000).snapshots.hydrate();
    expect(entries).toHaveLength(SNAPSHOT_LIMIT);
    expect(entries.some((entry) => entry.key.endsWith("week-0"))).toBe(false);
  });

  it("ignores and reports a corrupt snapshot; it is never returned", async () => {
    const map = new Map<string, string>();
    const first = store(createMemoryKeyValue(map));
    first.snapshots.write(todayKey, bundle, 1_000);
    first.snapshots.write(progressKey, { measurements: [] }, 2_000);
    await first.snapshots.flush();
    const corruptKey = [...map.keys()].find((key) => key.includes(".e.dayview"))!;
    map.set(corruptKey, "{not json");

    const second = store(createMemoryKeyValue(map));
    const entries = await second.snapshots.hydrate();
    expect(entries.map((entry) => entry.key)).toEqual([progressKey]);
    expect(second.errors.map((error) => error.scope)).toEqual(["trainee.snapshot.read"]);
    // Reported without the stored text.
    expect(JSON.stringify(second.errors)).not.toContain("not json");
    expect(map.has(corruptKey)).toBe(false);
  });

  it("an unreadable index is reported and starts empty", async () => {
    const map = new Map<string, string>([
      ["fitbud.snap.owner", AARAV],
      [`${snapshotPrefixFor(AARAV)}.index`, "[]"],
    ]);
    const { snapshots, errors } = store(createMemoryKeyValue(map));
    expect(await snapshots.hydrate()).toEqual([]);
    expect(errors.map((error) => error.scope)).toEqual(["trainee.snapshot.read"]);
  });

  it("clear drops every snapshot and the owner marker", async () => {
    const map = new Map<string, string>();
    const { snapshots } = store(createMemoryKeyValue(map));
    snapshots.write(todayKey, bundle, 1_000);
    await snapshots.flush();
    snapshots.write(progressKey, { measurements: [] }, 2_000);
    await snapshots.clear();
    await snapshots.flush();
    expect([...map.keys()]).toEqual([]);
  });
});

describe("bindTraineeSnapshots (the app binding)", () => {
  it("hydrates this relationship's snapshots into the cache with their saved time", async () => {
    const map = new Map<string, string>();
    const seed = store(createMemoryKeyValue(map));
    const savedAt = Date.now() - 5 * 60_000;
    seed.snapshots.write(todayKey, bundle, savedAt);
    seed.snapshots.write(workoutsKey, [{ id: "w1" }], savedAt);
    seed.snapshots.write(dayViewKey("today", OTHER_REL, DAY), { other: true }, savedAt);
    await seed.snapshots.flush();

    await bindTraineeSnapshots({
      userId: AARAV,
      relationshipId: REL,
      storage: createMemoryKeyValue(map),
    });
    expect(getCached(todayKey)).toEqual(bundle);
    expect(getCached(workoutsKey)).toEqual([{ id: "w1" }]);
    expect(getCached(dayViewKey("today", OTHER_REL, DAY))).toBeUndefined();
    // Old enough that a reader refreshes it in the background.
    expect(getCacheEntry(todayKey)?.updatedAt).toBe(savedAt);
  });

  it("writes every later cache write of a snapshot kind back to the phone", async () => {
    const map = new Map<string, string>();
    await bindTraineeSnapshots({
      userId: AARAV,
      relationshipId: REL,
      storage: createMemoryKeyValue(map),
    });
    setCached(progressKey, { measurements: [{ id: "x" }] });
    await flushTraineeSnapshots();
    const entries = await store(createMemoryKeyValue(map)).snapshots.hydrate();
    expect(entries.map((entry) => entry.key)).toEqual([progressKey]);
  });

  it("the end of a session (clearDayViews) clears the phone's snapshots", async () => {
    const map = new Map<string, string>();
    await bindTraineeSnapshots({
      userId: AARAV,
      relationshipId: REL,
      storage: createMemoryKeyValue(map),
    });
    setCached(todayKey, bundle);
    await flushTraineeSnapshots();
    expect(map.size).toBeGreaterThan(0);
    clearDayViews();
    await vi.waitFor(() => expect(map.size).toBe(0));
    // Nothing written after the clear lands on the phone.
    setCached(todayKey, bundle);
    await flushTraineeSnapshots();
    expect(map.size).toBe(0);
    await clearTraineeSnapshots();
  });
});
