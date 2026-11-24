import type { SyncMutationResult, WorkoutExecution } from "@fitbud/contracts";
import { isNetworkFailure, userFacingMessage } from "@fitbud/api-client";
import { createIdempotencyKey } from "../../lib/idempotency";
import { reportError } from "../../lib/reportError";
import { enqueueAndPush } from "../../sync/actions";
import type { SyncEngine } from "../../sync/engine";

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
 */
export type RatingOutcome =
  /** The server holds this rating. */
  | { kind: "saved"; rpe: number | null }
  /** Queued behind a failed or slow push; it sends when the phone is online. */
  | { kind: "queued" }
  | {
      kind: "refused";
      reason: "window_closed" | "conflict" | "other";
      message: string;
      /** The server's rating, when the read gave one (conflict). */
      serverRpe?: number | null;
    };

export const RATING_WINDOW_CLOSED_MESSAGE =
  "Ratings can be changed for 48 hours after a workout.";
export const RATING_CONFLICT_MESSAGE =
  "Your rating was changed somewhere else. Pick again to replace it.";
export const RATING_HELD_MESSAGE =
  "Your rating will be saved when this workout is sent.";
export const RATING_QUEUED_MESSAGE =
  "Your rating will be saved when you're back online.";

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

function refusedFrom(result: SyncMutationResult): RatingOutcome & { kind: "refused" } {
  const code = result.error?.code;
  if (code === "FEEDBACK_EDIT_WINDOW_CLOSED") {
    return { kind: "refused", reason: "window_closed", message: RATING_WINDOW_CLOSED_MESSAGE };
  }
  if (result.status === "conflicted" || code === "VERSION_CONFLICT") {
    return { kind: "refused", reason: "conflict", message: RATING_CONFLICT_MESSAGE };
  }
  return {
    kind: "refused",
    reason: "other",
    message: userFacingMessage(result.error?.message, {
      fallback: "Couldn't save your rating. Try again.",
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

export async function saveWorkoutRating(input: {
  sync: SyncEngine;
  api: RatingApi;
  executionId: string;
  rpe: number | null;
  progress?: (state: "held") => void;
}): Promise<RatingOutcome> {
  const { sync, api, executionId, rpe } = input;

  // 1. Wait for the finish to be accepted; show the pick as held meanwhile.
  // 2. Read the execution for the real version.
  let current: WorkoutExecution | null = null;
  let heldShown = false;
  while (current == null) {
    if (await finishQueued(sync, executionId)) {
      if (!heldShown) {
        heldShown = true;
        input.progress?.("held");
      }
      await nextChange(sync, RECHECK_MS);
      continue;
    }
    try {
      current = await api.getWorkoutExecution(executionId);
    } catch (err: unknown) {
      if (isNetworkFailure(err)) {
        if (!heldShown) {
          heldShown = true;
          input.progress?.("held");
        }
        await nextChange(sync, RECHECK_MS);
        continue;
      }
      reportError("workout.feedback.read", err);
      return {
        kind: "refused",
        reason: "other",
        message: userFacingMessage(err, {
          fallback: "Couldn't save your rating. Try again.",
        }),
      };
    }
  }

  if (current.sessionRpe === rpe) return { kind: "saved", rpe };

  // One mutation id and key for this rating action; a retry of the same
  // payload (the push failing, the app returning) reuses them.
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
        payload: { executionId, body: { rpe, recordVersion: seen.recordVersion } },
        wait: true,
      });
      results = queued.results;
    } catch (err: unknown) {
      reportError("workout.feedback", err);
      return {
        kind: "refused",
        reason: "other",
        message: "Couldn't save your rating on this phone. Try again.",
      };
    }
    const result = results.find((item) => item.mutationId === mutationId);
    if (!result) return { kind: "queued" };
    if (result.status === "applied" || result.status === "already_applied") {
      return { kind: "saved", rpe };
    }
    if (result.status === "rejected" && result.retryable === true) {
      return { kind: "queued" };
    }
    await dropRefusedRow(sync, mutationId);
    if (!isConflict(result)) return refusedFrom(result);

    // 409: the version moved. Read once; retry only when the server's rating
    // is the one this phone last saw.
    let fresh: WorkoutExecution;
    try {
      fresh = await api.getWorkoutExecution(executionId);
    } catch (err: unknown) {
      reportError("workout.feedback.reread", err);
      return refusedFrom(result);
    }
    if (fresh.sessionRpe === rpe) return { kind: "saved", rpe };
    if (attempt === 1 || fresh.sessionRpe !== seen.sessionRpe) {
      return { ...refusedFrom(result), serverRpe: fresh.sessionRpe };
    }
    seen = fresh;
    // A new payload (the fresh version) is a new send: new id, old refused
    // row already removed.
    mutationId = createIdempotencyKey();
  }
  return { kind: "queued" };
}
