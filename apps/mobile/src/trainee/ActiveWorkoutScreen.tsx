import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { WorkoutExecution } from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";

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
  const [sessionRpe, setSessionRpe] = useState(
    execution.sessionRpe != null ? String(execution.sessionRpe) : "",
  );

  const current = useMemo(() => {
    for (const exercise of execution.exercises) {
      for (const set of exercise.sets) {
        if (set.status === "pending") {
          return { exercise, set };
        }
      }
    }
    return null;
  }, [execution]);

  const setsDone = execution.exercises.reduce(
    (count, exercise) =>
      count + exercise.sets.filter((set) => set.status !== "pending").length,
    0,
  );
  const setsTotal = execution.exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0,
  );

  return (
    <Screen
      chrome="app"
      title={current ? current.exercise.name : "Workout"}
      subtitle={
        execution.status === "paused"
          ? "Paused — resume when you are ready."
          : `Set ${setsDone + (current ? 1 : 0)} of ${setsTotal}`
      }
    >
      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.progress}>
        <Text style={styles.progressLabel}>
          Sets {setsDone}/{setsTotal}
        </Text>
        <Text style={styles.status}>{execution.status.replace(/_/g, " ")}</Text>
      </View>

      {current ? (
        <View style={styles.currentCard}>
          <Text style={styles.eyebrow}>Current set</Text>
          <Text style={styles.target}>
            Set {current.set.order}
            {current.set.prescribedReps != null
              ? ` · ${current.set.prescribedReps} reps`
              : ""}
            {current.set.prescribedLoadLabel
              ? ` · ${current.set.prescribedLoadLabel}`
              : ""}
          </Text>
          <PrimaryButton
            label="Done"
            loading={acting}
            disabled={execution.status === "paused"}
            onPress={() => {
              void (async () => {
                setActing(true);
                setError(null);
                try {
                  await enqueueAndPush(sync, {
                    recordId: execution.id,
                    operation: "workout.complete_set",
                    expectedServerVersion: execution.recordVersion,
                    payload: {
                      executionId: execution.id,
                      setExecutionId: current.set.id,
                      expectedVersion: execution.recordVersion,
                      body: {},
                    },
                  });
                  const next = await api.getWorkoutExecution(execution.id);
                  onChange(next);
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
                    current.set.id,
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
      ) : (
        <View style={styles.currentCard}>
          <Text style={styles.eyebrow}>Session wrap-up</Text>
          <Text style={styles.exerciseName}>All sets recorded</Text>
          {execution.requireSessionRpe ? (
            <>
              <Text style={styles.target}>Session RPE (required)</Text>
              <TextInput
                accessibilityLabel="Session RPE"
                keyboardType="decimal-pad"
                value={sessionRpe}
                onChangeText={setSessionRpe}
                placeholder="1–10"
                style={styles.input}
              />
            </>
          ) : (
            <Text style={styles.target}>Optional session RPE</Text>
          )}
          {!execution.requireSessionRpe ? (
            <TextInput
              accessibilityLabel="Session RPE"
              keyboardType="decimal-pad"
              value={sessionRpe}
              onChangeText={setSessionRpe}
              placeholder="1–10 (optional)"
              style={styles.input}
            />
          ) : null}
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
      )}

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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  input: {
    borderWidth: 1,
    borderColor: colors.lightGrey,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.nearBlack,
    backgroundColor: colors.background,
  },
  actions: {
    gap: spacing.sm,
  },
});
