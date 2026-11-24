import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../lib/secureSessionStore", () => ({
  secureGet: async () => null,
  secureSet: async () => undefined,
  secureDelete: async () => undefined,
}));

import { createDurableSyncStore } from "./durableStore";
import type { LocalRecord, NewOutboxEntry } from "./engine";
import {
  createChunkedKeyValue,
  createNativeDeviceStorage,
  createSqliteKeyValue,
  resetDeviceStorageForTests,
  type AsyncKeyValue,
  type DeviceStorage,
  type SecureBackend,
  type SqlDatabase,
} from "./storage";
import {
  claimSyncOwner,
  resetSyncStoresForTests,
  syncPrefixFor,
  syncStoreForUser,
} from "./userStore";

/**
 * Z14-5 (D-W14-7): the native outbox and snapshots move from keychain chunks
 * to SQLite. The SQL runs on Node's own SQLite, the same engine expo-sqlite
 * ships, through the three calls the adapter makes on the device.
 */

type NodeStatement = {
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): unknown;
};
type NodeDatabase = {
  exec(source: string): void;
  prepare(source: string): NodeStatement;
};
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => NodeDatabase;
};

/** One phone's SQLite file: survives a relaunch, like the app's documents directory. */
function deviceDatabase(): NodeDatabase {
  return new DatabaseSync(":memory:");
}

type Faults = {
  /** Throw on an INSERT into `kv` whose key matches. */
  failInsert?: RegExp;
  /** Store this text instead of the value (a copy that does not verify). */
  corrupt?: RegExp;
};

function sqlOver(file: NodeDatabase, faults: Faults = {}): SqlDatabase {
  return {
    async execAsync(source) {
      file.exec(source);
    },
    async runAsync(source, ...params) {
      const key = typeof params[0] === "string" ? params[0] : "";
      if (source.startsWith("INSERT INTO kv")) {
        if (faults.failInsert?.test(key)) throw new Error("disk I/O error");
        if (faults.corrupt?.test(key)) params = [key, "{\"broken\":true}"];
      }
      return file.prepare(source).run(...params);
    },
    async getFirstAsync<T>(source: string, ...params: (string | number | null)[]) {
      return (file.prepare(source).get(...params) as T | undefined) ?? null;
    },
  };
}

function rows(file: NodeDatabase, table: "kv" | "legacy_checked"): string[] {
  const statement = file.prepare(`SELECT group_concat(key, '|') AS keys FROM ${table}`);
  const result = statement.get() as { keys: string | null };
  return result.keys ? result.keys.split("|") : [];
}

/** The keychain as earlier builds used it, with counters and switchable faults. */
function keychain() {
  const map = new Map<string, string>();
  const state = { reads: 0, failReads: false, failRemoves: false };
  const backend: SecureBackend = {
    async get(key) {
      state.reads += 1;
      if (state.failReads) throw new Error("User interaction is not allowed.");
      return map.get(key) ?? null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      if (state.failRemoves) throw new Error("keychain remove failed");
      map.delete(key);
    },
  };
  return { map, state, store: createChunkedKeyValue(backend) };
}

const AARAV = "6f1c2f0e-8f58-4d3a-9d5c-0a4d2f1b7c11";
const PRIYA = "0b8f6a3e-2c1d-4e5f-9a7b-3c2d1e0f9a8b";

function log(n: number, mealName = "Evening snack"): NewOutboxEntry {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    mutationId: id,
    idempotencyKey: id,
    entityType: "meal_compliance",
    recordId: id,
    operation: "meal.confirm",
    expectedServerVersion: null,
    clientOccurredAt: "2026-11-15T07:05:00.000Z",
    payloadJson: JSON.stringify({ mealName }),
  };
}

const PLAN: LocalRecord = {
  entityType: "effective_plan",
  recordId: "4b7e2d10-1c3a-4f5e-8d9c-2a1b0c3d4e5f",
  serverVersion: 3,
  payloadJson: JSON.stringify({ name: "Lower body B · Week 2" }),
  tombstone: false,
  updatedAt: "2026-11-20T04:30:00.000Z",
};

/**
 * What a build before Z14-5 left on the phone: the owner marker, the outbox
 * and the plan, written by the real sync store into keychain chunks.
 */
async function olderBuildWrote(legacy: AsyncKeyValue, userId: string) {
  const store = createDurableSyncStore({
    storage: legacy,
    prefix: syncPrefixFor(userId),
    capacity: "small",
    beforeOpen: () => claimSyncOwner(legacy, userId),
  });
  // Non-ASCII on purpose: the chunks store it escaped, SQLite must read it back.
  await store.enqueueOutbox(log(1, "Poha with chai — ½ plate"));
  await store.enqueueOutbox(log(2));
  await store.upsertLocal(PLAN);
}

type Launch = { device: DeviceStorage; errors: string[] };

/** A new process on this build: module state is gone, SQLite and the keychain are not. */
function launch(
  file: NodeDatabase,
  legacy: AsyncKeyValue,
  faults: Faults = {},
): Launch {
  const errors: string[] = [];
  const device = createNativeDeviceStorage({
    sqliteAvailable: () => true,
    openDatabase: async () => sqlOver(file, faults),
    legacy,
    onError: (scope) => errors.push(scope),
  });
  resetSyncStoresForTests();
  resetDeviceStorageForTests(device);
  return { device, errors };
}

const outboxKey = (userId: string) => `${syncPrefixFor(userId)}.outbox`;
const planKey = (userId: string) => `${syncPrefixFor(userId)}.local.effective_plan`;
const keychainHas = (map: Map<string, string>, fragment: string) =>
  [...map.keys()].some((key) => key.includes(fragment));

beforeEach(() => {
  resetSyncStoresForTests();
  resetDeviceStorageForTests();
});

describe("SQLite key-value store", () => {
  it("keeps values across a relaunch and replaces them whole", async () => {
    const file = deviceDatabase();
    const first = createSqliteKeyValue(async () => sqlOver(file));
    await first.set("fitbud.me.snapshot", "{\"v\":1}");
    await first.set("fitbud.me.snapshot", "{\"v\":2}");

    const relaunched = createSqliteKeyValue(async () => sqlOver(file));
    expect(await relaunched.get("fitbud.me.snapshot")).toBe("{\"v\":2}");
    await relaunched.remove("fitbud.me.snapshot");
    expect(await relaunched.get("fitbud.me.snapshot")).toBeNull();
  });

  it("an open that fails is tried again on the next call", async () => {
    const file = deviceDatabase();
    let attempts = 0;
    const kv = createSqliteKeyValue(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("database is locked");
      return sqlOver(file);
    });
    await expect(kv.get("a")).rejects.toThrow("database is locked");
    await kv.set("a", "1");
    expect(await kv.get("a")).toBe("1");
    expect(attempts).toBe(2);
  });

  it("a build without the SQLite module stays on the keychain, small", () => {
    const legacy = keychain();
    const device = createNativeDeviceStorage({
      sqliteAvailable: () => false,
      openDatabase: async () => {
        throw new Error("not called");
      },
      legacy: legacy.store,
    });
    expect(device).toEqual({ storage: legacy.store, capacity: "small" });
  });
});

describe("first launch with SQLite: the keychain outbox moves over", () => {
  it("copies, verifies and then removes the outbox and plan; the trainee's logs are all there", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await olderBuildWrote(legacy.store, AARAV);
    expect(keychainHas(legacy.map, AARAV)).toBe(true);

    const { device, errors } = launch(file, legacy.store);
    expect(device.capacity).toBe("full");
    const store = syncStoreForUser(AARAV);

    const outbox = await store.listOutbox();
    expect(outbox.map((row) => row.mutationId)).toEqual([log(1).mutationId, log(2).mutationId]);
    expect(JSON.parse(outbox[0]!.payloadJson).mealName).toBe("Poha with chai — ½ plate");
    expect(await store.getLocal("effective_plan", PLAN.recordId)).toEqual(PLAN);

    // Moved: in SQLite, gone from the keychain (owner marker included).
    expect(rows(file, "kv")).toEqual(
      expect.arrayContaining(["fitbud.sync.owner", outboxKey(AARAV), planKey(AARAV)]),
    );
    expect(legacy.map.size).toBe(0);
    expect(errors).toEqual([]);

    // The next launch reads SQLite only; the keychain is not asked again.
    const readsBefore = legacy.state.reads;
    launch(file, legacy.store);
    expect(await syncStoreForUser(AARAV).listOutbox()).toHaveLength(2);
    expect(legacy.state.reads).toBe(readsBefore);
  });

  it("new logs after the move land in SQLite and survive a kill", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await olderBuildWrote(legacy.store, AARAV);

    launch(file, legacy.store);
    await syncStoreForUser(AARAV).enqueueOutbox(log(3));

    launch(file, legacy.store);
    expect((await syncStoreForUser(AARAV).listOutbox()).map((row) => row.mutationId)).toEqual([
      log(1).mutationId,
      log(2).mutationId,
      log(3).mutationId,
    ]);
    expect(legacy.map.size).toBe(0);
  });

  it("a copy that fails keeps the keychain copy, reports, and the logs still show", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await olderBuildWrote(legacy.store, AARAV);

    const broken = launch(file, legacy.store, { failInsert: /\.outbox$/ });
    expect(await syncStoreForUser(AARAV).listOutbox()).toHaveLength(2);
    expect(broken.errors).toContain("storage.migrate.copy");
    // Not dropped: the outbox is still in the keychain, and not in SQLite.
    expect(keychainHas(legacy.map, `${AARAV}.outbox`)).toBe(true);
    expect(rows(file, "kv")).not.toContain(outboxKey(AARAV));
    expect(rows(file, "legacy_checked")).not.toContain(outboxKey(AARAV));

    // The next launch, with SQLite healthy, finishes the move.
    const healthy = launch(file, legacy.store);
    expect(await syncStoreForUser(AARAV).listOutbox()).toHaveLength(2);
    expect(healthy.errors).toEqual([]);
    expect(keychainHas(legacy.map, AARAV)).toBe(false);
    expect(rows(file, "kv")).toContain(outboxKey(AARAV));
  });

  it("a copy that does not read back the same is undone and the keychain copy kept", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await olderBuildWrote(legacy.store, AARAV);

    const { errors } = launch(file, legacy.store, { corrupt: /\.outbox$/ });
    expect(await syncStoreForUser(AARAV).listOutbox()).toHaveLength(2);
    expect(errors).toContain("storage.migrate.copy");
    expect(rows(file, "kv")).not.toContain(outboxKey(AARAV));
    expect(keychainHas(legacy.map, `${AARAV}.outbox`)).toBe(true);
  });

  it("a keychain that cannot be read stops the open; nothing is overwritten or dropped", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await olderBuildWrote(legacy.store, AARAV);
    const before = new Map(legacy.map);

    legacy.state.failReads = true;
    const { device } = launch(file, legacy.store);
    // A failed keychain read is an error, never "nothing stored".
    await expect(device.storage.get(outboxKey(AARAV))).rejects.toThrow();
    const store = syncStoreForUser(AARAV);
    await expect(store.listOutbox()).rejects.toThrow();
    await expect(store.enqueueOutbox(log(3))).rejects.toThrow();
    expect(legacy.map).toEqual(before);
    expect(rows(file, "kv")).toEqual([]);
    expect(rows(file, "legacy_checked")).toEqual([]);

    // Once the keychain answers (the phone was unlocked), the same store opens
    // with every row, the new log can be written, and nothing was lost.
    legacy.state.failReads = false;
    await store.enqueueOutbox(log(3));
    expect(await store.listOutbox()).toHaveLength(3);
  });

  it("a keychain copy that cannot be removed is never read again over the SQLite copy", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await olderBuildWrote(legacy.store, AARAV);

    legacy.state.failRemoves = true;
    const { errors } = launch(file, legacy.store);
    const store = syncStoreForUser(AARAV);
    expect(await store.listOutbox()).toHaveLength(2);
    expect(errors).toContain("storage.migrate.cleanup");
    await store.removeOutbox(log(1).mutationId);

    legacy.state.failRemoves = false;
    launch(file, legacy.store);
    expect((await syncStoreForUser(AARAV).listOutbox()).map((row) => row.mutationId)).toEqual([
      log(2).mutationId,
    ]);
  });
});

/**
 * A keychain whose reads can be held after they have read: the value is
 * taken, then handed back only when the test releases it, as when the
 * keychain answers slowly on a cold start.
 */
function heldReads(inner: AsyncKeyValue) {
  let release: () => void = () => undefined;
  let reached: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const store: AsyncKeyValue = {
    async get(key) {
      const value = await inner.get(key);
      reached();
      await gate;
      return value;
    },
    set: (key, value) => inner.set(key, value),
    remove: (key) => inner.remove(key),
  };
  return { store, started, release };
}

const SNAPSHOT_KEY = "fitbud.me.snapshot";
const OLD_SNAPSHOT = JSON.stringify({ id: AARAV, name: "Aarav Shah", v: 1 });
const NEW_SNAPSHOT = JSON.stringify({ id: AARAV, name: "Aarav Shah", v: 2 });

describe("writes made while a first-launch move is reading the keychain", () => {
  it("a save during the move is kept; the old keychain value never overwrites it", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await legacy.store.set(SNAPSHOT_KEY, OLD_SNAPSHOT);
    const held = heldReads(legacy.store);
    const { device, errors } = launch(file, held.store);

    const read = device.storage.get(SNAPSHOT_KEY);
    await held.started;
    const save = device.storage.set(SNAPSHOT_KEY, NEW_SNAPSHOT);
    held.release();
    expect(await read).toBe(OLD_SNAPSHOT);
    await save;

    expect(await device.storage.get(SNAPSHOT_KEY)).toBe(NEW_SNAPSHOT);
    expect(legacy.map.size).toBe(0);
    expect(errors).toEqual([]);
    const relaunched = launch(file, legacy.store);
    expect(await relaunched.device.storage.get(SNAPSHOT_KEY)).toBe(NEW_SNAPSHOT);
  });

  it("a clear during the move stays cleared; the old keychain value never comes back", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await legacy.store.set(SNAPSHOT_KEY, OLD_SNAPSHOT);
    const held = heldReads(legacy.store);
    const { device } = launch(file, held.store);

    const read = device.storage.get(SNAPSHOT_KEY);
    await held.started;
    const clear = device.storage.remove(SNAPSHOT_KEY);
    held.release();
    await read;
    await clear;

    expect(await device.storage.get(SNAPSHOT_KEY)).toBeNull();
    expect(legacy.map.size).toBe(0);
    expect(rows(file, "kv")).not.toContain(SNAPSHOT_KEY);
    const relaunched = launch(file, legacy.store);
    expect(await relaunched.device.storage.get(SNAPSHOT_KEY)).toBeNull();
  });

  it("a clear whose keychain removal fails throws, and the keychain value is never read back", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await legacy.store.set(SNAPSHOT_KEY, OLD_SNAPSHOT);
    const { device } = launch(file, legacy.store);

    legacy.state.failRemoves = true;
    await expect(device.storage.remove(SNAPSHOT_KEY)).rejects.toThrow();
    expect(await device.storage.get(SNAPSHOT_KEY)).toBeNull();

    // Not on the next launch either, and the repeat removes the keychain copy.
    legacy.state.failRemoves = false;
    const relaunched = launch(file, legacy.store);
    const readsBefore = legacy.state.reads;
    expect(await relaunched.device.storage.get(SNAPSHOT_KEY)).toBeNull();
    expect(legacy.state.reads).toBe(readsBefore);
    await relaunched.device.storage.remove(SNAPSHOT_KEY);
    expect(legacy.map.size).toBe(0);
  });
});

describe("owner-scoped keys across the move", () => {
  it("a different user's first open removes the previous owner's keychain and SQLite data", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await olderBuildWrote(legacy.store, AARAV);

    launch(file, legacy.store);
    const priya = syncStoreForUser(PRIYA);
    expect(await priya.listOutbox()).toEqual([]);

    expect(keychainHas(legacy.map, AARAV)).toBe(false);
    expect(rows(file, "kv").some((key) => key.includes(AARAV))).toBe(false);
    const { device } = launch(file, legacy.store);
    expect(await device.storage.get("fitbud.sync.owner")).toBe(PRIYA);
    // And the first user's logs cannot come back for them either.
    expect(await syncStoreForUser(AARAV).listOutbox()).toEqual([]);
  });

  it("the moved outbox is read only under its own user's keys", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await olderBuildWrote(legacy.store, AARAV);

    const { device } = launch(file, legacy.store);
    expect(await device.storage.get(outboxKey(PRIYA))).toBeNull();
    // Reading another user's key did not touch Aarav's keychain copy.
    expect(keychainHas(legacy.map, `${AARAV}.outbox`)).toBe(true);
    expect(await syncStoreForUser(AARAV).listOutbox()).toHaveLength(2);
  });

  it("an owner change that cannot clear the keychain stops and is repeated, never mixing users", async () => {
    const file = deviceDatabase();
    const legacy = keychain();
    await olderBuildWrote(legacy.store, AARAV);

    legacy.state.failRemoves = true;
    launch(file, legacy.store);
    await expect(syncStoreForUser(PRIYA).listOutbox()).rejects.toThrow();

    legacy.state.failRemoves = false;
    launch(file, legacy.store);
    expect(await syncStoreForUser(PRIYA).listOutbox()).toEqual([]);
    expect(keychainHas(legacy.map, AARAV)).toBe(false);
    expect(rows(file, "kv").some((key) => key.includes(AARAV))).toBe(false);
  });
});
