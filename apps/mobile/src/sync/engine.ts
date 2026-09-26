import type {
  SyncChangeRecord,
  SyncEntityType,
  SyncMutationOperation,
  SyncMutationRequest,
  SyncMutationResult,
} from "@fitbud/contracts";
import {
  shouldAdvanceSyncCursor,
  type OutboxMutationStatus,
} from "@fitbud/core";

export type LocalRecord = {
  entityType: SyncEntityType;
  recordId: string;
  serverVersion: number | null;
  payloadJson: string | null;
  tombstone: boolean;
  updatedAt: string;
};

export type OutboxEntry = {
  mutationId: string;
  idempotencyKey: string;
  entityType: SyncEntityType;
  recordId: string;
  operation: SyncMutationOperation;
  expectedServerVersion: number | null;
  clientOccurredAt: string;
  payloadJson: string;
  status: OutboxMutationStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Pending file uploads stay outside structured sync mutations. */
export type PendingUpload = {
  id: string;
  coachingRelationshipId: string;
  mediaType: string;
  contentType: string;
  localUri: string;
  byteSize: number | null;
  status: "pending" | "uploading" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type SyncMeta = {
  cursor: string | null;
  lastSyncedAt: string | null;
};

export interface TraineeSyncStore {
  getMeta(): Promise<SyncMeta>;
  setCursor(cursor: string | null, lastSyncedAt: string): Promise<void>;
  upsertLocal(record: LocalRecord): Promise<void>;
  getLocal(
    entityType: SyncEntityType,
    recordId: string,
  ): Promise<LocalRecord | null>;
  listLocal(entityType: SyncEntityType): Promise<LocalRecord[]>;
  enqueueOutbox(
    entry: Omit<OutboxEntry, "status" | "lastError" | "createdAt" | "updatedAt">,
  ): Promise<OutboxEntry>;
  listPendingOutbox(): Promise<OutboxEntry[]>;
  updateOutboxStatus(
    mutationId: string,
    status: OutboxMutationStatus,
    lastError?: string | null,
  ): Promise<void>;
  getOutbox(mutationId: string): Promise<OutboxEntry | null>;
  enqueueUpload(
    upload: Omit<PendingUpload, "status" | "createdAt" | "updatedAt">,
  ): Promise<PendingUpload>;
  listPendingUploads(): Promise<PendingUpload[]>;
  updateUploadStatus(
    id: string,
    status: PendingUpload["status"],
  ): Promise<void>;
  /** Simulate process restart by clearing ephemeral in-flight markers. */
  recoverAfterRestart(): Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return crypto.randomUUID();
}

/** In-memory store for tests and environments without native SQLite. */
export function createMemorySyncStore(): TraineeSyncStore {
  const local = new Map<string, LocalRecord>();
  const outbox = new Map<string, OutboxEntry>();
  const uploads = new Map<string, PendingUpload>();
  let meta: SyncMeta = { cursor: null, lastSyncedAt: null };

  const key = (entityType: string, recordId: string) =>
    `${entityType}:${recordId}`;

  return {
    async getMeta() {
      return { ...meta };
    },
    async setCursor(cursor, lastSyncedAt) {
      meta = { cursor, lastSyncedAt };
    },
    async upsertLocal(record) {
      local.set(key(record.entityType, record.recordId), { ...record });
    },
    async getLocal(entityType, recordId) {
      return local.get(key(entityType, recordId)) ?? null;
    },
    async listLocal(entityType) {
      return [...local.values()].filter((row) => row.entityType === entityType);
    },
    async enqueueOutbox(entry) {
      const now = nowIso();
      const full: OutboxEntry = {
        ...entry,
        status: "pending",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      };
      outbox.set(full.mutationId, full);
      return { ...full };
    },
    async listPendingOutbox() {
      return [...outbox.values()]
        .filter((row) => row.status === "pending" || row.status === "in_flight")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async updateOutboxStatus(mutationId, status, lastError = null) {
      const existing = outbox.get(mutationId);
      if (!existing) return;
      outbox.set(mutationId, {
        ...existing,
        status,
        lastError,
        updatedAt: nowIso(),
      });
    },
    async getOutbox(mutationId) {
      const row = outbox.get(mutationId);
      return row ? { ...row } : null;
    },
    async enqueueUpload(upload) {
      const now = nowIso();
      const full: PendingUpload = {
        ...upload,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      uploads.set(full.id, full);
      return { ...full };
    },
    async listPendingUploads() {
      return [...uploads.values()].filter(
        (row) => row.status === "pending" || row.status === "failed",
      );
    },
    async updateUploadStatus(id, status) {
      const existing = uploads.get(id);
      if (!existing) return;
      uploads.set(id, { ...existing, status, updatedAt: nowIso() });
    },
    async recoverAfterRestart() {
      for (const [id, row] of outbox) {
        if (row.status === "in_flight") {
          outbox.set(id, {
            ...row,
            status: "pending",
            updatedAt: nowIso(),
          });
        }
      }
    },
  };
}

export type SyncApi = {
  pushSync: (body: {
    mutations: SyncMutationRequest[];
  }) => Promise<{ results: SyncMutationResult[] }>;
  pullSync: (query?: {
    cursor?: string | null;
    limit?: number;
  }) => Promise<{
    changes: SyncChangeRecord[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;
};

export type SyncEngine = {
  enqueue: (
    input: Omit<
      OutboxEntry,
      "status" | "lastError" | "createdAt" | "updatedAt" | "mutationId" | "idempotencyKey"
    > & {
      mutationId?: string;
      idempotencyKey?: string;
    },
  ) => Promise<OutboxEntry>;
  enqueueFileUpload: (
    input: Omit<PendingUpload, "status" | "createdAt" | "updatedAt" | "id"> & {
      id?: string;
    },
  ) => Promise<PendingUpload>;
  applyChange: (change: SyncChangeRecord) => Promise<void>;
  pushPending: () => Promise<SyncMutationResult[]>;
  pullAndApply: () => Promise<{ applied: number; advancedCursor: boolean }>;
  runCycle: () => Promise<void>;
  recoverAfterRestart: () => Promise<void>;
  store: TraineeSyncStore;
};

export function createSyncEngine(
  store: TraineeSyncStore,
  api: SyncApi,
): SyncEngine {
  async function applyChange(change: SyncChangeRecord): Promise<void> {
    await store.upsertLocal({
      entityType: change.entityType,
      recordId: change.recordId,
      serverVersion: change.serverVersion,
      payloadJson:
        change.payload === null || change.payload === undefined
          ? null
          : JSON.stringify(change.payload),
      tombstone: change.changeKind === "tombstone",
      updatedAt: change.changedAt,
    });
  }

  async function pushPending(): Promise<SyncMutationResult[]> {
    const pending = await store.listPendingOutbox();
    if (pending.length === 0) return [];

    const mutations: SyncMutationRequest[] = [];
    for (const entry of pending) {
      await store.updateOutboxStatus(entry.mutationId, "in_flight");
      mutations.push({
        mutationId: entry.mutationId,
        idempotencyKey: entry.idempotencyKey,
        entityType: entry.entityType,
        recordId: entry.recordId,
        operation: entry.operation,
        expectedServerVersion: entry.expectedServerVersion,
        clientOccurredAt: entry.clientOccurredAt,
        payload: JSON.parse(entry.payloadJson) as Record<string, unknown>,
      });
    }

    const response = await api.pushSync({ mutations });
    for (const result of response.results) {
      if (result.status === "applied" || result.status === "already_applied") {
        await store.updateOutboxStatus(result.mutationId, "acked");
        if (result.recordId && result.entityType) {
          const existing = await store.getLocal(
            result.entityType,
            result.recordId,
          );
          await store.upsertLocal({
            entityType: result.entityType,
            recordId: result.recordId,
            serverVersion: result.serverVersion,
            payloadJson: existing?.payloadJson ?? null,
            tombstone: false,
            updatedAt: nowIso(),
          });
        }
      } else if (result.status === "conflicted") {
        await store.updateOutboxStatus(
          result.mutationId,
          "conflicted",
          result.error?.message ?? "Conflict",
        );
      } else {
        await store.updateOutboxStatus(
          result.mutationId,
          "rejected",
          result.error?.message ?? "Rejected",
        );
      }
    }
    return response.results;
  }

  async function pullAndApply(): Promise<{
    applied: number;
    advancedCursor: boolean;
  }> {
    const meta = await store.getMeta();
    const pulled = await api.pullSync({ cursor: meta.cursor, limit: 50 });
    let applied = 0;
    for (const change of pulled.changes) {
      await applyChange(change);
      applied += 1;
    }
    const advanced = shouldAdvanceSyncCursor({
      appliedAllChanges: applied === pulled.changes.length,
      pullHasChanges: pulled.changes.length > 0,
    });
    if (advanced) {
      await store.setCursor(pulled.nextCursor, nowIso());
    }
    return { applied, advancedCursor: advanced };
  }

  return {
    store,
    async enqueue(input) {
      const mutationId = input.mutationId ?? createId();
      const idempotencyKey = input.idempotencyKey ?? createId();
      return store.enqueueOutbox({
        mutationId,
        idempotencyKey,
        entityType: input.entityType,
        recordId: input.recordId,
        operation: input.operation,
        expectedServerVersion: input.expectedServerVersion,
        clientOccurredAt: input.clientOccurredAt,
        payloadJson: input.payloadJson,
      });
    },
    async enqueueFileUpload(input) {
      return store.enqueueUpload({
        id: input.id ?? createId(),
        coachingRelationshipId: input.coachingRelationshipId,
        mediaType: input.mediaType,
        contentType: input.contentType,
        localUri: input.localUri,
        byteSize: input.byteSize,
      });
    },
    applyChange,
    pushPending,
    pullAndApply,
    async runCycle() {
      await pushPending();
      await pullAndApply();
    },
    async recoverAfterRestart() {
      await store.recoverAfterRestart();
    },
  };
}
