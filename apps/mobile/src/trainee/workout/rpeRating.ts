import type { SyncMutationResult, WorkoutExecution } from "@fitbud/contracts";
import { isNetworkFailure, userFacingMessage } from "@fitbud/api-client";
import { createIdempotencyKey } from "../../lib/idempotency";
import { reportError } from "../../lib/reportError";
import { enqueueAndPush } from "../../sync/actions";
import type { SyncEngine } from "../../sync/engine";
import {
  PENDING_FEEDBACK_MAX_AGE_MS,
  pendingFeedbackStore,
  type PendingFeedbackStore,
} from "./pendingFeedbackStore";

/**
 * Sends one rating change of a finished workout (Z14-12, D-W14-20).
 *
 * The version is never guessed (fix round 1): the server bumps a workout's
 * `recordVersion` on pause, resume and finish, and the phone does not count
 * those, so the rating is always sent with the version read from the server
 * after the finish has been accepted.
 *
 * - Finish still queued on the phone: the pick is held (`progress("held")`),
 *   and sent once the finish has synced.
 * - A 409 `VERSION_CONFLICT`: read the execution once more and retry with its
 *   version if the server's rating is the one the phone last saw; otherwise
 *   surface the conflict with the server's rating (no silent overwrite).
 * - A refused row is removed from the outbox: the summary shows the verdict
 *   itself and the trainee decides what to do next.
 * - Z14-37: with `hold`, the held change is also written to the device store
 *   (`pendingFeedbackStore`) the moment it is held, so a restart does not lose
 *   it (`resumeHeldWorkoutFeedback` sends it later), and removed once the send
 *   is durably in the outbox (or has a verdict before that). The held
 *   record's token is the send's mutation id and idempotency key, so a resumed
 *   send reuses it and a crash after the outbox write never queues a second
 *   row. A hold older than 72 h, or one past the server's 48 h edit window
 *   (D-W14-20), is given up with the neutral closed-window message. A store
 *   failure never blocks the send.
 */
/** What to change: an omitted field is left as it is (D-W14-34). */
export type FeedbackChange = { rpe?: number | null; note?: string | null };

export type RatingOutcome =
  /** The server holds this rating and note. */
  | { kind: "saved"; rpe: number | null; note: string | null }
  /** Queued behind a failed or slow push; it sends when the phone is online. */
  | { kind: "queued" }
  | {
      kind: "refused";
      reason: "window_closed" | "conflict" | "other";
      message: string;
      /** The server's rating and note, when the read gave them (conflict). */
      serverRpe?: number | null;
      serverNote?: string | null;
    };

export const RATING_NOTE_WINDOW_CLOSED_MESSAGE =
  "Ratings and notes can be changed for 48 hours after a workout.";
export const RATING_CONFLICT_MESSAGE =
  "Your rating was changed somewhere else. Pick again to replace it.";
export const RATING_NOTE_CONFLICT_MESSAGE =
  "Your rating or note was changed somewhere else. Save again to replace it.";
export const RATING_HELD_MESSAGE =
  "Your rating will be saved when this workout is sent.";
export const RATING_NOTE_HELD_MESSAGE =
  "Your rating and note will be saved when this workout is sent.";
export const RATING_QUEUED_MESSAGE =
  "Your rating will be saved when you're back online.";
export const RATING_NOTE_QUEUED_MESSAGE =
  "Your rating and note will be saved when you're back online.";

/** A note as the server stores it: trimmed, empty is none. */
export function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

const RECHECK_MS = 15_000;

type RatingApi = {
  getWorkoutExecution: (id: string) => Promise<WorkoutExecution>;
};

/** True while this workout's finish is still waiting in the outbox. */
async function finishQueued(sync: SyncEngine, executionId: string): Promise<boolean> {
  try {
    const rows = await sync.store.listOutbox();
    return rows.some(
      (row) => row.operation === "workout.complete" && row.recordId === executionId,
    );
  } catch {
    // Unknown: the read below decides (a version read before the finish
    // landed would fail the version check, never overwrite).
    return false;
  }
}

/** Resolves on the next outbox change, or after `ms`. */
function nextChange(sync: SyncEngine, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe: (() => void) | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve();
    };
    const timer = setTimeout(finish, ms);
    unsubscribe = sync.store.subscribe(finish);
    if (done) unsubscribe();
  });
}

function refusedFrom(
  result: SyncMutationResult,
  hasNote: boolean,
): RatingOutcome & { kind: "refused" } {
  const code = result.error?.code;
  const what = hasNote ? "rating and note" : "rating";
  if (code === "FEEDBACK_EDIT_WINDOW_CLOSED") {
    return {
      kind: "refused",
      reason: "window_closed",
      message: RATING_NOTE_WINDOW_CLOSED_MESSAGE,
    };
  }
  if (result.status === "conflicted" || code === "VERSION_CONFLICT") {
    return {
      kind: "refused",
      reason: "conflict",
      message: hasNote ? RATING_NOTE_CONFLICT_MESSAGE : RATING_CONFLICT_MESSAGE,
    };
  }
  return {
    kind: "refused",
    reason: "other",
    message: userFacingMessage(result.error?.message, {
      fallback: `Couldn't save your ${what}. Try again.`,
    }),
  };
}

function isConflict(result: SyncMutationResult): boolean {
  return result.status === "conflicted" || result.error?.code === "VERSION_CONFLICT";
}

async function dropRefusedRow(sync: SyncEngine, mutationId: string): Promise<void> {
  try {
    await sync.store.removeOutbox(mutationId);
  } catch (err: unknown) {
    reportError("workout.feedback.cleanup", err);
  }
}

/**
 * Executions with a held or resumed send running in this process, counted
 * (two overlapping sends for one workout each hold their own count). Resume
 * skips an execution that has any.
 */
const activeHolds = new Map<string, number>();

function acquireHold(executionId: string): void {
  activeHolds.set(executionId, (activeHolds.get(executionId) ?? 0) + 1);
}

function releaseHold(executionId: string): void {
  const left = (activeHolds.get(executionId) ?? 0) - 1;
  if (left > 0) activeHolds.set(executionId, left);
  else activeHolds.delete(executionId);
}

/** The server's 48 h edit window from the finish (D-W14-20). */
const FEEDBACK_EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * When the trainee's edit window closes: the server's `feedbackEditableUntil`
 * when the read carries it, else `completedAt` + 48 h; null when unknown.
 */
function editWindowClosesAt(execution: WorkoutExecution): number | null {
  if (execution.feedbackEditableUntil) {
    const until = Date.parse(execution.feedbackEditableUntil);
    if (!Number.isNaN(until)) return until;
  }
  if (execution.completedAt) {
    const done = Date.parse(execution.completedAt);
    if (!Number.isNaN(done)) return done + FEEDBACK_EDIT_WINDOW_MS;
  }
  return null;
}

export type HoldOptions = {
  /** The signed-in user: the held value is stored under this owner only. */
  ownerId: string;
  store?: PendingFeedbackStore;
  /** When the hold began (a resumed hold keeps its first time). */
  heldAt?: number;
  /**
   * A resumed hold: the stored record's token. It is reused as the send's
   * mutation id and idempotency key, and the record is already on the device.
   */
  resumeToken?: string;
  now?: () => number;
};

export async function saveWorkoutRating(input: {
  sync: SyncEngine;
  api: RatingApi;
  executionId: string;
  change: FeedbackChange;
  progress?: (state: "held") => void;
  hold?: HoldOptions;
}): Promise<RatingOutcome> {
  const { executionId } = input;
  const change: FeedbackChange = {};
  if (input.change.rpe !== undefined) change.rpe = input.change.rpe;
  if (input.change.note !== undefined) change.note = normalizeNote(input.change.note);
  const hold = input.hold;
  if (!hold) return sendRating(input, change, null);

  const store = hold.store ?? pendingFeedbackStore;
  const now = hold.now ?? (() => Date.now());
  const token = hold.resumeToken ?? createIdempotencyKey();
  const heldAt = hold.heldAt ?? now();
  // A resumed record is already stored (and the resume holds the count).
  let stored = hold.resumeToken !== undefined;
  let acquired = false;
  const release = async () => {
    if (!stored) return;
    stored = false;
    await store.release(hold.ownerId, executionId, token);
  };
  const held: HeldState = {
    heldAt,
    now,
    token,
    async begin() {
      if (stored || acquired) return;
      stored = true;
      acquired = true;
      acquireHold(executionId);
      await store.hold({ ownerId: hold.ownerId, executionId, change, heldAt, token });
    },
    enqueued: release,
  };
  try {
    return await sendRating(input, change, held);
  } finally {
    if (acquired) releaseHold(executionId);
    await release();
  }
}

type HeldState = {
  heldAt: number;
  now: () => number;
  /** The held record's token: the first send's mutation id and key. */
  token: string;
  /** Writes the held value to the device store (never throws). */
  begin: () => Promise<void>;
  /** The send is durably in the outbox: the held record is no longer needed. */
  enqueued: () => Promise<void>;
};

async function sendRating(
  input: {
    sync: SyncEngine;
    api: RatingApi;
    executionId: string;
    progress?: (state: "held") => void;
  },
  change: FeedbackChange,
  held: HeldState | null,
): Promise<RatingOutcome> {
  const { sync, api, executionId } = input;
  const hasNote = change.note !== undefined;
  const what = hasNote ? "rating and note" : "rating";

  // 1. Wait for the finish to be accepted; show the pick as held meanwhile.
  // 2. Read the execution for the real version.
  let current: WorkoutExecution | null = null;
  let heldShown = false;
  const markHeld = async () => {
    if (heldShown) return;
    heldShown = true;
    input.progress?.("held");
    await held?.begin();
  };
  /** Past the server's late window (72 h): given up with the neutral copy. */
  const tooLate = () =>
    held != null && held.now() - held.heldAt > PENDING_FEEDBACK_MAX_AGE_MS;
  while (current == null) {
    if (tooLate()) {
      return {
        kind: "refused",
        reason: "window_closed",
        message: RATING_NOTE_WINDOW_CLOSED_MESSAGE,
      };
    }
    if (await finishQueued(sync, executionId)) {
      await markHeld();
      await nextChange(sync, RECHECK_MS);
      continue;
    }
    try {
      current = await api.getWorkoutExecution(executionId);
    } catch (err: unknown) {
      if (isNetworkFailure(err)) {
        await markHeld();
        await nextChange(sync, RECHECK_MS);
        continue;
      }
      reportError("workout.feedback.read", err);
      return {
        kind: "refused",
        reason: "other",
        message: userFacingMessage(err, {
          fallback: `Couldn't save your ${what}. Try again.`,
        }),
      };
    }
  }

  const serverNote = (e: WorkoutExecution) => normalizeNote(e.sessionNote);
  /** True when the server already holds everything asked for. */
  const matches = (e: WorkoutExecution) =>
    (change.rpe === undefined || e.sessionRpe === change.rpe) &&
    (change.note === undefined || serverNote(e) === change.note);
  const savedFrom = (e: WorkoutExecution): RatingOutcome => ({
    kind: "saved",
    rpe: change.rpe !== undefined ? change.rpe : e.sessionRpe,
    note: change.note !== undefined ? change.note : serverNote(e),
  });
  /** Only the fields that differ from the server go out. */
  const bodyFor = (e: WorkoutExecution) => {
    const body: { rpe?: number | null; note?: string | null; recordVersion: number } = {
      recordVersion: e.recordVersion,
    };
    if (change.rpe !== undefined && change.rpe !== e.sessionRpe) body.rpe = change.rpe;
    if (change.note !== undefined && change.note !== serverNote(e)) body.note = change.note;
    return body;
  };

  if (matches(current)) return savedFrom(current);

  // A held value past the server's 48 h edit window is not sent (the server
  // would refuse it): given up with the neutral closed-window copy.
  if (held) {
    const closesAt = editWindowClosesAt(current);
    if (closesAt != null && held.now() >= closesAt) {
      return {
        kind: "refused",
        reason: "window_closed",
        message: RATING_NOTE_WINDOW_CLOSED_MESSAGE,
      };
    }
  }

  // One mutation id and key for this action; a retry of the same payload
  // (the push failing, the app returning) reuses them. A held action uses
  // its stored token, so a resumed send after a restart is the same action.
  let mutationId = held?.token ?? createIdempotencyKey();
  let seen = current;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let results: SyncMutationResult[];
    try {
      const queued = await enqueueAndPush(sync, {
        mutationId,
        idempotencyKey: mutationId,
        recordId: executionId,
        operation: "workout.feedback",
        expectedServerVersion: seen.recordVersion,
        payload: { executionId, body: bodyFor(seen) },
      });
      // The row is on the phone now: the outbox carries it from here.
      await held?.enqueued();
      results = await queued.pushed;
    } catch (err: unknown) {
      reportError("workout.feedback", err);
      return {
        kind: "refused",
        reason: "other",
        message: `Couldn't save your ${what} on this phone. Try again.`,
      };
    }
    const result = results.find((item) => item.mutationId === mutationId);
    if (!result) return { kind: "queued" };
    if (result.status === "applied" || result.status === "already_applied") {
      return savedFrom(seen);
    }
    if (result.status === "rejected" && result.retryable === true) {
      return { kind: "queued" };
    }
    await dropRefusedRow(sync, mutationId);
    if (!isConflict(result)) return refusedFrom(result, hasNote);

    // 409: the version moved. Read once; retry only when the server's rating
    // and note are the ones this phone last saw.
    let fresh: WorkoutExecution;
    try {
      fresh = await api.getWorkoutExecution(executionId);
    } catch (err: unknown) {
      reportError("workout.feedback.reread", err);
      return refusedFrom(result, hasNote);
    }
    if (matches(fresh)) return savedFrom(fresh);
    if (
      attempt === 1 ||
      fresh.sessionRpe !== seen.sessionRpe ||
      serverNote(fresh) !== serverNote(seen)
    ) {
      return {
        ...refusedFrom(result, hasNote),
        serverRpe: fresh.sessionRpe,
        serverNote: serverNote(fresh),
      };
    }
    seen = fresh;
    // A new payload (the fresh version) is a new send: new id, old refused
    // row already removed.
    mutationId = createIdempotencyKey();
  }
  return { kind: "queued" };
}

/**
 * After a restart (called when the Workout tab mounts): sends each rating and
 * note this user held before, once its finish has synced, through the same
 * path as a Save, reusing the record's token as the mutation id and key. Only
 * this owner's records are read; one older than 72 h, or past the 48 h edit
 * window, is removed without a word (the server would refuse it as late). A
 * send already running in this process for the workout is left to it; a
 * record whose send is already in the outbox (a crash right after the write)
 * is removed without queueing another. Never throws.
 */
export async function resumeHeldWorkoutFeedback(input: {
  ownerId: string;
  sync: SyncEngine;
  api: RatingApi;
  store?: PendingFeedbackStore;
  now?: () => number;
}): Promise<void> {
  const store = input.store ?? pendingFeedbackStore;
  const now = input.now ?? (() => Date.now());
  const rows = await store.list(input.ownerId);
  await Promise.all(
    rows.map(async (row) => {
      if (row.ownerId !== input.ownerId) return;
      // Check and register in one step (no await between): a second resume
      // started meanwhile (the tab remounting) skips this workout.
      if (activeHolds.has(row.executionId)) return;
      acquireHold(row.executionId);
      try {
        if (now() - row.heldAt > PENDING_FEEDBACK_MAX_AGE_MS) return;
        if (await alreadyQueued(input.sync, row.token)) return;
        const outcome = await saveWorkoutRating({
          sync: input.sync,
          api: input.api,
          executionId: row.executionId,
          change: row.change,
          hold: {
            ownerId: input.ownerId,
            store,
            heldAt: row.heldAt,
            resumeToken: row.token,
            now,
          },
        });
        // Nobody is looking at this workout: a refusal is logged, not shown.
        if (outcome.kind === "refused" && outcome.reason === "other") {
          reportError("workout.feedback.resume", new Error("Held feedback was refused"));
        }
      } catch (err: unknown) {
        reportError("workout.feedback.resume", err);
      } finally {
        releaseHold(row.executionId);
        // Removed only if this record still carries the token (a newer Save
        // held meanwhile keeps its own).
        await store.release(input.ownerId, row.executionId, row.token);
      }
    }),
  );
}

/** True when the send with this mutation id is already in the outbox. */
async function alreadyQueued(sync: SyncEngine, mutationId: string): Promise<boolean> {
  try {
    const rows = await sync.store.listOutbox();
    return rows.some(
      (row) => row.operation === "workout.feedback" && row.mutationId === mutationId,
    );
  } catch (err: unknown) {
    // Unknown: sending reuses the same mutation id and key, so the server
    // treats a repeat as the same action.
    reportError("workout.feedback.resume", err);
    return false;
  }
}

/** Tests only: forget holds running in this process (a fresh process). */
export function resetActiveHoldsForTests(): void {
  activeHolds.clear();
}
