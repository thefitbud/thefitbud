import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
const secure = vi.hoisted(() => ({ map: new Map<string, string>() }));
vi.mock("../lib/secureSessionStore", () => ({
  secureGet: async (key: string) => secure.map.get(key) ?? null,
  secureSet: async (key: string, value: string) => {
    secure.map.set(key, value);
  },
  secureDelete: async (key: string) => {
    secure.map.delete(key);
  },
}));

import type { NewOutboxEntry } from "./engine";
import { resetDeviceStorageForTests } from "./storage";
import {
  clearSyncDataOnSignOut,
  resetSyncStoresForTests,
  syncStoreForUser,
} from "./userStore";

/**
 * Z12-41: the outbox belongs to one user. Before this it was one process-wide
 * store, so the next account on the phone pushed the previous account's logs
 * and the server refused them all.
 */

const AARAV = "6f1c2f0e-8f58-4d3a-9d5c-0a4d2f1b7c11";
const PRIYA = "0b8f6a3e-2c1d-4e5f-9a7b-3c2d1e0f9a8b";

function log(n: number): NewOutboxEntry {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    mutationId: id,
    idempotencyKey: id,
    entityType: "meal_compliance",
    recordId: id,
    operation: "meal.confirm",
    expectedServerVersion: null,
    clientOccurredAt: "2026-11-15T07:05:00.000Z",
    payloadJson: JSON.stringify({ mealName: "Evening snack" }),
  };
}

/** A new process: module state is gone, the keychain is not. */
function relaunch() {
  resetSyncStoresForTests();
  resetDeviceStorageForTests();
}

beforeEach(() => {
  secure.map.clear();
  relaunch();
});

describe("per-user sync store", () => {
  it("nobody signed in: an empty store that keeps nothing on the device", async () => {
    const store = syncStoreForUser(null);
    await store.enqueueOutbox(log(1));
    expect(secure.map.size).toBe(0);
    await store.clear();
  });

  it("the same user gets the same store, and their logs after an app kill", async () => {
    const store = syncStoreForUser(AARAV);
    expect(syncStoreForUser(AARAV)).toBe(store);
    await store.enqueueOutbox(log(1));

    relaunch();

    expect(await syncStoreForUser(AARAV).listOutbox()).toHaveLength(1);
  });

  it("a different user never reads the previous user's outbox, in memory or after a kill", async () => {
    await syncStoreForUser(AARAV).enqueueOutbox(log(1));

    const priya = syncStoreForUser(PRIYA);
    expect(await priya.listOutbox()).toEqual([]);

    relaunch();
    expect(await syncStoreForUser(PRIYA).listOutbox()).toEqual([]);
  });

  it("a different user's first open removes the previous user's data from the device", async () => {
    await syncStoreForUser(AARAV).enqueueOutbox(log(1));
    expect([...secure.map.keys()].some((key) => key.includes(AARAV))).toBe(true);

    await syncStoreForUser(PRIYA).listOutbox();

    expect([...secure.map.keys()].some((key) => key.includes(AARAV))).toBe(false);
    // And it cannot come back for the first user either.
    relaunch();
    expect(await syncStoreForUser(AARAV).listOutbox()).toEqual([]);
  });

  it("explicit sign-out drops the unsent logs from memory and the device", async () => {
    const store = syncStoreForUser(AARAV);
    await store.enqueueOutbox(log(1));

    await clearSyncDataOnSignOut();

    expect(secure.map.size).toBe(0);
    expect(await store.listOutbox()).toEqual([]);
    relaunch();
    expect(await syncStoreForUser(AARAV).listOutbox()).toEqual([]);
  });

  it("a session the server ended keeps the logs for the same user's next sign-in", async () => {
    await syncStoreForUser(AARAV).enqueueOutbox(log(1));

    // No clearSyncDataOnSignOut: the provider switches to "nobody".
    expect(await syncStoreForUser(null).listOutbox()).toEqual([]);

    expect(await syncStoreForUser(AARAV).listOutbox()).toHaveLength(1);
    relaunch();
    expect(await syncStoreForUser(AARAV).listOutbox()).toHaveLength(1);
  });
});
