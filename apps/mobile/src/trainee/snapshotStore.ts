import { reportError } from "../lib/reportError";
import { deviceStorage, type AsyncKeyValue } from "../sync/storage";
import {
  hydrateCached,
  registerSnapshotClearer,
  setCachePersistence,
  type CachePersistence,
} from "./dataCache";

/**
 * Trainee read snapshots on the phone (Z14-2, D-W14-6, D-W14-7).
 *
 * The trainee screens read from `dataCache`, which lives in memory. This
 * store keeps the entries a cold start paints from (day views, week models,
 * workout lists, the progress summary and check-in list) in the device store
 * (`deviceStorage()`, SQLite on native since Z14-5), and puts them back into
 * `dataCache` before the first tab renders. A snapshot is a starting point,
 * never the truth: it comes back with the time it was saved, so every screen
 * refreshes it in the background (stale-while-revalidate), and the outbox is
 * applied on top of it (`today/queuedLogs.ts`).
 *
 * Layout, under an owner-scoped prefix `fitbud.snap.<userId>`:
 * - `<prefix>.index`      `{ v: 1, saved: { [cacheKey]: savedAtMs } }`;
 * - `<prefix>.e.<key>`    `{ v: 1, key, savedAt, value }`, one per entry.
 * An entry is written before the index names it, so the index never points
 * at a value that was not written. The device remembers one owner
 * (`fitbud.snap.owner`); opening the store for another user removes the
 * previous owner's snapshots first, like the outbox (`sync/userStore.ts`).
 *
 * Only `full` storage keeps snapshots: on a dev build without SQLite (the
 * keychain, `small`) or with no storage at all this store does nothing.
 */

/** Cache keys that are kept on the phone. Everything else is memory only. */
export const SNAPSHOT_PREFIXES = [
  "dayview:",
  "workouts:",
  "progress:",
  "progress-checkins:",
] as const;

/** Snapshots older than this are pruned when the store opens. */
export const SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** At most this many snapshots are kept; the oldest go first. */
export const SNAPSHOT_LIMIT = 80;
/** Writes to one key within this window are coalesced into one. */
export const SNAPSHOT_WRITE_DELAY_MS = 250;

const OWNER_KEY = "fitbud.snap.owner";

export function isSnapshotKey(key: string): boolean {
  return SNAPSHOT_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function snapshotPrefixFor(userId: string): string {
  return `fitbud.snap.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/** Storage keys use letters, digits, ".", "-" and "_" only (`storage.ts`). */
function entryKey(prefix: string, cacheKey: string): string {
  return `${prefix}.e.${cacheKey.replace(/[^A-Za-z0-9_-]/g, ".")}`;
}

type Index = { v: 1; saved: Record<string, number> };
type StoredEntry = { v: 1; key: string; savedAt: number; value: unknown };

export type SnapshotEntry = { key: string; value: unknown; savedAt: number };

export type SnapshotStore = {
  /**
   * Reads every snapshot still young enough, pruning the rest. Entries that
   * do not parse are reported and dropped, never returned.
   */
  hydrate(filter?: (key: string) => boolean): Promise<SnapshotEntry[]>;
  /** Queues `value` as the snapshot of `key` (coalesced per key). */
  write(key: string, value: unknown, savedAt: number): void;
  /** Writes everything queued now. */
  flush(): Promise<void>;
  /** Drops every snapshot of this owner, on the phone and queued. */
  clear(): Promise<void>;
};

export type SnapshotStoreOptions = {
  storage: AsyncKeyValue;
  userId: string;
  now?: () => number;
  /** Storage that could not be read, parsed or written. Never gets a value. */
  onError?: (scope: string, error: unknown) => void;
  /** Coalescing window; 0 writes on the next tick (tests). */
  writeDelayMs?: number;
};

function parseIndex(raw: string | null): Index | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<Index> | null;
  if (!parsed || parsed.v !== 1 || typeof parsed.saved !== "object" || !parsed.saved) {
    throw new Error("Snapshot index has an unknown shape");
  }
  const saved: Record<string, number> = {};
  for (const [key, at] of Object.entries(parsed.saved)) {
    if (typeof at === "number" && Number.isFinite(at)) saved[key] = at;
  }
  return { v: 1, saved };
}

async function removeOwner(storage: AsyncKeyValue, userId: string): Promise<void> {
  const prefix = snapshotPrefixFor(userId);
  let index: Index | null = null;
  try {
    index = parseIndex(await storage.get(`${prefix}.index`));
  } catch {
    // An unreadable index still has to go; its entries age out unread.
  }
  for (const key of Object.keys(index?.saved ?? {})) {
    await storage.remove(entryKey(prefix, key));
  }
  await storage.remove(`${prefix}.index`);
}

/**
 * Makes `userId` the device's snapshot owner. A different stored owner's
 * snapshots are removed first; the marker is written last, so a failure
 * part-way is repeated on the next open.
 */
export async function claimSnapshotOwner(
  storage: AsyncKeyValue,
  userId: string,
): Promise<void> {
  const previous = await storage.get(OWNER_KEY);
  if (previous === userId) return;
  if (previous) await removeOwner(storage, previous);
  await storage.set(OWNER_KEY, userId);
}

export function createSnapshotStore(options: SnapshotStoreOptions): SnapshotStore {
  const { storage, userId } = options;
  const now = options.now ?? Date.now;
  const delay = options.writeDelayMs ?? SNAPSHOT_WRITE_DELAY_MS;
  const prefix = snapshotPrefixFor(userId);
  const indexKey = `${prefix}.index`;
  const report = (scope: string, error: unknown) => {
    try {
      options.onError?.(scope, error);
    } catch {
      // Reporting must never break a read or a write.
    }
  };

  let index: Index = { v: 1, saved: {} };
  let opened: Promise<void> | null = null;
  const queued = new Map<string, { value: unknown; savedAt: number }>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  /** Bumped by `clear`: a write queued before it never lands after it. */
  let generation = 0;

  async function readIndex(): Promise<void> {
    await claimSnapshotOwner(storage, userId);
    try {
      index = parseIndex(await storage.get(indexKey)) ?? { v: 1, saved: {} };
    } catch (error) {
      report("trainee.snapshot.read", error);
      index = { v: 1, saved: {} };
    }
  }

  function open(): Promise<void> {
    if (!opened) {
      const attempt = readIndex();
      opened = attempt;
      attempt.catch(() => {
        if (opened === attempt) opened = null;
      });
    }
    return opened;
  }

  async function writeIndex(): Promise<void> {
    await storage.set(indexKey, JSON.stringify(index));
  }

  async function dropKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    for (const key of keys) {
      delete index.saved[key];
      try {
        await storage.remove(entryKey(prefix, key));
      } catch (error) {
        report("trainee.snapshot.remove", error);
      }
    }
  }

  /** The oldest snapshots beyond the limit. */
  function overLimit(): string[] {
    const keys = Object.entries(index.saved).sort((a, b) => a[1] - b[1]);
    return keys.slice(0, Math.max(0, keys.length - SNAPSHOT_LIMIT)).map(([key]) => key);
  }

  async function writeQueued(): Promise<void> {
    const startedIn = generation;
    // Nothing queued opens nothing (a flush after a clear writes no owner).
    if (queued.size === 0) return;
    await open();
    if (startedIn !== generation) return;
    const batch = [...queued.entries()];
    queued.clear();
    if (batch.length === 0) return;
    for (const [key, entry] of batch) {
      if (startedIn !== generation) return;
      const stored: StoredEntry = { v: 1, key, savedAt: entry.savedAt, value: entry.value };
      let text: string;
      try {
        text = JSON.stringify(stored);
      } catch (error) {
        report("trainee.snapshot.write", error);
        continue;
      }
      try {
        await storage.set(entryKey(prefix, key), text);
        index.saved[key] = entry.savedAt;
      } catch (error) {
        // Full or failing storage: make room once and try again; if that
        // also fails this launch keeps the entry in memory only.
        report("trainee.snapshot.write", error);
        const oldest = Object.entries(index.saved)
          .sort((a, b) => a[1] - b[1])
          .slice(0, 5)
          .map(([old]) => old);
        await dropKeys(oldest);
        try {
          await storage.set(entryKey(prefix, key), text);
          index.saved[key] = entry.savedAt;
        } catch {
          // Reported above.
        }
      }
    }
    if (startedIn !== generation) return;
    await dropKeys(overLimit());
    try {
      await writeIndex();
    } catch (error) {
      report("trainee.snapshot.write", error);
    }
  }

  function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const run = chain.then(writeQueued, writeQueued);
    chain = run.catch((error: unknown) => report("trainee.snapshot.write", error));
    return chain;
  }

  return {
    async hydrate(filter) {
      await open();
      const cutoff = now() - SNAPSHOT_MAX_AGE_MS;
      const expired: string[] = [];
      const entries: SnapshotEntry[] = [];
      const broken: string[] = [];
      for (const [key, savedAt] of Object.entries(index.saved)) {
        if (savedAt < cutoff || !isSnapshotKey(key)) {
          expired.push(key);
          continue;
        }
        if (filter && !filter(key)) continue;
        let raw: string | null;
        try {
          raw = await storage.get(entryKey(prefix, key));
        } catch (error) {
          // Unreadable this time: keep it for the next launch.
          report("trainee.snapshot.read", error);
          continue;
        }
        if (raw === null) {
          broken.push(key);
          continue;
        }
        try {
          const stored = JSON.parse(raw) as Partial<StoredEntry> | null;
          if (
            !stored ||
            stored.v !== 1 ||
            stored.key !== key ||
            typeof stored.savedAt !== "number" ||
            stored.value === undefined ||
            stored.value === null
          ) {
            throw new Error("Snapshot entry has an unknown shape");
          }
          entries.push({ key, value: stored.value, savedAt: stored.savedAt });
        } catch (error) {
          // A corrupt snapshot is never shown: reported and dropped.
          report("trainee.snapshot.read", error);
          broken.push(key);
        }
      }
      if (expired.length > 0 || broken.length > 0) {
        await dropKeys([...expired, ...broken]);
        try {
          await writeIndex();
        } catch (error) {
          report("trainee.snapshot.write", error);
        }
      }
      return entries;
    },
    write(key, value, savedAt) {
      if (!isSnapshotKey(key) || value === undefined) return;
      queued.set(key, { value, savedAt });
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, delay);
    },
    flush,
    async clear() {
      generation += 1;
      queued.clear();
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await chain.catch(() => undefined);
      const keys = Object.keys(index.saved);
      index = { v: 1, saved: {} };
      try {
        for (const key of keys) await storage.remove(entryKey(prefix, key));
        await removeOwner(storage, userId);
        if ((await storage.get(OWNER_KEY)) === userId) {
          await storage.remove(OWNER_KEY);
        }
      } catch (error) {
        report("trainee.snapshot.clear", error);
      }
      opened = null;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The app's binding: one store for the signed-in trainee                      */
/* -------------------------------------------------------------------------- */

let bound: { userId: string; relationshipId: string; store: SnapshotStore } | null = null;
let binding: Promise<void> | null = null;
let bindingFor: string | null = null;
/** Bumped by every clear: a binding that started before it never lands. */
let clears = 0;

/** True once this user's and relationship's snapshots are in `dataCache`. */
export function snapshotsBoundFor(userId: string, relationshipId: string): boolean {
  return bound?.userId === userId && bound.relationshipId === relationshipId;
}

function relationshipKeyFilter(relationshipId: string) {
  return (key: string) => key.split(":").includes(relationshipId);
}

/**
 * Opens the signed-in trainee's snapshots, puts this relationship's into
 * `dataCache` (never over a fresher in-memory entry) and starts writing
 * every snapshot-kind cache write back to the phone. Resolves when the
 * hydration is done; never rejects (a failure is reported and the app
 * starts from the network, as before).
 */
export function bindTraineeSnapshots(input: {
  userId: string;
  relationshipId: string;
  storage?: AsyncKeyValue | null;
}): Promise<void> {
  const { userId, relationshipId } = input;
  const id = `${userId}|${relationshipId}`;
  if (snapshotsBoundFor(userId, relationshipId)) return Promise.resolve();
  if (binding && bindingFor === id) return binding;
  const run = (async () => {
    const startedAfter = clears;
    let storage: AsyncKeyValue | null | undefined = input.storage;
    if (storage === undefined) {
      const device = deviceStorage();
      storage = device.capacity === "full" ? device.storage : null;
    }
    if (!storage) {
      setCachePersistence(null);
      bound = null;
      return;
    }
    const store = createSnapshotStore({ storage, userId, onError: reportError });
    try {
      const entries = await store.hydrate(relationshipKeyFilter(relationshipId));
      // The session ended while the phone was being read: nothing of it may
      // paint or be written back.
      if (startedAfter !== clears) return;
      hydrateCached(entries);
    } catch (error) {
      reportError("trainee.snapshot.hydrate", error);
    }
    if (startedAfter !== clears) return;
    const persistence: CachePersistence = {
      onWrite(key, value, updatedAt) {
        if (key.split(":").includes(relationshipId)) store.write(key, value, updatedAt);
      },
    };
    bound = { userId, relationshipId, store };
    setCachePersistence(persistence);
  })().finally(() => {
    if (binding === run) {
      binding = null;
      bindingFor = null;
    }
  });
  binding = run;
  bindingFor = id;
  return run;
}

/**
 * Drops the trainee's snapshots from the phone: sign-out and every other end
 * of a session (through `clearDayViews`), and a switch to the trainer role.
 * The outbox is not touched here.
 */
export async function clearTraineeSnapshots(): Promise<void> {
  clears += 1;
  const active = bound;
  bound = null;
  setCachePersistence(null);
  try {
    if (active) {
      await active.store.clear();
      return;
    }
    const device = deviceStorage();
    if (device.capacity !== "full") return;
    const owner = await device.storage.get(OWNER_KEY);
    if (owner) await removeOwner(device.storage, owner);
    await device.storage.remove(OWNER_KEY);
  } catch (error) {
    reportError("trainee.snapshot.clear", error);
  }
}

/** Writes every queued snapshot now (the app going to the background). */
export function flushTraineeSnapshots(): Promise<void> {
  return bound?.store.flush() ?? Promise.resolve();
}

// Every end of a session clears the day views (`clearDayViews`, called by
// AuthProvider); the snapshots on the phone go with them.
registerSnapshotClearer(() => {
  void clearTraineeSnapshots();
});

/** Tests only. */
export function resetTraineeSnapshotsForTests(): void {
  bound = null;
  binding = null;
  bindingFor = null;
  setCachePersistence(null);
}
