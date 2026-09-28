import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { ActiveWorkoutScreen } from "./ActiveWorkoutScreen";
import { WorkoutSummaryScreen } from "./WorkoutSummaryScreen";

function localDateInTimezone(timeZone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function statusLabel(status: WorkoutAssignment["status"]): string {
  switch (status) {
    case "assigned":
      return "Assigned";
    case "in_progress":
      return "In progress";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "modified":
      return "Modified";
    case "skipped":
      return "Skipped";
    case "missed":
      return "Missed";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function WorkoutTab({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeExecution, setActiveExecution] =
    useState<WorkoutExecution | null>(null);
  const [summaryExecution, setSummaryExecution] =
    useState<WorkoutExecution | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const rangeEnd = useMemo(() => addDays(today, 7), [today]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.generateWorkoutAssignments(
        relationship.id,
        { fromDate: today, toDate: rangeEnd },
        createIdempotencyKey(),
      );
      const listed = await api.listWorkoutAssignments(relationship.id, {
        fromDate: today,
        toDate: rangeEnd,
      });
      setAssignments(listed.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load workouts.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, today, rangeEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const todayAssignment = assignments.find((item) => item.localDate === today);
  const upcoming = assignments.filter((item) => item.localDate !== today);

  if (summaryExecution) {
    return (
      <WorkoutSummaryScreen
        execution={summaryExecution}
        onDone={() => {
          setSummaryExecution(null);
          void load();
        }}
      />
    );
  }

  if (activeExecution) {
    return (
      <ActiveWorkoutScreen
        execution={activeExecution}
        onChange={setActiveExecution}
        onFinished={(execution) => {
          setActiveExecution(null);
          setSummaryExecution(execution);
        }}
        onExit={() => {
          setActiveExecution(null);
          void load();
        }}
      />
    );
  }

  return (
    <Screen
      chrome="app"
      title="Workout"
      subtitle={today}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <Text style={styles.muted}>Loading assignments…</Text>
      ) : (
        <View style={styles.stack}>
          <View style={styles.banner}>
            {todayAssignment ? (
              <>
                <Text style={styles.kicker}>Today</Text>
                <Text style={styles.bannerTitle}>
                  {todayAssignment.workoutDayName}
                </Text>
                <Text style={styles.bannerBody}>
                  {statusLabel(todayAssignment.status)} ·{" "}
                  {todayAssignment.workoutDay.exercises.length} exercises
                </Text>
                {todayAssignment.workoutDay.exercises.map((exercise) => (
                  <View key={exercise.id} style={styles.exerciseRow}>
                    <Text style={styles.rowTitle}>{exercise.name}</Text>
                    <Text style={styles.rowMeta}>
                      {exercise.setTargets.length} sets
                      {exercise.setTargets[0]?.reps
                        ? ` · ${exercise.setTargets[0].reps} reps`
                        : ""}
                      {exercise.setTargets[0]?.loadLabel
                        ? ` · ${exercise.setTargets[0].loadLabel}`
                        : ""}
                    </Text>
                  </View>
                ))}
                {todayAssignment.status === "assigned" ||
                todayAssignment.status === "missed" ? (
                  <PrimaryButton
                    label="Start Workout"
                    loading={actingId === todayAssignment.id}
                    onPress={() => {
                      void (async () => {
                        setActingId(todayAssignment.id);
                        setError(null);
                        try {
                          await enqueueAndPush(sync, {
                            recordId: todayAssignment.id,
                            operation: "workout.start",
                            payload: { assignmentId: todayAssignment.id },
                          });
                          const refreshed = await api.getWorkoutAssignment(
                            todayAssignment.id,
                          );
                          if (!refreshed.execution) {
                            throw new Error("Workout did not start.");
                          }
                          const execution = await api.getWorkoutExecution(
                            refreshed.execution.id,
                          );
                          setActiveExecution(execution);
                        } catch (err) {
                          setError(
                            err instanceof ApiClientError
                              ? err.message
                              : "Could not start workout.",
                          );
                        } finally {
                          setActingId(null);
                        }
                      })();
                    }}
                  />
                ) : null}
                {todayAssignment.execution &&
                (todayAssignment.status === "in_progress" ||
                  todayAssignment.status === "paused") ? (
                  <PrimaryButton
                    label="Continue Workout"
                    onPress={() => {
                      void (async () => {
                        setError(null);
                        try {
                          const execution = await api.getWorkoutExecution(
                            todayAssignment.execution!.id,
                          );
                          setActiveExecution(execution);
                        } catch (err) {
                          setError(
                            err instanceof ApiClientError
                              ? err.message
                              : "Could not open workout.",
                          );
                        }
                      })();
                    }}
                  />
                ) : null}
                {todayAssignment.status === "assigned" ? (
                  <PrimaryButton
                    label="Skip workout"
                    variant="ghost"
                    onPress={() => {
                      void (async () => {
                        setActingId(`skip-${todayAssignment.id}`);
                        setError(null);
                        try {
                          await enqueueAndPush(sync, {
                            recordId: todayAssignment.id,
                            operation: "workout.skip",
                            payload: { assignmentId: todayAssignment.id },
                          });
                          await load();
                        } catch (err) {
                          setError(
                            err instanceof ApiClientError
                              ? err.message
                              : "Could not skip workout.",
                          );
                        } finally {
                          setActingId(null);
                        }
                      })();
                    }}
                  />
                ) : null}
              </>
            ) : (
              <Text style={styles.bannerBody}>
                No workout assigned for today. Upcoming sessions appear below
                when your plan and schedule place them.
              </Text>
            )}
          </View>

          <Text style={styles.sectionTitle}>Upcoming</Text>
          {upcoming.length === 0 ? (
            <Text style={styles.muted}>No upcoming assignments in range.</Text>
          ) : (
            upcoming.map((item) => (
              <Pressable key={item.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{item.workoutDayName}</Text>
                  <Text style={styles.rowMeta}>
                    {item.localDate} · {statusLabel(item.status)}
                  </Text>
                </View>
              </Pressable>
            ))
          )}

          <PrimaryButton
            label="Refresh"
            variant="secondary"
            onPress={() => {
              void load();
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  banner: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  kicker: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
  },
  exerciseRow: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  rowMain: {
    gap: spacing.xs,
  },
  rowTitle: {
    color: colors.nearBlack,
    fontSize: 16,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 13,
  },
});
