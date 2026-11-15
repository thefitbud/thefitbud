import { ApiClientError } from "@fitbud/api-client";
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

/**
 * Trainee offline sync (Z12-41).
 *
 * The outbox is the only source of sync status. A row is in exactly one state:
 * - `pending`     waiting on this phone ("Saved on phone");
 * - `in_flight`   in a request that has not answered yet ("Sending…");
 * - `rejected` / `conflicted`  the server answered and refused it, with the
 *   reason kept on the row;
 * - sent: the row is REMOVED when the server answers `applied` or
 *   `already_applied`. Nothing "sent" is left behind to be miscounted.
 *
 * A request that fails (no network, timeout, 5xx, an unreadable answer) puts
 * its rows back to `pending` with the reason, so a row is never left "sending"
 * with nothing in flight. Pushes run one at a time, so the same row is never
 * in two requests at once; a retry reuses the row's mutation id and
 * idempotency key, and the server answers `already_applied` for a duplicate.
 */

export type LocalRecord = {
  entityType: SyncEntityType;
  recordId: string;
  serverVersion: number | null;
  payloadJson: string | null;
  tombstone: boolean;
  updatedAt: string;
};

/**
 * Why a row that is still waiting did not send on its last attempt. Never
 * shown raw: `outboxCopy` turns it into trainee-facing text.
 * - `UNREACHABLE` the request never got an answer (no network, timeout);
 * - `SERVER`      the API answered 5xx, 408 or 429, or told us to retry;
 * - `AUTH`        the API answered 401 or 403 for the whole request;
 * - `CLIENT`      the answer could not be read (a client/server disagreement).
 */
export type WaitingReason = "UNREACHABLE" | "SERVER" | "AUTH" | "CLIENT";

const WAITING_REASONS: readonly string[] = [
  "UNREACHABLE",
  "SERVER",
  "AUTH",
  "CLIENT",
];

export function isWaitingReason(value: unknown): value is WaitingReason {
  return typeof value === "string" && WAITING_REASONS.includes(value);
}

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
  /** The server's own (static) message for a refused row; null otherwise. */
  lastError: string | null;
  /**
   * The server's error code for a refused row, or a `WaitingReason` for a row
   * that is waiting after a failed attempt. Null before the first attempt.
   */
  lastErrorCode: string | null;
  /** `details.reason` from the server's error, when it sent one. */
  lastErrorReason: string | null;
  /** Requests this row has been part of. */
  attempts: number;
  lastAttemptAt: string | null;
  /** Set when the trainee chose "Keep my log" on a conflict (TR-19b). */
  keptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewOutboxEntry = Pick<
  OutboxEntry,
  | "mutationId"
  | "idempotencyKey"
  | "entityType"
  | "recordId"
  | "operation"
  | "expectedServerVersion"
  | "clientOccurredAt"
  | "payloadJson"
>;

export type OutboxPatch = Partial<
  Pick<
    OutboxEntry,
    | "status"
    | "lastError"
    | "lastErrorCode"
    | "lastErrorReason"
    | "attempts"
    | "lastAttemptAt"
    | "keptAt"
  >
>;

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
  /** When the server last accepted a row from this outbox ("Last sent"). */
  lastSentAt: string | null;
};

export interface TraineeSyncStore {
  getMeta(): Promise<SyncMeta>;
  setCursor(cursor: string | null, lastSyncedAt: string): Promise<void>;
  setLastSentAt(lastSentAt: string): Promise<void>;
  upsertLocal(record: LocalRecord): Promise<void>;
  getLocal(
    entityType: SyncEntityType,
    recordId: string,
  ): Promise<LocalRecord | null>;
  listLocal(entityType: SyncEntityType): Promise<LocalRecord[]>;
  /**
   * Adds a row as `pending`. A mutation id that is already in the outbox is
   * left exactly as it is and returned: one logical action is one row,
   * whatever its state, so a repeated enqueue can never reset or duplicate it.
   */
  enqueueOutbox(entry: NewOutboxEntry): Promise<OutboxEntry>;
  /** Rows still to send (`pending`, and `in_flight` left by a failed request). */
  listPendingOutbox(): Promise<OutboxEntry[]>;
  /** Every row: waiting, sending, and refused. Sent rows are not kept. */
  listOutbox(): Promise<OutboxEntry[]>;
  /** `acked` removes the row: a sent row is never kept. */
  updateOutboxStatus(
    mutationId: string,
    status: OutboxMutationStatus,
    lastError?: string | null,
  ): Promise<void>;
  patchOutbox(mutationId: string, patch: OutboxPatch): Promise<void>;
  /** The server accepted the row: it leaves the outbox. */
  removeOutbox(mutationId: string): Promise<void>;
  getOutbox(mutationId: string): Promise<OutboxEntry | null>;
  enqueueUpload(
    upload: Omit<PendingUpload, "status" | "createdAt" | "updatedAt">,
  ): Promise<PendingUpload>;
  listPendingUploads(): Promise<PendingUpload[]>;
  updateUploadStatus(
    id: string,
    status: PendingUpload["status"],
  ): Promise<void>;
  /** After a process restart nothing is in flight: such rows are waiting. */
  recoverAfterRestart(): Promise<void>;
  /**
   * Runs several writes as one unit: listeners hear one change, and a durable
   * store writes its storage once, after the last write.
   */
  transaction<T>(work: () => Promise<T>): Promise<T>;
  /** Called after every change to the outbox, local records or meta. */
  subscribe(listener: () => void): () => void;
  /** Drops everything (explicit sign-out, or another user took the phone). */
  clear(): Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return crypto.randomUUID();
}

export type MemorySyncStore = TraineeSyncStore & {
  /** Puts stored rows back exactly as they were (a durable store's start). */
  restoreOutbox(rows: readonly OutboxEntry[]): void;
};

/** In-memory store for tests and environments without durable storage. */
export function createMemorySyncStore(): MemorySyncStore {
  const local = new Map<string, LocalRecord>();
  const outbox = new Map<string, OutboxEntry>();
  const uploads = new Map<string, PendingUpload>();
  const listeners = new Set<() => void>();
  let meta: SyncMeta = { cursor: null, lastSyncedAt: null, lastSentAt: null };
  let depth = 0;
  let dirty = false;

  const key = (entityType: string, recordId: string) =>
    `${entityType}:${recordId}`;

  function changed() {
    if (depth > 0) {
      dirty = true;
      return;
    }
    for (const listener of [...listeners]) listener();
  }

  /** Oldest first; insertion order breaks a tie inside one millisecond. */
  function ordered(): OutboxEntry[] {
    return [...outbox.values()]
      .map((row, index) => ({ row, index }))
      .sort(
        (a, b) =>
          a.row.createdAt.localeCompare(b.row.createdAt) || a.index - b.index,
      )
      .map(({ row }) => ({ ...row }));
  }

  return {
    restoreOutbox(rows) {
      for (const row of rows) outbox.set(row.mutationId, { ...row });
      changed();
    },
    async getMeta() {
      return { ...meta };
    },
    async setCursor(cursor, lastSyncedAt) {
      meta = { ...meta, cursor, lastSyncedAt };
      changed();
    },
    async setLastSentAt(lastSentAt) {
      meta = { ...meta, lastSentAt };
      changed();
    },
    async upsertLocal(record) {
      local.set(key(record.entityType, record.recordId), { ...record });
      changed();
    },
    async getLocal(entityType, recordId) {
      return local.get(key(entityType, recordId)) ?? null;
    },
    async listLocal(entityType) {
      return [...local.values()].filter((row) => row.entityType === entityType);
    },
    async enqueueOutbox(entry) {
      const existing = outbox.get(entry.mutationId);
      if (existing) return { ...existing };
      const now = nowIso();
      const full: OutboxEntry = {
        mutationId: entry.mutationId,
        idempotencyKey: entry.idempotencyKey,
        entityType: entry.entityType,
        recordId: entry.recordId,
        operation: entry.operation,
        expectedServerVersion: entry.expectedServerVersion,
        clientOccurredAt: entry.clientOccurredAt,
        payloadJson: entry.payloadJson,
        status: "pending",
        lastError: null,
        lastErrorCode: null,
        lastErrorReason: null,
        attempts: 0,
        lastAttemptAt: null,
        keptAt: null,
        createdAt: now,
        updatedAt: now,
      };
      outbox.set(full.mutationId, full);
      changed();
      return { ...full };
    },
    async listPendingOutbox() {
      return ordered().filter(
        (row) => row.status === "pending" || row.status === "in_flight",
      );
    },
    async listOutbox() {
      return ordered();
    },
    async updateOutboxStatus(mutationId, status, lastError = null) {
      const existing = outbox.get(mutationId);
      if (!existing) return;
      if (status === "acked") {
        outbox.delete(mutationId);
      } else {
        outbox.set(mutationId, {
          ...existing,
          status,
          lastError,
          // A row put back to waiting by hand starts clean.
          ...(status === "pending"
            ? { lastErrorCode: null, lastErrorReason: null, keptAt: null }
            : {}),
          updatedAt: nowIso(),
        });
      }
      changed();
    },
    async patchOutbox(mutationId, patch) {
      const existing = outbox.get(mutationId);
      if (!existing) return;
      outbox.set(mutationId, { ...existing, ...patch, updatedAt: nowIso() });
      changed();
    },
    async removeOutbox(mutationId) {
      if (outbox.delete(mutationId)) changed();
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
      changed();
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
      changed();
    },
    async recoverAfterRestart() {
      let any = false;
      for (const [id, row] of outbox) {
        if (row.status === "in_flight") {
          outbox.set(id, { ...row, status: "pending", updatedAt: nowIso() });
          any = true;
        }
      }
      if (any) changed();
    },
    async transaction(work) {
      depth += 1;
      try {
        return await work();
      } finally {
        depth -= 1;
        if (depth === 0 && dirty) {
          dirty = false;
          changed();
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async clear() {
      local.clear();
      outbox.clear();
      uploads.clear();
      meta = { cursor: null, lastSyncedAt: null, lastSentAt: null };
      changed();
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

/** The outbox, counted. Everything the sync UI shows comes from this. */
export type SyncStatus = {
  /** Rows saved on the phone and not in a request right now. */
  waiting: number;
  /** Rows in a request that has not answered yet. */
  sending: number;
  /** Rows the server refused (`rejected` or `conflicted`). */
  failed: number;
  /** Why the waiting rows did not send on their last attempt, if they tried. */
  waitingReason: WaitingReason | null;
  lastSentAt: string | null;
};

/** What one "Try sending now" did, read back from the outbox afterwards. */
export type SendOutcome = {
  /** Rows the server accepted during this attempt. */
  sent: number;
  status: SyncStatus;
};

export type SyncEngine = {
  enqueue: (
    input: Omit<NewOutboxEntry, "mutationId" | "idempotencyKey"> & {
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
  /**
   * Sends every waiting row, one request at a time. Resolves with the
   * server's results for the rows it sent, plus the standing verdict of
   * every refused row still in the outbox; rejects when a request got no
   * usable answer (the rows are back to waiting by then).
   */
  pushPending: () => Promise<SyncMutationResult[]>;
  /** `pushPending` that never rejects: the outcome is read from the outbox. */
  sendNow: () => Promise<SendOutcome>;
  pullAndApply: () => Promise<{ applied: number; advancedCursor: boolean }>;
  runCycle: () => Promise<void>;
  recoverAfterRestart: () => Promise<void>;
  /** Puts a refused row back to waiting (the trainee tapped Retry). */
  retryEntry: (mutationId: string) => Promise<void>;
  /** "Keep my log" on a conflict: the row stays, marked as seen. */
  keepEntry: (mutationId: string) => Promise<void>;
  /** Removes a refused row the trainee no longer wants. */
  discardEntry: (mutationId: string) => Promise<void>;
  getStatus: () => Promise<SyncStatus>;
  /** Called after every outbox change; read `getStatus` or the store then. */
  subscribe: (listener: () => void) => () => void;
  store: TraineeSyncStore;
};

export type SyncEngineOptions = {
  /** A request with no answer after this long counts as unreachable. */
  requestTimeoutMs?: number;
  /** Called with every push failure (for dev logs and Sentry); never throws. */
  onError?: (scope: string, error: unknown) => void;
};

/** The server's limit on one push (`syncPushRequestSchema`). */
export const PUSH_BATCH_SIZE = 50;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

class PushTimeoutError extends Error {
  constructor() {
    super("Sync push timed out");
    this.name = "PushTimeoutError";
  }
}

export type PushFailure =
  | { kind: "waiting"; reason: WaitingReason }
  /** The API refused the request itself (400, 413, 422): not retryable as is. */
  | { kind: "invalid"; code: string; message: string };

/** Why a push got no per-row answer. Pure, so the rules are testable. */
export function classifyPushError(error: unknown): PushFailure {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.status === 403) {
      return { kind: "waiting", reason: "AUTH" };
    }
    if (error.status === 400 || error.status === 413 || error.status === 422) {
      return { kind: "invalid", code: error.code, message: error.message };
    }
    return { kind: "waiting", reason: "SERVER" };
  }
  if (error instanceof Error && error.name === "ZodError") {
    return { kind: "waiting", reason: "CLIENT" };
  }
  return { kind: "waiting", reason: "UNREACHABLE" };
}

export function summariseOutbox(
  rows: readonly Pick<OutboxEntry, "status" | "lastErrorCode">[],
  lastSentAt: string | null,
): SyncStatus {
  let waiting = 0;
  let sending = 0;
  let failed = 0;
  let waitingReason: WaitingReason | null = null;
  for (const row of rows) {
    if (row.status === "pending") {
      waiting += 1;
      if (waitingReason === null && isWaitingReason(row.lastErrorCode)) {
        waitingReason = row.lastErrorCode;
      }
    } else if (row.status === "in_flight") {
      sending += 1;
    } else if (row.status === "rejected" || row.status === "conflicted") {
      failed += 1;
    }
  }
  return { waiting, sending, failed, waitingReason, lastSentAt };
}

function toRequest(entry: OutboxEntry): SyncMutationRequest {
  return {
    mutationId: entry.mutationId,
    idempotencyKey: entry.idempotencyKey,
    entityType: entry.entityType,
    recordId: entry.recordId,
    operation: entry.operation,
    expectedServerVersion: entry.expectedServerVersion,
    clientOccurredAt: entry.clientOccurredAt,
    payload: JSON.parse(entry.payloadJson) as Record<string, unknown>,
  };
}

function errorReason(result: SyncMutationResult): string | null {
  const reason = result.error?.details?.reason;
  return typeof reason === "string" ? reason : null;
}

export function createSyncEngine(
  store: TraineeSyncStore,
  api: SyncApi,
  options: SyncEngineOptions = {},
): SyncEngine {
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const report = (scope: string, error: unknown) => {
    try {
      options.onError?.(scope, error);
    } catch {
      // Reporting must never break a send.
    }
  };

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

  function pushWithTimeout(mutations: SyncMutationRequest[]) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PushTimeoutError()), timeoutMs);
    });
    return Promise.race([api.pushSync({ mutations }), timeout]).finally(() => {
      if (timer !== null) clearTimeout(timer);
    });
  }

  /** One row's answer, applied to local state and the outbox together. */
  async function applyResult(
    entry: OutboxEntry,
    result: SyncMutationResult,
    attemptAt: string,
  ): Promise<boolean> {
    if (result.status === "applied" || result.status === "already_applied") {
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
          updatedAt: attemptAt,
        });
      }
      await store.removeOutbox(entry.mutationId);
      return true;
    }
    if (result.status === "rejected" && result.retryable === true) {
      // The server could not process it this time and kept no verdict.
      await store.patchOutbox(entry.mutationId, {
        status: "pending",
        lastError: null,
        lastErrorCode: "SERVER",
        lastErrorReason: null,
      });
      return false;
    }
    await store.patchOutbox(entry.mutationId, {
      status: result.status === "conflicted" ? "conflicted" : "rejected",
      lastError: result.error?.message ?? null,
      lastErrorCode: result.error?.code ?? null,
      lastErrorReason: errorReason(result),
    });
    return false;
  }

  async function backToWaiting(
    entries: OutboxEntry[],
    reason: WaitingReason,
  ): Promise<void> {
    await store.transaction(async () => {
      for (const entry of entries) {
        await store.patchOutbox(entry.mutationId, {
          status: "pending",
          lastError: null,
          lastErrorCode: reason,
          lastErrorReason: null,
        });
      }
    });
  }

  /**
   * Sends one batch. Returns the results and how many rows left the outbox;
   * throws when the request got no usable answer (rows are waiting again).
   */
  async function sendBatch(
    entries: OutboxEntry[],
  ): Promise<{ results: SyncMutationResult[]; sent: number }> {
    const attemptAt = nowIso();
    await store.transaction(async () => {
      for (const entry of entries) {
        await store.patchOutbox(entry.mutationId, {
          status: "in_flight",
          attempts: entry.attempts + 1,
          lastAttemptAt: attemptAt,
        });
      }
    });

    let response: { results: SyncMutationResult[] };
    try {
      // A payload that is not JSON throws here and is handled like an
      // unreadable answer: the row waits, it is never left "sending".
      response = await pushWithTimeout(entries.map(toRequest));
    } catch (error) {
      const failure: PushFailure =
        error instanceof SyntaxError
          ? { kind: "waiting", reason: "CLIENT" }
          : classifyPushError(error);
      if (failure.kind === "waiting") {
        await backToWaiting(entries, failure.reason);
        throw error;
      }
      if (entries.length > 1) {
        // One bad row must not hold the others back: send them one by one.
        await backToWaiting(entries, "SERVER");
        const results: SyncMutationResult[] = [];
        let sent = 0;
        for (const entry of entries) {
          const fresh = await store.getOutbox(entry.mutationId);
          if (!fresh) continue;
          const one = await sendBatch([fresh]);
          results.push(...one.results);
          sent += one.sent;
        }
        return { results, sent };
      }
      const entry = entries[0]!;
      await store.patchOutbox(entry.mutationId, {
        status: "rejected",
        lastError: failure.message,
        lastErrorCode: failure.code,
        lastErrorReason: null,
      });
      return {
        results: [
          {
            mutationId: entry.mutationId,
            status: "rejected",
            recordId: entry.recordId,
            serverVersion: null,
            entityType: entry.entityType,
            error: { code: failure.code, message: failure.message },
          },
        ],
        sent: 0,
      };
    }

    const byId = new Map(
      response.results.map((result) => [result.mutationId, result]),
    );
    let sent = 0;
    await store.transaction(async () => {
      for (const entry of entries) {
        const result = byId.get(entry.mutationId);
        if (!result) {
          // No verdict for this row: it is still waiting, not "sending".
          await store.patchOutbox(entry.mutationId, {
            status: "pending",
            lastErrorCode: "SERVER",
          });
          continue;
        }
        if (await applyResult(entry, result, attemptAt)) sent += 1;
      }
      if (sent > 0) await store.setLastSentAt(nowIso());
    });
    return { results: response.results, sent };
  }

  async function drain(): Promise<{
    results: SyncMutationResult[];
    sent: number;
  }> {
    const results: SyncMutationResult[] = [];
    let sent = 0;
    // Each row goes out at most once per drain, so a row the server asks us
    // to retry cannot spin this loop.
    const tried = new Set<string>();
    for (;;) {
      const pending = (await store.listPendingOutbox()).filter(
        (entry) => !tried.has(entry.mutationId),
      );
      if (pending.length === 0) return { results, sent };
      const batch = pending.slice(0, PUSH_BATCH_SIZE);
      for (const entry of batch) tried.add(entry.mutationId);
      const outcome = await sendBatch(batch);
      results.push(...outcome.results);
      sent += outcome.sent;
    }
  }

  // One push at a time. A caller that arrives during a push waits for it and
  // then runs its own, so the row it just enqueued is always covered.
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  }

  /** The server's verdict on a refused row, rebuilt from the outbox. */
  function standingVerdict(row: OutboxEntry): SyncMutationResult {
    return {
      mutationId: row.mutationId,
      status: row.status === "conflicted" ? "conflicted" : "rejected",
      recordId: row.recordId,
      serverVersion: null,
      entityType: row.entityType,
      error: {
        code: row.lastErrorCode ?? "SYNC_MUTATION_FAILED",
        message: row.lastError ?? "Mutation failed.",
        ...(row.lastErrorReason
          ? { details: { reason: row.lastErrorReason } }
          : {}),
      },
    };
  }

  function pushPending(): Promise<SyncMutationResult[]> {
    return serial(async () => {
      try {
        const { results } = await drain();
        // A caller's row may have gone out in the push before its own. So
        // the answer also carries the verdict of every refused row still in
        // the outbox: a caller always finds the row it asked about.
        const seen = new Set(results.map((result) => result.mutationId));
        for (const row of await store.listOutbox()) {
          if (
            (row.status === "rejected" || row.status === "conflicted") &&
            !seen.has(row.mutationId)
          ) {
            results.push(standingVerdict(row));
          }
        }
        return results;
      } catch (error) {
        report("sync.push", error);
        throw error;
      }
    });
  }

  async function getStatus(): Promise<SyncStatus> {
    const [rows, meta] = await Promise.all([
      store.listOutbox(),
      store.getMeta(),
    ]);
    return summariseOutbox(rows, meta.lastSentAt);
  }

  async function pullAndApply(): Promise<{
    applied: number;
    advancedCursor: boolean;
  }> {
    const meta = await store.getMeta();
    const pulled = await api.pullSync({ cursor: meta.cursor, limit: 50 });
    let applied = 0;
    // The changes and the cursor that covers them land together, and the
    // cursor moves only after every change is applied.
    return store.transaction(async () => {
      for (const change of pulled.changes) {
        await applyChange(change);
        applied += 1;
      }
      const advanced = shouldAdvanceSyncCursor({
        appliedAllChanges: applied === pulled.changes.length,
        pullHasChanges: pulled.changes.length > 0,
      });
      if (advanced) {
        await store.setCursor(pulled.nextCursor ?? meta.cursor, nowIso());
      }
      return { applied, advancedCursor: advanced };
    });
  }

  return {
    store,
    async enqueue(input) {
      const mutationId = input.mutationId ?? createId();
      // One key per logical action: the idempotency key defaults to the
      // mutation id, so a row re-created from the same id reuses both.
      const idempotencyKey = input.idempotencyKey ?? mutationId;
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
    sendNow() {
      return serial(async () => {
        let sent = 0;
        try {
          sent = (await drain()).sent;
        } catch (error) {
          // The rows are back to waiting with the reason; the caller reads
          // the outcome from the outbox, never from this error.
          report("sync.sendNow", error);
        }
        return { sent, status: await getStatus() };
      });
    },
    pullAndApply,
    async runCycle() {
      await pushPending();
      await pullAndApply();
    },
    async recoverAfterRestart() {
      await store.recoverAfterRestart();
    },
    async retryEntry(mutationId) {
      const row = await store.getOutbox(mutationId);
      if (!row || (row.status !== "rejected" && row.status !== "conflicted")) {
        return;
      }
      await store.patchOutbox(mutationId, {
        status: "pending",
        lastError: null,
        lastErrorCode: null,
        lastErrorReason: null,
        keptAt: null,
      });
    },
    async keepEntry(mutationId) {
      const row = await store.getOutbox(mutationId);
      if (!row || row.status !== "conflicted") return;
      await store.patchOutbox(mutationId, { keptAt: nowIso() });
    },
    async discardEntry(mutationId) {
      const row = await store.getOutbox(mutationId);
      if (!row || (row.status !== "rejected" && row.status !== "conflicted")) {
        return;
      }
      await store.removeOutbox(mutationId);
    },
    getStatus,
    subscribe: (listener) => store.subscribe(listener),
  };
}
