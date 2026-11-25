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
 *   has a verdict. A hold older than 72 h is given up with the neutral
 *   closed-window message. A store failure never blocks the send.
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

export const RATING_WINDOW_CLOSED_MESSAGE =
  "Ratings can be changed for 48 hours after a workout.";
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
      message: hasNote ? RATING_NOTE_WINDOW_CLOSED_MESSAGE : RATING_WINDOW_CLOSED_MESSAGE,
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

/** Executions with a held send running in this process (resume skips them). */
const activeHolds = new Set<string>();

export type HoldOptions = {
  /** The signed-in user: the held value is stored under this owner only. */
  ownerId: string;
  store?: PendingFeedbackStore;
  /** When the hold began (a resumed hold keeps its first time). */
  heldAt?: number;
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
  const token = createIdempotencyKey();
  const heldAt = hold.heldAt ?? now();
  let stored = false;
  const held: HeldState = {
    heldAt,
    now,
    async begin() {
      if (stored) return;
      stored = true;
      activeHolds.add(executionId);
      await store.hold({ ownerId: hold.ownerId, executionId, change, heldAt, token });
    },
  };
  try {
    return await sendRating(input, change, held);
  } finally {
    if (stored) {
      activeHolds.delete(executionId);
      await store.release(hold.ownerId, executionId, token);
    }
  }
}

type HeldState = {
  heldAt: number;
  now: () => number;
  /** Writes the held value to the device store (never throws). */
  begin: () => Promise<void>;
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
        message: hasNote ? RATING_NOTE_WINDOW_CLOSED_MESSAGE : RATING_WINDOW_CLOSED_MESSAGE,
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

  // One mutation id and key for this action; a retry of the same payload
  // (the push failing, the app returning) reuses them.
  let mutationId = createIdempotencyKey();
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
        wait: true,
      });
      results = queued.results;
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
 * path as a Save. Only this owner's records are read; one older than 72 h is
 * removed without a word (the server would refuse it as late). A hold
 * already running in this process is left to it. Never throws.
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
      if (activeHolds.has(row.executionId)) return;
      if (now() - row.heldAt > PENDING_FEEDBACK_MAX_AGE_MS) {
        await store.release(input.ownerId, row.executionId, row.token);
        return;
      }
      try {
        const outcome = await saveWorkoutRating({
          sync: input.sync,
          api: input.api,
          executionId: row.executionId,
          change: row.change,
          hold: { ownerId: input.ownerId, store, heldAt: row.heldAt, now },
        });
        // Nobody is looking at this workout: a refusal is logged, not shown.
        if (outcome.kind === "refused" && outcome.reason === "other") {
          reportError("workout.feedback.resume", new Error("Held feedback was refused"));
        }
      } catch (err: unknown) {
        reportError("workout.feedback.resume", err);
      } finally {
        // A hold that began above re-wrote and released the record itself;
        // this removes the original when the send went out at once.
        await store.release(input.ownerId, row.executionId, row.token);
      }
    }),
  );
}

/** Tests only: forget holds running in this process (a fresh process). */
export function resetActiveHoldsForTests(): void {
  activeHolds.clear();
}
