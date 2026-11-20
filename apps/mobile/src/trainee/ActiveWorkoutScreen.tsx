import { requireOptionalNativeModule } from "expo-modules-core";
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
  useKeepAwake,
} from "expo-keep-awake";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  Check,
  ChevronDown,
  CirclePlay,
  Pause,
  Play,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  ExerciseExecution,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { BottomSheet } from "../components/BottomSheet";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { useAuth } from "../auth/AuthProvider";
import { localDateInTimezone } from "../lib/dates";
import type { RestWindow } from "../notifications/liveActivity";
import { useWorkoutLiveActivity } from "../notifications/liveActivitySession";
import {
  ThemeScope,
  createThemedStyles,
  shadowColor,
  useTheme,
  withAlpha,
} from "../providers/ThemeProvider";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import {
  SetEntryHeader,
  SetEntryRow,
  SetKeypad,
  backspace,
  displayLoad,
  draftForSet,
  isDraftModified,
  loadBody,
  loadCellIsKg,
  loadCellText,
  loadLabelForDraft,
  pressKey,
  prescribedLoadText,
  stepValue,
  type KeypadField,
  type SetDraft,
} from "../workout/shared";
import {
  exerciseInstructionsFor,
  loadPreviousSetHistory,
  previousSetLabel,
} from "./workoutDisplay";
import { elapsedSeconds } from "./workoutDuration";

const DEFAULT_REST_SECONDS = 90;
const TARGET = 44;
const LOGBAR_HEIGHT = 64;
const KEYPAD_HEIGHT = 400;

const RPE_ANCHORS: Record<number, string> = {
  1: "Very easy",
  5: "Hard",
  10: "Max effort",
};


function firstPendingExerciseIndex(execution: WorkoutExecution): number {
  return execution.exercises.findIndex((ex) =>
    ex.sets.some((set) => set.status === "pending"),
  );
}

function firstPendingSetIndex(
  execution: WorkoutExecution,
  exerciseIndex: number,
): number {
  const exercise = execution.exercises[exerciseIndex];
  if (!exercise) return -1;
  return exercise.sets.findIndex((set) => set.status === "pending");
}

function exerciseComplete(execution: WorkoutExecution, exerciseIndex: number) {
  const exercise = execution.exercises[exerciseIndex];
  if (!exercise) return false;
  return exercise.sets.every((set) => set.status !== "pending");
}

function formatElapsedMinutes(totalSeconds: number): string {
  const m = Math.max(0, Math.floor(totalSeconds / 60));
  return `${m} min`;
}

function exercisePrescriptionLine(
  exercise: ExerciseExecution,
  restSecondsBySetTargetId: Record<string, number>,
): string {
  const sets = exercise.sets.length;
  const first = exercise.sets[0];
  const reps = first?.prescribedReps;
  const load = first?.prescribedLoadLabel?.trim();
  const repPart =
    reps != null ? `${sets} × ${reps}` : `${sets} sets`;
  const parts = [repPart];
  if (load) parts.push(load);
  else if (!load && sets > 0) parts.push("bodyweight");
  const rest = first
    ? restSecondsBySetTargetId[first.setTargetId]
    : undefined;
  if (rest != null && rest > 0) parts.push(`rest ${rest} s`);
  return parts.join(" · ");
}

function summarizeDoneExercise(exercise: ExerciseExecution): string {
  const total = exercise.sets.length;
  const done = exercise.sets.filter((s) => s.status !== "pending").length;
  const loads = exercise.sets
    .map((s) => s.actualLoadLabel ?? s.prescribedLoadLabel)
    .filter(Boolean) as string[];
  const reps = exercise.sets
    .map((s) => s.actualReps ?? s.prescribedReps)
    .filter((r): r is number => r != null);
  let detail = "";
  if (loads.length > 0 && reps.length > 0) {
    const maxLoad = loads
      .map((l) => Number.parseFloat(l.match(/([\d.]+)/)?.[1] ?? "0"))
      .filter(Number.isFinite)
      .reduce((a, b) => Math.max(a, b), 0);
    const maxReps = Math.max(...reps);
    if (maxLoad > 0) {
      const varied = new Set(loads.map(displayLoad)).size > 1;
      detail = varied
        ? `up to ${maxLoad} kg`
        : `${maxReps} × ${displayLoad(loads[0])} kg`;
    } else {
      detail = `${maxReps} reps`;
    }
  }
  const base = `Done · ${done} of ${total} sets`;
  return detail ? `${base} · ${detail}` : base;
}

function applySetCompleteLocally(
  execution: WorkoutExecution,
  setId: string,
  actualReps: number | null,
  actualLoadLabel: string | null,
): WorkoutExecution {
  const now = new Date().toISOString();
  return {
    ...execution,
    updatedAt: now,
    exercises: execution.exercises.map((exercise) => {
      const sets = exercise.sets.map((set) => {
        if (set.id !== setId) return set;
        const modified =
          (actualReps != null &&
            set.prescribedReps != null &&
            actualReps !== set.prescribedReps) ||
          (actualLoadLabel != null &&
            displayLoad(actualLoadLabel) !==
              displayLoad(set.prescribedLoadLabel)) ||
          (actualReps != null && set.prescribedReps == null);
        return {
          ...set,
          status: modified ? ("modified" as const) : ("completed" as const),
          actualReps: actualReps ?? set.prescribedReps,
          actualLoadLabel: actualLoadLabel ?? set.prescribedLoadLabel,
          completedAt: now,
          updatedAt: now,
        };
      });
      const allDone = sets.every((set) => set.status !== "pending");
      return {
        ...exercise,
        sets,
        status: allDone ? ("completed" as const) : exercise.status,
        updatedAt: now,
      };
    }),
  };
}

const KEEP_AWAKE_TAG = "fitbud-active-workout";

type KeepAwakeNative = {
  activate(tag: string): Promise<boolean>;
  deactivate(tag: string): Promise<boolean>;
};

/**
 * Keeps the screen on during a workout (Z12-57).
 *
 * Primary path: `expo-keep-awake` (now a direct dependency). Z11b-3's
 * `requireOptionalNativeModule("ExpoKeepAwake")` path stays the fallback when
 * the package import throws (web tests that stub the module out, an old
 * bundle). Neither path may fail the screen.
 */
export function activateWorkoutKeepAwake(): () => void {
  try {
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      try {
        void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
      } catch {
        // ignore
      }
    };
  } catch {
    // Fall through to the Z11b-3 native-module lookup.
  }
  let native: KeepAwakeNative | null = null;
  try {
    native = requireOptionalNativeModule<KeepAwakeNative>("ExpoKeepAwake");
  } catch {
    native = null;
  }
  if (!native) return () => undefined;
  const keepAwake = native;
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

type ActiveWorkoutProps = {
  execution: WorkoutExecution;
  assignment?: WorkoutAssignment | null;
  onChange: (execution: WorkoutExecution) => void;
  onFinished: (execution: WorkoutExecution) => void;
  onExit: () => void;
  sessionName?: string;
  coachName?: string;
  restSecondsBySetTargetId?: Record<string, number>;
  onAskCoach?: () => void;
};

/**
 * Active workout (W-03). ThemeScope opts the body into system light/dark before
 * styles are built; `<Screen v3>` keeps the same opt-in for Screen chrome and
 * Z12-58 (MoreScreen / DietTab pattern).
 */
export function ActiveWorkoutScreen(props: ActiveWorkoutProps) {
  return (
    <ThemeScope scheme="system">
      <ActiveWorkoutBody {...props} />
    </ThemeScope>
  );
}

function ActiveWorkoutBody({
  execution,
  assignment = null,
  onChange,
  onFinished,
  onExit,
  sessionName,
  coachName = "Your coach",
  restSecondsBySetTargetId = {},
  onAskCoach,
}: ActiveWorkoutProps) {
  const styles = useStyles();
  const theme = useTheme();
  const sync = useSyncEngine();
  const { api, me } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [sessionRpe, setSessionRpe] = useState<number | null>(
    execution.sessionRpe,
  );
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [keypad, setKeypad] = useState<{
    field: KeypadField;
    replace: boolean;
  } | null>(null);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(DEFAULT_REST_SECONDS);
  // Lock-screen rest (LA1c): when the current in-app rest ends, for the Live
  // Activity's own countdown. Follows the in-app timer; it doesn't drive it.
  const [restWindow, setRestWindow] = useState<RestWindow | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [previousByKey, setPreviousByKey] = useState<Record<string, string>>({});

  const emptyOrDone =
    execution.exercises.length === 0 ||
    execution.status === "completed" ||
    execution.status === "skipped" ||
    execution.status === "modified";

  const currentExerciseIndex = useMemo(
    () => firstPendingExerciseIndex(execution),
    [execution],
  );

  const exercise =
    currentExerciseIndex >= 0
      ? execution.exercises[currentExerciseIndex]
      : null;
  const setIndex =
    exercise && currentExerciseIndex >= 0
      ? firstPendingSetIndex(execution, currentExerciseIndex)
      : -1;
  const currentSet =
    exercise && setIndex >= 0 ? exercise.sets[setIndex] : null;

  const pendingSets = execution.exercises.reduce(
    (count, ex) =>
      count + ex.sets.filter((set) => set.status === "pending").length,
    0,
  );
  const allSetsDone = pendingSets === 0;

  const title = sessionName?.trim() || "Workout";
  const exerciseOrdinal =
    currentExerciseIndex >= 0 ? currentExerciseIndex + 1 : execution.exercises.length;
  const exerciseTotal = execution.exercises.length;

  const upcoming = useMemo(() => {
    if (currentExerciseIndex < 0) return [];
    return execution.exercises.slice(currentExerciseIndex + 1);
  }, [currentExerciseIndex, execution.exercises]);

  // iOS Live Activity (LA1b): starts, updates per logged set, ends on finish,
  // skip or leaving. No-op on Android and web.
  useWorkoutLiveActivity({
    execution,
    workoutName: title,
    historyByKey: previousByKey,
    rest: restWindow,
    // Skip on the lock screen ends the app's rest when the app comes back.
    onRestSkipped: () => setRestRemaining(null),
  });

  // The in-app rest ended (expiry, Skip, or the next set): no lock-screen rest.
  useEffect(() => {
    if (restRemaining == null || restRemaining <= 0) setRestWindow(null);
  }, [restRemaining]);

  // Screen stays awake for the whole active workout (Z12-57 / useKeepAwake).
  useKeepAwake(KEEP_AWAKE_TAG);

  useEffect(() => {
    if (!assignment) return;
    const timeZone = me?.timezone ?? "UTC";
    const today = localDateInTimezone(timeZone);
    let cancelled = false;
    void loadPreviousSetHistory(api, assignment, today).then((map) => {
      if (!cancelled) setPreviousByKey(map);
    });
    return () => {
      cancelled = true;
    };
  }, [api, assignment, me?.timezone]);

  useEffect(() => {
    if (restRemaining == null || restRemaining <= 0) return;
    const timer = setTimeout(() => {
      setRestRemaining((value) => {
        if (value == null || value <= 1) return null;
        return value - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [restRemaining]);

  // The session clock reads the execution's own timestamps (Z12-44,
  // `elapsedSeconds`): it stands still while paused and survives a resume,
  // a kill and a relaunch, and it is the same rule as the summary's Duration
  // and the Workout tab's "In progress" clock. It used to keep the paused
  // time in memory, so a relaunch made it jump.
  const { startedAt, pausedAt, completedAt } = execution;
  useEffect(() => {
    const tick = () =>
      setElapsedSec(
        elapsedSeconds({ startedAt, pausedAt, completedAt }, Date.now()),
      );
    tick();
    if (execution.status === "paused") return undefined;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [execution.status, startedAt, pausedAt, completedAt]);

  function startRestForSet(setTargetId: string) {
    const prescribed = restSecondsBySetTargetId[setTargetId];
    const seconds =
      prescribed != null && prescribed > 0
        ? prescribed
        : DEFAULT_REST_SECONDS;
    setRestTotal(seconds);
    setRestRemaining(seconds);
    setRestWindow({ endsAt: Date.now() + seconds * 1000, seconds });
  }

  function updateDraft(setId: string, patch: Partial<SetDraft>) {
    setDrafts((prev) => {
      const base =
        prev[setId] ??
        (() => {
          for (const ex of execution.exercises) {
            const match = ex.sets.find((s) => s.id === setId);
            if (match) return draftForSet(match, prev);
          }
          return { load: "", reps: "", bodyweight: false };
        })();
      return { ...prev, [setId]: { ...base, ...patch } };
    });
  }

  function completeSet(setId: string) {
    if (execution.status === "paused") return;
    let targetSet: ExerciseExecution["sets"][number] | null = null;
    for (const ex of execution.exercises) {
      const found = ex.sets.find((s) => s.id === setId);
      if (found) {
        targetSet = found;
        break;
      }
    }
    if (!targetSet || targetSet.status !== "pending") return;

    const draft = draftForSet(targetSet, drafts);
    const repsRaw = draft.reps.trim();
    const actualReps =
      repsRaw === "" ? null : Number.parseInt(repsRaw, 10);
    const loadPart = loadBody(draft, targetSet.prescribedLoadLabel);
    const actualLoadLabel = loadLabelForDraft(draft, targetSet.prescribedLoadLabel);
    setKeypad(null);

    setRestRemaining(null);

    const optimistic = applySetCompleteLocally(
      execution,
      setId,
      actualReps != null && Number.isFinite(actualReps) ? actualReps : null,
      actualLoadLabel,
    );
    onChange(optimistic);
    startRestForSet(targetSet.setTargetId);
    setError(null);

    void (async () => {
      try {
        await enqueueAndPush(sync, {
          recordId: execution.id,
          operation: "workout.complete_set",
          expectedServerVersion: execution.recordVersion,
          payload: {
            executionId: execution.id,
            setExecutionId: setId,
            // The plan's own ids: a workout opened with no network has ids
            // the server has never seen, and finds the set by these (Z12-41).
            assignmentId: execution.assignmentId,
            setTargetId: targetSet.setTargetId,
            expectedVersion: execution.recordVersion,
            body: {
              actualReps:
                actualReps != null && Number.isFinite(actualReps)
                  ? actualReps
                  : null,
              ...loadPart,
            },
          },
        });
      } catch (err: unknown) {
        const message =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : null;
        setError(message ?? "Saved on phone · will sync when online.");
      }
    })();
  }

  function pauseSession() {
    const optimistic: WorkoutExecution = {
      ...execution,
      status: "paused",
      pausedAt: new Date().toISOString(),
    };
    onChange(optimistic);
    void enqueueAndPush(sync, {
      recordId: execution.id,
      operation: "workout.pause",
      expectedServerVersion: execution.recordVersion,
      payload: {
        executionId: execution.id,
        assignmentId: execution.assignmentId,
        expectedVersion: execution.recordVersion,
      },
    }).catch(() => {
      setError("Saved on phone · will sync when online.");
    });
  }

  function resumeSession() {
    const optimistic: WorkoutExecution = {
      ...execution,
      status: "started",
      pausedAt: null,
    };
    onChange(optimistic);
    void enqueueAndPush(sync, {
      recordId: execution.id,
      operation: "workout.resume",
      expectedServerVersion: execution.recordVersion,
      payload: {
        executionId: execution.id,
        assignmentId: execution.assignmentId,
        expectedVersion: execution.recordVersion,
      },
    }).catch(() => {
      setError("Saved on phone · will sync when online.");
    });
  }

  function finishWorkout(force = false) {
    if (!force && pendingSets > 0) {
      setFinishOpen(true);
      return;
    }
    if (execution.requireSessionRpe && sessionRpe == null) {
      setFinishOpen(true);
      setError("Pick a session RPE before finishing.");
      return;
    }
    const optimistic: WorkoutExecution = {
      ...execution,
      status: "completed",
      completedAt: new Date().toISOString(),
      sessionRpe,
    };
    onChange(optimistic);
    setFinishOpen(false);
    void (async () => {
      try {
        await enqueueAndPush(sync, {
          recordId: execution.id,
          operation: "workout.complete",
          expectedServerVersion: execution.recordVersion,
          payload: {
            executionId: execution.id,
            assignmentId: execution.assignmentId,
            expectedVersion: execution.recordVersion,
            body: { sessionRpe },
          },
        });
      } catch {
        // Still show summary offline.
      }
      onFinished(optimistic);
    })();
  }

  if (emptyOrDone) {
    return (
      <Screen v3 chrome="app" title={title}>
        <View style={styles.guardCard}>
          <Text style={styles.guardTitle} accessibilityRole="header">
            This workout is already done
          </Text>
          <Text style={styles.guardBody}>View summary when you go back.</Text>
          <PrimaryButton
            label="View summary"
            onPress={() => onFinished(execution)}
          />
          <PrimaryButton label="Back" variant="ghost" onPress={onExit} />
        </View>
      </Screen>
    );
  }

  const currentDraft = currentSet ? draftForSet(currentSet, drafts) : null;
  const restProgress =
    restRemaining != null && restTotal > 0
      ? Math.max(0, Math.min(1, restRemaining / restTotal))
      : 0;

  const nextRestSeconds = currentSet
    ? restSecondsBySetTargetId[currentSet.setTargetId] ?? DEFAULT_REST_SECONDS
    : DEFAULT_REST_SECONDS;

  const logLabel = currentSet && currentDraft
    ? (() => {
        const load = loadCellText(currentSet, currentDraft);
        const reps =
          currentDraft.reps.trim() ||
          (currentSet.prescribedReps != null
            ? String(currentSet.prescribedReps)
            : "—");
        if (load === "BW") {
          return `Log set ${currentSet.order} · ${reps} reps`;
        }
        if (load === "Bodyweight") {
          return `Log set ${currentSet.order} · Bodyweight × ${reps}`;
        }
        return loadCellIsKg(currentDraft)
          ? `Log set ${currentSet.order} · ${load} kg × ${reps}`
          : `Log set ${currentSet.order} · ${load} × ${reps}`;
      })()
    : "Finish workout";

  const logSub =
    restRemaining != null && restRemaining > 0
      ? "Ready early? Logging a set ends the rest."
      : `Tap load or reps to change · rest ${nextRestSeconds} s starts after`;

  const nextSetLoadText = (
    set: ExerciseExecution["sets"][number],
  ): string => {
    const text = prescribedLoadText(set.prescribedLoadLabel);
    return text ? ` · ${text}` : "";
  };

  // During a rest the current set is already the next one to do (frame 11b).
  const nextAfterRest =
    currentSet && exercise
      ? `Next: ${exercise.name}, set ${currentSet.order}${nextSetLoadText(currentSet)}`
      : "Next: finish workout";

  const keypadOpen =
    keypad != null && currentSet != null && currentDraft != null;

  function openKeypad(field: KeypadField) {
    if (execution.status === "paused") return;
    setKeypad({ field, replace: true });
  }

  function keypadKey(key: string) {
    if (!keypad || !currentSet || !currentDraft) return;
    const next = pressKey(
      currentDraft[keypad.field],
      key,
      keypad.field,
      keypad.replace,
    );
    updateDraft(currentSet.id, { [keypad.field]: next });
    setKeypad({ ...keypad, replace: false });
  }

  function keypadBackspace() {
    if (!keypad || !currentSet || !currentDraft) return;
    updateDraft(currentSet.id, {
      [keypad.field]: backspace(currentDraft[keypad.field], keypad.replace),
    });
    setKeypad({ ...keypad, replace: false });
  }

  function keypadStep(direction: 1 | -1) {
    if (!keypad || !currentSet || !currentDraft) return;
    const base =
      keypad.field === "load" && currentDraft.load.trim() === ""
        ? "0"
        : currentDraft[keypad.field];
    updateDraft(currentSet.id, {
      [keypad.field]: stepValue(base, direction, keypad.field),
    });
    setKeypad({ ...keypad, replace: true });
  }

  function keypadBodyweight(bodyweight: boolean) {
    if (!currentSet) return;
    updateDraft(currentSet.id, { bodyweight });
    // Switching to kg from the reps keypad goes to the load to type it.
    if (!bodyweight && keypad?.field === "reps") {
      setKeypad({ field: "load", replace: true });
    }
  }

  function keypadPrimary() {
    if (!keypad || !currentSet) return;
    if (keypad.field === "load") setKeypad({ field: "reps", replace: true });
    else completeSet(currentSet.id);
  }

  const logFooter = keypadOpen && currentSet && keypad ? (
    <SetKeypad
      field={keypad.field}
      setOrder={currentSet.order}
      bodyweight={currentDraft!.bodyweight}
      onBodyweightChange={keypadBodyweight}
      onKey={keypadKey}
      onBackspace={keypadBackspace}
      onStep={keypadStep}
      onPrimary={keypadPrimary}
      onClose={() => setKeypad(null)}
      disabled={execution.status === "paused"}
    />
  ) : currentSet ? (
    <View style={styles.logbar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={logLabel}
        disabled={execution.status === "paused"}
        onPress={() => completeSet(currentSet.id)}
        style={[
          styles.logBtn,
          execution.status === "paused" ? styles.logBtnDisabled : null,
        ]}
      >
        <Check color={theme.colors.onBrand} size={24} strokeWidth={2.6} />
        <Text style={styles.logBtnText}>{logLabel}</Text>
      </Pressable>
      <Text style={styles.logSub}>{logSub}</Text>
    </View>
  ) : allSetsDone ? (
    <View style={styles.logbar}>
      <PrimaryButton label="Finish workout" onPress={() => finishWorkout(true)} />
    </View>
  ) : null;

  return (
    <Screen v3 chrome="app" title={title} showHeader={false} footer={logFooter}>
      <View style={styles.awl}>
        <View style={styles.hdr}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              execution.status === "paused" ? "Resume" : "Pause"
            }
            onPress={
              execution.status === "paused" ? resumeSession : pauseSession
            }
            style={styles.ibtnFill}
          >
            {execution.status === "paused" ? (
              <Play color={theme.colors.ink} size={22} />
            ) : (
              <Pause color={theme.colors.ink} size={22} />
            )}
          </Pressable>
          <View style={styles.hdrTitle}>
            <Text style={styles.hdrName} accessibilityRole="header">
              {title}
            </Text>
            <View style={styles.hdrMetaRow}>
              {execution.status !== "paused" ? (
                <View style={styles.recDot} />
              ) : null}
              <Text style={styles.hdrMeta}>
                {formatElapsedMinutes(elapsedSec)} · exercise {exerciseOrdinal}{" "}
                of {exerciseTotal}
              </Text>
            </View>
          </View>
          {allSetsDone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Finish workout"
              onPress={() => finishWorkout()}
              style={styles.fin}
            >
              <Text style={styles.finText}>Finish</Text>
            </Pressable>
          ) : (
            <View style={styles.finPlaceholder} />
          )}
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        {execution.status === "paused" ? (
          <View style={styles.pauseBanner}>
            <Text style={styles.pauseText}>Paused</Text>
            <PrimaryButton
              label="Resume"
              variant="tinted"
              onPress={resumeSession}
            />
          </View>
        ) : null}

        {restRemaining != null && restRemaining > 0 ? (
          <View style={styles.restband}>
            <View style={styles.restbandRow}>
              <View style={styles.restMain}>
                <Text style={styles.restK}>REST</Text>
                <Text style={styles.restV}>
                  {restRemaining}
                  <Text style={styles.restVs}> s left</Text>
                </Text>
              </View>
              <View style={styles.restCtl}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="15 seconds less"
                onPress={() =>
                  {
                    setRestRemaining((v) => Math.max(0, (v ?? 0) - 15));
                    setRestWindow((w) => (w ? { ...w, endsAt: w.endsAt - 15_000 } : w));
                  }
                }
                style={styles.restCtlBtn}
              >
                <Text style={styles.restCtlText}>−15 s</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="15 seconds more"
                onPress={() => {
                  setRestRemaining((v) => (v ?? 0) + 15);
                  setRestTotal((v) => v + 15);
                  setRestWindow((w) =>
                    w ? { endsAt: w.endsAt + 15_000, seconds: w.seconds + 15 } : w,
                  );
                }}
                style={styles.restCtlBtn}
              >
                <Text style={styles.restCtlText}>+15 s</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip rest"
                onPress={() => setRestRemaining(null)}
                style={styles.restCtlBtn}
              >
                <Text style={styles.restCtlText}>Skip</Text>
              </Pressable>
              </View>
            </View>
            <View style={styles.restTrack}>
              <View
                style={[styles.restBar, { width: `${Math.round(restProgress * 100)}%` }]}
              />
            </View>
            {nextAfterRest ? (
              <Text style={styles.restNx}>{nextAfterRest}</Text>
            ) : null}
          </View>
        ) : null}

        {execution.exercises.map((ex, idx) => {
          if (idx > currentExerciseIndex && currentExerciseIndex >= 0) {
            return null;
          }
          const done = exerciseComplete(execution, idx);
          const isCurrent = idx === currentExerciseIndex;
          return (
            <View
              key={ex.id}
              style={[
                styles.acc,
                done ? styles.accDone : null,
                isCurrent ? styles.accCur : null,
                idx > 0 ? styles.accGap : null,
              ]}
            >
              <View style={styles.ah}>
                <View style={[styles.exn, done ? styles.exnDone : null]}>
                  {done ? (
                    <Check
                      color={theme.colors.onBrand}
                      size={18}
                      strokeWidth={2.6}
                    />
                  ) : (
                    <Text style={styles.exnNum}>{idx + 1}</Text>
                  )}
                </View>
                <View style={styles.ahTx}>
                  <Text style={[styles.exName, done ? styles.exNameDone : null]}>
                    {ex.name}
                  </Text>
                  <Text style={styles.exSub}>
                    {done
                      ? summarizeDoneExercise(ex)
                      : exercisePrescriptionLine(ex, restSecondsBySetTargetId)}
                  </Text>
                </View>
                {isCurrent ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="How to do it"
                    onPress={onAskCoach}
                    style={styles.coachVid}
                  >
                    <CirclePlay color={theme.colors.brand} size={22} />
                  </Pressable>
                ) : null}
                {!isCurrent ? (
                  <ChevronDown color={theme.colors.ink3} size={20} />
                ) : (
                  <ChevronDown
                    color={theme.colors.ink3}
                    size={20}
                    style={{ transform: [{ rotate: "180deg" }] }}
                  />
                )}
              </View>

              {isCurrent ? (
                <>
                  {(() => {
                    const cue = exerciseInstructionsFor(
                      assignment,
                      ex.exerciseId,
                    );
                    if (!cue) return null;
                    const coachFirst = coachName.split(/\s+/)[0] ?? coachName;
                    return (
                      <View style={styles.note2}>
                        <Text style={styles.note2Text}>
                          <Text style={styles.note2Bold}>{coachFirst}:</Text>{" "}
                          {cue}
                        </Text>
                      </View>
                    );
                  })()}
                <View style={styles.stab}>
                  <SetEntryHeader />
                  {ex.sets.map((set) => {
                    const isNow = currentSet?.id === set.id;
                    const draft = draftForSet(set, drafts);
                    return (
                      <SetEntryRow
                        key={set.id}
                        set={set}
                        isNow={isNow}
                        draft={draft}
                        modified={isNow && isDraftModified(set, draft)}
                        activeField={keypad?.field ?? null}
                        previousLabel={previousSetLabel(ex, set, previousByKey)}
                        onOpenField={openKeypad}
                        onComplete={() => completeSet(set.id)}
                        completeDisabled={execution.status === "paused"}
                      />
                    );
                  })}
                </View>
                </>
              ) : null}
            </View>
          );
        })}

        {upcoming.length > 0 ? (
          <View style={styles.sh}>
            <Text style={styles.shTitle} accessibilityRole="header">
              Up next{" "}
              <Text style={styles.shCnt}>{upcoming.length}</Text>
            </Text>
          </View>
        ) : null}

        {upcoming.map((ex, i) => {
          const idx = currentExerciseIndex + 1 + i;
          return (
            <View key={ex.id} style={[styles.acc, styles.accGap]}>
              <View style={styles.ah}>
                <View style={styles.exn}>
                  <Text style={styles.exnNum}>{idx + 1}</Text>
                </View>
                <View style={styles.ahTx}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <Text style={styles.exSub}>
                    {exercisePrescriptionLine(ex, restSecondsBySetTargetId)}
                  </Text>
                </View>
                <ChevronDown color={theme.colors.ink3} size={20} />
              </View>
            </View>
          );
        })}

        <View
          style={{
            height: keypadOpen
              ? KEYPAD_HEIGHT
              : LOGBAR_HEIGHT + theme.spacing.xl,
          }}
        />
      </View>

      <BottomSheet
        visible={finishOpen}
        title={allSetsDone ? "Finish workout?" : "Finish early?"}
        subtitle={
          !allSetsDone && pendingSets > 0
            ? `${pendingSets} sets not logged. Finish anyway?`
            : execution.requireSessionRpe
              ? "How hard was the session?"
              : undefined
        }
        onDismiss={() => setFinishOpen(false)}
      >
        {execution.requireSessionRpe ? (
          <>
            <View style={styles.rpeRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`RPE ${value}${RPE_ANCHORS[value] ? ` · ${RPE_ANCHORS[value]}` : ""}`}
                  style={[
                    styles.rpeChip,
                    sessionRpe === value ? styles.rpeChipActive : null,
                  ]}
                  onPress={() => setSessionRpe(value)}
                >
                  <Text
                    style={
                      sessionRpe === value
                        ? styles.rpeChipTextActive
                        : styles.rpeChipText
                    }
                  >
                    {value}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.rpeAnchors}>
              1 · Very easy … 10 · Max effort
            </Text>
          </>
        ) : null}
        <PrimaryButton
          label="Finish workout"
          onPress={() => finishWorkout(true)}
        />
        <PrimaryButton
          label="Keep going"
          variant="ghost"
          onPress={() => setFinishOpen(false)}
        />
      </BottomSheet>
    </Screen>
  );
}

const useStyles = createThemedStyles((t) => ({
  awl: {
    marginHorizontal: -t.spacing.xs,
  },
  hdr: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.sm,
    height: 52,
    marginBottom: t.spacing.sm,
  },
  ibtnFill: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 22,
    height: TARGET,
    justifyContent: "center",
    width: TARGET,
  },
  hdrTitle: {
    flex: 1,
    minWidth: 0,
  },
  hdrName: {
    color: t.colors.ink,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 21,
  },
  hdrMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 2,
  },
  hdrMeta: {
    color: t.colors.ink3,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  recDot: {
    backgroundColor: t.colors.brand,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  fin: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  finPlaceholder: {
    height: 44,
    minWidth: 64,
  },
  finText: {
    color: t.colors.brand,
    fontSize: 15,
    fontWeight: "700",
  },
  pauseBanner: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: t.radii.card,
    flexDirection: "row",
    gap: t.spacing.md,
    justifyContent: "space-between",
    marginBottom: t.spacing.md,
    padding: t.spacing.md,
  },
  pauseText: {
    color: t.colors.ink,
    fontWeight: "700",
  },
  restband: {
    backgroundColor: t.colors.brandTint,
    borderColor: t.colors.brandTint2,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: t.spacing.md,
    marginTop: t.spacing.xs,
    overflow: "hidden",
    paddingBottom: t.spacing.md,
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.md,
  },
  restbandRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  restMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: t.spacing.sm,
  },
  restK: {
    color: t.colors.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  restV: {
    color: t.colors.ink,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  restVs: {
    color: t.colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  restNx: {
    color: t.colors.ink,
    fontSize: 14,
    marginTop: t.spacing.sm,
  },
  restCtl: {
    flexDirection: "row",
    flexShrink: 0,
    gap: 6,
  },
  restCtlBtn: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.brandTint2,
    borderRadius: 22,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    minWidth: 52,
    paddingHorizontal: 10,
  },
  restCtlText: {
    color: t.colors.brand,
    fontSize: 14,
    fontWeight: "700",
  },
  restTrack: {
    backgroundColor: t.colors.card,
    borderRadius: 3,
    height: 6,
    marginTop: t.spacing.sm,
    overflow: "hidden",
  },
  restBar: {
    backgroundColor: t.colors.brand,
    borderRadius: 3,
    height: 6,
  },
  acc: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  accGap: {
    marginTop: 10,
  },
  accDone: {},
  accCur: {
    borderColor: t.colors.brandTint2,
    borderWidth: 1.5,
  },
  ah: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.md,
    minHeight: 64,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 10,
  },
  exn: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderColor: t.colors.brandTint2,
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  exnDone: {
    backgroundColor: t.colors.ink,
    borderColor: t.colors.ink,
  },
  exnNum: {
    color: t.colors.brand,
    fontSize: 15,
    fontWeight: "700",
  },
  ahTx: {
    flex: 1,
    minWidth: 0,
  },
  exName: {
    color: t.colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  exNameDone: {
    color: t.colors.ink2,
  },
  exSub: {
    color: t.colors.ink3,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  coachVid: {
    alignItems: "center",
    height: TARGET,
    justifyContent: "center",
    width: 32,
  },
  note2: {
    marginBottom: 6,
    paddingHorizontal: t.spacing.md,
  },
  note2Text: {
    color: t.colors.brand,
    fontSize: 14,
    lineHeight: 20,
  },
  note2Bold: {
    fontWeight: "700",
  },
  stab: {
    paddingBottom: t.spacing.sm,
    paddingHorizontal: t.spacing.sm,
  },
  sh: {
    marginBottom: 10,
    marginTop: 18,
    paddingHorizontal: 4,
  },
  shTitle: {
    color: t.colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  shCnt: {
    color: t.colors.ink3,
    fontSize: 15,
    fontWeight: "600",
  },
  logbar: {
    backgroundColor: withAlpha(t.colors.card, 0.94),
    borderTopColor: t.colors.line,
    borderTopWidth: 1,
    paddingBottom: t.spacing.xl,
    paddingHorizontal: t.spacing.lg,
    paddingTop: 10,
  },
  logBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: 20,
    flexDirection: "row",
    gap: t.spacing.sm,
    height: LOGBAR_HEIGHT,
    justifyContent: "center",
  },
  logBtnDisabled: {
    opacity: 0.5,
  },
  logBtnText: {
    color: t.colors.onBrand,
    fontSize: 18,
    fontWeight: "700",
  },
  logSub: {
    color: t.colors.ink3,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  rpeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.spacing.xs,
    marginBottom: t.spacing.sm,
  },
  rpeChip: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: t.radii.button,
    height: TARGET,
    justifyContent: "center",
    minWidth: TARGET,
  },
  rpeChipActive: {
    backgroundColor: t.colors.brand,
  },
  rpeChipText: {
    color: t.colors.ink,
    fontWeight: "600",
  },
  rpeChipTextActive: {
    color: t.colors.onBrand,
    fontWeight: "700",
  },
  rpeAnchors: {
    color: t.colors.ink3,
    fontSize: 13,
    marginBottom: t.spacing.md,
  },
  guardCard: {
    backgroundColor: t.colors.card,
    borderRadius: t.radii.card,
    gap: t.spacing.md,
    padding: t.spacing.xl,
  },
  guardTitle: {
    color: t.colors.ink,
    fontSize: 20,
    fontWeight: "700",
  },
  guardBody: {
    color: t.colors.ink3,
    fontSize: 15,
  },
}));
