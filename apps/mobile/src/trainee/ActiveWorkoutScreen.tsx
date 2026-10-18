import { useEffect, useState } from "react";

const DEFAULT_REST_SECONDS = 90;
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import { labelFor } from "@fitbud/core";
import type { WorkoutExecution } from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";

function exerciseComplete(execution: WorkoutExecution, exerciseIndex: number) {
  const exercise = execution.exercises[exerciseIndex];
  if (!exercise) return false;
  return exercise.sets.every((set) => set.status !== "pending");
}

function firstPendingSetIndex(execution: WorkoutExecution, exerciseIndex: number) {
  const exercise = execution.exercises[exerciseIndex];
  if (!exercise) return -1;
  return exercise.sets.findIndex((set) => set.status === "pending");
}

export function ActiveWorkoutScreen({
  execution,
  onChange,
  onFinished,
  onExit,
}: {
  execution: WorkoutExecution;
  onChange: (execution: WorkoutExecution) => void;
  onFinished: (execution: WorkoutExecution) => void;
  onExit: () => void;
}) {
  const { api } = useAuth();
  const sync = useSyncEngine();
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [sessionRpe, setSessionRpe] = useState(
    execution.sessionRpe != null ? String(execution.sessionRpe) : "",
  );
  const [repsInput, setRepsInput] = useState("");
  const [loadInput, setLoadInput] = useState("");
  const [restRemaining, setRestRemaining] = useState<number | null>(null);

  const exercise = execution.exercises[exerciseIndex] ?? null;
  const setIndex = exercise ? firstPendingSetIndex(execution, exerciseIndex) : -1;
  const currentSet =
    exercise && setIndex >= 0 ? exercise.sets[setIndex] : null;

  const setsDone = execution.exercises.reduce(
    (count, ex) =>
      count + ex.sets.filter((set) => set.status !== "pending").length,
    0,
  );
  const setsTotal = execution.exercises.reduce(
    (count, ex) => count + ex.sets.length,
    0,
  );

  const allSetsDone = setsDone === setsTotal;

  useEffect(() => {
    if (!currentSet) return;
    setRepsInput(
      currentSet.prescribedReps != null ? String(currentSet.prescribedReps) : "",
    );
    setLoadInput(currentSet.prescribedLoadLabel ?? "");
  }, [currentSet?.id, currentSet?.prescribedLoadLabel, currentSet?.prescribedReps]);

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

  const sessionTitle =
    execution.exercises[0]?.name != null
      ? "Workout"
      : exercise?.name ?? "Workout";

  function goToExercise(next: number) {
    if (next < 0 || next >= execution.exercises.length) return;
    setExerciseIndex(next);
  }

  return (
    <Screen
      chrome="app"
      title={exercise?.name ?? sessionTitle}
      subtitle={
        execution.status === "paused"
          ? "Paused — resume when you are ready."
          : `Exercise ${exerciseIndex + 1} of ${execution.exercises.length} · Set ${setsDone + (currentSet ? 1 : 0)} of ${setsTotal}`
      }
    >
      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.navRow}>
        <PrimaryButton
          label="‹ Prev"
          variant="ghost"
          disabled={exerciseIndex === 0}
          onPress={() => goToExercise(exerciseIndex - 1)}
        />
        <PrimaryButton
          label="Overview"
          variant="secondary"
          onPress={() => setOverviewOpen(true)}
        />
        <PrimaryButton
          label="Next ›"
          variant="ghost"
          disabled={exerciseIndex >= execution.exercises.length - 1}
          onPress={() => goToExercise(exerciseIndex + 1)}
        />
      </View>

      <View style={styles.progress}>
        <Text style={styles.progressLabel}>
          Sets {setsDone}/{setsTotal}
        </Text>
        <Text style={styles.status}>
          {labelFor("workout_execution_status", execution.status)}
        </Text>
      </View>

      {currentSet && exercise ? (
        <View style={styles.currentCard}>
          <Text style={styles.eyebrow}>Current set</Text>
          <Text style={styles.target}>
            Set {currentSet.order}
            {currentSet.prescribedReps != null
              ? ` · ${currentSet.prescribedReps} reps`
              : ""}
            {currentSet.prescribedLoadLabel
              ? ` · ${currentSet.prescribedLoadLabel}`
              : ""}
          </Text>
          <View style={styles.stepperRow}>
            <Text style={styles.stepperLabel}>Reps</Text>
            <TextInput
              accessibilityLabel="Reps"
              keyboardType="number-pad"
              value={repsInput}
              onChangeText={setRepsInput}
              style={styles.input}
            />
          </View>
          <View style={styles.stepperRow}>
            <Text style={styles.stepperLabel}>Load</Text>
            <TextInput
              accessibilityLabel="Load"
              value={loadInput}
              onChangeText={setLoadInput}
              placeholder="kg or label"
              style={styles.input}
            />
          </View>
          <PrimaryButton
            label="✓ Done"
            loading={acting}
            disabled={execution.status === "paused"}
            onPress={() => {
              void (async () => {
                setActing(true);
                setError(null);
                try {
                  const reps = repsInput.trim();
                  const load = loadInput.trim();
                  await enqueueAndPush(sync, {
                    recordId: execution.id,
                    operation: "workout.complete_set",
                    expectedServerVersion: execution.recordVersion,
                    payload: {
                      executionId: execution.id,
                      setExecutionId: currentSet.id,
                      expectedVersion: execution.recordVersion,
                      body: {
                        executedReps:
                          reps === "" ? null : Number.parseInt(reps, 10),
                        executedLoadLabel: load === "" ? null : load,
                      },
                    },
                  });
                  const next = await api.getWorkoutExecution(execution.id);
                  onChange(next);
                  setRestRemaining(DEFAULT_REST_SECONDS);
                  if (firstPendingSetIndex(next, exerciseIndex) < 0) {
                    const nextEx = next.exercises.findIndex(
                      (ex, idx) =>
                        idx > exerciseIndex &&
                        ex.sets.some((set) => set.status === "pending"),
                    );
                    if (nextEx >= 0) setExerciseIndex(nextEx);
                  }
                } catch (err) {
                  setError(
                    err instanceof ApiClientError
                      ? err.message
                      : "Could not complete set.",
                  );
                } finally {
                  setActing(false);
                }
              })();
            }}
          />
          <PrimaryButton
            label="Skip set"
            variant="ghost"
            disabled={acting || execution.status === "paused"}
            onPress={() => {
              void (async () => {
                setActing(true);
                setError(null);
                try {
                  const next = await api.skipWorkoutSet(
                    execution.id,
                    currentSet.id,
                  );
                  onChange(next);
                } catch (err) {
                  setError(
                    err instanceof ApiClientError
                      ? err.message
                      : "Could not skip set.",
                  );
                } finally {
                  setActing(false);
                }
              })();
            }}
          />
        </View>
      ) : null}

      {restRemaining != null && restRemaining > 0 ? (
        <View style={styles.restCard}>
          <Text style={styles.restTitle}>Rest</Text>
          <Text style={styles.restTimer}>{restRemaining}s</Text>
          <View style={styles.restActions}>
            <PrimaryButton
              label="−15 s"
              variant="secondary"
              onPress={() => {
                setRestRemaining((value) =>
                  Math.max(0, (value ?? 0) - 15),
                );
              }}
            />
            <PrimaryButton
              label="+15 s"
              variant="secondary"
              onPress={() => {
                setRestRemaining((value) => (value ?? 0) + 15);
              }}
            />
            <PrimaryButton
              label="Skip rest"
              variant="ghost"
              onPress={() => setRestRemaining(null)}
            />
          </View>
        </View>
      ) : null}

      {allSetsDone ? (
        <View style={styles.currentCard}>
          <Text style={styles.eyebrow}>Session wrap-up</Text>
          <Text style={styles.exerciseName}>All sets recorded</Text>
          <Text style={styles.target}>Session RPE</Text>
          <View style={styles.rpeRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <Pressable
                key={value}
                style={[
                  styles.rpeChip,
                  sessionRpe === String(value) ? styles.rpeChipActive : null,
                ]}
                onPress={() => setSessionRpe(String(value))}
              >
                <Text
                  style={
                    sessionRpe === String(value)
                      ? styles.rpeChipTextActive
                      : styles.rpeChipText
                  }
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton
            label="Complete workout"
            loading={acting}
            onPress={() => {
              void (async () => {
                setActing(true);
                setError(null);
                try {
                  const rpeValue =
                    sessionRpe.trim() === ""
                      ? null
                      : Number(sessionRpe.trim());
                  await enqueueAndPush(sync, {
                    recordId: execution.id,
                    operation: "workout.complete",
                    expectedServerVersion: execution.recordVersion,
                    payload: {
                      executionId: execution.id,
                      expectedVersion: execution.recordVersion,
                      body: {
                        sessionRpe:
                          rpeValue != null && Number.isFinite(rpeValue)
                            ? rpeValue
                            : null,
                      },
                    },
                  });
                  const next = await api.getWorkoutExecution(execution.id);
                  onFinished(next);
                } catch (err) {
                  setError(
                    err instanceof ApiClientError
                      ? err.message
                      : "Could not complete workout.",
                  );
                } finally {
                  setActing(false);
                }
              })();
            }}
          />
        </View>
      ) : !currentSet ? (
        <Text style={styles.muted}>
          No pending sets on this exercise. Use Next or open the overview.
        </Text>
      ) : null}

      <View style={styles.actions}>
        {execution.status === "started" ? (
          <PrimaryButton
            label="Pause"
            variant="secondary"
            disabled={acting}
            onPress={() => {
              void (async () => {
                setActing(true);
                setError(null);
                try {
                  await enqueueAndPush(sync, {
                    recordId: execution.id,
                    operation: "workout.pause",
                    expectedServerVersion: execution.recordVersion,
                    payload: {
                      executionId: execution.id,
                      expectedVersion: execution.recordVersion,
                    },
                  });
                  onChange(await api.getWorkoutExecution(execution.id));
                } catch (err) {
                  setError(
                    err instanceof ApiClientError
                      ? err.message
                      : "Could not pause.",
                  );
                } finally {
                  setActing(false);
                }
              })();
            }}
          />
        ) : null}
        {execution.status === "paused" ? (
          <PrimaryButton
            label="Resume"
            variant="secondary"
            disabled={acting}
            onPress={() => {
              void (async () => {
                setActing(true);
                setError(null);
                try {
                  await enqueueAndPush(sync, {
                    recordId: execution.id,
                    operation: "workout.resume",
                    expectedServerVersion: execution.recordVersion,
                    payload: {
                      executionId: execution.id,
                      expectedVersion: execution.recordVersion,
                    },
                  });
                  onChange(await api.getWorkoutExecution(execution.id));
                } catch (err) {
                  setError(
                    err instanceof ApiClientError
                      ? err.message
                      : "Could not resume.",
                  );
                } finally {
                  setActing(false);
                }
              })();
            }}
          />
        ) : null}
        <PrimaryButton label="Exit" variant="ghost" onPress={onExit} />
      </View>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  progress: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  progressLabel: {
    color: colors.deepNavy,
    fontWeight: "600",
  },
  status: {
    color: colors.midGrey,
    textTransform: "capitalize",
  },
  currentCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  exerciseName: {
    color: colors.deepNavy,
    fontSize: 28,
    fontWeight: "700",
  },
  target: {
    color: colors.darkGrey,
    fontSize: 18,
    fontWeight: "600",
  },
  stepperRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  stepperLabel: {
    color: colors.midGrey,
    fontSize: 14,
    width: 48,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.lightGrey,
    borderRadius: 10,
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.nearBlack,
    backgroundColor: colors.background,
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
  rpeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  rpeChip: {
    backgroundColor: colors.paleLavender,
    borderRadius: 8,
    minHeight: 40,
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
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
  actions: {
    gap: spacing.sm,
  },
  sheetScrim: {
    backgroundColor: "rgba(0,0,0,0.35)",
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "55%",
    padding: spacing.lg,
    gap: spacing.md,
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
