import { requireOptionalNativeModule } from "expo-modules-core";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  BackHandler,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  View,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  ExerciseExecution,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { formatClockTime } from "@fitbud/core";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import { Text } from "../components/Text";
import { useAuth } from "../auth/AuthProvider";
import { localDateInTimezone } from "../lib/dates";
import { reportError } from "../lib/reportError";
import type { RestWindow } from "../notifications/liveActivity";
import { useWorkoutLiveActivity } from "../notifications/liveActivitySession";
import {
  adjustRest,
  formatRestClock,
  restCountdownRender,
  restElapsedFraction,
  restSecondsShown,
} from "../notifications/restCountdown";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { useApiReachable } from "../sync/useSyncStatus";
import {
  backspace,
  draftForSet,
  initialDraft,
  isBodyweightLabel,
  isDraftModified,
  loadBody,
  loadLabelForDraft,
  plainKgFromLabel,
  pressKey,
  stepValue,
  type KeypadField,
  type SetDraft,
} from "../workout/shared";
import {
  ExerciseDetailScreen,
  exerciseHasHowTo,
  historyWhen,
  type ExerciseDetailSession,
  type ExerciseDetailTab,
} from "./workout/ExerciseDetailScreen";
import { restEndHaptic } from "./workout/haptics";
import { LogKeypad } from "./workout/log/LogKeypad";
import {
  CollapsedExercise,
  ExerciseHead,
  ExercisePad,
  ExerciseSeparator,
  LogNav,
  LogSetRow,
  LogStats,
  PausedBanner,
  RecordBanner,
  RestBar,
  RestDoneBar,
  SetTableHead,
  TargetLegend,
  type SetRowState,
} from "./workout/log/LogParts";
import {
  ConfirmDialog,
  ExerciseMenuSheet,
  FinishSheet,
  SetSheet,
  useModalCloseGate,
  type SetSheetMode,
} from "./workout/log/LogSheets";
import {
  EMPTY_WORKOUT_HISTORY,
  coachInitials,
  exerciseDoneLine,
  exerciseInstructionsFor,
  exercisePlanLine,
  formatRestLength,
  historySetLabel,
  historySetsOf,
  loadExerciseBests,
  loadWorkoutHistory,
  type ExerciseBest,
  type WorkoutHistory,
} from "./workoutDisplay";
import { elapsedSeconds, formatElapsedClock } from "./workoutDuration";
import {
  currentSetId,
  discardLocally,
  exerciseNameKey,
  findSessionSet,
  finishLocally,
  logSetLocally,
  restoreSetsLocally,
  sessionRecordSetIds,
  sessionSetCounts,
  sessionVolumeKg,
  skipSetsLocally,
  skippableSetIds,
  unloggedExercises,
  type UnloggedExercise,
} from "./workoutSession";

const DEFAULT_REST_SECONDS = 90;
/** How long "skipped · Undo" stays before the skip is sent (W-09b). */
export const SKIP_UNDO_MS = 6000;
/** A rest found already over by more than this was missed, not just ended. */
const REST_DONE_GRACE_MS = 3000;
/** How long the record banner stays (W-12). */
const RECORD_NOTICE_MS = 8000;

type ExecutionSet = ExerciseExecution["sets"][number];

const KEEP_AWAKE_TAG = "fitbud-active-workout";

type KeepAwakeNative = {
  activate(tag: string): Promise<boolean>;
  deactivate(tag: string): Promise<boolean>;
};

/**
 * Keeps the screen on during a workout through the `ExpoKeepAwake` native
 * module that `expo` autolinks. `expo-keep-awake` is not a dependency of this
 * app, so `require("expo-keep-awake")` cannot be resolved under pnpm and Metro
 * reports it as a fatal error that a try/catch never sees (Z11b-3).
 * `requireOptionalNativeModule` returns null where the module is missing (web,
 * tests), and then this does nothing.
 */
export function activateWorkoutKeepAwake(): () => void {
  let native: KeepAwakeNative | null = null;
  try {
    native = requireOptionalNativeModule<KeepAwakeNative>("ExpoKeepAwake");
  } catch {
    native = null;
  }
  if (!native) return () => undefined;
  const keepAwake = native;
  // Keep-awake is best effort: neither call may fail the screen.
  try {
    void keepAwake.activate(KEEP_AWAKE_TAG)?.catch(() => undefined);
  } catch {
    // ignore
  }
  return () => {
    try {
      void keepAwake.deactivate(KEEP_AWAKE_TAG)?.catch(() => undefined);
    } catch {
      // ignore
    }
  };
}

type PendingSkip = {
  setIds: string[];
  /** The sets as they were, for Undo. */
  previous: ExecutionSet[];
  message: string;
};

function sortedSets(exercise: ExerciseExecution): ExecutionSet[] {
  return [...exercise.sets].sort((a, b) => a.order - b.order);
}

/** "set 3 · 40 kg × 10", "set 1 · 12 reps": what the rest bars point at. */
function nextSetText(
  exercise: ExerciseExecution,
  set: ExecutionSet,
  draft: SetDraft,
): string {
  const number = sortedSets(exercise).indexOf(set) + 1;
  const reps = draft.reps.trim();
  if (draft.bodyweight) return `set ${number}${reps ? ` · ${reps} reps` : ""}`;
  const load = draft.load.trim()
    ? `${draft.load} kg`
    : (set.prescribedLoadLabel?.trim() ?? "");
  const values = [load, reps].filter(Boolean).join(" × ");
  return `set ${number}${values ? ` · ${values}` : ""}`;
}

export function ActiveWorkoutScreen({
  execution,
  assignment = null,
  onChange,
  onFinished,
  onExit,
  onMinimise,
  sessionName,
  coachName = "Your coach",
  restSecondsBySetTargetId = {},
  onAskCoach,
  rest: restProp,
  onRestChange,
}: {
  execution: WorkoutExecution;
  assignment?: WorkoutAssignment | null;
  onChange: (execution: WorkoutExecution) => void;
  onFinished: (execution: WorkoutExecution) => void;
  /** Leave the log for good: after a discard, or from the "already done" guard. */
  onExit: () => void;
  /** Tuck the log into the minimised bar (W-14). Defaults to `onExit`. */
  onMinimise?: () => void;
  sessionName?: string;
  coachName?: string;
  restSecondsBySetTargetId?: Record<string, number>;
  /** Opens the coach message for the workout; given the exercise it is about. */
  onAskCoach?: (exerciseName?: string) => void;
  /** The running rest, when the caller keeps it across minimise (W-14). */
  rest?: RestWindow | null;
  onRestChange?: (rest: RestWindow | null) => void;
}) {
  const sync = useSyncEngine();
  const { api, me } = useAuth();
  const reachable = useApiReachable();
  /** iOS: open the next sheet only after the closing Modal's onDismiss. */
  const sheetGate = useModalCloseGate();
  const [error, setError] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [sessionRpe, setSessionRpe] = useState<number | null>(
    execution.sessionRpe,
  );
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [keypad, setKeypad] = useState<{
    field: KeypadField;
    replace: boolean;
  } | null>(null);
  /** The set the trainee chose to do next; null follows the plan's order. */
  const [pickedSetId, setPickedSetId] = useState<string | null>(null);
  /** Exercises the trainee opened or folded by hand. */
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [menuExerciseId, setMenuExerciseId] = useState<string | null>(null);
  const [sheetSetId, setSheetSetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    exerciseExecutionId: string;
    tab: ExerciseDetailTab;
  } | null>(null);
  const [pendingSkip, setPendingSkip] = useState<PendingSkip | null>(null);
  const [restDone, setRestDone] = useState<string | null>(null);
  const [recordNotice, setRecordNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<WorkoutHistory>(EMPTY_WORKOUT_HISTORY);
  const [historyLoading, setHistoryLoading] = useState(assignment != null);
  const [bests, setBests] = useState<Record<string, ExerciseBest>>({});
  const [now, setNow] = useState(() => Date.now());
  const [localRest, setLocalRest] = useState<RestWindow | null>(null);

  // The rest is the caller's when it keeps one (so it survives minimise),
  // else this screen's own.
  const rest = restProp !== undefined ? restProp : localRest;
  const setRest = (next: RestWindow | null) => {
    if (onRestChange) onRestChange(next);
    else setLocalRest(next);
  };

  const executionRef = useRef(execution);
  executionRef.current = execution;
  const pendingSkipRef = useRef<PendingSkip | null>(null);
  pendingSkipRef.current = pendingSkip;
  const scrollRef = useRef<ScrollView>(null);
  const exerciseY = useRef<Record<string, number>>({});

  const paused = execution.status === "paused";
  const emptyOrDone =
    execution.exercises.length === 0 ||
    execution.status === "completed" ||
    execution.status === "skipped" ||
    execution.status === "modified";

  const exercises = useMemo(
    () => [...execution.exercises].sort((a, b) => a.order - b.order),
    [execution.exercises],
  );
  const activeSetId = useMemo(
    () => currentSetId(execution, pickedSetId),
    [execution, pickedSetId],
  );
  const active = activeSetId ? findSessionSet(execution, activeSetId) : null;
  const activeDraft = active ? draftForSet(active.set, drafts) : null;

  const counts = sessionSetCounts(execution);
  const notLogged = counts.total - counts.done;
  const bestKgByName = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [key, best] of Object.entries(bests)) map[key] = best.kg;
    return map;
  }, [bests]);
  const recordSetIds = useMemo(
    () => sessionRecordSetIds(execution, bestKgByName),
    [execution, bestKgByName],
  );

  const title = sessionName?.trim() || "Workout";
  const coachFirst =
    coachName === "Your coach"
      ? "your coach"
      : (coachName.split(/\s+/)[0] ?? coachName);
  const timeZone = me?.timezone ?? "UTC";
  const today = localDateInTimezone(timeZone);

  // The rest as every surface reads it (restCountdown.ts): one end instant.
  const restRender = restCountdownRender(
    { restEndsAt: rest?.endsAt ?? null, restSeconds: rest?.seconds ?? null },
    now,
  );
  const resting = rest != null && restRender.kind === "resting";

  // iOS Live Activity (LA1b): starts, updates per logged set, ends on finish,
  // skip or leaving. No-op on Android and web.
  useWorkoutLiveActivity({
    execution,
    workoutName: title,
    historyByKey: history.previousByKey,
    rest,
    // Skip on the lock screen ends the app's rest when the app comes back.
    onRestSkipped: () => setRest(null),
  });

  useEffect(() => {
    return activateWorkoutKeepAwake();
  }, []);

  useEffect(() => {
    if (!assignment) {
      setHistoryLoading(false);
      return undefined;
    }
    let cancelled = false;
    setHistoryLoading(true);
    void loadWorkoutHistory(api, assignment, today).then((loaded) => {
      if (cancelled) return;
      setHistory(loaded);
      setHistoryLoading(false);
    });
    // A late log is for an earlier day: what counts as "before" is that day,
    // so the session's own sets are never the record it has to beat.
    const before = assignment.localDate < today ? assignment.localDate : today;
    void loadExerciseBests(api, assignment.coachingRelationshipId, before).then(
      (loaded) => {
        if (!cancelled) setBests(loaded);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, assignment, today]);

  // One clock for the session timer and the rest bar. It reads the wall clock
  // at every tick, so a tick that comes late never makes either drift.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    if (paused && rest == null) return undefined;
    const timer = setInterval(tick, rest != null ? 250 : 1000);
    return () => clearInterval(timer);
  }, [paused, rest]);

  // The rest reached its end (W-05b): say what is next, and buzz. A rest the
  // trainee skipped, or ended by logging the next set, clears `rest` itself
  // and never comes through here.
  useEffect(() => {
    if (rest == null || restRender.kind !== "ended") return;
    // A rest that ended while the log was away (minimised) is simply over:
    // "Rest done" and the buzz belong to the moment it ends.
    if (Date.now() - rest.endsAt > REST_DONE_GRACE_MS) {
      setRest(null);
      return;
    }
    const current = executionRef.current;
    const id = currentSetId(current, pickedSetId);
    const found = id ? findSessionSet(current, id) : null;
    setRest(null);
    setRestDone(
      found
        ? `Next: ${nextSetText(found.exercise, found.set, draftForSet(found.set, drafts))}`
        : "Next: finish workout",
    );
    restEndHaptic();
    // `rest` and the render kind are the triggers; the rest is read at fire time.
  }, [rest, restRender.kind]);

  useEffect(() => {
    if (!recordNotice) return undefined;
    const timer = setTimeout(() => setRecordNotice(null), RECORD_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [recordNotice]);

  /** Send a skip whose Undo has gone. A failure leaves the sets unlogged, which is what a skip means for the count. */
  function sendSkips(skip: PendingSkip) {
    const executionId = executionRef.current.id;
    void (async () => {
      for (const setId of skip.setIds) {
        try {
          await api.skipWorkoutSet(executionId, setId);
        } catch (err: unknown) {
          reportError("workout.set.skip", err);
          return;
        }
      }
    })();
  }

  function settlePendingSkip() {
    const skip = pendingSkipRef.current;
    if (!skip) return;
    pendingSkipRef.current = null;
    setPendingSkip(null);
    sendSkips(skip);
  }

  useEffect(() => {
    if (!pendingSkip) return undefined;
    const timer = setTimeout(settlePendingSkip, SKIP_UNDO_MS);
    return () => clearTimeout(timer);
  }, [pendingSkip]);

  // Leaving the log (minimise, finish, discard) settles a skip still on show.
  useEffect(() => {
    return () => {
      const skip = pendingSkipRef.current;
      if (skip) sendSkips(skip);
    };
  }, []);

  const minimise = onMinimise ?? onExit;
  const minimiseRef = useRef(minimise);
  minimiseRef.current = minimise;
  const backState = useRef({ detail: false, keypad: false });
  backState.current = { detail: detail != null, keypad: keypad != null };
  // Android Back never throws the session away: it closes what is open, then
  // minimises (W-14).
  useEffect(() => {
    // Only Android has a hardware Back (and react-native-web rejects the call).
    if (Platform.OS !== "android") return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (backState.current.detail) setDetail(null);
      else if (backState.current.keypad) setKeypad(null);
      else minimiseRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  function workoutPayload(extra: Record<string, unknown> = {}) {
    return {
      executionId: execution.id,
      // The plan's own id: a workout opened with no network has ids the
      // server has never seen, and is found by this (Z12-41).
      assignmentId: execution.assignmentId,
      expectedVersion: execution.recordVersion,
      // What the outbox list calls this row (Z12-41 hand-over).
      workoutName: title,
      ...extra,
    };
  }

  function saveFailed(where: string, err: unknown, fallback: string) {
    reportError(where, err);
    setError(err instanceof ApiClientError ? err.message : fallback);
  }

  function startRestForSet(setTargetId: string) {
    const prescribed = restSecondsBySetTargetId[setTargetId];
    const seconds =
      prescribed != null && prescribed > 0 ? prescribed : DEFAULT_REST_SECONDS;
    setNow(Date.now());
    setRest({ endsAt: Date.now() + seconds * 1000, seconds });
  }

  function updateDraft(set: ExecutionSet, patch: Partial<SetDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [set.id]: { ...draftForSet(set, prev), ...patch },
    }));
  }

  /** Log a set, or log it again with new values (W-13). */
  function commitLog(set: ExecutionSet, exercise: ExerciseExecution, draft: SetDraft) {
    if (paused) return;
    settlePendingSkip();
    const repsRaw = draft.reps.trim();
    const parsedReps = repsRaw === "" ? null : Number.parseInt(repsRaw, 10);
    const actualReps =
      parsedReps != null && Number.isFinite(parsedReps) ? parsedReps : null;
    const loadPart = loadBody(draft, set.prescribedLoadLabel);
    const actualLoadLabel = loadLabelForDraft(draft, set.prescribedLoadLabel);
    const firstLog = set.status === "pending";

    const optimistic = logSetLocally(execution, set.id, {
      actualReps,
      actualLoadLabel,
    });
    onChange(optimistic);
    setKeypad(null);
    setSheetSetId(null);
    setError(null);
    setRestDone(null);
    if (firstLog) {
      // The log moves on from the set just logged; a correction leaves the
      // current set where it is and starts no rest.
      setPickedSetId(set.id);
      startRestForSet(set.setTargetId);
    }

    if (
      sessionRecordSetIds(optimistic, bestKgByName).has(set.id) &&
      !recordSetIds.has(set.id)
    ) {
      setRecordNotice(
        `${exercise.name} · ${historySetLabel(
          actualLoadLabel ?? set.prescribedLoadLabel,
          actualReps ?? set.prescribedReps,
        )}`,
      );
    }

    void enqueueAndPush(sync, {
      recordId: execution.id,
      operation: "workout.complete_set",
      expectedServerVersion: execution.recordVersion,
      payload: workoutPayload({
        setExecutionId: set.id,
        setTargetId: set.setTargetId,
        body: { actualReps, ...loadPart },
      }),
    }).catch((err: unknown) => {
      saveFailed(
        "workout.set.save",
        err,
        "That set couldn’t be saved on this phone (WO-SAVE). Log it again.",
      );
    });
  }

  /** Skip sets that are still to do, with Undo (W-08, W-09b). */
  function skipWithUndo(setIds: string[], message: string) {
    if (paused || setIds.length === 0) return;
    settlePendingSkip();
    const previous = setIds
      .map((id) => findSessionSet(execution, id)?.set)
      .filter((set): set is ExecutionSet => set != null);
    onChange(skipSetsLocally(execution, setIds));
    setKeypad(null);
    setSheetSetId(null);
    setMenuExerciseId(null);
    setPendingSkip({ setIds, previous, message });
  }

  function undoSkip() {
    const skip = pendingSkipRef.current;
    if (!skip) return;
    pendingSkipRef.current = null;
    setPendingSkip(null);
    onChange(restoreSetsLocally(executionRef.current, skip.previous));
  }

  /**
   * A logged set becomes not done (W-13). The server has the log, so this one
   * has to reach it: queued logs go first, and if the change does not land the
   * set stays logged here too.
   */
  function markNotDone(set: ExecutionSet) {
    if (paused) return;
    settlePendingSkip();
    const previous = [set];
    onChange(skipSetsLocally(execution, [set.id]));
    setSheetSetId(null);
    setError(null);
    void (async () => {
      try {
        await sync.pushPending();
        await api.skipWorkoutSet(execution.id, set.id);
      } catch (err: unknown) {
        onChange(restoreSetsLocally(executionRef.current, previous));
        saveFailed(
          "workout.set.unlog",
          err,
          "That change didn’t go through, so the set is still logged (WO-UNLOG).",
        );
      }
    })();
  }

  function setPaused(next: boolean) {
    settlePendingSkip();
    const at = new Date().toISOString();
    onChange({
      ...execution,
      status: next ? "paused" : "started",
      pausedAt: next ? at : null,
    });
    if (next) {
      setKeypad(null);
      setRest(null);
      setRestDone(null);
    }
    void enqueueAndPush(sync, {
      recordId: execution.id,
      operation: next ? "workout.pause" : "workout.resume",
      expectedServerVersion: execution.recordVersion,
      payload: workoutPayload(),
    }).catch((err: unknown) => {
      saveFailed(
        next ? "workout.pause" : "workout.resume",
        err,
        "That couldn’t be saved on this phone (WO-SAVE).",
      );
    });
  }

  function requestFinish() {
    if (!(notLogged > 0 || execution.requireSessionRpe)) {
      finishWorkout();
      return;
    }
    // Close keypad (not a Modal) at once. If a sheet or dialog is still up,
    // wait for its Modal onDismiss before presenting "Finish early?" — opening
    // in the same tick never shows on iOS (F06c run 44402973183).
    const modalOpen =
      menuExerciseId != null || sheetSetId != null || discardOpen;
    setKeypad(null);
    setMenuExerciseId(null);
    setSheetSetId(null);
    setDiscardOpen(false);
    if (!modalOpen) {
      setFinishOpen(true);
      return;
    }
    sheetGate.afterClose(() => setFinishOpen(true));
  }

  function finishWorkout() {
    if (execution.requireSessionRpe && sessionRpe == null) return;
    settlePendingSkip();
    const optimistic = finishLocally(executionRef.current, sessionRpe);
    onChange(optimistic);
    setFinishOpen(false);
    setRest(null);
    void (async () => {
      try {
        await enqueueAndPush(sync, {
          recordId: execution.id,
          operation: "workout.complete",
          expectedServerVersion: execution.recordVersion,
          payload: workoutPayload({ body: { sessionRpe } }),
        });
      } catch (err: unknown) {
        // The summary still opens; the sync status says what was not sent.
        reportError("workout.complete", err);
      }
      onFinished(optimistic);
    })();
  }

  function discardWorkout() {
    settlePendingSkip();
    setDiscardOpen(false);
    setRest(null);
    onChange(discardLocally(executionRef.current));
    void (async () => {
      try {
        await enqueueAndPush(sync, {
          recordId: execution.assignmentId,
          operation: "workout.skip",
          payload: { assignmentId: execution.assignmentId, workoutName: title },
        });
      } catch (err: unknown) {
        reportError("workout.discard", err);
      }
      onExit();
    })();
  }

  function goTo(row: UnloggedExercise) {
    setFinishOpen(false);
    setFolded((prev) => ({ ...prev, [row.exerciseExecutionId]: false }));
    const found = findSessionSet(execution, row.setId);
    if (found?.set.status === "pending") setPickedSetId(row.setId);
    const y = exerciseY.current[row.exerciseExecutionId];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }

  if (emptyOrDone) {
    return (
      <Screen v3 chrome="app" title={title}>
        <DoneGuard onSummary={() => onFinished(execution)} onBack={onExit} />
      </Screen>
    );
  }

  const planExercise = (exercise: ExerciseExecution) =>
    assignment?.workoutDay.exercises.find((item) => item.id === exercise.exerciseId) ??
    null;

  if (detail) {
    const exercise = exercises.find((item) => item.id === detail.exerciseExecutionId);
    if (exercise) {
      const key = exerciseNameKey(exercise.name);
      const todaySets = historySetsOf(exercise);
      const sessions: ExerciseDetailSession[] = [];
      if (todaySets.length > 0) {
        sessions.push({
          key: "this-session",
          workoutDayName: title,
          when: historyWhen(assignment?.localDate ?? today, today),
          sets: todaySets,
          recordOrders: new Set(
            exercise.sets
              .filter((set) => recordSetIds.has(set.id))
              .map((set) => set.order),
          ),
        });
      }
      for (const session of history.sessions) {
        const sets = session.setsByExerciseName[key];
        if (!sets || sets.length === 0) continue;
        sessions.push({
          key: session.assignmentId,
          workoutDayName: session.workoutDayName,
          when: historyWhen(session.localDate, today),
          sets,
        });
      }
      return (
        <ExerciseDetailScreen
          name={exercise.name}
          tab={detail.tab}
          onTabChange={(tab) => setDetail({ ...detail, tab })}
          onBack={() => setDetail(null)}
          exercise={planExercise(exercise)}
          coachInitials={coachInitials(coachName)}
          best={bests[key] ?? null}
          sessions={sessions}
          historyLoading={historyLoading}
        />
      );
    }
  }

  const keypadOpen = keypad != null && active != null && activeDraft != null;

  function openField(set: ExecutionSet, field: KeypadField) {
    if (paused) return;
    setPickedSetId(set.id);
    setRestDone(null);
    // Set sheet is a Modal; open the keypad only after it has left on iOS.
    const sheetWasOpen = sheetSetId != null;
    setSheetSetId(null);
    const showKeypad = () => setKeypad({ field, replace: true });
    if (sheetWasOpen) sheetGate.afterClose(showKeypad);
    else showKeypad();
  }

  function keypadKey(key: string) {
    if (!keypad || !active || !activeDraft) return;
    updateDraft(active.set, {
      [keypad.field]: pressKey(
        activeDraft[keypad.field],
        key,
        keypad.field,
        keypad.replace,
      ),
    });
    setKeypad({ ...keypad, replace: false });
  }

  function keypadBackspace() {
    if (!keypad || !active || !activeDraft) return;
    updateDraft(active.set, {
      [keypad.field]: backspace(activeDraft[keypad.field], keypad.replace),
    });
    setKeypad({ ...keypad, replace: false });
  }

  function keypadStep(direction: 1 | -1) {
    if (!keypad || !active || !activeDraft) return;
    const base =
      keypad.field === "load" && activeDraft.load.trim() === ""
        ? "0"
        : activeDraft[keypad.field];
    updateDraft(active.set, {
      [keypad.field]: stepValue(base, direction, keypad.field),
    });
    setKeypad({ ...keypad, replace: true });
  }

  function keypadBodyweight(bodyweight: boolean) {
    if (!active) return;
    updateDraft(active.set, { bodyweight });
    // A bodyweight set has no kg to type; back on kg, the weight comes first.
    setKeypad({ field: bodyweight ? "reps" : "load", replace: true });
  }

  const menuExercise = menuExerciseId
    ? (exercises.find((item) => item.id === menuExerciseId) ?? null)
    : null;
  const sheet = sheetSetId ? findSessionSet(execution, sheetSetId) : null;
  const sheetMode: SetSheetMode =
    sheet?.set.status === "pending"
      ? "pending"
      : sheet?.set.status === "skipped"
        ? "skipped"
        : "logged";
  const sheetNumber = sheet ? sortedSets(sheet.exercise).indexOf(sheet.set) + 1 : 0;
  const sheetDetail = !sheet
    ? ""
    : sheetMode === "pending"
      ? "Not logged yet"
      : sheetMode === "skipped"
        ? "Skipped"
        : `Logged ${historySetLabel(
            sheet.set.actualLoadLabel ?? sheet.set.prescribedLoadLabel,
            sheet.set.actualReps ?? sheet.set.prescribedReps,
          )}${
            sheet.set.completedAt
              ? ` at ${formatClockTime(sheet.set.completedAt, timeZone)}`
              : ""
          }${recordSetIds.has(sheet.set.id) ? " · PR" : ""}`;

  const clock = formatElapsedClock(
    elapsedSeconds(
      {
        startedAt: execution.startedAt,
        pausedAt: execution.pausedAt,
        completedAt: execution.completedAt,
      },
      now,
    ),
  );
  const offline = reachable === false;

  return (
    <ThemeScope scheme="system">
      <LogFrame
        header={
          <>
            <LogNav
              title={title}
              subtitle={
                coachFirst === "your coach" ? null : `From ${coachFirst}’s plan`
              }
              offline={offline}
              paused={paused}
              onMinimise={minimise}
              onPauseToggle={() => setPaused(!paused)}
              onFinish={requestFinish}
            />
            <LogStats
              clock={clock}
              volumeKg={sessionVolumeKg(execution) ?? 0}
              setsDone={counts.done}
              setsTotal={counts.total}
              paused={paused}
            />
          </>
        }
        scrollRef={scrollRef}
        dock={
          <>
            {pendingSkip ? (
              <View style={dockStyles.pad}>
                <Snackbar
                  message={pendingSkip.message}
                  leadingCheck
                  actionLabel="Undo"
                  onAction={undoSkip}
                  onDismiss={settlePendingSkip}
                />
              </View>
            ) : null}
            {resting ? (
              <RestBar
                clock={formatRestClock(restSecondsShown(restRender))}
                fraction={restElapsedFraction(restRender)}
                label={
                  active
                    ? `Rest · next set ${sortedSets(active.exercise).indexOf(active.set) + 1}`
                    : "Rest"
                }
                onLess={() => rest && setRest(adjustRest(rest, -15, Date.now()))}
                onMore={() => rest && setRest(adjustRest(rest, 15, Date.now()))}
                onSkip={() => setRest(null)}
              />
            ) : restDone ? (
              <RestDoneBar next={restDone} onOk={() => setRestDone(null)} />
            ) : null}
            {keypadOpen && active && activeDraft && keypad ? (
              <LogKeypad
                field={keypad.field}
                setNumber={sortedSets(active.exercise).indexOf(active.set) + 1}
                targetText={
                  keypad.field === "load"
                    ? plainKgFromLabel(active.set.prescribedLoadLabel)
                      ? `${plainKgFromLabel(active.set.prescribedLoadLabel)} kg`
                      : null
                    : active.set.prescribedReps != null
                      ? String(active.set.prescribedReps)
                      : null
                }
                coachFirst={coachFirst}
                bodyweight={activeDraft.bodyweight}
                onBodyweightChange={keypadBodyweight}
                onKey={keypadKey}
                onBackspace={keypadBackspace}
                onStep={keypadStep}
                onNext={() =>
                  setKeypad({
                    field: keypad.field === "load" ? "reps" : "load",
                    replace: true,
                  })
                }
                onLog={() => commitLog(active.set, active.exercise, activeDraft)}
                onDone={() => setKeypad(null)}
              />
            ) : null}
          </>
        }
      >
        {error ? (
          <View style={dockStyles.pad}>
            <ErrorBanner message={error} />
          </View>
        ) : null}
        {paused ? (
          <PausedBanner clock={clock} onResume={() => setPaused(false)} />
        ) : null}
        {recordNotice ? <RecordBanner detail={recordNotice} /> : null}

        {exercises.map((exercise, index) => {
          const sets = sortedSets(exercise);
          const pendingCount = sets.filter((set) => set.status === "pending").length;
          const loggedCount = sets.filter(
            (set) => set.status === "completed" || set.status === "modified",
          ).length;
          const allRecorded = pendingCount === 0;
          const isFolded = folded[exercise.id] ?? allRecorded;
          const rememberY = (y: number) => {
            exerciseY.current[exercise.id] = y;
          };
          if (isFolded) {
            return (
              <View
                key={exercise.id}
                onLayout={(event) => rememberY(event.nativeEvent.layout.y)}
              >
                <CollapsedExercise
                  name={exercise.name}
                  line={
                    allRecorded
                      ? exerciseDoneLine(exercise)
                      : `${loggedCount} of ${sets.length} sets logged`
                  }
                  done={allRecorded}
                  skipped={allRecorded && loggedCount === 0}
                  onPress={() =>
                    setFolded((prev) => ({ ...prev, [exercise.id]: false }))
                  }
                />
              </View>
            );
          }
          const restSeconds = sets
            .map((set) => restSecondsBySetTargetId[set.setTargetId])
            .find((value) => value != null && value > 0);
          const allBodyweight = sets.every((set) =>
            set.status === "pending"
              ? draftForSet(set, drafts).bodyweight
              : isBodyweightLabel(set.actualLoadLabel ?? set.prescribedLoadLabel),
          );
          const holdsActive = active?.exercise.id === exercise.id;
          const activeIsTarget =
            holdsActive &&
            active != null &&
            activeDraft != null &&
            !isDraftModified(active.set, activeDraft) &&
            (activeDraft.bodyweight || activeDraft.load.trim() !== "");
          return (
            <View
              key={exercise.id}
              onLayout={(event) => rememberY(event.nativeEvent.layout.y)}
            >
              {index > 0 && !(folded[exercises[index - 1]!.id] ?? exercises[index - 1]!.sets.every((set) => set.status !== "pending")) ? (
                <ExerciseSeparator />
              ) : null}
              <ExercisePad>
                <ExerciseHead
                  name={exercise.name}
                  planLine={exercisePlanLine(exercise)}
                  restLine={restSeconds != null ? formatRestLength(restSeconds) : null}
                  cue={exerciseInstructionsFor(assignment, exercise.exerciseId)}
                  coachInitials={coachInitials(coachName)}
                  canFold={allRecorded}
                  onFold={() =>
                    setFolded((prev) => ({ ...prev, [exercise.id]: true }))
                  }
                  onMenu={() => {
                    setKeypad(null);
                    setMenuExerciseId(exercise.id);
                  }}
                />
                <SetTableHead bodyweight={allBodyweight} />
                {sets.map((set, position) => {
                  const draft = draftForSet(set, drafts);
                  const state: SetRowState =
                    set.status === "skipped"
                      ? "skip"
                      : set.status !== "pending"
                        ? "done"
                        : set.id === activeSetId
                          ? "cur"
                          : "up";
                  return (
                    <LogSetRow
                      key={set.id}
                      set={set}
                      number={position + 1}
                      state={state}
                      draft={draft}
                      target={
                        !isDraftModified(set, draft) &&
                        draft.reps ===
                          initialDraft(set.prescribedLoadLabel, set.prescribedReps).reps
                      }
                      activeField={state === "cur" ? (keypad?.field ?? null) : null}
                      previousLabel={
                        history.previousByKey[`${exercise.exerciseId}:${set.order}`] ??
                        "—"
                      }
                      record={recordSetIds.has(set.id)}
                      disabled={paused}
                      onOpenField={(field) => openField(set, field)}
                      onLog={() => commitLog(set, exercise, draft)}
                      onOpenSheet={() => {
                        setKeypad(null);
                        setSheetSetId(set.id);
                      }}
                      onSkip={() =>
                        skipWithUndo([set.id], `Set ${position + 1} skipped`)
                      }
                    />
                  );
                })}
                {activeIsTarget ? <TargetLegend coachFirst={coachFirst} /> : null}
              </ExercisePad>
            </View>
          );
        })}

        <View style={dockStyles.end}>
          <Button
            label="Discard workout"
            variant="dangerQuiet"
            onPress={() => {
              setKeypad(null);
              setDiscardOpen(true);
            }}
          />
        </View>
      </LogFrame>

      <ExerciseMenuSheet
        visible={menuExercise != null}
        name={menuExercise?.name ?? ""}
        planLine={menuExercise ? exercisePlanLine(menuExercise) : ""}
        coachFirst={coachFirst}
        canSkip={
          !paused &&
          menuExercise != null &&
          skippableSetIds(execution, menuExercise.id).length > 0
        }
        showHowTo={
          menuExercise != null && exerciseHasHowTo(planExercise(menuExercise))
        }
        onHowTo={() => {
          if (!menuExercise) return;
          const id = menuExercise.id;
          const tab: ExerciseDetailTab = exerciseHasHowTo(planExercise(menuExercise))
            ? "how_to"
            : "history";
          setMenuExerciseId(null);
          sheetGate.afterClose(() => setDetail({ exerciseExecutionId: id, tab }));
        }}
        onHistory={() => {
          if (!menuExercise) return;
          const id = menuExercise.id;
          setMenuExerciseId(null);
          sheetGate.afterClose(() =>
            setDetail({ exerciseExecutionId: id, tab: "history" }),
          );
        }}
        onAskCoach={
          onAskCoach
            ? () => {
                const name = menuExercise?.name;
                setMenuExerciseId(null);
                sheetGate.afterClose(() => onAskCoach(name));
              }
            : undefined
        }
        onSkip={() => {
          if (!menuExercise) return;
          skipWithUndo(
            skippableSetIds(execution, menuExercise.id),
            `${menuExercise.name} skipped`,
          );
        }}
        onDismiss={() => setMenuExerciseId(null)}
        onClosed={sheetGate.notifyClosed}
      />

      <SetSheet
        visible={sheet != null}
        mode={sheetMode}
        title={sheet ? `Set ${sheetNumber} · ${sheet.exercise.name}` : ""}
        detail={sheetDetail}
        set={sheet?.set ?? null}
        coachFirst={coachFirst}
        onSave={(draft) => {
          if (sheet) commitLog(sheet.set, sheet.exercise, draft);
        }}
        onMarkNotDone={() => {
          if (sheet) markNotDone(sheet.set);
        }}
        onSkip={() => {
          if (sheet) skipWithUndo([sheet.set.id], `Set ${sheetNumber} skipped`);
        }}
        onDismiss={() => setSheetSetId(null)}
        onClosed={sheetGate.notifyClosed}
      />

      <FinishSheet
        visible={finishOpen}
        unlogged={unloggedExercises(execution)}
        notLogged={notLogged}
        total={counts.total}
        coachFirst={coachFirst}
        requireRpe={execution.requireSessionRpe}
        sessionRpe={sessionRpe}
        onPickRpe={setSessionRpe}
        onGoTo={goTo}
        onFinish={finishWorkout}
        onDismiss={() => setFinishOpen(false)}
        onClosed={sheetGate.notifyClosed}
      />

      <DiscardDialog
        visible={discardOpen}
        logged={counts.done}
        coachFirst={coachFirst}
        onDiscard={discardWorkout}
        onDismiss={() => setDiscardOpen(false)}
        onClosed={sheetGate.notifyClosed}
      />
    </ThemeScope>
  );
}

/** W-15. The server records a discarded workout as skipped, and the copy says so. */
export function DiscardDialog({
  visible,
  logged,
  coachFirst,
  onDiscard,
  onDismiss,
  onClosed,
}: {
  visible: boolean;
  logged: number;
  coachFirst: string;
  onDiscard: () => void;
  onDismiss: () => void;
  onClosed?: () => void;
}) {
  const theme = useTheme();
  const coach = coachFirst === "your coach" ? "Your coach" : coachFirst;
  const sets =
    logged === 0
      ? "Nothing is logged yet."
      : `${logged} logged ${logged === 1 ? "set" : "sets"} won’t count.`;
  return (
    <ConfirmDialog
      visible={visible}
      tone="crit"
      icon={<Trash2 color={theme.colors.crit} size={22} strokeWidth={2.2} />}
      title="Discard this workout?"
      body={`${sets} ${coach} will see this workout as skipped.`}
      actions={[
        { label: "Discard workout", variant: "danger", onPress: onDiscard },
        { label: "Keep logging", variant: "secondary", onPress: onDismiss },
      ]}
      onDismiss={onDismiss}
      onClosed={onClosed}
    />
  );
}

function DoneGuard({
  onSummary,
  onBack,
}: {
  onSummary: () => void;
  onBack: () => void;
}) {
  const styles = useFrameStyles();
  return (
    <View style={styles.guard}>
      <Text variant="title" accessibilityRole="header">
        This workout is already done
      </Text>
      <Text variant="body" tone="ink2">
        View summary when you go back.
      </Text>
      <Button label="View summary" onPress={onSummary} />
      <Button label="Back" variant="text" onPress={onBack} />
    </View>
  );
}

/**
 * The log's frame: a header that stays put, the list that scrolls under it,
 * and a dock at the bottom for the Undo toast, the rest bar and the keypad.
 * `Screen` scrolls everything as one, so the log lays itself out and opts in
 * to the system theme the same way `<Screen v3>` does (`ThemeScope`).
 */
function LogFrame({
  header,
  dock,
  scrollRef,
  children,
}: {
  header: ReactNode;
  dock: ReactNode;
  scrollRef: RefObject<ScrollView>;
  children: ReactNode;
}) {
  const styles = useFrameStyles();
  return (
    <SafeAreaView style={styles.safe} accessibilityRole="summary">
      <View style={[styles.header, ANDROID_STATUS_BAR_PAD]}>{header}</View>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View role="main">{children}</View>
      </ScrollView>
      <View style={styles.dock}>{dock}</View>
    </SafeAreaView>
  );
}

/**
 * Android draws the app under a translucent status bar and its SafeAreaView
 * adds no inset, so the pinned header clears the bar itself (device run
 * 44220623583: the minimise button sat under the clock).
 */
const ANDROID_STATUS_BAR_PAD =
  Platform.OS === "android"
    ? { paddingTop: 8 + (StatusBar.currentHeight ?? 24) }
    : null;

const dockStyles = {
  pad: { paddingHorizontal: 12, paddingTop: 8 },
  end: { marginTop: 24, paddingHorizontal: 16 },
} as const;

const useFrameStyles = createThemedStyles((t) => ({
  safe: { backgroundColor: t.colors.card, flex: 1 },
  header: { backgroundColor: t.colors.card, paddingTop: 8 },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  dock: { gap: 8, paddingBottom: 8 },
  guard: {
    backgroundColor: t.colors.card,
    borderRadius: t.radii.card,
    gap: 12,
    padding: 24,
  },
}));
