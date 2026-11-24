import { type FitBudApiClient, userFacingMessage } from "@fitbud/api-client";
import type {
  WorkoutAssignment,
  WorkoutExecution,
  WorkoutExecutionSummary,
} from "@fitbud/contracts";
import { formatClockTime } from "@fitbud/core";
import { createIdempotencyKey } from "../lib/idempotency";
import { enqueueAndPush } from "../sync/actions";
import type { SyncEngine } from "../sync/engine";
import { recordFinishedWorkoutNotes } from "../sync/outboxCopy";

function newId(): string {
  return createIdempotencyKey();
}

/* ------------------------------------------------------------------------ */
/* One logical workout action, one mutation (Z14-8, diagnosis #13)          */
/* ------------------------------------------------------------------------ */

function hash32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A stable mutation UUID for a key, so a second tap, a retry or a re-drain of
 * the same logical action reuses the same mutation id and idempotency key
 * (AGENTS.md: one per logical action). Shaped as a version-4 UUID because the
 * sync contract takes a UUID. The outbox keeps one row per mutation id and the
 * server answers a repeat `already_applied`, so the same key never logs twice.
 */
export function stableMutationId(key: string): string {
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

/** "Finish this execution" happens once: its id comes from the execution. */
export function finishMutationId(executionId: string): string {
  return stableMutationId(`workout.complete|${executionId}`);
}

/**
 * Skipping (or discarding) a planned workout happens once per assignment: a
 * skipped workout offers no start, so it is never skipped again.
 */
export function skipMutationId(assignmentId: string): string {
  return stableMutationId(`workout.skip|${assignmentId}`);
}

/** The last log sent for each set: its values and its mutation id. */
const lastSetLogs = new Map<string, { values: string; mutationId: string }>();

/**
 * The mutation id for logging `setId` with `values`. The same values as the
 * set's last log (a double tap, a retry after "Log it again") reuse that
 * log's id, so they stay one outbox row and one server write. New values (a
 * correction, W-13) are a new log with its own id: the outbox keeps the first
 * row's payload for a reused id and the server answers it `already_applied`,
 * so reusing the id would silently drop the correction.
 */
export function setLogMutationId(
  executionId: string,
  setId: string,
  values: unknown,
): string {
  const key = `${executionId}|${setId}`;
  const valuesKey = JSON.stringify(values ?? null);
  const last = lastSetLogs.get(key);
  if (last && last.values === valuesKey) return last.mutationId;
  const mutationId = newId();
  lastSetLogs.set(key, { values: valuesKey, mutationId });
  return mutationId;
}

const DONE_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "skipped",
  "modified",
]);

/** Finished, finished early, or discarded (recorded as skipped). */
export function isExecutionDone(execution: { status: string }): boolean {
  return DONE_STATUSES.has(execution.status);
}

/**
 * Workouts finished or discarded on this phone since the app started, by
 * execution id and by assignment id. The finish and discard handlers mark
 * them before anything is queued, so a second tap, a Discard after a Finish,
 * or a lock-screen set that arrives later all see the workout as ended
 * (Z14-8) even before the server has heard of it.
 */
const endedLocally = new Set<string>();

export function markWorkoutEndedLocally(execution: {
  id: string;
  assignmentId: string;
}): void {
  endedLocally.add(`execution:${execution.id}`);
  endedLocally.add(`assignment:${execution.assignmentId}`);
  for (const key of [...lastSetLogs.keys()]) {
    if (key.startsWith(`${execution.id}|`)) lastSetLogs.delete(key);
  }
}

export function isWorkoutEndedLocally(ids: {
  executionId?: string | null;
  assignmentId?: string | null;
}): boolean {
  return (
    (ids.executionId != null && endedLocally.has(`execution:${ids.executionId}`)) ||
    (ids.assignmentId != null && endedLocally.has(`assignment:${ids.assignmentId}`))
  );
}

/** Tests only: forget what this process has marked. */
export function resetWorkoutActionsForTests(): void {
  endedLocally.clear();
  lastSetLogs.clear();
}

type OutboxLike = {
  operation: string;
  recordId: string;
  payloadJson: string;
};

/**
 * True when the phone already holds a finish or a discard of this workout:
 * marked in this process, queued in the outbox (it survives a restart), or a
 * finished record in the local store. Never throws; a store that cannot be
 * read answers with what is known in memory.
 */
export async function isWorkoutEndedOnPhone(
  store: Pick<SyncEngine["store"], "listOutbox" | "listLocal">,
  ids: { executionId?: string | null; assignmentId?: string | null },
): Promise<boolean> {
  if (isWorkoutEndedLocally(ids)) return true;
  const matches = (executionId: unknown, assignmentId: unknown) =>
    (ids.executionId != null && executionId === ids.executionId) ||
    (ids.assignmentId != null && assignmentId === ids.assignmentId);
  try {
    const rows: OutboxLike[] = await store.listOutbox();
    for (const row of rows) {
      if (row.operation !== "workout.complete" && row.operation !== "workout.skip") {
        continue;
      }
      let body: Record<string, unknown> = {};
      try {
        body = (JSON.parse(row.payloadJson) as Record<string, unknown>) ?? {};
      } catch {
        body = {};
      }
      const executionId = body.executionId ?? (row.operation === "workout.complete" ? row.recordId : null);
      const assignmentId = body.assignmentId ?? (row.operation === "workout.skip" ? row.recordId : null);
      if (matches(executionId, assignmentId)) return true;
    }
  } catch {
    // Fall through to the local records.
  }
  try {
    for (const record of await store.listLocal("workout_execution")) {
      if (record.tombstone || !record.payloadJson) continue;
      let parsed: { id?: unknown; assignmentId?: unknown; status?: unknown } = {};
      try {
        parsed = JSON.parse(record.payloadJson) as typeof parsed;
      } catch {
        continue;
      }
      if (
        typeof parsed.status === "string" &&
        DONE_STATUSES.has(parsed.status) &&
        matches(parsed.id ?? record.recordId, parsed.assignmentId)
      ) {
        return true;
      }
    }
  } catch {
    // Nothing more is known.
  }
  return false;
}

/** Build a local execution snapshot from the assignment plan (offline start/continue). */
export function synthesizeExecutionFromAssignment(
  assignment: WorkoutAssignment,
  existing?: WorkoutExecutionSummary | null,
): WorkoutExecution {
  const now = new Date().toISOString();
  const executionId = existing?.id ?? newId();
  const status =
    existing?.status === "paused"
      ? "paused"
      : existing?.status === "started"
        ? "started"
        : "started";

  return {
    id: executionId,
    assignmentId: assignment.id,
    coachingRelationshipId: assignment.coachingRelationshipId,
    planVersionId: assignment.planVersionId,
    traineeUserId: existing?.traineeUserId ?? "",
    status,
    recordVersion: existing?.recordVersion ?? 0,
    startedAt: existing?.startedAt ?? now,
    pausedAt: existing?.pausedAt ?? null,
    completedAt: existing?.completedAt ?? null,
    sessionRpe: existing?.sessionRpe ?? null,
    requireSessionRpe: existing?.requireSessionRpe ?? false,
    exercises: [...assignment.workoutDay.exercises]
      .sort((a, b) => a.order - b.order)
      .map((exercise) => {
        const exerciseId = newId();
        return {
          id: exerciseId,
          workoutExecutionId: executionId,
          exerciseId: exercise.id,
          name: exercise.name,
          order: exercise.order,
          status: "pending" as const,
          sets: [...exercise.setTargets]
            .sort((a, b) => a.order - b.order)
            .map((target) => ({
              id: newId(),
              exerciseExecutionId: exerciseId,
              setTargetId: target.id,
              order: target.order,
              status: "pending" as const,
              prescribedReps: target.reps,
              prescribedLoadLabel: target.loadLabel,
              actualReps: null,
              actualLoadLabel: null,
              completedAt: null,
              createdAt: now,
              updatedAt: now,
            })),
          createdAt: now,
          updatedAt: now,
        };
      }),
    createdAt: existing?.createdAt ?? now,
    updatedAt: existing?.updatedAt ?? now,
  };
}

async function fetchExecutionOrSynthesize(
  api: FitBudApiClient,
  assignment: WorkoutAssignment,
  summary: WorkoutExecutionSummary,
): Promise<WorkoutExecution> {
  try {
    return await api.getWorkoutExecution(summary.id);
  } catch {
    return synthesizeExecutionFromAssignment(assignment, summary);
  }
}

/**
 * Start or resume a workout. Prefers an existing local execution summary,
 * then enqueues start and refreshes; synthesizes from the assignment when
 * offline so the gym path still works.
 */
export async function openActiveWorkout(
  api: FitBudApiClient,
  sync: SyncEngine,
  assignment: WorkoutAssignment,
): Promise<WorkoutExecution> {
  if (
    assignment.execution &&
    (assignment.status === "in_progress" ||
      assignment.status === "paused" ||
      assignment.execution.status === "started" ||
      assignment.execution.status === "paused")
  ) {
    return fetchExecutionOrSynthesize(api, assignment, assignment.execution);
  }

  // Prefer an already-attached execution on the assignment (local cache / prior start).
  if (
    assignment.execution &&
    assignment.execution.status !== "completed" &&
    assignment.execution.status !== "skipped" &&
    assignment.execution.status !== "modified"
  ) {
    return fetchExecutionOrSynthesize(api, assignment, assignment.execution);
  }

  // A second tap never gets here: the Workout tab holds an in-flight lock
  // while a start runs. The start waits for its verdict (AWAITS_VERDICT), so
  // each deliberate attempt is its own mutation: a stable id would pin a
  // refused start to its old verdict for good.
  const started = await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "workout.start",
    payload: { assignmentId: assignment.id },
  });
  recordFinishedWorkoutNotes(started.results, {
    operation: "workout.start",
    workoutKey: assignment.id,
    workoutName: assignment.workoutDayName ?? null,
  });

  try {
    const refreshed = await api.getWorkoutAssignment(assignment.id);
    if (refreshed.execution) {
      return fetchExecutionOrSynthesize(api, refreshed, refreshed.execution);
    }
  } catch {
    // Offline or network failure after enqueue — synthesize below.
  }

  if (assignment.workoutDay.exercises.length === 0) {
    throw new Error(
      "Couldn't start this workout offline. Pull to refresh when you're back online.",
    );
  }

  return synthesizeExecutionFromAssignment(assignment, assignment.execution);
}

export function workoutStartError(err: unknown): string {
  return userFacingMessage(err, { fallback: "Could not start workout." });
}

/**
 * Seeded / list payloads sometimes omit nested exercise rows. Build summary
 * counts from the assignment day when the execution has no exercises (TR-12).
 */
export function enrichExecutionFromAssignmentDay(
  execution: WorkoutExecution,
  assignment: WorkoutAssignment | null | undefined,
): WorkoutExecution {
  if (execution.exercises.length > 0) return execution;
  const day = assignment?.workoutDay;
  if (!day?.exercises.length) return execution;
  const now = execution.completedAt ?? new Date().toISOString();
  const completed =
    execution.status === "completed" || execution.status === "modified";
  return {
    ...execution,
    exercises: [...day.exercises]
      .sort((a, b) => a.order - b.order)
      .map((exercise, index) => {
        const exerciseId = exercise.id;
        return {
          id: exerciseId,
          workoutExecutionId: execution.id,
          exerciseId: exercise.id,
          name: exercise.name,
          order: exercise.order ?? index + 1,
          status: completed ? ("completed" as const) : ("pending" as const),
          sets: [...exercise.setTargets]
            .sort((a, b) => a.order - b.order)
            .map((target, setIndex) => ({
              id: target.id,
              exerciseExecutionId: exerciseId,
              setTargetId: target.id,
              order: target.order ?? setIndex + 1,
              status: completed
                ? ("completed" as const)
                : ("pending" as const),
              prescribedReps: target.reps,
              prescribedLoadLabel: target.loadLabel,
              actualReps: completed ? target.reps : null,
              actualLoadLabel: completed ? target.loadLabel : null,
              completedAt: completed ? now : null,
              createdAt: now,
              updatedAt: now,
            })),
          createdAt: now,
          updatedAt: now,
        };
      }),
  };
}

/** Map setTargetId → prescribed rest seconds from the day's plan. */
export function restSecondsBySetTargetId(
  assignment: WorkoutAssignment,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const exercise of assignment.workoutDay.exercises) {
    for (const target of exercise.setTargets) {
      if (target.restSeconds != null) {
        map[target.id] = target.restSeconds;
      }
    }
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Session figures for the Workout tab and the summary (Z12-44)                */
/* -------------------------------------------------------------------------- */

/** A set the trainee logged (as planned or changed). */
function isLoggedSet(set: { status: string }): boolean {
  return set.status === "completed" || set.status === "modified";
}

/**
 * "7 of 18 sets" (W-01b), "Sets 17 / 18" (W-01c, W-17a): logged sets out of
 * every set in the session. Skipped sets count in the total, not as done.
 */
export function sessionSetCounts(
  execution: Pick<WorkoutExecution, "exercises">,
): { done: number; skipped: number; total: number } {
  let done = 0;
  let skipped = 0;
  let total = 0;
  for (const exercise of execution.exercises) {
    for (const set of exercise.sets) {
      total += 1;
      if (isLoggedSet(set)) done += 1;
      else if (set.status === "skipped") skipped += 1;
    }
  }
  return { done, skipped, total };
}

/** "40 kg", "42.5kg": a load label that is a weight in kg, else null. */
export function kgFromLoadLabel(
  label: string | null | undefined,
): number | null {
  const match = label?.trim().match(/^(\d+(?:\.\d+)?)\s*kg$/i);
  if (!match) return null;
  const kg = Number(match[1]);
  return Number.isFinite(kg) ? kg : null;
}

/**
 * Volume (W-01c, W-17a): kg × reps over the logged sets whose load is a
 * weight in kg, from what was logged (falling back to the plan for a set
 * logged as planned). Bodyweight and other loads add nothing. Null when no
 * logged set carries a kg load, so the screen shows a dash, never "0 kg".
 */
export function sessionVolumeKg(
  execution: Pick<WorkoutExecution, "exercises">,
): number | null {
  let volume = 0;
  let counted = false;
  for (const exercise of execution.exercises) {
    for (const set of exercise.sets) {
      if (!isLoggedSet(set)) continue;
      const kg = kgFromLoadLabel(
        set.actualLoadLabel ?? set.prescribedLoadLabel,
      );
      const reps = set.actualReps ?? set.prescribedReps;
      if (kg == null || reps == null) continue;
      volume += kg * reps;
      counted = true;
    }
  }
  return counted ? Math.round(volume * 10) / 10 : null;
}

export type NextUpSet = {
  /** Index of the exercise in `execution.exercises`. */
  exerciseIndex: number;
  exerciseName: string;
  /** 1-based set number within the exercise. */
  setNumber: number;
  /** "40 × 10", or "12 reps" when the plan has no kg load. */
  target: string;
};

/**
 * The first pending set, in exercise and set order (W-01b "Up next"), or
 * null when nothing is left to log.
 */
export function nextUpSet(
  execution: Pick<WorkoutExecution, "exercises">,
): NextUpSet | null {
  const exercises = [...execution.exercises].sort((a, b) => a.order - b.order);
  for (const exercise of exercises) {
    const sets = [...exercise.sets].sort((a, b) => a.order - b.order);
    const index = sets.findIndex((set) => set.status === "pending");
    if (index < 0) continue;
    const set = sets[index]!;
    const kg = kgFromLoadLabel(set.prescribedLoadLabel);
    const reps = set.prescribedReps;
    const target =
      kg != null && reps != null
        ? `${kg} × ${reps}`
        : reps != null
          ? `${reps} reps`
          : (set.prescribedLoadLabel?.trim() ?? "");
    return {
      exerciseIndex: execution.exercises.indexOf(exercise),
      exerciseName: exercise.name,
      setNumber: index + 1,
      target,
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The open session: what the trainee can do to it (Z12-45)                    */
/* -------------------------------------------------------------------------- */
/*
 * Pure reducers over the execution snapshot the active workout screen holds.
 * Each one mirrors a server transition (routes/workouts.ts), so the screen can
 * show the result at once and the outbox or the API carries it:
 *
 * - log a set, again too: POST …/sets/:id/complete (`workout.complete_set`).
 *   While the workout is open the latest log stands, so a correction and a
 *   log of a skipped set are the same call.
 * - skip a set, or mark a logged set not done: POST …/sets/:id/skip.
 * - finish, early or not: POST …/complete (`workout.complete`).
 * - discard: POST /assignments/:id/skip (`workout.skip`); the coach sees the
 *   workout as skipped.
 *
 * Undo (W-09b) puts back the sets as they were before a skip. It never needs
 * the server: the screen sends a skip only once its Undo has gone.
 */

type ExecutionSet = WorkoutExecution["exercises"][number]["sets"][number];
type ExecutionExercise = WorkoutExecution["exercises"][number];

/** "40 kg", "40", " 40kg " all read as the same load; "" is bodyweight. */
function comparableLoad(label: string | null | undefined): string {
  const raw = (label ?? "").trim().toLowerCase();
  if (raw === "" || /^(body\s*weight|bw)$/.test(raw)) return "bw";
  const kg = raw.match(/^(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kg|kgs)?$/);
  return kg ? String(Number(kg[1]!.replace(",", "."))) : raw;
}

function mapSets(
  execution: WorkoutExecution,
  now: string,
  change: (set: ExecutionSet) => ExecutionSet,
): WorkoutExecution {
  let touched = false;
  const exercises = execution.exercises.map((exercise) => {
    let exerciseTouched = false;
    const sets = exercise.sets.map((set) => {
      const next = change(set);
      if (next !== set) exerciseTouched = true;
      return next;
    });
    if (!exerciseTouched) return exercise;
    touched = true;
    // The server's rule: an exercise is done once no set of it is pending.
    const allRecorded = sets.every((set) => set.status !== "pending");
    return {
      ...exercise,
      sets,
      status: allRecorded ? ("completed" as const) : ("pending" as const),
      updatedAt: now,
    };
  });
  return touched ? { ...execution, exercises, updatedAt: now } : execution;
}

export function findSessionSet(
  execution: Pick<WorkoutExecution, "exercises">,
  setId: string,
): { exercise: ExecutionExercise; set: ExecutionSet } | null {
  for (const exercise of execution.exercises) {
    const set = exercise.sets.find((item) => item.id === setId);
    if (set) return { exercise, set };
  }
  return null;
}

/**
 * Log a set with what the trainee did; null keeps the plan's value. Logging a
 * set that is already logged corrects it and keeps the time it was first
 * logged, as the server does.
 */
export function logSetLocally(
  execution: WorkoutExecution,
  setId: string,
  values: { actualReps: number | null; actualLoadLabel: string | null },
  now: string = new Date().toISOString(),
): WorkoutExecution {
  return mapSets(execution, now, (set) => {
    if (set.id !== setId) return set;
    const actualReps = values.actualReps ?? set.prescribedReps;
    const actualLoadLabel = values.actualLoadLabel ?? set.prescribedLoadLabel;
    const modified =
      (actualReps != null &&
        set.prescribedReps != null &&
        actualReps !== set.prescribedReps) ||
      (actualReps != null && set.prescribedReps == null) ||
      comparableLoad(actualLoadLabel) !== comparableLoad(set.prescribedLoadLabel);
    return {
      ...set,
      status: modified ? ("modified" as const) : ("completed" as const),
      actualReps,
      actualLoadLabel,
      completedAt: isLoggedSet(set) ? (set.completedAt ?? now) : now,
      updatedAt: now,
    };
  });
}

/** Skip sets: nothing of what was logged is kept (W-08, W-13 "Mark not done"). */
export function skipSetsLocally(
  execution: WorkoutExecution,
  setIds: readonly string[],
  now: string = new Date().toISOString(),
): WorkoutExecution {
  const ids = new Set(setIds);
  return mapSets(execution, now, (set) =>
    ids.has(set.id) && set.status !== "skipped"
      ? {
          ...set,
          status: "skipped" as const,
          actualReps: null,
          actualLoadLabel: null,
          completedAt: now,
          updatedAt: now,
        }
      : set,
  );
}

/** The sets of an exercise that "Skip exercise" skips: the ones not logged. */
export function skippableSetIds(
  execution: Pick<WorkoutExecution, "exercises">,
  exerciseExecutionId: string,
): string[] {
  const exercise = execution.exercises.find(
    (item) => item.id === exerciseExecutionId,
  );
  return (exercise?.sets ?? [])
    .filter((set) => set.status === "pending")
    .map((set) => set.id);
}

/** Undo: put sets back exactly as `previous` had them. */
export function restoreSetsLocally(
  execution: WorkoutExecution,
  previous: readonly ExecutionSet[],
  now: string = new Date().toISOString(),
): WorkoutExecution {
  const byId = new Map(previous.map((set) => [set.id, set]));
  return mapSets(execution, now, (set) => byId.get(set.id) ?? set);
}

/** Finish now, with whatever is logged (W-16). Unlogged sets stay unlogged. */
export function finishLocally(
  execution: WorkoutExecution,
  sessionRpe: number | null,
  now: string = new Date().toISOString(),
): WorkoutExecution {
  const changed = execution.exercises.some((exercise) =>
    exercise.sets.some(
      (set) => set.status === "modified" || set.status === "skipped",
    ),
  );
  return {
    ...execution,
    status: changed ? "modified" : "completed",
    completedAt: now,
    pausedAt: null,
    sessionRpe,
    updatedAt: now,
  };
}

/** Discard (W-15): the workout is recorded as skipped. */
export function discardLocally(
  execution: WorkoutExecution,
  now: string = new Date().toISOString(),
): WorkoutExecution {
  return { ...execution, status: "skipped", pausedAt: null, updatedAt: now };
}

export type UnloggedExercise = {
  exerciseExecutionId: string;
  name: string;
  /** "Set 3", "Sets 2, 3", "3 sets", "3 sets · skipped". */
  detail: string;
  /** Where "Go to" lands: the first set still to log, else the first skipped. */
  setId: string;
};

/** What is not logged, by exercise, for "Finish early?" (W-16). */
export function unloggedExercises(
  execution: Pick<WorkoutExecution, "exercises">,
): UnloggedExercise[] {
  const rows: UnloggedExercise[] = [];
  for (const exercise of [...execution.exercises].sort(
    (a, b) => a.order - b.order,
  )) {
    const sets = [...exercise.sets].sort((a, b) => a.order - b.order);
    const open = sets.filter((set) => !isLoggedSet(set));
    if (open.length === 0) continue;
    const pending = open.filter((set) => set.status === "pending");
    const allSkipped = pending.length === 0;
    let detail: string;
    if (open.length === sets.length) {
      detail = `${open.length} ${open.length === 1 ? "set" : "sets"}`;
    } else if (open.length === 1) {
      detail = `Set ${sets.indexOf(open[0]!) + 1}`;
    } else {
      detail = `Sets ${open.map((set) => sets.indexOf(set) + 1).join(", ")}`;
    }
    if (allSkipped) detail += " · skipped";
    rows.push({
      exerciseExecutionId: exercise.id,
      name: exercise.name,
      detail,
      setId: (pending[0] ?? open[0]!).id,
    });
  }
  return rows;
}

/** When the last set was logged (W-18 "the last at 6:52 pm"), or null. */
export function lastLoggedAt(
  execution: Pick<WorkoutExecution, "exercises">,
): string | null {
  let latest: string | null = null;
  for (const exercise of execution.exercises) {
    for (const set of exercise.sets) {
      if (!isLoggedSet(set) || !set.completedAt) continue;
      if (latest == null || set.completedAt > latest) latest = set.completedAt;
    }
  }
  return latest;
}

/**
 * The set the log acts on (W-03): the one the trainee picked while it is
 * still to do; else the next pending set of the same exercise; else the next
 * pending set further down; else the first pending set of the session. Null
 * when nothing is pending.
 */
export function currentSetId(
  execution: Pick<WorkoutExecution, "exercises">,
  pickedSetId: string | null,
): string | null {
  const exercises = [...execution.exercises].sort((a, b) => a.order - b.order);
  const firstPending = (exercise: ExecutionExercise) =>
    [...exercise.sets]
      .sort((a, b) => a.order - b.order)
      .find((set) => set.status === "pending");
  if (pickedSetId) {
    const picked = findSessionSet(execution, pickedSetId);
    if (picked) {
      if (picked.set.status === "pending") return picked.set.id;
      const sets = [...picked.exercise.sets].sort((a, b) => a.order - b.order);
      const after =
        sets.find(
          (set) => set.order > picked.set.order && set.status === "pending",
        ) ?? sets.find((set) => set.status === "pending");
      if (after) return after.id;
      // That exercise is finished: carry on with the next one down the list.
      for (const exercise of exercises) {
        if (exercise.order <= picked.exercise.order) continue;
        const next = firstPending(exercise);
        if (next) return next.id;
      }
    }
  }
  for (const exercise of exercises) {
    const next = firstPending(exercise);
    if (next) return next.id;
  }
  return null;
}

/** "bulgarian  Split squat" and "Bulgarian split squat" are one lift. */
export function exerciseNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The personal records of this session (W-12): per exercise, the heaviest
 * logged set, when it is heavier than every load logged for that exercise
 * before today (`bestKgByName`, from the strength read model). An exercise
 * with no earlier kg load has no record to beat, so it marks none.
 */
export function sessionRecordSetIds(
  execution: Pick<WorkoutExecution, "exercises">,
  bestKgByName: Readonly<Record<string, number>>,
): Set<string> {
  const records = new Set<string>();
  for (const exercise of execution.exercises) {
    const best = bestKgByName[exerciseNameKey(exercise.name)];
    if (best == null) continue;
    let top: { id: string; kg: number } | null = null;
    for (const set of [...exercise.sets].sort((a, b) => a.order - b.order)) {
      if (!isLoggedSet(set)) continue;
      const kg = kgFromLoadLabel(set.actualLoadLabel ?? set.prescribedLoadLabel);
      if (kg == null || kg <= best) continue;
      if (top == null || kg > top.kg) top = { id: set.id, kg };
    }
    if (top) records.add(top.id);
  }
  return records;
}

/** "Lower body B was in progress. 7 sets were logged, the last at 6:52 pm." (W-18) */
export function resumeBody(
  name: string,
  execution: Pick<WorkoutExecution, "exercises">,
  timeZone: string,
): string {
  const { done } = sessionSetCounts(execution);
  const last = lastLoggedAt(execution);
  if (done === 0) return `${name} was in progress. No sets were logged yet.`;
  const sets = done === 1 ? "1 set was logged" : `${done} sets were logged`;
  return `${name} was in progress. ${sets}${
    last ? `, the last at ${formatClockTime(last, timeZone)}` : ""
  }.`;
}

/** "Romanian deadlift · set 3 of 3", or "All sets logged": the minimised bar (W-14). */
export function minimisedLine(
  execution: Pick<WorkoutExecution, "exercises">,
): string {
  const id = currentSetId(execution, null);
  const found = id ? findSessionSet(execution, id) : null;
  if (!found) return "All sets logged";
  const sets = [...found.exercise.sets].sort((a, b) => a.order - b.order);
  return `${found.exercise.name} · set ${sets.indexOf(found.set) + 1} of ${sets.length}`;
}
