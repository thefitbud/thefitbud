import { useEffect, useRef } from "react";
import type { ExerciseExecution, SetExecution, WorkoutExecution } from "@fitbud/contracts";
import type { LiveActivityState, LoggedSet } from "./liveActivity";
import {
  liveActivityNative,
  type LiveActivityContent,
  type LiveActivityNative,
} from "./liveActivityNative";

/**
 * Workout screen → Live Activity (task LA1b; frames 27 and 27b). Local
 * updates only. The screen calls `useWorkoutLiveActivity` once; everything
 * else lives here:
 * - an in-progress workout starts one activity (the native side reuses a
 *   running one for the same workout);
 * - each logged set updates exercise, set x of y, kg, reps, plan, last and
 *   the logged line;
 * - finish, skip or leaving the screen ends it with `finished: true`;
 * - pause/resume change nothing (status is not part of the activity).
 * On Android and web the native bridge does nothing.
 */

const DONE_STATUSES = new Set<WorkoutExecution["status"]>(["completed", "skipped", "modified"]);

/**
 * The activity's "Open" link. It must bring the trainee back to the active
 * workout, but the app has no route for that yet: `fitbud://workout/{id}`
 * opens the workout overview, which unmounts this screen and ends the
 * activity. So the link only opens the app (src/navigation/linking.ts parses
 * it to null and navigates nowhere), leaving the active workout on screen.
 * The assignment id keeps it unique per workout for the native reuse check.
 */
export function workoutOpenUrl(assignmentId: string): string {
  return `fitbud://?workout=${encodeURIComponent(assignmentId)}`;
}

/** "22.5 kg" → 22.5; bodyweight, empty or unparseable → 0. */
export function loadKg(label: string | null | undefined): number {
  const match = label?.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]!);
  return Number.isFinite(value) ? value : 0;
}

/** Previous-session history label ("22.5 × 10", "12 reps") → numbers, or null. */
export function historyPair(label: string | undefined): { kg: number; reps: number } | null {
  if (!label) return null;
  const pair = label.match(/^(\d+(?:\.\d+)?)\s*×\s*(\d+)$/);
  if (pair) return { kg: Number.parseFloat(pair[1]!), reps: Number.parseInt(pair[2]!, 10) };
  const repsOnly = label.match(/^(\d+)\s+reps$/);
  if (repsOnly) return { kg: 0, reps: Number.parseInt(repsOnly[1]!, 10) };
  return null;
}

function setDone(set: SetExecution): boolean {
  return set.status !== "pending";
}

function actualKg(set: SetExecution): number {
  return loadKg(set.actualLoadLabel ?? set.prescribedLoadLabel);
}

function actualReps(set: SetExecution): number {
  return set.actualReps ?? set.prescribedReps ?? 0;
}

function sortedSets(exercise: ExerciseExecution): SetExecution[] {
  return [...exercise.sets].sort((a, b) => a.order - b.order);
}

/**
 * The activity's content for an execution: the first pending set, or the last
 * set when every set is done (finished). Null when there is nothing to show.
 */
export function liveActivityContentFor(
  execution: WorkoutExecution,
  historyByKey: Record<string, string> = {},
): LiveActivityContent | null {
  const exercises = [...execution.exercises]
    .filter((ex) => ex.sets.length > 0)
    .sort((a, b) => a.order - b.order);
  if (exercises.length === 0) return null;

  const current = exercises.find((ex) => ex.sets.some((set) => !setDone(set)));
  const exercise = current ?? exercises[exercises.length - 1]!;
  const sets = sortedSets(exercise);
  const finished = current === undefined;
  const position = finished ? sets.length - 1 : sets.findIndex((set) => !setDone(set));
  const set = sets[position]!;
  const prior = position > 0 ? sets[position - 1]! : null;

  // Logged line: the set logged just before this one, in workout order. When
  // finished, the "current" set is the last logged one. On a new exercise's
  // first set, that is the previous exercise's last set.
  let logged: { set: SetExecution; index: number } | null = null;
  if (finished) logged = { set, index: position + 1 };
  else if (prior) logged = setDone(prior) ? { set: prior, index: position } : null;
  else {
    const previousExercise = exercises[exercises.indexOf(exercise) - 1];
    const previousSets = previousExercise ? sortedSets(previousExercise) : [];
    const last = previousSets[previousSets.length - 1];
    if (last && setDone(last)) logged = { set: last, index: previousSets.length };
  }
  const loggedSet: LoggedSet | null = logged
    ? { setIndex: logged.index, kilograms: actualKg(logged.set), reps: actualReps(logged.set) }
    : null;

  const planKg = loadKg(set.prescribedLoadLabel);
  const planReps = set.prescribedReps ?? 0;

  // Last: the set before this one (as logged, else as prescribed, like the
  // screen's "Previous" column), else the previous session's same set, else
  // the plan (LA1c can make "Last" optional; the widget needs a number).
  let lastKg = planKg;
  let lastReps = planReps;
  const lastSource = finished ? set : prior;
  if (lastSource) {
    lastKg = actualKg(lastSource);
    lastReps = actualReps(lastSource);
  } else {
    const history = historyPair(historyByKey[`${exercise.exerciseId}:${set.order}`]);
    if (history) {
      lastKg = history.kg;
      lastReps = history.reps;
    }
  }

  const state: LiveActivityState = {
    kilograms: finished ? actualKg(set) : planKg,
    reps: finished ? actualReps(set) : planReps,
    planKg,
    planReps,
    setIndex: position + 1,
    setCount: sets.length,
    lastKg,
    lastReps,
    loggedSet,
    finished,
  };
  return { exerciseName: exercise.name, state };
}

export type WorkoutLiveActivityInput = {
  execution: WorkoutExecution;
  workoutName: string;
  historyByKey?: Record<string, string>;
};

/** One workout's activity: start once, update on change, end once. */
export function createLiveActivitySession(native: LiveActivityNative = liveActivityNative) {
  let started = false;
  let ended = false;
  let lastSent: string | null = null;
  let lastContent: LiveActivityContent | null = null;
  // Native calls are async; run them in order so an update never overtakes its start.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = (call: () => Promise<unknown>) => {
    queue = queue.then(call, call).catch(() => undefined);
    return queue;
  };

  function end(): Promise<unknown> {
    if (!started || ended) return queue;
    ended = true;
    const final = lastContent
      ? { ...lastContent, state: { ...lastContent.state, finished: true } }
      : undefined;
    return enqueue(() => native.end(final));
  }

  function sync({ execution, workoutName, historyByKey }: WorkoutLiveActivityInput): Promise<unknown> {
    if (ended) return queue;
    const content = liveActivityContentFor(execution, historyByKey);
    if (content) lastContent = content;
    if (DONE_STATUSES.has(execution.status) || !content) return end();

    const key = JSON.stringify(content);
    if (!started) {
      started = true;
      lastSent = key;
      const workout = { workoutName, openUrl: workoutOpenUrl(execution.assignmentId) };
      return enqueue(() => native.start(workout, content));
    }
    if (key === lastSent) return queue;
    lastSent = key;
    return enqueue(() => native.update(content));
  }

  return { sync, end };
}

/** The workout screen's only Live Activity call. */
export function useWorkoutLiveActivity(input: WorkoutLiveActivityInput): void {
  const sessionRef = useRef<ReturnType<typeof createLiveActivitySession> | null>(null);
  if (sessionRef.current === null) sessionRef.current = createLiveActivitySession();
  const { execution, workoutName, historyByKey } = input;

  useEffect(() => {
    void sessionRef.current?.sync({ execution, workoutName, historyByKey });
  }, [execution, workoutName, historyByKey]);

  useEffect(() => {
    const session = sessionRef.current;
    return () => {
      void session?.end();
    };
  }, []);
}
