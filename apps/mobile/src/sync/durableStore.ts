import type { SyncEntityType } from "@fitbud/contracts";
import {
  createMemorySyncStore,
  type LocalRecord,
  type OutboxEntry,
  type PendingUpload,
  type SyncMeta,
  type TraineeSyncStore,
} from "./engine";
import type { AsyncKeyValue } from "./storage";

/**
 * The sync store that survives an app kill (Z12-41).
 *
 * State lives in a memory store and is written to device storage after every
 * change, before the write's promise resolves: a log is on the phone before
 * anything tries to send it. Storage is split into segments so a change to the
 * outbox never rewrites the cached plan:
 *
 * - `<prefix>.outbox`             the outbox, pending uploads and meta;
 * - `<prefix>.local.<entityType>` the synced records of one entity type.
 *
 * One segment is one storage value, replaced whole, so a segment is never
 * half-written. A push result touches a record's version (a `local` segment)
 * and removes the outbox row; the record is written first, so a crash between
 * the two leaves the row waiting, it is sent again, and the server answers
 * `already_applied`.
 */

const ALL_ENTITY_TYPES: readonly SyncEntityType[] = [
  "effective_plan",
  "workout_assignment",
  "workout_execution",
  "meal_assignment",
  "meal_compliance",
  "checkin",
  "measurement",
];

/**
 * Small storage (the native keychain) keeps the outbox and the plan a cold
 * start opens on. The pull cursor is not kept there: the records it covers
 * are not, so after a restart the pull starts again from the beginning.
 */
const SMALL_ENTITY_TYPES: readonly SyncEntityType[] = ["effective_plan"];

/** A `local` segment larger than this is not written to small storage. */
export const SMALL_SEGMENT_MAX_CHARS = 200_000;

type OutboxSegment = {
  v: 2;
  meta: SyncMeta;
  outbox: OutboxEntry[];
  uploads: PendingUpload[];
};

export type DurableSyncStoreOptions = {
  storage: AsyncKeyValue;
  /** Owner-scoped key prefix, for example `fitbud.sync.<userId>`. */
  prefix: string;
  capacity: "full" | "small";
  /**
   * Runs once before the first read (the owner check). If it throws, nothing
   * is read and the call fails; the next call tries again.
   */
  beforeOpen?: () => Promise<void>;
  /** Storage that could not be written or parsed. Never receives a value. */
  onError?: (scope: string, error: unknown) => void;
};

export type DurableSyncStore = TraineeSyncStore & {
  /** Every storage key this store may have written (for an owner change). */
  storageKeys(): string[];
};

export function syncStorageKeys(prefix: string): string[] {
  return [
    `${prefix}.outbox`,
    ...ALL_ENTITY_TYPES.map((type) => `${prefix}.local.${type}`),
  ];
}

function withDefaults(row: OutboxEntry): OutboxEntry {
  // Rows written before a field existed read as if it had its empty value.
  return {
    ...row,
    lastError: row.lastError ?? null,
    lastErrorCode: row.lastErrorCode ?? null,
    lastErrorReason: row.lastErrorReason ?? null,
    attempts: row.attempts ?? 0,
    lastAttemptAt: row.lastAttemptAt ?? null,
    keptAt: row.keptAt ?? null,
  };
}

export function createDurableSyncStore(
  options: DurableSyncStoreOptions,
): DurableSyncStore {
  const { storage, prefix, capacity } = options;
  const inner = createMemorySyncStore();
  const persistedTypes =
    capacity === "full" ? ALL_ENTITY_TYPES : SMALL_ENTITY_TYPES;
  const outboxKey = `${prefix}.outbox`;
  const localKey = (type: SyncEntityType) => `${prefix}.local.${type}`;
  const report = (scope: string, error: unknown) => {
    try {
      options.onError?.(scope, error);
    } catch {
      // Reporting must never break a write.
    }
  };

  let ready: Promise<void> | null = null;
  const dirty = new Set<string>();
  let depth = 0;
  let flushing: Promise<void> = Promise.resolve();

  function parse<T>(raw: string | null, scope: string): T | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      report(scope, error);
      return null;
    }
  }

  async function hydrate(): Promise<void> {
    await options.beforeOpen?.();
    const segment = parse<OutboxSegment>(
      await storage.get(outboxKey),
      "sync.store.read",
    );
    const locals: LocalRecord[] = [];
    for (const type of persistedTypes) {
      const rows = parse<LocalRecord[]>(
        await storage.get(localKey(type)),
        "sync.store.read",
      );
      if (Array.isArray(rows)) locals.push(...rows);
    }
    // Everything is read before anything is applied, so a read that throws
    // leaves the memory store empty and the next call starts again.
    for (const row of locals) await inner.upsertLocal(row);
    if (!segment || segment.v !== 2) return;
    if (capacity === "full" && (segment.meta?.cursor || segment.meta?.lastSyncedAt)) {
      await inner.setCursor(
        segment.meta.cursor ?? null,
        segment.meta.lastSyncedAt ?? new Date(0).toISOString(),
      );
    }
    if (segment.meta?.lastSentAt) {
      await inner.setLastSentAt(segment.meta.lastSentAt);
    }
    inner.restoreOutbox(
      (segment.outbox ?? []).map((stored) => {
        const row = withDefaults(stored);
        // Nothing is in flight in a process that has just started.
        return row.status === "in_flight" ? { ...row, status: "pending" } : row;
      }),
    );
    for (const row of segment.uploads ?? []) {
      const created = await inner.enqueueUpload({
        id: row.id,
        coachingRelationshipId: row.coachingRelationshipId,
        mediaType: row.mediaType,
        contentType: row.contentType,
        localUri: row.localUri,
        byteSize: row.byteSize,
      });
      if (row.status !== "pending") {
        await inner.updateUploadStatus(created.id, row.status);
      }
    }
  }

  function open(): Promise<void> {
    if (!ready) {
      const attempt = hydrate();
      ready = attempt;
      attempt.catch(() => {
        // Not cached: storage may answer on the next call.
        if (ready === attempt) ready = null;
      });
    }
    return ready;
  }

  async function writeSegment(key: string): Promise<void> {
    if (key === outboxKey) {
      const meta = await inner.getMeta();
      const segment: OutboxSegment = {
        v: 2,
        meta:
          capacity === "full"
            ? meta
            : { cursor: null, lastSyncedAt: null, lastSentAt: meta.lastSentAt },
        outbox: await inner.listOutbox(),
        uploads: await inner.listPendingUploads(),
      };
      await storage.set(key, JSON.stringify(segment));
      return;
    }
    const type = persistedTypes.find((candidate) => localKey(candidate) === key);
    if (!type) return;
    const text = JSON.stringify(await inner.listLocal(type));
    if (capacity === "small" && text.length > SMALL_SEGMENT_MAX_CHARS) {
      // Too large for the keychain: this launch keeps it in memory only.
      await storage.remove(key);
      return;
    }
    await storage.set(key, text);
  }

  /** Writes every dirty segment, records before the outbox. One at a time. */
  function flush(): Promise<void> {
    const run = flushing.then(async () => {
      const keys = [...dirty].sort((a, b) =>
        a === outboxKey ? 1 : b === outboxKey ? -1 : a.localeCompare(b),
      );
      for (const key of keys) {
        dirty.delete(key);
        try {
          await writeSegment(key);
        } catch (error) {
          // The memory copy still serves this launch; the segment stays
          // dirty, so the next write tries it again.
          dirty.add(key);
          report("sync.store.write", error);
        }
      }
    });
    flushing = run;
    return run;
  }

  async function read<T>(work: () => Promise<T>): Promise<T> {
    await open();
    return work();
  }

  async function write<T>(key: string | null, work: () => Promise<T>): Promise<T> {
    await open();
    const value = await work();
    if (key) dirty.add(key);
    if (depth === 0) await flush();
    return value;
  }

  const localSegment = (type: SyncEntityType) =>
    persistedTypes.includes(type) ? localKey(type) : null;

  return {
    storageKeys: () => syncStorageKeys(prefix),
    getMeta: () => read(() => inner.getMeta()),
    setCursor: (cursor, lastSyncedAt) =>
      write(outboxKey, () => inner.setCursor(cursor, lastSyncedAt)),
    setLastSentAt: (lastSentAt) =>
      write(outboxKey, () => inner.setLastSentAt(lastSentAt)),
    upsertLocal: (record) =>
      write(localSegment(record.entityType), () => inner.upsertLocal(record)),
    getLocal: (entityType, recordId) =>
      read(() => inner.getLocal(entityType, recordId)),
    listLocal: (entityType) => read(() => inner.listLocal(entityType)),
    enqueueOutbox: (entry) => write(outboxKey, () => inner.enqueueOutbox(entry)),
    listPendingOutbox: () => read(() => inner.listPendingOutbox()),
    listOutbox: () => read(() => inner.listOutbox()),
    updateOutboxStatus: (mutationId, status, lastError) =>
      write(outboxKey, () =>
        inner.updateOutboxStatus(mutationId, status, lastError),
      ),
    patchOutbox: (mutationId, patch) =>
      write(outboxKey, () => inner.patchOutbox(mutationId, patch)),
    removeOutbox: (mutationId) =>
      write(outboxKey, () => inner.removeOutbox(mutationId)),
    getOutbox: (mutationId) => read(() => inner.getOutbox(mutationId)),
    enqueueUpload: (upload) => write(outboxKey, () => inner.enqueueUpload(upload)),
    listPendingUploads: () => read(() => inner.listPendingUploads()),
    updateUploadStatus: (id, status) =>
      write(outboxKey, () => inner.updateUploadStatus(id, status)),
    recoverAfterRestart: () =>
      write(outboxKey, () => inner.recoverAfterRestart()),
    async transaction(work) {
      await open();
      depth += 1;
      try {
        return await inner.transaction(work);
      } finally {
        depth -= 1;
        if (depth === 0) await flush();
      }
    },
    subscribe: (listener) => inner.subscribe(listener),
    async clear() {
      // Clearing must work even when storage cannot be read.
      await open().catch(() => undefined);
      await inner.clear();
      dirty.clear();
      await flushing.catch(() => undefined);
      for (const key of syncStorageKeys(prefix)) {
        try {
          await storage.remove(key);
        } catch (error) {
          report("sync.store.clear", error);
        }
      }
    },
  };
}
