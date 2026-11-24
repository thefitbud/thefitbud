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
import {
  isSettledLateWrite,
  recordFinishedWorkoutNotes,
  resolvedSyncNotes,
  type ResolvedNotesStore,
} from "../sync/outboxCopy";
import {
  peekActiveSession,
  updateActiveSession,
  type ActiveSession,
} from "../trainee/workout/activeSession";
import {
  isExecutionDone,
  isWorkoutEndedOnPhone,
  logSetLocally,
  stableMutationId,
} from "../trainee/workoutSession";
import {
  createLiveActivityModuleAccess,
  liveActivityModuleAccess,
  subscribeLiveActivityOutbox,
  type LiveActivityModuleAccess,
} from "./liveActivityNative";

/**
 * "Log set" taps outside the app → the sync outbox (LA2 on iOS, LA3b on
 * Android).
 *
 * Neither the iOS Live Activity widget nor the Android notification's button
 * can reach the API, so a tap only appends a row to native storage: the shared
 * App Group (targets/FitBudLiveActivity) on iOS, SharedPreferences
 * (WorkoutSetStore) on Android. This module drains those rows at once when the
 * native module says a row was appended while the app runs (Z14-5's
 * `onOutboxRow`, D-W14-12), and otherwise when the app becomes active and when
 * the trainee opens the workout tab: each row becomes one
 * `workout.complete_set` mutation (D-W3-5) against the running workout, with
 * a mutation UUID derived from the row so a re-drain or a double tap never
 * logs the same set twice, and the set shows as logged in the open workout
 * straight away. A row for a workout that has already ended on this phone is
 * dropped with a note in the sync status, never sent (Z14-8).
 *
 * Both platforms drain through this one function, over the same module name
 * and the same row shape, so the dedupe keys are identical (LA3b). On web, and
 * in a build without the module or with one made before LA2/LA3, every call is
 * a no-op. The rows are read through the handle's `get()`, not `supported()`:
 * a set tapped while notifications were on is still drained after they are
 * turned off, so a logged set is never lost.
 */

/** What happened to one row in a drain. Only `kept` rows stay in the App Group. */
export type DrainOutcome =
  /** Enqueued as a `workout.complete_set` mutation. */
  | "enqueued"
  /** Another row in the same drain already logged that set (double tap). */
  | "duplicate"
  /** The set was already logged in the app, so there is nothing to send. */
  | "already_logged"
  /**
   * The workout already ended on this phone (finished or discarded): never
   * sent, noted in the sync status instead (Z14-8, D-W14-12).
   */
  | "dropped"
  /** No running workout, no matching set, or the enqueue failed: keep it. */
  | "kept";

export type DrainResult = {
  rows: number;
  enqueued: number;
  duplicates: number;
  alreadyLogged: number;
  dropped: number;
  kept: number;
  /** Rows removed from the App Group (the leading non-kept run). */
  cleared: number;
};

const EMPTY_RESULT: DrainResult = {
  rows: 0,
  enqueued: 0,
  duplicates: 0,
  alreadyLogged: 0,
  dropped: 0,
  kept: 0,
  cleared: 0,
};

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
  if (row.operation !== "workout.log_set") return null;
  if (!row.exerciseName.trim() || !Number.isInteger(row.setIndex) || row.setIndex < 1) {
    return null;
  }
  const named = execution.exercises.filter((exercise) =>
    sameExercise(exercise.name, row.exerciseName),
  );
  if (named.length === 0) return null;
  const setAt = (exercise: (typeof named)[number]) =>
    [...exercise.sets].sort((a, b) => a.order - b.order)[row.setIndex - 1];
  // The widget's set index is per occurrence, so the same exercise name twice
  // in one workout cannot be told apart from the row. With more than one
  // occurrence still waiting at that index, keep the row rather than guess.
  const waiting = named.filter((exercise) => setAt(exercise)?.status === "pending");
  if (waiting.length > 1) return null;
  const exercise = waiting[0] ?? named[0]!;
  const set = setAt(exercise);
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

/**
 * A stable mutation UUID for a row key, so a retry or a re-drain reuses the
 * same mutation and idempotency key (AGENTS.md: one per logical action). The
 * same hash the workout log uses for its own stable ids (Z14-8), unchanged,
 * so a row read before an update keeps its id after it.
 */
export function mutationIdFromKey(key: string): string {
  return stableMutationId(key);
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

/**
 * The workout the rows now in the App Group were first seen against. A row
 * carries only an exercise name, so without this a row kept today would match
 * a later workout's set of the same name and be logged into the wrong
 * session's coaching record. Rows are only ever placed against this workout;
 * under any other one they are kept and reported (the spec's rule), never
 * discarded, expired or auto-cleared. Cleared when the App Group is empty.
 */
function createRowsOrigin() {
  let assignmentId: string | null = null;
  return {
    get: () => assignmentId,
    set(next: string | null) {
      assignmentId = next;
    },
  };
}

export const liveActivityRowsOrigin = createRowsOrigin();

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
  /**
   * The workout open in the app right now (Z14-8). Preferred when it is the
   * activity's workout: it holds what was logged since the last sync, and
   * the drained set then shows in it at once.
   */
  session?: () => ActiveSession | null;
}): RunningWorkoutLookup {
  const session = input.session ?? peekActiveSession;
  return async (assignmentId) => {
    const open = session();
    if (
      open &&
      !isExecutionDone(open.execution) &&
      (assignmentId === null || open.execution.assignmentId === assignmentId)
    ) {
      return open.execution;
    }
    if (assignmentId) {
      try {
        const assignment = await input.api.getWorkoutAssignment(assignmentId);
        const summary = assignment.execution;
        if (summary && !isExecutionDone(summary)) {
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
        .filter((execution) => !isExecutionDone(execution));
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
  /** An existing module handle; built from the platform when absent. */
  access?: LiveActivityModuleAccess;
  onKept?: (count: number) => void;
  /**
   * True when the rows' workout already ended on this phone (Z14-8). Its rows
   * are dropped, never sent: the server would only turn them away.
   */
  isWorkoutEnded?: (ids: {
    assignmentId: string | null;
    executionId: string | null;
  }) => Promise<boolean> | boolean;
  /** Rows dropped for an ended workout, for the sync status note. */
  onDropped?: (count: number, assignmentId: string | null) => void;
  /** A drained set, applied to the open workout so it shows at once. */
  applyLocally?: (
    execution: WorkoutExecution,
    setExecutionId: string,
    values: { actualReps: number | null; actualLoadLabel: string | null },
  ) => void;
  /** Settled late writes the server answered for a drained row. */
  notes?: ResolvedNotesStore;
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
  // One platform guard and one lazy load, iOS and Android alike: the handle in
  // liveActivityNative.ts. Off those platforms `get()` returns null and the
  // module is never loaded.
  const access =
    deps.access ??
    createLiveActivityModuleAccess({
      platformOS: deps.platformOS ?? Platform.OS,
      loadModule: deps.loadModule ?? loadLiveActivityModule,
      warn,
    });

  let read;
  let mod: LiveActivityNativeModule | null = null;
  try {
    mod = access.get();
    if (!mod?.readOutbox) {
      deps.onKept?.(0);
      return EMPTY_RESULT;
    }
    read = mod.readOutbox();
  } catch (error) {
    warn(`[liveActivityOutbox] read failed: ${errorName(error)}`);
    deps.onKept?.(0);
    return EMPTY_RESULT;
  }

  const rows = read?.rows ?? [];
  if (rows.length === 0) {
    liveActivityRowsOrigin.set(null);
    deps.onKept?.(0);
    return EMPTY_RESULT;
  }

  const activityAssignmentId = assignmentIdFromOpenUrl(read?.openUrl);
  const running = await deps.findRunningWorkout(activityAssignmentId).catch(() => null);

  // The workout these rows belong to. Recorded the first time rows are seen
  // and kept until the App Group is empty again, so a row kept while nothing
  // was running is never logged against a later workout.
  const origin = liveActivityRowsOrigin.get();
  const observed = origin ?? activityAssignmentId ?? running?.assignmentId ?? null;
  if (observed !== null) liveActivityRowsOrigin.set(observed);
  const execution = running && running.assignmentId === observed ? running : null;

  // The rows' workout already ended on this phone (finished or discarded,
  // possibly not yet sent): every row is for it, so none is sent. Each is
  // dropped and counted for the sync status note (D-W14-12).
  let ended = false;
  if (observed !== null && deps.isWorkoutEnded) {
    try {
      ended = await deps.isWorkoutEnded({
        assignmentId: observed,
        executionId: execution?.id ?? null,
      });
    } catch (error) {
      warn(`[liveActivityOutbox] ended check failed: ${errorName(error)}`);
      ended = false;
    }
  }

  const outcomes: DrainOutcome[] = [];
  if (ended) {
    while (outcomes.length < rows.length) outcomes.push("dropped");
  }
  const loggedSetIds = new Set<string>();
  for (const [position, row] of rows.entries()) {
    if (ended) break;
    // A kept row stays where it is, and clearing is a prefix, so every row
    // after it stays too: stop here, or a later row would be enqueued and
    // then re-read at a different position (a different idempotency key).
    const keepTheRest = () => {
      while (outcomes.length < rows.length) outcomes.push("kept");
    };
    if (!execution) {
      keepTheRest();
      break;
    }
    const match = matchSetExecution(execution, row);
    if (!match) {
      keepTheRest();
      break;
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
    const body = {
      actualReps: Number.isInteger(row.reps) && row.reps > 0 ? row.reps : null,
      actualLoadLabel: loadLabelFor(row.kilograms),
    };
    try {
      const queued = await enqueueAndPush(deps.sync, {
        mutationId,
        idempotencyKey: mutationId,
        recordId: execution.id,
        operation: "workout.complete_set",
        expectedServerVersion: execution.recordVersion,
        payload: {
          executionId: execution.id,
          // The plan's own id, so a workout opened with no network (ids the
          // server has never seen) is still found (Z12-41).
          assignmentId: execution.assignmentId,
          setExecutionId: match.setExecutionId,
          expectedVersion: execution.recordVersion,
          body,
        },
      });
      loggedSetIds.add(match.setExecutionId);
      outcomes.push("enqueued");
      const assignmentId = execution.assignmentId;
      void queued.pushed.then((results) =>
        recordFinishedWorkoutNotes(
          results,
          {
            operation: "workout.complete_set",
            workoutKey: assignmentId,
            workoutName: null,
            source: "lock_screen",
          },
          deps.notes,
        ),
      );
      try {
        deps.applyLocally?.(execution, match.setExecutionId, body);
      } catch (error) {
        warn(`[liveActivityOutbox] apply failed: ${errorName(error)}`);
      }
    } catch (error) {
      warn(`[liveActivityOutbox] enqueue failed: ${errorName(error)}`);
      while (outcomes.length < rows.length) outcomes.push("kept");
      break;
    }
  }

  // Clear only the drained rows: the leading run, which is every row the loop
  // handled before it stopped. Anything kept stays, at its own position, so a
  // re-drain rebuilds the same key and so the same mutation.
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
  // Every observed row went: the next read is a fresh observation, which may
  // legitimately be a different workout (rows the widget appended meanwhile).
  if (cleared === rows.length) liveActivityRowsOrigin.set(null);

  const result: DrainResult = {
    rows: rows.length,
    enqueued: outcomes.filter((outcome) => outcome === "enqueued").length,
    duplicates: outcomes.filter((outcome) => outcome === "duplicate").length,
    alreadyLogged: outcomes.filter((outcome) => outcome === "already_logged").length,
    dropped: outcomes.filter((outcome) => outcome === "dropped").length,
    kept: outcomes.filter((outcome) => outcome === "kept").length,
    cleared,
  };
  // Only rows that really left the App Group are reported as dropped; if the
  // clear failed they are still there and the next drain tries again.
  if (result.dropped > 0 && cleared > 0) deps.onDropped?.(result.dropped, observed);
  deps.onKept?.(result.kept);
  return result;
}

/**
 * A drained set shows in the open workout at once (Z14-8): the session store
 * is what the log, the minimised bar and the Live Activity read.
 */
export function applyDrainedSetToSession(
  execution: WorkoutExecution,
  setExecutionId: string,
  values: { actualReps: number | null; actualLoadLabel: string | null },
): void {
  const open = peekActiveSession();
  if (!open || open.execution.id !== execution.id) return;
  const current = open.execution.exercises
    .flatMap((exercise) => exercise.sets)
    .find((set) => set.id === setExecutionId);
  // Logged in the app meanwhile: the app's own log stands.
  if (!current || current.status !== "pending") return;
  updateActiveSession(open.relationshipId, {
    execution: logSetLocally(open.execution, setExecutionId, values),
  });
}

function stringField(json: string | null, key: string): string | null {
  if (!json) return null;
  try {
    const value = (JSON.parse(json) as Record<string, unknown> | null)?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/** The workout's name from what the phone already holds; null if unknown. */
async function workoutNameOnPhone(
  store: TraineeSyncStore,
  assignmentId: string | null,
): Promise<string | null> {
  if (!assignmentId) return null;
  const open = peekActiveSession();
  if (open?.assignment?.id === assignmentId) {
    return open.assignment.workoutDayName ?? null;
  }
  try {
    const record = await store.getLocal("workout_assignment", assignmentId);
    return stringField(record?.payloadJson ?? null, "workoutDayName");
  } catch {
    return null;
  }
}

/**
 * Late workout writes the server turned away before Z14-7 settled them (rows
 * refused as "workout already finished" may still be on a phone): nothing was
 * written and nothing is left to do, so each becomes a sync status note and
 * leaves the outbox, as an `already_applied` answer would (Z14-8). A finish
 * with a different session RPE is not one of them and stays a refusal.
 */
export async function settleFinishedWorkoutRefusals(
  sync: SyncEngine,
  notes: ResolvedNotesStore = resolvedSyncNotes,
): Promise<number> {
  let rows;
  try {
    rows = await sync.store.listOutbox();
  } catch {
    return 0;
  }
  let settled = 0;
  for (const row of rows) {
    if (!isSettledLateWrite(row)) continue;
    const assignmentId = stringField(row.payloadJson, "assignmentId");
    const executionId = stringField(row.payloadJson, "executionId");
    try {
      await sync.discardEntry(row.mutationId);
    } catch {
      continue;
    }
    settled += 1;
    notes.add({
      workoutKey: assignmentId ?? executionId ?? row.recordId,
      operation: row.operation,
      source: "app",
      workoutName:
        stringField(row.payloadJson, "workoutName") ??
        (await workoutNameOnPhone(sync.store, assignmentId)),
    });
  }
  return settled;
}

/**
 * The trainee shell's only call. Drains as soon as the native module says a
 * lock-screen or notification "Log set" row was appended (Z14-5's event, while
 * the app runs), when the app becomes active, and when `focusKey` changes
 * (the shell passes its tab, so opening the workout tab drains too). One
 * drain at a time; a request that arrives during a drain runs right after
 * it, so a row appended mid-drain is never left until the next foreground.
 */
export function useLiveActivityOutboxDrain(input: {
  sync: SyncEngine;
  api: FitBudApiClient;
  focusKey?: string;
}): void {
  const { sync, api, focusKey } = input;
  const running = useRef(false);
  const again = useRef(false);
  const drainRef = useRef<() => void>(() => undefined);

  const drain = useCallback(() => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    void drainLiveActivityOutbox({
      sync,
      findRunningWorkout: createRunningWorkoutLookup({ api, store: sync.store }),
      isWorkoutEnded: (ids) => isWorkoutEndedOnPhone(sync.store, ids),
      applyLocally: applyDrainedSetToSession,
      // The app's one handle, so the module is loaded once, not once per drain.
      access: liveActivityModuleAccess,
      onKept: (count) => liveActivityKeptRows.set(count),
      onDropped: (count, assignmentId) => {
        void workoutNameOnPhone(sync.store, assignmentId).then((workoutName) =>
          resolvedSyncNotes.add({
            workoutKey: assignmentId ?? "unknown",
            operation: "workout.complete_set",
            source: "lock_screen",
            workoutName,
            count,
          }),
        );
      },
    }).finally(() => {
      running.current = false;
      if (again.current) {
        again.current = false;
        drainRef.current();
      }
    });
  }, [api, sync]);
  drainRef.current = drain;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") drain();
    });
    return () => subscription.remove();
  }, [drain]);

  // D-W14-12: a running app drains the moment a row is appended. Builds
  // without the event (or off iOS/Android) subscribe to nothing.
  useEffect(
    () => subscribeLiveActivityOutbox(liveActivityModuleAccess, () => drain()),
    [drain],
  );

  // Runs on mount (app launch) and whenever the shell's focus key changes.
  useEffect(() => {
    drain();
  }, [drain, focusKey]);

  // Late workout writes refused before Z14-7 become notes, not refusals.
  useEffect(() => {
    let busy = false;
    let rerun = false;
    const settle = () => {
      if (busy) {
        rerun = true;
        return;
      }
      busy = true;
      void settleFinishedWorkoutRefusals(sync).finally(() => {
        busy = false;
        // A change during the pass (its own removals included) runs one more
        // pass, which finds nothing left once every such row is settled.
        if (rerun) {
          rerun = false;
          settle();
        }
      });
    };
    settle();
    return typeof sync.subscribe === "function" ? sync.subscribe(settle) : undefined;
  }, [sync]);
}
