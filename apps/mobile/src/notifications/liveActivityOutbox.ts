import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import type { FitBudApiClient } from "@fitbud/api-client";
import type { WorkoutExecution } from "@fitbud/contracts";
import {
  loadLiveActivityModule,
  type LiveActivityNativeModule,
  type NativeOutboxRow,
} from "../../modules/live-activity";
import { enqueueAndPush } from "../sync/actions";
import type { SyncEngine, TraineeSyncStore } from "../sync/engine";

/**
 * Lock-screen "Log set" taps → the sync outbox (task LA2).
 *
 * The Live Activity widget cannot reach the API, so its Log set button only
 * appends a row to the shared App Group (targets/FitBudLiveActivity). This
 * module drains those rows when the app becomes active and when the trainee
 * opens the workout tab: each row becomes one `workout.complete_set` mutation
 * (D-W3-5) against the running workout, with a mutation UUID derived from the
 * row so a re-drain or a double tap never logs the same set twice.
 *
 * iOS only. On Android (LA3, LA3b) and web every call is a no-op.
 *
 * Ownership note: the platform guard and module load are repeated here rather
 * than reused from liveActivityNative.ts because that file belongs to another
 * task in this batch (LA3b). They behave the same: never throw, no-op where
 * the module is absent.
 */

/** What happened to one row in a drain. Only `kept` rows stay in the App Group. */
export type DrainOutcome =
  /** Enqueued as a `workout.complete_set` mutation. */
  | "enqueued"
  /** Another row in the same drain already logged that set (double tap). */
  | "duplicate"
  /** The set was already logged in the app, so there is nothing to send. */
  | "already_logged"
  /** No running workout, no matching set, or the enqueue failed: keep it. */
  | "kept";

export type DrainResult = {
  rows: number;
  enqueued: number;
  duplicates: number;
  alreadyLogged: number;
  kept: number;
  /** Rows removed from the App Group (the leading non-kept run). */
  cleared: number;
};

const EMPTY_RESULT: DrainResult = {
  rows: 0,
  enqueued: 0,
  duplicates: 0,
  alreadyLogged: 0,
  kept: 0,
  cleared: 0,
};

const DONE_EXECUTION_STATUSES = new Set(["completed", "skipped", "modified"]);

/** `fitbud://?workout={assignmentId}` (liveActivitySession.workoutOpenUrl) → the id. */
export function assignmentIdFromOpenUrl(
  openUrl: string | null | undefined,
): string | null {
  if (!openUrl) return null;
  const query = openUrl.match(/[?&]workout=([^&]+)/);
  if (query) return decodeURIComponent(query[1]!) || null;
  const path = openUrl.match(/^fitbud:\/\/workout\/([^/?#]+)/);
  return path ? decodeURIComponent(path[1]!) || null : null;
}

/** "22.5 kg", or null for a bodyweight / unknown load (no label is sent). */
export function loadLabelFor(kilograms: number): string | null {
  if (!Number.isFinite(kilograms) || kilograms <= 0) return null;
  const rounded = Math.round(kilograms * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} kg`;
}

function sameExercise(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The set execution a row refers to: the widget only knows the exercise name
 * and the set's position in that exercise (D-W3-5 maps those onto the running
 * session's ids). Null when the running workout has no such set.
 */
export function matchSetExecution(
  execution: WorkoutExecution,
  row: NativeOutboxRow,
): { setExecutionId: string; pending: boolean } | null {
  if (!row.exerciseName.trim() || !Number.isInteger(row.setIndex) || row.setIndex < 1) {
    return null;
  }
  const named = execution.exercises.filter((exercise) =>
    sameExercise(exercise.name, row.exerciseName),
  );
  if (named.length === 0) return null;
  // Same name twice in one workout: the one still being worked through.
  const exercise =
    named.find((candidate) => candidate.sets.some((set) => set.status === "pending")) ??
    named[0]!;
  const sets = [...exercise.sets].sort((a, b) => a.order - b.order);
  const set = sets[row.setIndex - 1];
  if (!set) return null;
  return { setExecutionId: set.id, pending: set.status === "pending" };
}

/**
 * The row's identity: the running session, the set, the values logged and the
 * row's position in the App Group. Two taps of the same set are two rows (two
 * positions), so the drain dedupes them by set; the same row drained twice
 * keeps one key, and so one mutation.
 */
export function outboxRowKey(
  executionId: string,
  row: NativeOutboxRow,
  position: number,
): string {
  return [executionId, row.setIndex, row.kilograms, row.reps, position].join("|");
}

function hash32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A stable mutation UUID for a row key, so a retry or a re-drain reuses the
 * same mutation and idempotency key (AGENTS.md: one per logical action).
 * Shaped as a version-4 UUID because the sync contract takes a UUID.
 */
export function mutationIdFromKey(key: string): string {
  const hex = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((seed) => hash32(key, seed).toString(16).padStart(8, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** Trainee-facing line for rows that could not be matched to a workout yet. */
export function keptLiveActivityRowsCopy(count: number): string | null {
  if (count <= 0) return null;
  const sets = count === 1 ? "1 set" : `${count} sets`;
  return `${sets} logged on your lock screen · open the workout to save ${count === 1 ? "it" : "them"}`;
}

/**
 * The count of kept rows, reported once per drain. The sync status screen
 * reads it so a lock-screen set that is waiting is visible and never silently
 * dropped (see the PR: wiring the screen itself is a follow-up, the screen
 * file belongs to another task).
 */
function createKeptRowsNotice() {
  let count = 0;
  const listeners = new Set<(next: number) => void>();
  return {
    get: () => count,
    copy: () => keptLiveActivityRowsCopy(count),
    set(next: number) {
      if (next === count) return;
      count = next;
      for (const listener of listeners) listener(count);
    },
    subscribe(listener: (next: number) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const liveActivityKeptRows = createKeptRowsNotice();

export type RunningWorkoutLookup = (
  assignmentId: string | null,
) => Promise<WorkoutExecution | null>;

function parseLocalExecution(payloadJson: string | null): WorkoutExecution | null {
  if (!payloadJson) return null;
  try {
    const parsed = JSON.parse(payloadJson) as WorkoutExecution | null;
    return parsed && Array.isArray(parsed.exercises) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The workout a lock-screen row belongs to: the authoritative execution for
 * the activity's assignment, or — offline — the one the local sync store
 * already holds. Null when nothing is running, which keeps the rows.
 */
export function createRunningWorkoutLookup(input: {
  api: FitBudApiClient;
  store: TraineeSyncStore;
}): RunningWorkoutLookup {
  return async (assignmentId) => {
    if (assignmentId) {
      try {
        const assignment = await input.api.getWorkoutAssignment(assignmentId);
        const summary = assignment.execution;
        if (summary && !DONE_EXECUTION_STATUSES.has(summary.status)) {
          return await input.api.getWorkoutExecution(summary.id);
        }
      } catch {
        // Offline or the assignment is gone: fall back to the local store.
      }
    }
    let local: WorkoutExecution[] = [];
    try {
      local = (await input.store.listLocal("workout_execution"))
        .filter((record) => !record.tombstone)
        .map((record) => parseLocalExecution(record.payloadJson))
        .filter((execution): execution is WorkoutExecution => execution !== null)
        .filter((execution) => !DONE_EXECUTION_STATUSES.has(execution.status));
    } catch {
      return null;
    }
    if (assignmentId) {
      const matched = local.find((execution) => execution.assignmentId === assignmentId);
      if (matched) return matched;
      // An activity names its workout: never guess a different one.
      return null;
    }
    return local.length === 1 ? local[0]! : null;
  };
}

export type DrainDeps = {
  sync: SyncEngine;
  findRunningWorkout: RunningWorkoutLookup;
  platformOS?: string;
  loadModule?: () => LiveActivityNativeModule | null;
  onKept?: (count: number) => void;
  warn?: (message: string) => void;
};

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

/**
 * Drains the App Group rows into the sync outbox once each. Never throws: a
 * failure leaves the row where it is for the next drain.
 */
export async function drainLiveActivityOutbox(deps: DrainDeps): Promise<DrainResult> {
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  const platformOS = deps.platformOS ?? Platform.OS;
  if (platformOS !== "ios") return EMPTY_RESULT;

  let read;
  let mod: LiveActivityNativeModule | null = null;
  try {
    mod = (deps.loadModule ?? loadLiveActivityModule)();
    if (!mod?.readOutbox) return EMPTY_RESULT;
    read = mod.readOutbox();
  } catch (error) {
    warn(`[liveActivityOutbox] read failed: ${errorName(error)}`);
    return EMPTY_RESULT;
  }

  const rows = read?.rows ?? [];
  if (rows.length === 0) {
    deps.onKept?.(0);
    return EMPTY_RESULT;
  }

  const execution = await deps
    .findRunningWorkout(assignmentIdFromOpenUrl(read?.openUrl))
    .catch(() => null);

  const outcomes: DrainOutcome[] = [];
  const loggedSetIds = new Set<string>();
  for (const [position, row] of rows.entries()) {
    if (!execution) {
      outcomes.push("kept");
      continue;
    }
    const match = matchSetExecution(execution, row);
    if (!match) {
      outcomes.push("kept");
      continue;
    }
    if (loggedSetIds.has(match.setExecutionId)) {
      outcomes.push("duplicate");
      continue;
    }
    if (!match.pending) {
      loggedSetIds.add(match.setExecutionId);
      outcomes.push("already_logged");
      continue;
    }
    const mutationId = mutationIdFromKey(outboxRowKey(execution.id, row, position));
    try {
      await enqueueAndPush(deps.sync, {
        mutationId,
        idempotencyKey: mutationId,
        recordId: execution.id,
        operation: "workout.complete_set",
        expectedServerVersion: execution.recordVersion,
        payload: {
          executionId: execution.id,
          setExecutionId: match.setExecutionId,
          expectedVersion: execution.recordVersion,
          body: {
            actualReps: Number.isInteger(row.reps) && row.reps > 0 ? row.reps : null,
            actualLoadLabel: loadLabelFor(row.kilograms),
          },
        },
      });
      loggedSetIds.add(match.setExecutionId);
      outcomes.push("enqueued");
    } catch (error) {
      warn(`[liveActivityOutbox] enqueue failed: ${errorName(error)}`);
      outcomes.push("kept");
    }
  }

  // Clear only the drained rows. Rows are a queue, so clearing is a prefix:
  // stop at the first kept row and leave it (and anything after it) for the
  // next drain. Their keys make a re-drain reuse the same mutations.
  let cleared = 0;
  while (cleared < outcomes.length && outcomes[cleared] !== "kept") cleared += 1;
  if (cleared > 0 && mod?.removeOutbox) {
    try {
      mod.removeOutbox(cleared);
    } catch (error) {
      warn(`[liveActivityOutbox] clear failed: ${errorName(error)}`);
      cleared = 0;
    }
  }

  const result: DrainResult = {
    rows: rows.length,
    enqueued: outcomes.filter((outcome) => outcome === "enqueued").length,
    duplicates: outcomes.filter((outcome) => outcome === "duplicate").length,
    alreadyLogged: outcomes.filter((outcome) => outcome === "already_logged").length,
    kept: outcomes.filter((outcome) => outcome === "kept").length,
    cleared,
  };
  deps.onKept?.(result.kept);
  return result;
}

/**
 * The trainee shell's only call. Drains when the app becomes active and when
 * `focusKey` changes (the shell passes its tab, so opening the workout tab
 * drains too), one drain at a time.
 */
export function useLiveActivityOutboxDrain(input: {
  sync: SyncEngine;
  api: FitBudApiClient;
  focusKey?: string;
}): void {
  const { sync, api, focusKey } = input;
  const running = useRef(false);

  const drain = useCallback(() => {
    if (running.current) return;
    running.current = true;
    void drainLiveActivityOutbox({
      sync,
      findRunningWorkout: createRunningWorkoutLookup({ api, store: sync.store }),
      onKept: (count) => liveActivityKeptRows.set(count),
    }).finally(() => {
      running.current = false;
    });
  }, [api, sync]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") drain();
    });
    return () => subscription.remove();
  }, [drain]);

  // Runs on mount (app launch) and whenever the shell's focus key changes.
  useEffect(() => {
    drain();
  }, [drain, focusKey]);
}
