import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Pause, Play } from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { WorkoutExecution } from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { ErrorBanner } from "../components/ErrorBanner";
import { OverflowMenu } from "../components/OverflowMenu";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";

const DEFAULT_REST_SECONDS = 90;
const TARGET = 44;
const DONE_SIZE = 72;

const RPE_ANCHORS: Record<number, string> = {
  1: "Very easy",
  5: "Hard",
  10: "Max effort",
};

function exerciseComplete(execution: WorkoutExecution, exerciseIndex: number) {
  const exercise = execution.exercises[exerciseIndex];
  if (!exercise) return false;
  return exercise.sets.every((set) => set.status !== "pending");
}

function firstPendingSetIndex(
  execution: WorkoutExecution,
  exerciseIndex: number,
) {
  const exercise = execution.exercises[exerciseIndex];
  if (!exercise) return -1;
  return exercise.sets.findIndex((set) => set.status === "pending");
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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
          actualReps:
            actualReps ?? set.prescribedReps,
          actualLoadLabel:
            actualLoadLabel ?? set.prescribedLoadLabel,
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

function applySetSkipLocally(
  execution: WorkoutExecution,
  setId: string,
): WorkoutExecution {
  const now = new Date().toISOString();
  return {
    ...execution,
    updatedAt: now,
    exercises: execution.exercises.map((exercise) => {
      const sets = exercise.sets.map((set) =>
        set.id === setId
          ? {
              ...set,
              status: "skipped" as const,
              completedAt: now,
              updatedAt: now,
            }
          : set,
      );
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
    // Optional peer — skip quietly when the package isn't installed.
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

export function ActiveWorkoutScreen({
  execution,
  onChange,
  onFinished,
  onExit,
  sessionName,
  restSecondsBySetTargetId = {},
  onAskCoach,
}: {
  execution: WorkoutExecution;
  onChange: (execution: WorkoutExecution) => void;
  onFinished: (execution: WorkoutExecution) => void;
  onExit: () => void;
  sessionName?: string;
  restSecondsBySetTargetId?: Record<string, number>;
  onAskCoach?: () => void;
}) {
  const { api } = useAuth();
  const sync = useSyncEngine();
  const [error, setError] = useState<string | null>(null);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [sessionRpe, setSessionRpe] = useState<number | null>(
    execution.sessionRpe,
  );
  const [repsInput, setRepsInput] = useState("");
  const [loadInput, setLoadInput] = useState("");
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(DEFAULT_REST_SECONDS);
  const [elapsedSec, setElapsedSec] = useState(0);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);
  const tickBaseRef = useRef(Date.parse(execution.startedAt));

  const emptyOrDone =
    execution.exercises.length === 0 ||
    execution.status === "completed" ||
    execution.status === "skipped" ||
    execution.status === "modified";

  const exercise = execution.exercises[exerciseIndex] ?? null;
  const setIndex = exercise
    ? firstPendingSetIndex(execution, exerciseIndex)
    : -1;
  const currentSet =
    exercise && setIndex >= 0 ? exercise.sets[setIndex] : null;

  const setsTotal = execution.exercises.reduce(
    (count, ex) => count + ex.sets.length,
    0,
  );
  const pendingSets = execution.exercises.reduce(
    (count, ex) =>
      count + ex.sets.filter((set) => set.status === "pending").length,
    0,
  );
  const allSetsDone = setsTotal > 0 && pendingSets === 0;

  const title = sessionName?.trim() || "Workout";

  useEffect(() => {
    const deactivate = tryActivateKeepAwake();
    return () => {
      deactivate?.();
    };
  }, []);

  useEffect(() => {
    if (!currentSet) return;
    setRepsInput(
      currentSet.prescribedReps != null
        ? String(currentSet.prescribedReps)
        : "",
    );
    setLoadInput(currentSet.prescribedLoadLabel ?? "");
  }, [
    currentSet?.id,
    currentSet?.prescribedLoadLabel,
    currentSet?.prescribedReps,
  ]);

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

  const modifiedCaption = useMemo(() => {
    if (!currentSet) return false;
    const reps =
      repsInput.trim() === ""
        ? null
        : Number.parseInt(repsInput.trim(), 10);
    const load = loadInput.trim();
    const repsChanged =
      reps != null &&
      Number.isFinite(reps) &&
      currentSet.prescribedReps != null &&
      reps !== currentSet.prescribedReps;
    const loadChanged =
      load !== "" &&
      (currentSet.prescribedLoadLabel ?? "") !== load;
    return repsChanged || loadChanged;
  }, [currentSet, loadInput, repsInput]);

  function startRestForSet(setTargetId: string) {
    const prescribed = restSecondsBySetTargetId[setTargetId];
    const seconds =
      prescribed != null && prescribed > 0
        ? prescribed
        : DEFAULT_REST_SECONDS;
    setRestTotal(seconds);
    setRestRemaining(seconds);
  }

  function goToExercise(next: number) {
    if (next < 0 || next >= execution.exercises.length) return;
    setExerciseIndex(next);
  }

  function advanceAfterSet(next: WorkoutExecution, currentExerciseIdx: number) {
    if (firstPendingSetIndex(next, currentExerciseIdx) < 0) {
      const nextEx = next.exercises.findIndex(
        (ex, idx) =>
          idx > currentExerciseIdx &&
          ex.sets.some((set) => set.status === "pending"),
      );
      if (nextEx >= 0) setExerciseIndex(nextEx);
    }
  }

  function completeCurrentSet() {
    if (!currentSet || execution.status === "paused") return;
    const repsRaw = repsInput.trim();
    const loadRaw = loadInput.trim();
    const actualReps =
      repsRaw === "" ? null : Number.parseInt(repsRaw, 10);
    const actualLoadLabel = loadRaw === "" ? null : loadRaw;

    const optimistic = applySetCompleteLocally(
      execution,
      currentSet.id,
      actualReps != null && Number.isFinite(actualReps) ? actualReps : null,
      actualLoadLabel,
    );
    onChange(optimistic);
    startRestForSet(currentSet.setTargetId);
    advanceAfterSet(optimistic, exerciseIndex);
    setError(null);

    void (async () => {
      try {
        await enqueueAndPush(sync, {
          recordId: execution.id,
          operation: "workout.complete_set",
          expectedServerVersion: execution.recordVersion,
          payload: {
            executionId: execution.id,
            setExecutionId: currentSet.id,
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

  function skipCurrentSet() {
    if (!currentSet || execution.status === "paused") return;
    const optimistic = applySetSkipLocally(execution, currentSet.id);
    onChange(optimistic);
    advanceAfterSet(optimistic, exerciseIndex);
    setError(null);

    void (async () => {
      try {
        await api.skipWorkoutSet(execution.id, currentSet.id);
      } catch {
        // Offline: local skip stands; sync path for skip-set is not in outbox yet.
        setError("Saved on phone · will sync when online.");
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

  const restProgress =
    restRemaining != null && restTotal > 0
      ? Math.max(0, Math.min(1, restRemaining / restTotal))
      : 0;

  return (
    <Screen chrome="app" title={title} showHeader={false}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.elapsed}>{formatElapsed(elapsedSec)}</Text>
        </View>
        <View style={styles.headerActions}>
          {execution.status === "paused" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume"
              onPress={resumeSession}
              style={styles.iconBtn}
            >
              <Play color={colors.indigo} size={22} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pause"
              onPress={pauseSession}
              style={styles.iconBtn}
            >
              <Pause color={colors.indigo} size={22} />
            </Pressable>
          )}
          <OverflowMenu
            label="Workout actions"
            items={[
              {
                id: "finish",
                label: "Finish early",
                onSelect: () => setFinishOpen(true),
              },
              ...(onAskCoach
                ? [
                    {
                      id: "ask",
                      label: "Ask coach",
                      onSelect: onAskCoach,
                    },
                  ]
                : []),
            ]}
          />
        </View>
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      {execution.status === "paused" ? (
        <View style={styles.pauseBanner}>
          <Text style={styles.pauseText}>Paused</Text>
          <PrimaryButton label="Resume" variant="tinted" onPress={resumeSession} />
        </View>
      ) : null}

      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous exercise"
          disabled={exerciseIndex === 0}
          onPress={() => goToExercise(exerciseIndex - 1)}
          style={styles.navBtn}
        >
          <Text style={styles.navLabel}>‹ Prev</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exercise overview"
          onPress={() => setOverviewOpen(true)}
          style={styles.navBtn}
        >
          <Text style={styles.navLabel}>Overview</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next exercise"
          disabled={exerciseIndex >= execution.exercises.length - 1}
          onPress={() => goToExercise(exerciseIndex + 1)}
          style={styles.navBtn}
        >
          <Text style={styles.navLabel}>Next ›</Text>
        </Pressable>
      </View>

      {exercise ? (
        <View style={styles.currentCard}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          {exercise.sets.map((set, idx) => {
            const isCurrent = currentSet?.id === set.id;
            const prescribed = [
              set.prescribedReps != null ? `${set.prescribedReps} reps` : null,
              set.prescribedLoadLabel,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <View
                key={set.id}
                style={[styles.setRow, isCurrent ? styles.setRowActive : null]}
              >
                <View style={styles.setMain}>
                  <Text style={styles.setOrder}>Set {set.order}</Text>
                  <Text style={styles.setPrescribed}>{prescribed || "—"}</Text>
                  {set.status !== "pending" ? (
                    <Text style={styles.setStatus}>
                      {set.status === "skipped"
                        ? "Skipped"
                        : set.status === "modified"
                          ? "Modified"
                          : "Done"}
                    </Text>
                  ) : null}
                </View>
                {isCurrent ? (
                  <OverflowMenu
                    label="Set actions"
                    items={[
                      {
                        id: "skip-set",
                        label: "Skip set",
                        onSelect: skipCurrentSet,
                        destructive: true,
                      },
                    ]}
                  />
                ) : null}
                {isCurrent ? (
                  <View style={styles.steppers}>
                    <View style={styles.stepper}>
                      <Text style={styles.stepperLabel}>Reps</Text>
                      <View style={styles.stepperControls}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Decrease reps"
                          style={styles.stepBtn}
                          onPress={() => {
                            const n = Number.parseInt(repsInput || "0", 10);
                            setRepsInput(String(Math.max(1, (Number.isFinite(n) ? n : 1) - 1)));
                          }}
                        >
                          <Text style={styles.stepBtnLabel}>−</Text>
                        </Pressable>
                        <Text style={styles.stepValue}>{repsInput || "—"}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Increase reps"
                          style={styles.stepBtn}
                          onPress={() => {
                            const n = Number.parseInt(repsInput || "0", 10);
                            setRepsInput(String((Number.isFinite(n) ? n : 0) + 1));
                          }}
                        >
                          <Text style={styles.stepBtnLabel}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.stepper}>
                      <Text style={styles.stepperLabel}>Load</Text>
                      <View style={styles.stepperControls}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Decrease load"
                          style={styles.stepBtn}
                          onPress={() => {
                            const match = loadInput.match(/([\d.]+)/);
                            if (!match) return;
                            const n = Number.parseFloat(match[1]!);
                            if (!Number.isFinite(n)) return;
                            const next = Math.max(0, n - 2.5);
                            setLoadInput(
                              loadInput.replace(match[1]!, String(next)),
                            );
                          }}
                        >
                          <Text style={styles.stepBtnLabel}>−</Text>
                        </Pressable>
                        <Text style={styles.stepValue}>{loadInput || "—"}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Increase load"
                          style={styles.stepBtn}
                          onPress={() => {
                            const match = loadInput.match(/([\d.]+)/);
                            if (!match) {
                              setLoadInput("2.5 kg");
                              return;
                            }
                            const n = Number.parseFloat(match[1]!);
                            if (!Number.isFinite(n)) return;
                            const next = n + 2.5;
                            setLoadInput(
                              loadInput.replace(match[1]!, String(next)),
                            );
                          }}
                        >
                          <Text style={styles.stepBtnLabel}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                    {modifiedCaption ? (
                      <Text style={styles.modified}>Modified</Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Done"
                      disabled={execution.status === "paused"}
                      onPress={completeCurrentSet}
                      style={styles.doneBtn}
                    >
                      <Text style={styles.doneLabel}>✓ Done</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {restRemaining != null && restRemaining > 0 ? (
        <View style={styles.restCard}>
          <Text style={styles.restTitle}>Rest</Text>
          <View style={styles.restRing}>
            <View
              style={[
                styles.restRingFill,
                { width: `${Math.round(restProgress * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.restTimer}>{restRemaining}s</Text>
          <View style={styles.restActions}>
            <PrimaryButton
              label="−15"
              variant="secondary"
              onPress={() => {
                setRestRemaining((value) => Math.max(0, (value ?? 0) - 15));
              }}
            />
            <PrimaryButton
              label="+15"
              variant="secondary"
              onPress={() => {
                setRestRemaining((value) => (value ?? 0) + 15);
                setRestTotal((value) => value + 15);
              }}
            />
            <PrimaryButton
              label="Skip"
              variant="ghost"
              onPress={() => setRestRemaining(null)}
            />
          </View>
        </View>
      ) : null}

      {allSetsDone ? (
        <View style={styles.currentCard}>
          <Text style={styles.eyebrow}>How hard was that?</Text>
          <Text style={styles.rpeHint}>Session RPE</Text>
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
          <Text style={styles.rpeAnchors}>1 · Very easy … 10 · Max effort</Text>
          <PrimaryButton
            label="Finish workout"
            onPress={() => finishWorkout(true)}
          />
        </View>
      ) : !currentSet ? (
        <Text style={styles.muted}>
          No pending sets on this exercise. Use Next or open the overview.
        </Text>
      ) : null}

      {!allSetsDone ? (
        <PrimaryButton
          label="Finish workout"
          variant="secondary"
          onPress={() => setFinishOpen(true)}
        />
      ) : null}

      <Modal
        visible={overviewOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setOverviewOpen(false)}
      >
        <Pressable
          style={styles.sheetScrim}
          onPress={() => setOverviewOpen(false)}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Exercises</Text>
          <ScrollView style={styles.sheetList}>
            {execution.exercises.map((ex, idx) => (
              <Pressable
                key={ex.id}
                style={styles.sheetRow}
                onPress={() => {
                  setExerciseIndex(idx);
                  setOverviewOpen(false);
                }}
              >
                <Text style={styles.sheetCheck}>
                  {exerciseComplete(execution, idx) ? "✓" : "○"}
                </Text>
                <Text style={styles.sheetName}>{ex.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <PrimaryButton
            label="Close"
            variant="ghost"
            onPress={() => setOverviewOpen(false)}
          />
        </View>
      </Modal>

      <BottomSheet
        visible={finishOpen && !allSetsDone}
        title="Finish early?"
        subtitle={
          pendingSets > 0
            ? `${pendingSets} sets not logged. Finish anyway?`
            : undefined
        }
        onDismiss={() => setFinishOpen(false)}
      >
        <View style={styles.rpeRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`RPE ${value}`}
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
        <Text style={styles.rpeAnchors}>1 · Very easy … 10 · Max effort</Text>
        <PrimaryButton
          label="Finish anyway"
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
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerMain: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: colors.deepNavy,
    fontSize: 22,
    fontWeight: "700",
  },
  elapsed: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  iconBtn: {
    alignItems: "center",
    height: TARGET,
    justifyContent: "center",
    width: TARGET,
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
  navRow: {
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  navBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: TARGET,
    minWidth: TARGET,
    paddingHorizontal: spacing.sm,
  },
  navLabel: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
  },
  currentCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  exerciseName: {
    color: colors.deepNavy,
    fontSize: 24,
    fontWeight: "700",
  },
  setRow: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  setRowActive: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.control,
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  setMain: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  setOrder: {
    color: colors.deepNavy,
    fontWeight: "700",
  },
  setPrescribed: {
    color: colors.darkGrey,
    fontSize: 15,
  },
  setStatus: {
    color: colors.midGrey,
    fontSize: 13,
  },
  steppers: {
    gap: spacing.sm,
  },
  stepper: {
    gap: spacing.xs,
  },
  stepperLabel: {
    color: colors.midGrey,
    fontSize: 13,
  },
  stepperControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  stepBtn: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.control,
    borderWidth: 1,
    height: TARGET,
    justifyContent: "center",
    width: TARGET,
  },
  stepBtnLabel: {
    color: colors.indigo,
    fontSize: 22,
    fontWeight: "700",
  },
  stepValue: {
    color: colors.nearBlack,
    fontSize: 20,
    fontWeight: "700",
    minWidth: 56,
    textAlign: "center",
  },
  modified: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  doneBtn: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.indigo,
    borderRadius: DONE_SIZE / 2,
    height: DONE_SIZE,
    justifyContent: "center",
    marginTop: spacing.sm,
    minWidth: DONE_SIZE + 48,
    paddingHorizontal: spacing.lg,
  },
  doneLabel: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  restCard: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: radii.card,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  restTitle: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
  },
  restRing: {
    backgroundColor: colors.lightGrey,
    borderRadius: 4,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
  restRingFill: {
    backgroundColor: colors.indigo,
    height: "100%",
  },
  restTimer: {
    color: colors.indigo,
    fontSize: 36,
    fontWeight: "700",
  },
  restActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "center",
  },
  rpeHint: {
    color: colors.darkGrey,
    fontSize: 16,
    fontWeight: "600",
  },
  rpeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
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
  },
  pendingWarn: {
    color: colors.darkGrey,
    fontSize: 14,
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
  sheetScrim: {
    backgroundColor: "rgba(0,0,0,0.35)",
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    gap: spacing.md,
    maxHeight: "55%",
    padding: spacing.lg,
  },
  sheetTitle: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
  },
  sheetList: {
    maxHeight: 280,
  },
  sheetRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: TARGET,
    paddingVertical: spacing.sm,
  },
  sheetCheck: {
    color: colors.indigo,
    fontSize: 16,
    width: 24,
  },
  sheetName: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
});
