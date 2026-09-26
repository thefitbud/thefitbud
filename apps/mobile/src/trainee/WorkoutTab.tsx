import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
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
      title="Workout"
      subtitle="Assigned workouts from your effective plan."
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <Text style={styles.muted}>Loading assignments…</Text>
      ) : (
        <View style={styles.stack}>
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Today · {today}</Text>
            {todayAssignment ? (
              <>
                <Text style={styles.bannerBody}>
                  {todayAssignment.workoutDayName} ·{" "}
                  {statusLabel(todayAssignment.status)}
                </Text>
                <Text style={styles.meta}>
                  {todayAssignment.workoutDay.exercises.length} exercises
                </Text>
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
  },
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    color: colors.darkGrey,
    fontSize: 13,
    fontWeight: "500",
  },
  sectionTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    padding: spacing.lg,
  },
  rowMain: {
    gap: spacing.xs,
  },
  rowTitle: {
    color: colors.nearBlack,
    fontSize: 15,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 13,
  },
});
