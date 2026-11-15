import { describe, expect, it, vi } from "vitest";
import type { SyncMutationRequest, SyncPushResponse } from "@fitbud/contracts";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../lib/secureSessionStore", () => ({
  secureGet: async () => null,
  secureSet: async () => undefined,
  secureDelete: async () => undefined,
}));

import { createDurableSyncStore, syncStorageKeys } from "./durableStore";
import { createSyncEngine, type NewOutboxEntry } from "./engine";
import {
  SECURE_CHUNK_CHARS,
  asciiJson,
  createChunkedKeyValue,
  createMemoryKeyValue,
  type AsyncKeyValue,
} from "./storage";

function mealLog(n: number, mealName = "Lunch"): NewOutboxEntry {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    mutationId: id,
    idempotencyKey: id,
    entityType: "meal_compliance",
    recordId: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    operation: "meal.confirm",
    expectedServerVersion: null,
    clientOccurredAt: "2026-10-15T08:22:00.000Z",
    payloadJson: JSON.stringify({ mealName }),
  };
}

function open(storage: AsyncKeyValue, capacity: "full" | "small" = "full") {
  return createDurableSyncStore({ storage, prefix: "fitbud.sync.u1", capacity });
}

describe("durable sync store", () => {
  it("keeps an unsent meal log after the app is killed and reopened", async () => {
    const storage = createMemoryKeyValue();
    const first = open(storage);
    await first.enqueueOutbox(mealLog(1));

    const second = open(storage);
    const rows = await second.listOutbox();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ operation: "meal.confirm", status: "pending" });
  });

  it("the log is in storage before enqueue resolves (saved before any send)", async () => {
    const bag = new Map<string, string>();
    const store = open(createMemoryKeyValue(bag));

    await store.enqueueOutbox(mealLog(1));

    expect(bag.get("fitbud.sync.u1.outbox")).toContain("meal.confirm");
  });

  it("keeps order, attempts and the failure reason across a restart", async () => {
    const storage = createMemoryKeyValue();
    const first = open(storage);
    await first.enqueueOutbox(mealLog(1));
    await first.enqueueOutbox(mealLog(2));
    await first.patchOutbox(mealLog(1).mutationId, {
      status: "conflicted",
      lastError: "This meal cannot be logged.",
      lastErrorCode: "LOCKED",
      lastErrorReason: "superseded",
      attempts: 2,
    });
    const before = await first.listOutbox();

    const after = await open(storage).listOutbox();

    expect(after).toEqual(before);
  });

  it("a row that was in flight when the app died is waiting after the restart", async () => {
    const storage = createMemoryKeyValue();
    const first = open(storage);
    await first.enqueueOutbox(mealLog(1));
    await first.patchOutbox(mealLog(1).mutationId, { status: "in_flight" });

    const [row] = await open(storage).listOutbox();

    expect(row?.status).toBe("pending");
  });

  it("a sent row is gone after a restart too", async () => {
    const storage = createMemoryKeyValue();
    const first = open(storage);
    await first.enqueueOutbox(mealLog(1));
    await first.removeOutbox(mealLog(1).mutationId);
    await first.setLastSentAt("2026-11-15T11:11:00.000Z");

    const second = open(storage);

    expect(await second.listOutbox()).toEqual([]);
    expect((await second.getMeta()).lastSentAt).toBe("2026-11-15T11:11:00.000Z");
  });

  it("keeps the cached plan across a restart, on small storage too", async () => {
    const storage = createMemoryKeyValue();
    const first = open(storage, "small");
    await first.upsertLocal({
      entityType: "effective_plan",
      recordId: "plan-1",
      serverVersion: 3,
      payloadJson: JSON.stringify({ name: "Fat loss" }),
      tombstone: false,
      updatedAt: "2026-11-15T07:00:00.000Z",
    });

    const cached = await open(storage, "small").listLocal("effective_plan");

    expect(cached).toHaveLength(1);
    expect(cached[0]?.payloadJson).toContain("Fat loss");
  });

  it("small storage does not keep a pull cursor without the records it covers", async () => {
    const storage = createMemoryKeyValue();
    const first = open(storage, "small");
    await first.upsertLocal({
      entityType: "meal_assignment",
      recordId: "meal-1",
      serverVersion: 0,
      payloadJson: "{}",
      tombstone: false,
      updatedAt: "2026-11-15T07:00:00.000Z",
    });
    await first.setCursor("cursor-9", "2026-11-15T07:00:00.000Z");

    const second = open(storage, "small");

    expect(await second.listLocal("meal_assignment")).toEqual([]);
    expect((await second.getMeta()).cursor).toBeNull();
  });

  it("full storage keeps the cursor with the records", async () => {
    const storage = createMemoryKeyValue();
    const first = open(storage);
    await first.upsertLocal({
      entityType: "meal_assignment",
      recordId: "meal-1",
      serverVersion: 0,
      payloadJson: "{}",
      tombstone: false,
      updatedAt: "2026-11-15T07:00:00.000Z",
    });
    await first.setCursor("cursor-9", "2026-11-15T07:00:00.000Z");

    const second = open(storage);

    expect(await second.listLocal("meal_assignment")).toHaveLength(1);
    expect((await second.getMeta()).cursor).toBe("cursor-9");
  });

  it("a transaction writes storage once, after its last change", async () => {
    const inner = createMemoryKeyValue();
    const writes: string[] = [];
    const storage: AsyncKeyValue = {
      ...inner,
      set: async (key, value) => {
        writes.push(key);
        await inner.set(key, value);
      },
    };
    const store = open(storage);
    await store.listOutbox();

    await store.transaction(async () => {
      await store.enqueueOutbox(mealLog(1));
      await store.enqueueOutbox(mealLog(2));
      await store.enqueueOutbox(mealLog(3));
    });

    expect(writes).toEqual(["fitbud.sync.u1.outbox"]);
    expect(await open(inner).listOutbox()).toHaveLength(3);
  });

  it("storage that cannot be read fails the call instead of pretending the outbox is empty", async () => {
    const inner = createMemoryKeyValue();
    await open(inner).enqueueOutbox(mealLog(1));
    let failing = true;
    const storage: AsyncKeyValue = {
      ...inner,
      get: async (key) => {
        if (failing) throw new Error("keystore unavailable");
        return inner.get(key);
      },
    };
    const store = open(storage);

    await expect(store.listOutbox()).rejects.toThrow("keystore unavailable");
    failing = false;
    // The next call reads again, and the stored log is still there.
    expect(await store.listOutbox()).toHaveLength(1);
  });

  it("a failed write is reported and retried with the next write", async () => {
    const inner = createMemoryKeyValue();
    let failing = true;
    const storage: AsyncKeyValue = {
      ...inner,
      set: async (key, value) => {
        if (failing) throw new Error("disk full");
        await inner.set(key, value);
      },
    };
    const errors: string[] = [];
    const store = createDurableSyncStore({
      storage,
      prefix: "fitbud.sync.u1",
      capacity: "full",
      onError: (scope) => errors.push(scope),
    });

    await store.enqueueOutbox(mealLog(1));
    expect(errors).toEqual(["sync.store.write"]);
    // Still served from memory in this launch.
    expect(await store.listOutbox()).toHaveLength(1);

    failing = false;
    await store.enqueueOutbox(mealLog(2));
    expect(await open(inner).listOutbox()).toHaveLength(2);
  });

  it("clear removes every key the store may have written", async () => {
    const bag = new Map<string, string>();
    const store = open(createMemoryKeyValue(bag));
    await store.enqueueOutbox(mealLog(1));
    await store.upsertLocal({
      entityType: "effective_plan",
      recordId: "plan-1",
      serverVersion: 1,
      payloadJson: "{}",
      tombstone: false,
      updatedAt: "2026-11-15T07:00:00.000Z",
    });

    await store.clear();

    expect([...bag.keys()]).toEqual([]);
    expect(await store.listOutbox()).toEqual([]);
    expect(syncStorageKeys("fitbud.sync.u1")).toContain("fitbud.sync.u1.outbox");
  });
});

describe("kill and relaunch offline, then reconnect (AGENTS.md offline rule)", () => {
  it("logs made offline survive the kill and all send once, with no duplicates", async () => {
    const storage = createMemoryKeyValue();
    const serverRows = new Map<string, SyncMutationRequest>();
    let online = false;
    const api = {
      pushSync: async (body: {
        mutations: SyncMutationRequest[];
      }): Promise<SyncPushResponse> => {
        if (!online) throw new TypeError("Network request failed");
        return {
          results: body.mutations.map((mutation) => {
            const seen = serverRows.has(mutation.mutationId);
            serverRows.set(mutation.mutationId, mutation);
            return {
              mutationId: mutation.mutationId,
              status: seen ? ("already_applied" as const) : ("applied" as const),
              recordId: mutation.recordId,
              serverVersion: 1,
              entityType: mutation.entityType,
              error: null,
            };
          }),
        };
      },
      pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
    };

    // First launch, airplane mode: a meal, a set and a weight.
    const firstLaunch = createSyncEngine(open(storage), api);
    for (const n of [1, 2, 3]) {
      await firstLaunch.enqueue(mealLog(n));
      await firstLaunch.sendNow();
    }
    const queuedIds = (await firstLaunch.store.listOutbox()).map((r) => r.mutationId);
    expect(queuedIds).toHaveLength(3);

    // Kill. Relaunch, still offline: the same three are there, waiting.
    const secondLaunch = createSyncEngine(open(storage), api);
    await secondLaunch.recoverAfterRestart();
    expect((await secondLaunch.store.listOutbox()).map((r) => r.mutationId)).toEqual(queuedIds);
    expect(await secondLaunch.getStatus()).toMatchObject({ waiting: 3, sending: 0, failed: 0 });

    // Online: one send clears the queue.
    online = true;
    const outcome = await secondLaunch.sendNow();
    expect(outcome.sent).toBe(3);
    expect([...serverRows.keys()]).toEqual(queuedIds);

    // Kill again: nothing comes back to be sent twice.
    const thirdLaunch = createSyncEngine(open(storage), api);
    expect(await thirdLaunch.store.listOutbox()).toEqual([]);
    await thirdLaunch.sendNow();
    expect(serverRows.size).toBe(3);
  });
});

describe("chunked storage (the native keychain fallback)", () => {
  function backend() {
    const map = new Map<string, string>();
    return {
      map,
      get: async (key: string) => map.get(key) ?? null,
      set: async (key: string, value: string) => {
        if (value.length > 2000) throw new Error("value too large");
        map.set(key, value);
      },
      remove: async (key: string) => {
        map.delete(key);
      },
    };
  }

  it("round-trips a value far larger than one keychain entry", async () => {
    const b = backend();
    const storage = createChunkedKeyValue(b);
    const value = JSON.stringify({ rows: Array.from({ length: 400 }, (_, i) => `row-${i}`) });
    expect(value.length).toBeGreaterThan(SECURE_CHUNK_CHARS * 2);

    await storage.set("k", value);

    expect(JSON.parse((await storage.get("k"))!)).toEqual(JSON.parse(value));
  });

  it("keeps non-ASCII text intact (a meal named in Hindi, an emoji)", async () => {
    const storage = createChunkedKeyValue(backend(), 7);
    const value = JSON.stringify({ mealName: "दाल चावल 🍛 café" });

    await storage.set("k", value);

    expect(JSON.parse((await storage.get("k"))!)).toEqual(JSON.parse(value));
    expect([...asciiJson(value)].every((char) => char.charCodeAt(0) < 128)).toBe(true);
  });

  it("replacing a value leaves no chunk of the old one behind", async () => {
    const b = backend();
    const storage = createChunkedKeyValue(b, 10);
    await storage.set("k", JSON.stringify("x".repeat(95)));
    await storage.set("k", JSON.stringify("y"));

    expect(await storage.get("k")).toBe('"y"');
    expect([...b.map.keys()].sort()).toEqual(["k", "k.c1.0"]);

    await storage.remove("k");
    expect([...b.map.keys()]).toEqual([]);
  });

  it("a crash in the middle of a write leaves the previous value whole", async () => {
    const b = backend();
    const storage = createChunkedKeyValue(b, 10);
    await storage.set("k", JSON.stringify("old value that spans chunks"));
    let writes = 0;
    const crashing = createChunkedKeyValue(
      {
        ...b,
        set: async (key, value) => {
          writes += 1;
          if (writes === 3) throw new Error("killed");
          await b.set(key, value);
        },
      },
      10,
    );

    await expect(
      crashing.set("k", JSON.stringify("new value that also spans chunks")),
    ).rejects.toThrow("killed");

    expect(await storage.get("k")).toBe(JSON.stringify("old value that spans chunks"));
  });

  it("a missing chunk reads as nothing, never as a truncated value", async () => {
    const b = backend();
    const storage = createChunkedKeyValue(b, 10);
    await storage.set("k", JSON.stringify("a value that spans chunks"));
    b.map.delete("k.c0.1");

    expect(await storage.get("k")).toBeNull();
  });

  it("the durable store works on top of it", async () => {
    const storage = createChunkedKeyValue(backend(), 64);
    await open(storage, "small").enqueueOutbox(mealLog(1, "दाल"));

    const rows = await open(storage, "small").listOutbox();

    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payloadJson)).toEqual({ mealName: "दाल" });
  });
});
