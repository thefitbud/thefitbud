import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Z11-8: the trainer offline cache is scoped to the signed-in trainer and
 * cleared on sign-out. Runs each case against both stores: the memory map
 * alone (native, where `localStorage` does not exist) and web `localStorage`.
 */

const TRAINER_A = "6f1c2a9e-3b4d-4c5e-8f70-1a2b3c4d5e6f";
const TRAINER_B = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b";
const RELATIONSHIP = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

const attentionA = {
  items: [{ id: "exc-a-1", clientName: "Priya Sharma", kind: "missed_workout" }],
  savedAt: "2026-11-11T05:30:00.000Z",
};
const attentionB = {
  items: [{ id: "exc-b-1", clientName: "Arjun Mehta", kind: "missed_checkin" }],
  savedAt: "2026-11-11T06:00:00.000Z",
};

/** A minimal Web Storage, enough for the cache (getItem/setItem/key/length). */
class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  keys() {
    return [...this.data.keys()];
  }
}

type CacheModule = typeof import("./cache");

async function freshCache(): Promise<CacheModule> {
  vi.resetModules();
  return import("./cache");
}

const stores = [
  { name: "memory store (native)", web: false },
  { name: "localStorage (web)", web: true },
] as const;

describe.each(stores)("trainer cache, $name", ({ web }) => {
  let storage: MemoryStorage | null = null;
  let cache: CacheModule;

  beforeEach(async () => {
    if (web) {
      storage = new MemoryStorage();
      vi.stubGlobal("localStorage", storage);
    } else {
      storage = null;
    }
    cache = await freshCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads back the signed-in trainer's own snapshot", () => {
    cache.setTrainerCacheOwner(TRAINER_A);
    cache.writeTrainerCache("trainer:attention", attentionA);
    cache.writeTrainerCache(`trainer:client:${RELATIONSHIP}`, { name: "Priya Sharma" });

    expect(cache.readTrainerCache("trainer:attention")).toEqual(attentionA);
    expect(cache.readTrainerCache(`trainer:client:${RELATIONSHIP}`)).toEqual({
      name: "Priya Sharma",
    });
  });

  it("never serves trainer A's snapshot to trainer B, even without a sign-out clear", () => {
    cache.setTrainerCacheOwner(TRAINER_A);
    cache.writeTrainerCache("trainer:attention", attentionA);

    cache.setTrainerCacheOwner(TRAINER_B);
    expect(cache.readTrainerCache("trainer:attention")).toBeNull();

    cache.writeTrainerCache("trainer:attention", attentionB);
    expect(cache.readTrainerCache("trainer:attention")).toEqual(attentionB);

    cache.setTrainerCacheOwner(TRAINER_A);
    expect(cache.readTrainerCache("trainer:attention")).toEqual(attentionA);
  });

  it("returns null for B after A signs out (clear + no owner) and B signs in", () => {
    cache.setTrainerCacheOwner(TRAINER_A);
    cache.writeTrainerCache("trainer:attention", attentionA);
    cache.writeTrainerCache("trainer:clients", { items: [{ id: "client-1" }] });

    cache.clearTrainerCache();
    cache.setTrainerCacheOwner(null);
    cache.setTrainerCacheOwner(TRAINER_B);

    expect(cache.readTrainerCache("trainer:attention")).toBeNull();
    expect(cache.readTrainerCache("trainer:clients")).toBeNull();
    // A signing back in finds nothing either: the clear removed it.
    cache.setTrainerCacheOwner(TRAINER_A);
    expect(cache.readTrainerCache("trainer:attention")).toBeNull();
  });

  it("with no owner set, reads return null and writes are dropped", () => {
    expect(cache.readTrainerCache("trainer:attention")).toBeNull();
    cache.writeTrainerCache("trainer:attention", attentionA);
    expect(cache.readTrainerCache("trainer:attention")).toBeNull();

    // Nothing reached storage while no owner was set.
    if (storage) expect(storage.length).toBe(0);
    cache.setTrainerCacheOwner(TRAINER_A);
    expect(cache.readTrainerCache("trainer:attention")).toBeNull();

    // An empty owner id counts as no owner.
    cache.setTrainerCacheOwner("");
    cache.writeTrainerCache("trainer:attention", attentionA);
    cache.setTrainerCacheOwner(TRAINER_A);
    expect(cache.readTrainerCache("trainer:attention")).toBeNull();
  });

  it("does not read a legacy unscoped key written by an older build", () => {
    // Older builds stored the snapshot under the bare caller key.
    storage?.setItem("trainer:attention", JSON.stringify(attentionA));
    cache.setTrainerCacheOwner(TRAINER_B);
    expect(cache.readTrainerCache("trainer:attention")).toBeNull();
  });

  it("clear removes every trainer: entry, scoped and legacy, and keeps other keys", () => {
    cache.setTrainerCacheOwner(TRAINER_A);
    cache.writeTrainerCache("trainer:attention", attentionA);
    cache.writeTrainerCache(`trainer:client:${RELATIONSHIP}`, { name: "Priya Sharma" });
    cache.setTrainerCacheOwner(TRAINER_B);
    cache.writeTrainerCache("trainer:clients", { items: [] });
    storage?.setItem("trainer:attention", JSON.stringify(attentionA));
    storage?.setItem(`trainer:client:${RELATIONSHIP}`, "{}");
    storage?.setItem("fitbud.accessToken", "kept-by-session-storage");

    cache.clearTrainerCache();

    for (const owner of [TRAINER_A, TRAINER_B]) {
      cache.setTrainerCacheOwner(owner);
      expect(cache.readTrainerCache("trainer:attention")).toBeNull();
      expect(cache.readTrainerCache("trainer:clients")).toBeNull();
      expect(cache.readTrainerCache(`trainer:client:${RELATIONSHIP}`)).toBeNull();
    }
    if (storage) {
      expect(storage.keys()).toEqual(["fitbud.accessToken"]);
    }
  });
});

describe("trainer cache, memory store on web", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clear empties the memory copy too, so a rejected localStorage write cannot leak", async () => {
    // Private mode: setItem throws, so only the memory map holds the snapshot.
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    vi.stubGlobal("localStorage", storage);
    const cache = await freshCache();

    cache.setTrainerCacheOwner(TRAINER_A);
    cache.writeTrainerCache("trainer:attention", attentionA);
    expect(cache.readTrainerCache("trainer:attention")).toEqual(attentionA);

    cache.clearTrainerCache();
    expect(cache.readTrainerCache("trainer:attention")).toBeNull();
  });
});
