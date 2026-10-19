import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
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
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { BottomSheet } from "../components/BottomSheet";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { useAuth } from "../auth/AuthProvider";
import { localDateInTimezone } from "../lib/dates";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import {
  exerciseInstructionsFor,
  loadPreviousSetHistory,
  previousSetLabel,
} from "./workoutDisplay";

const DEFAULT_REST_SECONDS = 90;
const TARGET = 44;
const LOGBAR_HEIGHT = 64;

const RPE_ANCHORS: Record<number, string> = {
  1: "Very easy",
  5: "Hard",
  10: "Max effort",
};

type SetDraft = { load: string; reps: string };

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

function displayLoad(label: string | null | undefined): string {
  const raw = label?.trim() ?? "";
  if (!raw) return "BW";
  const match = raw.match(/([\d.]+)/);
  if (match) return match[1]!;
  if (/body\s*weight|^bw$/i.test(raw)) return "BW";
  return raw;
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
            set.prescribedLoadLabel != null &&
            actualLoadLabel !== set.prescribedLoadLabel) ||
          (actualLoadLabel != null &&
            !set.prescribedLoadLabel &&
            actualLoadLabel.trim() !== "") ||
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

function tryActivateKeepAwake() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const keepAwake = require("expo-keep-awake") as {
      activateKeepAwakeAsync?: (tag?: string) => Promise<void>;
      deactivateKeepAwake?: (tag?: string) => void;
    };
    void keepAwake.activateKeepAwakeAsync?.("fitbud-active-workout");
    return () => {
      try {
        keepAwake.deactivateKeepAwake?.("fitbud-active-workout");
      } catch {
        // ignore
      }
    };
  } catch {
    return undefined;
  }
}

function draftForSet(
  set: ExerciseExecution["sets"][number],
  drafts: Record<string, SetDraft>,
): SetDraft {
  const existing = drafts[set.id];
  if (existing) return existing;
  return {
    load: set.prescribedLoadLabel ?? "",
    reps:
      set.prescribedReps != null ? String(set.prescribedReps) : "",
  };
}

function isDraftModified(
  set: ExerciseExecution["sets"][number],
  draft: SetDraft,
): boolean {
  const reps =
    draft.reps.trim() === ""
      ? null
      : Number.parseInt(draft.reps.trim(), 10);
  const load = draft.load.trim();
  const repsChanged =
    reps != null &&
    Number.isFinite(reps) &&
    set.prescribedReps != null &&
    reps !== set.prescribedReps;
  const loadChanged =
    load !== "" && (set.prescribedLoadLabel ?? "") !== load;
  return repsChanged || loadChanged;
}

export function ActiveWorkoutScreen({
  execution,
  assignment = null,
  onChange,
  onFinished,
  onExit,
  sessionName,
  coachName = "Your coach",
  restSecondsBySetTargetId = {},
  onAskCoach,
}: {
  execution: WorkoutExecution;
  assignment?: WorkoutAssignment | null;
  onChange: (execution: WorkoutExecution) => void;
  onFinished: (execution: WorkoutExecution) => void;
  onExit: () => void;
  sessionName?: string;
  coachName?: string;
  restSecondsBySetTargetId?: Record<string, number>;
  onAskCoach?: () => void;
}) {
  const sync = useSyncEngine();
  const { api, me } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [sessionRpe, setSessionRpe] = useState<number | null>(
    execution.sessionRpe,
  );
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(DEFAULT_REST_SECONDS);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [previousByKey, setPreviousByKey] = useState<Record<string, string>>({});
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);
  const tickBaseRef = useRef(Date.parse(execution.startedAt));

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

  useEffect(() => {
    const deactivate = tryActivateKeepAwake();
    return () => {
      deactivate?.();
    };
  }, []);

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

  useEffect(() => {
    if (execution.status === "paused") {
      if (pauseStartedRef.current == null) {
        pauseStartedRef.current = Date.now();
      }
      return;
    }
    if (pauseStartedRef.current != null) {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
      pauseStartedRef.current = null;
    }
    const timer = setInterval(() => {
      const raw = Math.floor(
        (Date.now() - tickBaseRef.current - pausedAccumRef.current) / 1000,
      );
      setElapsedSec(Math.max(0, raw));
    }, 1000);
    return () => clearInterval(timer);
  }, [execution.status]);

  function startRestForSet(setTargetId: string) {
    const prescribed = restSecondsBySetTargetId[setTargetId];
    const seconds =
      prescribed != null && prescribed > 0
        ? prescribed
        : DEFAULT_REST_SECONDS;
    setRestTotal(seconds);
    setRestRemaining(seconds);
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
          return { load: "", reps: "" };
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
    const loadRaw = draft.load.trim();
    const actualReps =
      repsRaw === "" ? null : Number.parseInt(repsRaw, 10);
    const actualLoadLabel = loadRaw === "" ? null : loadRaw;

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
            expectedVersion: execution.recordVersion,
            body: {
              actualReps:
                actualReps != null && Number.isFinite(actualReps)
                  ? actualReps
                  : null,
              actualLoadLabel,
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
      <Screen chrome="app" title={title}>
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
        const load = displayLoad(
          currentDraft.load.trim() || currentSet.prescribedLoadLabel,
        );
        const reps =
          currentDraft.reps.trim() ||
          (currentSet.prescribedReps != null
            ? String(currentSet.prescribedReps)
            : "—");
        if (load === "BW") {
          return `Log set ${currentSet.order} · ${reps} reps`;
        }
        return `Log set ${currentSet.order} · ${load} kg × ${reps}`;
      })()
    : "Finish workout";

  const logSub =
    restRemaining != null && restRemaining > 0
      ? "Ready early? Logging ends the rest."
      : `Tap kg or reps to change · rest ${nextRestSeconds} s starts after`;

  const nextAfterRest =
    currentSet && exercise
      ? (() => {
          const nextPending = exercise.sets.find(
            (s) => s.status === "pending" && s.order > currentSet.order,
          );
          if (nextPending) {
            return `Next: ${exercise.name}, set ${nextPending.order}`;
          }
          const nextEx = execution.exercises[currentExerciseIndex + 1];
          if (nextEx) {
            const first = nextEx.sets.find((s) => s.status === "pending");
            return `Next: ${nextEx.name}${first ? `, set ${first.order}` : ""}`;
          }
          return "Next: finish workout";
        })()
      : "";

  const logFooter = currentSet ? (
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
        <Check color={colors.white} size={24} strokeWidth={2.6} />
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
    <Screen chrome="app" title={title} showHeader={false} footer={logFooter}>
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
              <Play color={colors.deepNavy} size={22} />
            ) : (
              <Pause color={colors.deepNavy} size={22} />
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
                {nextAfterRest ? (
                  <Text style={styles.restNx}>{nextAfterRest}</Text>
                ) : null}
              </View>
              <View style={styles.restCtl}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="15 seconds less"
                onPress={() =>
                  setRestRemaining((v) => Math.max(0, (v ?? 0) - 15))
                }
                style={styles.restCtlBtn}
              >
                <Text style={styles.restCtlText}>−15</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="15 seconds more"
                onPress={() => {
                  setRestRemaining((v) => (v ?? 0) + 15);
                  setRestTotal((v) => v + 15);
                }}
                style={styles.restCtlBtn}
              >
                <Text style={styles.restCtlText}>+15</Text>
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
            <View
              style={[styles.restBar, { width: `${Math.round(restProgress * 100)}%` }]}
            />
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
                    <Check color={colors.white} size={18} strokeWidth={2.6} />
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
                    <CirclePlay color={colors.indigo} size={22} />
                  </Pressable>
                ) : null}
                {!isCurrent ? (
                  <ChevronDown color={colors.midGrey} size={20} />
                ) : (
                  <ChevronDown
                    color={colors.midGrey}
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
                  <View style={styles.stabTh}>
                    <Text style={styles.thCell}>Set</Text>
                    <Text style={[styles.thCell, styles.thWide]}>Previous</Text>
                    <Text style={[styles.thCell, styles.thCenter]}>kg</Text>
                    <Text style={[styles.thCell, styles.thCenter]}>Reps</Text>
                    <Text style={styles.thCell} />
                  </View>
                  {ex.sets.map((set) => {
                    const isNow = currentSet?.id === set.id;
                    const isOk = set.status !== "pending";
                    const draft = draftForSet(set, drafts);
                    const rowModified =
                      isNow && isDraftModified(set, draft);
                    return (
                      <View
                        key={set.id}
                        style={[
                          styles.stabTr,
                          isOk ? styles.trOk : null,
                          isNow ? styles.trNow : null,
                          !isOk && !isNow ? styles.trPend : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stabNo,
                            isNow ? styles.stabNoNow : null,
                          ]}
                        >
                          {set.order}
                        </Text>
                        <Text style={styles.stabPrev} numberOfLines={1}>
                          {previousSetLabel(ex, set, previousByKey)}
                        </Text>
                        {isNow ? (
                          <View style={styles.valEditWrap}>
                            <TextInput
                              style={styles.valInput}
                              value={
                                draft.load ||
                                displayLoad(set.prescribedLoadLabel)
                              }
                              onChangeText={(t) =>
                                updateDraft(set.id, { load: t })
                              }
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                            />
                            {rowModified ? (
                              <Text style={styles.modBadge}>EDITED</Text>
                            ) : null}
                          </View>
                        ) : (
                          <Text style={styles.valStatic}>
                            {displayLoad(
                              isOk
                                ? set.actualLoadLabel ?? set.prescribedLoadLabel
                                : set.prescribedLoadLabel,
                            )}
                          </Text>
                        )}
                        {isNow ? (
                          <TextInput
                            style={[styles.valInput, styles.valReps]}
                            value={draft.reps}
                            onChangeText={(t) =>
                              updateDraft(set.id, { reps: t })
                            }
                            keyboardType="number-pad"
                            selectTextOnFocus
                          />
                        ) : (
                          <Text style={styles.valStatic}>
                            {isOk
                              ? set.actualReps ?? set.prescribedReps ?? "—"
                              : set.prescribedReps ?? "—"}
                          </Text>
                        )}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            isOk
                              ? `Set ${set.order} logged`
                              : `Log set ${set.order}`
                          }
                          disabled={
                            !isNow ||
                            execution.status === "paused" ||
                            set.status !== "pending"
                          }
                          onPress={() => completeSet(set.id)}
                          style={[
                            styles.ck,
                            isOk ? styles.ckOk : null,
                            isNow ? styles.ckNow : null,
                          ]}
                        >
                          <Check
                            color={isOk || isNow ? colors.white : colors.midGrey}
                            size={22}
                            strokeWidth={2.6}
                          />
                        </Pressable>
                      </View>
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
                <ChevronDown color={colors.midGrey} size={20} />
              </View>
            </View>
          );
        })}

        <View style={{ height: LOGBAR_HEIGHT + spacing.xl }} />
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

const styles = StyleSheet.create({
  awl: {
    marginHorizontal: -spacing.xs,
  },
  hdr: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    height: 52,
    marginBottom: spacing.sm,
  },
  ibtnFill: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
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
    color: colors.deepNavy,
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
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  recDot: {
    backgroundColor: colors.indigo,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  fin: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
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
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "700",
  },
  pauseBanner: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: radii.card,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  pauseText: {
    color: colors.deepNavy,
    fontWeight: "700",
  },
  restband: {
    backgroundColor: colors.deepNavy,
    borderRadius: 20,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
    overflow: "hidden",
    paddingBottom: 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    position: "relative",
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
    paddingRight: spacing.sm,
  },
  restK: {
    color: "#B8A8FF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  restV: {
    color: colors.white,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  restVs: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontWeight: "600",
  },
  restNx: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    marginTop: 2,
  },
  restCtl: {
    flexDirection: "row",
    flexShrink: 0,
    gap: 6,
  },
  restCtlBtn: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    minWidth: 52,
    paddingHorizontal: 10,
  },
  restCtlText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  restBar: {
    backgroundColor: "#B8A8FF",
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    bottom: 0,
    height: 4,
    left: 0,
    position: "absolute",
  },
  acc: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#0F0C28",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  accGap: {
    marginTop: 10,
  },
  accDone: {},
  accCur: {
    borderColor: "#CFC6FF",
    borderWidth: 1.5,
  },
  ah: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  exn: {
    alignItems: "center",
    backgroundColor: "#F6F4FF",
    borderColor: "#E6E0FF",
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  exnDone: {
    backgroundColor: colors.deepNavy,
    borderColor: colors.deepNavy,
  },
  exnNum: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "700",
  },
  ahTx: {
    flex: 1,
    minWidth: 0,
  },
  exName: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  exNameDone: {
    color: colors.darkGrey,
  },
  exSub: {
    color: colors.midGrey,
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
    paddingHorizontal: spacing.md,
  },
  note2Text: {
    color: colors.indigo,
    fontSize: 14,
    lineHeight: 20,
  },
  note2Bold: {
    fontWeight: "700",
  },
  stab: {
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  stabTh: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  thCell: {
    color: colors.midGrey,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    width: 34,
  },
  thWide: {
    flex: 1,
    width: undefined,
  },
  thCenter: {
    textAlign: "center",
    width: 76,
  },
  stabTr: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    minHeight: 56,
    paddingHorizontal: 6,
  },
  trOk: {
    backgroundColor: "#F9F7FF",
  },
  trNow: {
    backgroundColor: colors.white,
    borderColor: colors.indigo,
    borderWidth: 1.5,
  },
  trPend: {},
  stabNo: {
    color: colors.midGrey,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    width: 34,
  },
  stabNoNow: {
    color: colors.indigo,
  },
  stabPrev: {
    color: colors.midGrey,
    flex: 1,
    fontSize: 14,
  },
  valStatic: {
    color: colors.midGrey,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    width: 76,
  },
  valEditWrap: {
    alignItems: "center",
    width: 76,
  },
  valInput: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 12,
    borderWidth: 1.5,
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
    height: 44,
    textAlign: "center",
    width: 76,
  },
  valReps: {
    fontSize: 17,
    width: 64,
  },
  modBadge: {
    color: colors.indigo,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  ck: {
    alignItems: "center",
    borderColor: colors.lightGrey,
    borderRadius: 14,
    borderWidth: 1.5,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  ckOk: {
    backgroundColor: colors.deepNavy,
    borderColor: colors.deepNavy,
  },
  ckNow: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  sh: {
    marginBottom: 10,
    marginTop: 18,
    paddingHorizontal: 4,
  },
  shTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  shCnt: {
    color: colors.midGrey,
    fontSize: 15,
    fontWeight: "600",
  },
  logbar: {
    backgroundColor: "rgba(246,245,251,0.94)",
    borderTopColor: colors.lightGrey,
    borderTopWidth: 1,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
  },
  logBtn: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 20,
    flexDirection: "row",
    gap: spacing.sm,
    height: LOGBAR_HEIGHT,
    justifyContent: "center",
  },
  logBtnDisabled: {
    opacity: 0.5,
  },
  logBtnText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
  },
  logSub: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  rpeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  rpeChip: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: radii.control,
    height: TARGET,
    justifyContent: "center",
    minWidth: TARGET,
  },
  rpeChipActive: {
    backgroundColor: colors.indigo,
  },
  rpeChipText: {
    color: colors.deepNavy,
    fontWeight: "600",
  },
  rpeChipTextActive: {
    color: colors.white,
    fontWeight: "700",
  },
  rpeAnchors: {
    color: colors.midGrey,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  guardCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.md,
    padding: spacing.xl,
  },
  guardTitle: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "700",
  },
  guardBody: {
    color: colors.midGrey,
    fontSize: 15,
  },
});
