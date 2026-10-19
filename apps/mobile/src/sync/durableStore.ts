import {
  createMemorySyncStore,
  type LocalRecord,
  type OutboxEntry,
  type PendingUpload,
  type SyncMeta,
  type TraineeSyncStore,
} from "./engine";

type Snapshot = {
  meta: SyncMeta;
  local: LocalRecord[];
  outbox: OutboxEntry[];
  uploads: PendingUpload[];
};

export type SyncStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const ENTITY_TYPES = [
  "workout_execution",
  "meal_compliance",
  "checkin",
  "measurement",
] as const;

async function readSnapshot(store: TraineeSyncStore): Promise<Snapshot> {
  const meta = await store.getMeta();
  const local: LocalRecord[] = [];
  for (const entityType of ENTITY_TYPES) {
    local.push(...(await store.listLocal(entityType)));
  }
  return {
    meta,
    local,
    outbox: await store.listOutbox(),
    uploads: await store.listPendingUploads(),
  };
}

/**
 * Web stand-in for the native SQLite outbox. The same snapshot is reloaded
 * after a refresh, which is the app-kill check we can run in Expo web.
 */
export function createDurableSyncStore(
  storage: SyncStorage,
  key = "fitbud.trainee.sync.v1",
): TraineeSyncStore {
  const inner = createMemorySyncStore();
  let ready: Promise<void> | null = null;

  function hydrate(): Promise<void> {
    if (ready) return ready;
    ready = hydrateFromStorage();
    return ready;
  }

  async function hydrateFromStorage(): Promise<void> {
    const raw = storage.getItem(key);
    if (!raw) return;
    let snap: Snapshot;
    try {
      snap = JSON.parse(raw) as Snapshot;
    } catch {
      return;
    }
    if (snap.meta?.lastSyncedAt || snap.meta?.cursor) {
      await inner.setCursor(snap.meta.cursor, snap.meta.lastSyncedAt ?? new Date(0).toISOString());
    }
    for (const row of snap.local ?? []) {
      await inner.upsertLocal(row);
    }
    for (const row of snap.outbox ?? []) {
      const created = await inner.enqueueOutbox({
        mutationId: row.mutationId,
        idempotencyKey: row.idempotencyKey,
        entityType: row.entityType,
        recordId: row.recordId,
        operation: row.operation,
        expectedServerVersion: row.expectedServerVersion,
        clientOccurredAt: row.clientOccurredAt,
        payloadJson: row.payloadJson,
      });
      if (row.status !== "pending") {
        await inner.updateOutboxStatus(created.mutationId, row.status, row.lastError);
      }
    }
    for (const row of snap.uploads ?? []) {
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

  async function persist(): Promise<void> {
    const snap = await readSnapshot(inner);
    storage.setItem(key, JSON.stringify(snap));
  }

  async function run<T>(fn: () => Promise<T>, write: boolean): Promise<T> {
    await hydrate();
    const value = await fn();
    if (write) await persist();
    return value;
  }

  return {
    getMeta: () => run(() => inner.getMeta(), false),
    setCursor: (cursor, lastSyncedAt) =>
      run(() => inner.setCursor(cursor, lastSyncedAt), true),
    upsertLocal: (record) => run(() => inner.upsertLocal(record), true),
    getLocal: (entityType, recordId) =>
      run(() => inner.getLocal(entityType, recordId), false),
    listLocal: (entityType) => run(() => inner.listLocal(entityType), false),
    enqueueOutbox: (entry) => run(() => inner.enqueueOutbox(entry), true),
    listPendingOutbox: () => run(() => inner.listPendingOutbox(), false),
    listOutbox: () => run(() => inner.listOutbox(), false),
    updateOutboxStatus: (mutationId, status, lastError) =>
      run(() => inner.updateOutboxStatus(mutationId, status, lastError), true),
    getOutbox: (mutationId) => run(() => inner.getOutbox(mutationId), false),
    enqueueUpload: (upload) => run(() => inner.enqueueUpload(upload), true),
    listPendingUploads: () => run(() => inner.listPendingUploads(), false),
    updateUploadStatus: (id, status) =>
      run(() => inner.updateUploadStatus(id, status), true),
    recoverAfterRestart: () => run(() => inner.recoverAfterRestart(), true),
  };
}

export function createBrowserDurableSyncStore(): TraineeSyncStore | null {
  if (typeof localStorage === "undefined") return null;
  return createDurableSyncStore(localStorage);
}
