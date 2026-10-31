import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { ExerciseExecution, SetExecution, WorkoutExecution } from "@fitbud/contracts";
import { withRest, type LiveActivityState, type LoggedSet, type RestWindow } from "./liveActivity";
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
  // unknown: the activity then shows no "Last" (the screen says "first time").
  let lastKg = planKg;
  let lastReps = planReps;
  let lastKnown = true;
  const lastSource = finished ? set : prior;
  if (lastSource) {
    lastKg = actualKg(lastSource);
    lastReps = actualReps(lastSource);
  } else {
    const history = historyPair(historyByKey[`${exercise.exerciseId}:${set.order}`]);
    if (history) {
      lastKg = history.kg;
      lastReps = history.reps;
    } else {
      lastKnown = false;
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
    ...(lastKnown ? {} : { lastKnown: false }),
  };
  return { exerciseName: exercise.name, state };
}

export type WorkoutLiveActivityInput = {
  execution: WorkoutExecution;
  workoutName: string;
  historyByKey?: Record<string, string>;
  /** The app's running rest after a logged set (27c, LA1c); null when none. */
  rest?: RestWindow | null;
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

  function sync({ execution, workoutName, historyByKey, rest }: WorkoutLiveActivityInput): Promise<unknown> {
    if (ended) return queue;
    const mapped = liveActivityContentFor(execution, historyByKey);
    // One update when rest starts and one when it ends or is skipped; the
    // device counts down by itself. A finished workout never rests.
    const content = mapped ? { ...mapped, state: withRest(mapped.state, rest ?? null) } : null;
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

  /**
   * True when the activity's rest was skipped on the lock screen (the widget's
   * Skip clears it there only). Asked when the app becomes active.
   */
  function restSkippedOnActivity(): boolean {
    if (!started || ended || lastContent?.state.restEndsAt == null) return false;
    return native.hasRest() === false;
  }

  return { sync, end, restSkippedOnActivity };
}

/**
 * The workout screen's only Live Activity call. `onRestSkipped` runs when the
 * app becomes active and the activity's rest was skipped on the lock screen,
 * so the screen ends its own rest too.
 */
export function useWorkoutLiveActivity(
  input: WorkoutLiveActivityInput & { onRestSkipped?: () => void },
): void {
  const sessionRef = useRef<ReturnType<typeof createLiveActivitySession> | null>(null);
  if (sessionRef.current === null) sessionRef.current = createLiveActivitySession();
  const { execution, workoutName, historyByKey, rest, onRestSkipped } = input;
  const onRestSkippedRef = useRef(onRestSkipped);
  onRestSkippedRef.current = onRestSkipped;

  useEffect(() => {
    void sessionRef.current?.sync({ execution, workoutName, historyByKey, rest });
  }, [execution, workoutName, historyByKey, rest]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (sessionRef.current?.restSkippedOnActivity()) onRestSkippedRef.current?.();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const session = sessionRef.current;
    return () => {
      void session?.end();
    };
  }, []);
}
