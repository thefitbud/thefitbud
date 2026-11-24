import { isNetworkFailure } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import { createIdempotencyKey } from "../../lib/idempotency";
import type { AsyncKeyValue } from "../../sync/storage";
import {
  MealPhotoError,
  base64ToBytes,
  bytesToBase64,
  pendingMealLogIds,
} from "../mealActions";

/**
 * Meal photos on their way to the server (D-W14-11, TR-07m2 / TR-07m3).
 *
 * A picked photo is a file, not a structured mutation (AGENTS.md: files
 * upload separately), and its attach needs the server's entry id, which a
 * meal logged offline does not have yet. So each photo is a job of its own,
 * kept in the device store (Z14-5: SQLite on native, `localStorage` on web):
 *
 * - the record `{assignmentId, relationshipId, localDate, attachKey,
 *   uploadKey, mediaAssetId, state}` and the prepared (1600 px JPEG) bytes are
 *   written before the job counts as waiting, so it survives Diet unmounting
 *   and an app restart;
 * - the job attaches only once the log has a server entry id (`serverEntryId`:
 *   never a `local-` id, never while the log is still in the outbox);
 * - a failure for lack of connection puts it back to `waiting`, and it sends
 *   itself once the API is reachable again (reachability, an outbox change, or
 *   a backed-off timer);
 * - once attached, the record and the bytes are deleted.
 *
 * One runner per signed-in user lives for the process (`mealPhotoJobsFor`);
 * screens only read it and hand it work.
 */

export type MealPhotoJobState =
  | "preparing"
  | "waiting"
  | "uploading"
  | "failed"
  | "done";

export type MealPhotoJob = {
  assignmentId: string;
  relationshipId: string;
  localDate: string;
  /** What the card shows: the prepared file, or the stored bytes after a restart. */
  uri: string;
  /** Idempotency key of the attach; the same on every try. */
  attachKey: string;
  /** Idempotency key of the upload target; the same on every try. */
  uploadKey: string;
  /** Set once the file is up: a retry attaches without uploading again. */
  mediaAssetId: string | null;
  state: MealPhotoJobState;
  /** Trainee-facing copy for a `failed` job (never the raw error). */
  message: string | null;
  /** The last try could not reach the server: shown neutral (D-W14-9). */
  offline: boolean;
  createdAt: string;
};

/** What is written to the device store per job. */
type StoredJob = Omit<MealPhotoJob, "uri" | "state" | "message" | "offline"> & {
  state: "waiting" | "failed";
  message: string | null;
  /** The prepared file, for a store that could not keep the bytes. */
  fileUri: string;
};

type StoredIndex = { ownerId: string; ids: string[] };

export const MEAL_PHOTO_JOBS_PREFIX = "fitbud.mealPhotoJobs.v1";
const INDEX_KEY = `${MEAL_PHOTO_JOBS_PREFIX}.index`;
/** A job that never found its log (refused, signed out) is dropped after this. */
export const MEAL_PHOTO_JOB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MEAL_PHOTO_RETRY_FIRST_MS = 15_000;
export const MEAL_PHOTO_RETRY_MAX_MS = 120_000;

const FAILED_COPY = "Photo didn't upload. Your meal is still logged.";

function safe(part: string): string {
  return part.replace(/[^A-Za-z0-9._-]/g, "_");
}
function jobKey(ownerId: string, id: string): string {
  return `${MEAL_PHOTO_JOBS_PREFIX}.${safe(ownerId)}.job.${safe(id)}`;
}
function bytesKey(ownerId: string, id: string): string {
  return `${MEAL_PHOTO_JOBS_PREFIX}.${safe(ownerId)}.jpeg.${safe(id)}`;
}

/**
 * The server's entry id for a logged meal, or null while there is none: no
 * log, a log the phone made (`local-…` from the outbox overlay), or a log
 * still in the outbox (the id shown may belong to an earlier copy). A photo
 * is attached only to an id this returns.
 */
export function serverEntryId(
  meal: Pick<MealAssignment, "id" | "compliance"> | null | undefined,
  pendingIds: ReadonlySet<string>,
): string | null {
  const id = meal?.compliance?.id;
  if (!meal || !id) return null;
  if (id.startsWith("local-")) return null;
  if (pendingIds.has(meal.id)) return null;
  return id;
}

type OutboxRowLike = { status: string; operation: string; recordId: string };

/** Meal ids with a log (eaten as planned, skipped, changed) still in the outbox. */
export function pendingMealLogIdsAll(rows: ReadonlyArray<OutboxRowLike>): Set<string> {
  const ids = pendingMealLogIds(rows);
  for (const row of rows) {
    if (
      (row.status === "pending" || row.status === "in_flight") &&
      row.operation === "meal.deviate"
    ) {
      ids.add(row.recordId);
    }
  }
  return ids;
}

/**
 * Where a job's entry id comes from: the meal as a screen last showed it,
 * then the server's copy of that day. Both go through `serverEntryId` with
 * the outbox as it is now. Throws when the server could not be reached.
 */
export async function resolveMealEntryId(input: {
  job: Pick<MealPhotoJob, "assignmentId">;
  hint: Pick<MealAssignment, "id" | "compliance"> | undefined;
  listOutbox: () => Promise<ReadonlyArray<OutboxRowLike>>;
  fetchMeal: () => Promise<Pick<MealAssignment, "id" | "compliance"> | null>;
}): Promise<string | null> {
  const pending = pendingMealLogIdsAll(await input.listOutbox());
  const fromHint = serverEntryId(input.hint, pending);
  if (fromHint) return fromHint;
  return serverEntryId(await input.fetchMeal(), pending);
}

export type MealPhotoJobDeps = {
  /** The server entry id for the job's meal, or null while there is none. */
  resolveEntryId: (
    job: MealPhotoJob,
    hint: MealAssignment | undefined,
  ) => Promise<string | null>;
  /** Upload (unless `mediaAssetId` is set) and attach; `onUploaded` keeps the asset id. */
  send: (
    job: MealPhotoJob,
    input: {
      entryId: string;
      bytes: Uint8Array;
      onUploaded: (mediaAssetId: string) => Promise<void>;
    },
  ) => Promise<void>;
  /** Re-reads a prepared file when the store could not keep its bytes. */
  reloadBytes?: (uri: string) => Promise<Uint8Array>;
  /** The photo is on the log: the day views refresh. */
  onSent?: (job: MealPhotoJob) => void;
};

type Subscribable = {
  subscribe(listener: (value?: unknown) => void): () => void;
};

export type MealPhotoJobsOptions = {
  storage: AsyncKeyValue;
  ownerId: string;
  /** False on a store with no room for photos (the keychain): bytes stay in memory. */
  persistBytes?: boolean;
  report?: (scope: string, error: unknown) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
};

export type MealPhotoJobs = {
  readonly ownerId: string;
  /** Reads the stored jobs once; later calls wait for the same read. */
  start(): Promise<void>;
  configure(deps: MealPhotoJobDeps | null): void;
  /** Kick on these events (API reachable again, an outbox change). */
  connect(sources: {
    reachability?: { subscribe(listener: (reachable: boolean) => void): () => void } | null;
    outbox?: Subscribable | null;
  }): void;
  snapshot(): Readonly<Record<string, MealPhotoJob>>;
  subscribe(listener: () => void): () => void;
  /** The meals as a screen shows them: a first place to look for entry ids. */
  setHints(meals: readonly MealAssignment[]): void;
  /** A picked photo: prepared here, stored, then sent when it can be. */
  addPicked(
    input: { assignmentId: string; relationshipId: string; localDate: string; uri: string },
    prepare: () => Promise<{ uri: string; bytes: Uint8Array }>,
  ): Promise<void>;
  /** An already prepared photo (ate out keeps its own preview). */
  addPrepared(input: {
    assignmentId: string;
    relationshipId: string;
    localDate: string;
    uri: string;
    bytes: Uint8Array;
  }): Promise<void>;
  kick(): Promise<void>;
  retry(assignmentId: string): void;
  remove(assignmentId: string): Promise<void>;
  /** Drops a finished job from memory (the server's copy shows the photo now). */
  forget(assignmentId: string): void;
  dispose(): void;
};

export function createMealPhotoJobs(options: MealPhotoJobsOptions): MealPhotoJobs {
  const { storage, ownerId } = options;
  const persistBytes = options.persistBytes ?? true;
  const report = options.report ?? (() => undefined);
  const setTimer =
    options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const now = options.now ?? (() => Date.now());

  let jobs: Record<string, MealPhotoJob> = {};
  const bytes = new Map<string, Uint8Array>();
  const pickedUris = new Map<string, () => Promise<{ uri: string; bytes: Uint8Array }>>();
  const hints = new Map<string, MealAssignment>();
  const listeners = new Set<() => void>();
  let deps: MealPhotoJobDeps | null = null;
  let started: Promise<void> | null = null;
  let disposed = false;
  let unsubscribers: Array<() => void> = [];
  let running = false;
  let again = false;
  let timer: unknown = null;
  let retryMs = MEAL_PHOTO_RETRY_FIRST_MS;
  /** Store writes run one after another, so the index never loses a job. */
  let writes: Promise<void> = Promise.resolve();

  function emit() {
    for (const listener of [...listeners]) listener();
  }

  function setJob(id: string, next: MealPhotoJob | null) {
    const copy = { ...jobs };
    if (next) copy[id] = next;
    else delete copy[id];
    jobs = copy;
    emit();
  }

  function patch(id: string, change: Partial<MealPhotoJob>) {
    const job = jobs[id];
    if (job) setJob(id, { ...job, ...change });
  }

  function write(work: () => Promise<void>): Promise<void> {
    const next = writes.then(work, work);
    writes = next.catch(() => undefined);
    return next;
  }

  async function readIndex(): Promise<StoredIndex | null> {
    const raw = await storage.get(INDEX_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredIndex;
      if (typeof parsed?.ownerId !== "string" || !Array.isArray(parsed.ids)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async function writeIndex(ids: string[]) {
    await storage.set(INDEX_KEY, JSON.stringify({ ownerId, ids } satisfies StoredIndex));
  }

  async function dropStored(owner: string, id: string) {
    await storage.remove(jobKey(owner, id));
    await storage.remove(bytesKey(owner, id));
  }

  function toStored(job: MealPhotoJob, fileUri: string): StoredJob {
    return {
      assignmentId: job.assignmentId,
      relationshipId: job.relationshipId,
      localDate: job.localDate,
      attachKey: job.attachKey,
      uploadKey: job.uploadKey,
      mediaAssetId: job.mediaAssetId,
      createdAt: job.createdAt,
      state: job.state === "failed" ? "failed" : "waiting",
      message: job.state === "failed" ? job.message : null,
      fileUri,
    };
  }

  const fileUris = new Map<string, string>();

  async function persistJob(job: MealPhotoJob) {
    const fileUri = fileUris.get(job.assignmentId) ?? job.uri;
    await write(async () => {
      await storage.set(jobKey(ownerId, job.assignmentId), JSON.stringify(toStored(job, fileUri)));
      const index = await readIndex();
      const ids = index && index.ownerId === ownerId ? index.ids : [];
      if (!ids.includes(job.assignmentId)) await writeIndex([...ids, job.assignmentId]);
    });
  }

  async function unpersistJob(id: string) {
    await write(async () => {
      await dropStored(ownerId, id);
      const index = await readIndex();
      if (index && index.ownerId === ownerId && index.ids.includes(id)) {
        await writeIndex(index.ids.filter((other) => other !== id));
      }
    });
  }

  async function load() {
    const index = await readIndex();
    if (!index) return;
    if (index.ownerId !== ownerId) {
      // Another account's photos never send under this one.
      await write(async () => {
        for (const id of index.ids) await dropStored(index.ownerId, id);
        await writeIndex([]);
      });
      return;
    }
    const kept: string[] = [];
    const loaded: Record<string, MealPhotoJob> = {};
    for (const id of index.ids) {
      let stored: StoredJob | null = null;
      try {
        const raw = await storage.get(jobKey(ownerId, id));
        stored = raw ? (JSON.parse(raw) as StoredJob) : null;
      } catch (err) {
        report("mealPhoto.load", err);
      }
      if (!stored || now() - Date.parse(stored.createdAt) > MEAL_PHOTO_JOB_MAX_AGE_MS) {
        await write(() => dropStored(ownerId, id)).catch((err) =>
          report("mealPhoto.drop", err),
        );
        continue;
      }
      let uri = stored.fileUri;
      try {
        const b64 = await storage.get(bytesKey(ownerId, id));
        if (b64) {
          bytes.set(id, base64ToBytes(b64));
          uri = `data:image/jpeg;base64,${b64}`;
        }
      } catch (err) {
        report("mealPhoto.loadBytes", err);
      }
      fileUris.set(id, stored.fileUri);
      kept.push(id);
      loaded[id] = {
        assignmentId: stored.assignmentId,
        relationshipId: stored.relationshipId,
        localDate: stored.localDate,
        uri,
        attachKey: stored.attachKey,
        uploadKey: stored.uploadKey,
        mediaAssetId: stored.mediaAssetId ?? null,
        // A try cut short by the restart is waiting again.
        state: stored.state === "failed" ? "failed" : "waiting",
        message: stored.state === "failed" ? (stored.message ?? FAILED_COPY) : null,
        offline: false,
        createdAt: stored.createdAt,
      };
    }
    if (kept.length !== index.ids.length) {
      await write(() => writeIndex(kept)).catch((err) => report("mealPhoto.index", err));
    }
    // Jobs added while the store was read win over the stored copy.
    jobs = { ...loaded, ...jobs };
    emit();
  }

  function start(): Promise<void> {
    if (!started) {
      started = load()
        .catch((err) => report("mealPhoto.start", err))
        .then(() => {
          void kick();
        });
    }
    return started;
  }

  function scheduleRetry() {
    if (timer !== null || disposed) return;
    const wait = retryMs;
    retryMs = Math.min(retryMs * 2, MEAL_PHOTO_RETRY_MAX_MS);
    timer = setTimer(() => {
      timer = null;
      void kick();
    }, wait);
  }

  function cancelRetry() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  async function bytesFor(job: MealPhotoJob): Promise<Uint8Array | null> {
    const known = bytes.get(job.assignmentId);
    if (known) return known;
    const fileUri = fileUris.get(job.assignmentId) ?? job.uri;
    if (!deps?.reloadBytes || !fileUri || fileUri.startsWith("data:")) return null;
    try {
      const reloaded = await deps.reloadBytes(fileUri);
      bytes.set(job.assignmentId, reloaded);
      return reloaded;
    } catch (err) {
      report("mealPhoto.reload", err);
      return null;
    }
  }

  async function sendOne(job: MealPhotoJob): Promise<"sent" | "wait" | "offline" | "failed"> {
    const current = deps;
    if (!current) return "wait";
    let entryId: string | null;
    try {
      entryId = await current.resolveEntryId(job, hints.get(job.assignmentId));
    } catch (err) {
      if (isNetworkFailure(err)) {
        patch(job.assignmentId, { offline: true });
        return "offline";
      }
      report("mealPhoto.resolve", err);
      return "wait";
    }
    // A runner replaced while it looked (another user, a test restart) sends nothing.
    if (!entryId || disposed) return "wait";
    const data = await bytesFor(job);
    if (!data) {
      patch(job.assignmentId, { state: "failed", message: FAILED_COPY, offline: false });
      return "failed";
    }
    patch(job.assignmentId, { state: "uploading", message: null });
    try {
      await current.send(jobs[job.assignmentId] ?? job, {
        entryId,
        bytes: data,
        onUploaded: async (mediaAssetId) => {
          patch(job.assignmentId, { mediaAssetId });
          const latest = jobs[job.assignmentId];
          if (!latest) return;
          await persistJob(latest).catch((err) => report("mealPhoto.persist", err));
        },
      });
    } catch (err) {
      const cause = err instanceof MealPhotoError ? (err.cause ?? err) : err;
      const mediaAssetId =
        err instanceof MealPhotoError && err.mediaAssetId
          ? err.mediaAssetId
          : (jobs[job.assignmentId]?.mediaAssetId ?? null);
      if (!jobs[job.assignmentId]) return "failed";
      if (isNetworkFailure(cause)) {
        // No connection: the photo is still on the phone and waits.
        patch(job.assignmentId, { state: "waiting", offline: true, message: null, mediaAssetId });
        return "offline";
      }
      report("mealPhoto.send", err);
      const failed = {
        ...jobs[job.assignmentId]!,
        state: "failed" as const,
        offline: false,
        message: err instanceof MealPhotoError ? err.message : FAILED_COPY,
        mediaAssetId,
      };
      setJob(job.assignmentId, failed);
      await persistJob(failed).catch((e) => report("mealPhoto.persist", e));
      return "failed";
    }
    // On the log: the file and the record go.
    bytes.delete(job.assignmentId);
    fileUris.delete(job.assignmentId);
    pickedUris.delete(job.assignmentId);
    if (jobs[job.assignmentId]) {
      patch(job.assignmentId, { state: "done", offline: false, message: null });
    }
    await unpersistJob(job.assignmentId).catch((err) => report("mealPhoto.unpersist", err));
    current.onSent?.(job);
    return "sent";
  }

  async function kick(): Promise<void> {
    if (disposed) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        let offline = false;
        for (const job of Object.values(jobs)) {
          if (disposed) break;
          if (job.state !== "waiting") continue;
          const outcome = await sendOne(job);
          if (outcome === "offline") offline = true;
          if (outcome === "sent") retryMs = MEAL_PHOTO_RETRY_FIRST_MS;
        }
        if (offline) scheduleRetry();
      } while (again && !disposed);
    } finally {
      running = false;
    }
  }

  async function addPrepared(input: {
    assignmentId: string;
    relationshipId: string;
    localDate: string;
    uri: string;
    bytes: Uint8Array;
  }) {
    const id = input.assignmentId;
    const previous = jobs[id];
    const job: MealPhotoJob = {
      assignmentId: id,
      relationshipId: input.relationshipId,
      localDate: input.localDate,
      uri: input.uri,
      attachKey: previous?.state === "preparing" ? previous.attachKey : createIdempotencyKey(),
      uploadKey: previous?.state === "preparing" ? previous.uploadKey : createIdempotencyKey(),
      mediaAssetId: null,
      state: "waiting",
      message: null,
      offline: false,
      createdAt: new Date(now()).toISOString(),
    };
    bytes.set(id, input.bytes);
    fileUris.set(id, input.uri);
    setJob(id, job);
    try {
      await persistJob(job);
      if (persistBytes) {
        await write(() => storage.set(bytesKey(ownerId, id), bytesToBase64(input.bytes)));
      }
    } catch (err) {
      // No room in the store: the photo still sends from memory, and the
      // record keeps the file to read again after a restart.
      report("mealPhoto.persist", err);
    }
    void kick();
  }

  async function addPicked(
    input: { assignmentId: string; relationshipId: string; localDate: string; uri: string },
    prepare: () => Promise<{ uri: string; bytes: Uint8Array }>,
  ) {
    const id = input.assignmentId;
    pickedUris.set(id, prepare);
    setJob(id, {
      assignmentId: id,
      relationshipId: input.relationshipId,
      localDate: input.localDate,
      uri: input.uri,
      attachKey: createIdempotencyKey(),
      uploadKey: createIdempotencyKey(),
      mediaAssetId: null,
      state: "preparing",
      message: null,
      offline: false,
      createdAt: new Date(now()).toISOString(),
    });
    let prepared: { uri: string; bytes: Uint8Array };
    try {
      prepared = await prepare();
    } catch (err) {
      report("mealPhoto.prepare", err);
      patch(id, {
        state: "failed",
        message: err instanceof MealPhotoError ? err.message : FAILED_COPY,
      });
      return;
    }
    if (!jobs[id]) return; // removed while it was prepared
    pickedUris.delete(id);
    await addPrepared({ ...input, uri: prepared.uri, bytes: prepared.bytes });
  }

  function retry(id: string) {
    const job = jobs[id];
    if (!job || job.state !== "failed") return;
    const prepare = pickedUris.get(id);
    if (prepare && !bytes.has(id)) {
      // The photo never got ready: prepare it again.
      void addPicked(job, prepare);
      return;
    }
    const next = { ...job, state: "waiting" as const, message: null, offline: false };
    setJob(id, next);
    void persistJob(next).catch((err) => report("mealPhoto.persist", err));
    retryMs = MEAL_PHOTO_RETRY_FIRST_MS;
    void kick();
  }

  async function remove(id: string) {
    bytes.delete(id);
    fileUris.delete(id);
    pickedUris.delete(id);
    setJob(id, null);
    await unpersistJob(id).catch((err) => report("mealPhoto.unpersist", err));
  }

  function forget(id: string) {
    if (jobs[id]?.state === "done") setJob(id, null);
  }

  function connect(sources: {
    reachability?: { subscribe(listener: (reachable: boolean) => void): () => void } | null;
    outbox?: Subscribable | null;
  }) {
    for (const off of unsubscribers) off();
    unsubscribers = [];
    const hasWaiting = () => Object.values(jobs).some((job) => job.state === "waiting");
    if (sources.reachability) {
      unsubscribers.push(
        sources.reachability.subscribe((reachable) => {
          if (!reachable || !hasWaiting()) return;
          cancelRetry();
          retryMs = MEAL_PHOTO_RETRY_FIRST_MS;
          void kick();
        }),
      );
    }
    if (sources.outbox) {
      unsubscribers.push(
        sources.outbox.subscribe(() => {
          if (hasWaiting()) void kick();
        }),
      );
    }
  }

  return {
    ownerId,
    start,
    configure(next) {
      deps = next;
    },
    connect,
    snapshot: () => jobs,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setHints(meals) {
      for (const meal of meals) hints.set(meal.id, meal);
    },
    addPicked,
    addPrepared,
    kick,
    retry,
    remove,
    forget,
    dispose() {
      disposed = true;
      cancelRetry();
      for (const off of unsubscribers) off();
      unsubscribers = [];
      listeners.clear();
    },
  };
}

let current: MealPhotoJobs | null = null;

/**
 * The signed-in user's photo jobs, one per process. A different user gets a
 * new runner (and the old user's stored jobs are dropped when it starts).
 */
export function mealPhotoJobsFor(
  ownerId: string,
  make: () => MealPhotoJobsOptions,
): MealPhotoJobs {
  if (current?.ownerId === ownerId) return current;
  current?.dispose();
  current = createMealPhotoJobs(make());
  return current;
}

/** The runner a screen already started (`useMealPhotoJobs`), if any. */
export function currentMealPhotoJobs(): MealPhotoJobs | null {
  return current;
}

/** Tests only: forget the runner (a fresh process over the same storage). */
export function resetMealPhotoJobsForTests(): void {
  current?.dispose();
  current = null;
}
