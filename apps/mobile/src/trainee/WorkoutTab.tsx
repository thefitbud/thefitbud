import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { ErrorBanner } from "../components/ErrorBanner";
import { OverflowMenu } from "../components/OverflowMenu";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import {
  addDays,
  localDateInTimezone,
  startOfWeekMonday,
  weekDatesFrom,
  weekdayShort,
} from "../lib/dates";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { ActiveWorkoutScreen } from "./ActiveWorkoutScreen";
import { WorkoutOverviewScreen } from "./WorkoutOverviewScreen";
import {
  cacheKey,
  getCached,
  invalidateRelationshipDayData,
  setCached,
  subscribe,
  subscribeAll,
} from "./dataCache";
import { scheduledAssignments } from "./scheduledAssignments";
import { WorkoutSummaryScreen } from "./WorkoutSummaryScreen";
import { estimateDurationMinutesFromDay } from "./workoutDuration";
import {
  enrichExecutionFromAssignmentDay,
  openActiveWorkout,
  restSecondsBySetTargetId,
  workoutStartError,
} from "./workoutSession";

const TARGET = 44;
const SKIP_REASONS = [
  "Sick",
  "Travelling",
  "No time",
  "Injury",
  "Other",
] as const;

function exerciseLine(
  exercise: WorkoutAssignment["workoutDay"]["exercises"][number],
): string {
  const sets = exercise.setTargets.length;
  const first = exercise.setTargets[0];
  const reps = first?.reps != null ? String(first.reps) : "?";
  const load = first?.loadLabel?.trim();
  return load ? `${sets}×${reps} · ${load}` : `${sets}×${reps}`;
}

function continueCaption(
  assignment: WorkoutAssignment,
  lastProgress?: { done: number; total: number } | null,
): string | null {
  if (
    assignment.status !== "in_progress" &&
    assignment.status !== "paused"
  ) {
    return null;
  }
  const total =
    lastProgress?.total ?? assignment.workoutDay.exercises.length;
  if (lastProgress && lastProgress.total > 0) {
    return `Paused at ${lastProgress.done} of ${lastProgress.total} exercises`;
  }
  if (assignment.status === "paused" && total > 0) {
    return `Paused · ${total} exercises`;
  }
  return null;
}

export function WorkoutTab({
  relationship,
  selectedDate,
  onOpenOverlay,
  autoStartToday = false,
  onAutoStartConsumed,
  pendingStartAssignmentId = null,
  onPendingStartConsumed,
  onImmersiveChange,
  coachName: coachNameProp,
}: {
  relationship: CoachingRelationship;
  selectedDate?: string;
  onOpenOverlay?: import("../navigation/TraineeOverlay").TraineeOverlayOpener;
  autoStartToday?: boolean;
  onAutoStartConsumed?: () => void;
  pendingStartAssignmentId?: string | null;
  onPendingStartConsumed?: () => void;
  /** True while active workout or summary fills the tab (hide shell tab bar). */
  onImmersiveChange?: (immersive: boolean) => void;
  /** Optional override; defaults to relationship.trainerDisplayName. */
  coachName?: string;
}) {
  const { api, me, refreshSession } = useAuth();
  const sync = useSyncEngine();
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [activeExecution, setActiveExecution] =
    useState<WorkoutExecution | null>(null);
  const [activeAssignment, setActiveAssignment] =
    useState<WorkoutAssignment | null>(null);
  const [summaryExecution, setSummaryExecution] =
    useState<WorkoutExecution | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [skipTarget, setSkipTarget] = useState<WorkoutAssignment | null>(null);
  const [skipReason, setSkipReason] = useState<string | null>(null);
  const [closedMissedIds, setClosedMissedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pausedProgress, setPausedProgress] = useState<{
    assignmentId: string;
    done: number;
    total: number;
  } | null>(null);
  const [dayDetailAssignmentId, setDayDetailAssignmentId] = useState<
    string | null
  >(null);

  const coachName =
    coachNameProp?.trim() ||
    relationship.trainerDisplayName?.split(/\s+/)[0] ||
    "Your coach";

  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const focusDate = selectedDate ?? today;
  const weekStart = useMemo(
    () => startOfWeekMonday(focusDate),
    [focusDate],
  );
  const weekDates = useMemo(() => weekDatesFrom(weekStart), [weekStart]);
  const rangeEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const workoutsCacheKey = cacheKey(
    "workouts",
    relationship.id,
    weekStart,
    rangeEnd,
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const listed = await api.listWorkoutAssignments(relationship.id, {
        fromDate: weekStart,
        toDate: rangeEnd,
      });
      const next = scheduledAssignments(
        listed.items as WorkoutAssignment[],
      );
      setAssignments(next);
      setCached(workoutsCacheKey, next);
      setOffline(false);
    } catch (err) {
      setOffline(true);
      const cached = getCached<WorkoutAssignment[]>(workoutsCacheKey);
      if (cached) setAssignments(cached);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't refresh workouts. Pull to try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, weekStart, rangeEnd, workoutsCacheKey]);

  useEffect(() => {
    const cached = getCached<WorkoutAssignment[]>(workoutsCacheKey);
    if (cached) {
      setAssignments(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void load();
  }, [load, workoutsCacheKey]);

  useEffect(() => {
    return subscribe(workoutsCacheKey, () => {
      void load();
    });
  }, [workoutsCacheKey, load]);

  useEffect(() => {
    return subscribeAll(() => {
      void load();
    });
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    void refreshSession?.();
    await load();
    setRefreshing(false);
  }, [load, refreshSession]);

  useEffect(() => {
    if (!autoStartToday || loading) return;
    const todayAssignment = assignments.find(
      (item) => item.localDate === focusDate,
    );
    if (!todayAssignment || focusDate !== today) {
      onAutoStartConsumed?.();
      return;
    }
    void (async () => {
      setActingId(todayAssignment.id);
      setError(null);
      try {
        const execution = await openActiveWorkout(api, sync, todayAssignment);
        setActiveAssignment(todayAssignment);
        setActiveExecution(execution);
      } catch (err) {
        setError(workoutStartError(err));
      } finally {
        setActingId(null);
        onAutoStartConsumed?.();
      }
    })();
  }, [
    autoStartToday,
    loading,
    assignments,
    focusDate,
    today,
    api,
    sync,
    onAutoStartConsumed,
  ]);

  const byDate = useMemo(() => {
    const map = new Map<string, WorkoutAssignment>();
    for (const item of assignments) {
      if (!map.has(item.localDate)) map.set(item.localDate, item);
    }
    return map;
  }, [assignments]);

  const todayAssignment = byDate.get(focusDate) ?? null;

  const weekCompleted = assignments.filter(
    (item) =>
      item.status === "completed" ||
      item.status === "modified" ||
      (item.execution?.status === "completed" ||
        item.execution?.status === "modified"),
  ).length;
  const weekTotal = assignments.filter(
    (item) => item.workoutDay.required !== false,
  ).length;

  const lateLoggable = useMemo(() => {
    return assignments
      .filter(
        (item) =>
          item.status === "missed" &&
          item.localDate < today &&
          item.workoutDay.required !== false &&
          !closedMissedIds.has(item.id),
      )
      .slice(0, 3);
  }, [assignments, today, closedMissedIds]);

  const closedMissed = useMemo(() => {
    return assignments.filter(
      (item) =>
        item.status === "missed" &&
        item.workoutDay.required !== false &&
        closedMissedIds.has(item.id),
    );
  }, [assignments, closedMissedIds]);

  async function startOrContinue(assignment: WorkoutAssignment) {
    setDayDetailAssignmentId(null);
    setActingId(assignment.id);
    setError(null);
    try {
      const execution = await openActiveWorkout(api, sync, assignment);
      setActiveAssignment(assignment);
      setActiveExecution(execution);
      invalidateRelationshipDayData(relationship.id);
    } catch (err) {
      const message = workoutStartError(err);
      const locked =
        err instanceof ApiClientError &&
        (err.code === "LOCKED" ||
          /closed|resolved|locked/i.test(err.message));
      if (locked || /closed|resolved|locked/i.test(message)) {
        setClosedMissedIds((prev) => new Set(prev).add(assignment.id));
      }
      setError(message);
    } finally {
      setActingId(null);
    }
  }

  useEffect(() => {
    if (!pendingStartAssignmentId || loading) return;
    const assignment = assignments.find(
      (item) => item.id === pendingStartAssignmentId,
    );
    if (assignment) {
      void startOrContinue(assignment);
    }
    onPendingStartConsumed?.();
  }, [pendingStartAssignmentId, loading, assignments, onPendingStartConsumed]);

  function openDayDetail(assignment: WorkoutAssignment) {
    setDayDetailAssignmentId(assignment.id);
  }

  async function confirmSkip(reason: string | null) {
    if (!skipTarget) return;
    const assignment = skipTarget;
    setActingId(`skip-${assignment.id}`);
    setError(null);
    try {
      await enqueueAndPush(sync, {
        recordId: assignment.id,
        operation: "workout.skip",
        payload: {
          assignmentId: assignment.id,
          reason: reason ?? null,
        },
      });
      invalidateRelationshipDayData(relationship.id);
      setSkipTarget(null);
      setSkipReason(null);
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
  }

  useEffect(() => {
    onImmersiveChange?.(
      Boolean(
        summaryExecution || activeExecution || dayDetailAssignmentId,
      ),
    );
    return () => onImmersiveChange?.(false);
  }, [
    summaryExecution,
    activeExecution,
    dayDetailAssignmentId,
    onImmersiveChange,
  ]);

  if (summaryExecution) {
    const alreadyCounted = assignments.some(
      (item) =>
        item.execution?.id === summaryExecution.id &&
        (item.status === "completed" || item.status === "modified"),
    );
    const summaryWeekCompleted = weekCompleted + (alreadyCounted ? 0 : 1);
    const sourceAssignment =
      assignments.find((item) => item.execution?.id === summaryExecution.id) ??
      activeAssignment;
    const enriched = enrichExecutionFromAssignmentDay(
      summaryExecution,
      sourceAssignment,
    );
    return (
      <WorkoutSummaryScreen
        execution={enriched}
        coachName={coachName}
        weekCompleted={summaryWeekCompleted}
        weekTotal={weekTotal > 0 ? weekTotal : undefined}
        offline={offline}
        onDone={() => {
          setSummaryExecution(null);
          setActiveAssignment(null);
          invalidateRelationshipDayData(relationship.id);
          void load();
        }}
      />
    );
  }

  if (dayDetailAssignmentId) {
    return (
      <WorkoutOverviewScreen
        assignmentId={dayDetailAssignmentId}
        coachName={coachName}
        startLoading={actingId === dayDetailAssignmentId}
        onBack={() => setDayDetailAssignmentId(null)}
        onStart={(assignment) => {
          void startOrContinue(assignment);
        }}
        onAskCoach={
          onOpenOverlay
            ? (assignment) =>
                onOpenOverlay({
                  screen: "ask_coach",
                  itemType: "workout_assignment",
                  itemId: assignment.id,
                  itemLabel: assignment.workoutDayName,
                  dateLabel: formatCivilDate(assignment.localDate),
                })
            : undefined
        }
      />
    );
  }

  if (activeExecution) {
    return (
      <ActiveWorkoutScreen
        execution={activeExecution}
        sessionName={
          activeAssignment?.workoutDayName ??
          todayAssignment?.workoutDayName
        }
        restSecondsBySetTargetId={
          activeAssignment
            ? restSecondsBySetTargetId(activeAssignment)
            : todayAssignment
              ? restSecondsBySetTargetId(todayAssignment)
              : {}
        }
        onChange={(next) => {
          setActiveExecution(next);
          if (activeAssignment) {
            const total = next.exercises.length;
            const done = next.exercises.filter((ex) =>
              ex.sets.every((set) => set.status !== "pending"),
            ).length;
            setPausedProgress({
              assignmentId: activeAssignment.id,
              done,
              total,
            });
          }
        }}
        onAskCoach={
          onOpenOverlay && activeAssignment
            ? () =>
                onOpenOverlay({
                  screen: "ask_coach",
                  itemType: "workout_assignment",
                  itemId: activeAssignment.id,
                  itemLabel: activeAssignment.workoutDayName,
                  dateLabel: formatCivilDate(activeAssignment.localDate),
                })
            : undefined
        }
        onFinished={(execution) => {
          setActiveExecution(null);
          setPausedProgress(null);
          setSummaryExecution(execution);
        }}
        onExit={() => {
          setActiveExecution(null);
          setActiveAssignment(null);
          invalidateRelationshipDayData(relationship.id);
          void load();
        }}
      />
    );
  }

  const duration =
    todayAssignment != null
      ? estimateDurationMinutesFromDay(todayAssignment.workoutDay)
      : null;

  const pausedCaption =
    todayAssignment != null
      ? continueCaption(
          todayAssignment,
          pausedProgress?.assignmentId === todayAssignment.id
            ? pausedProgress
            : null,
        )
      : null;
  const continueLabel = pausedCaption
    ? `Continue · ${pausedCaption}`
    : "Continue";

  return (
    <Screen
      chrome="app"
      title="Workout"
      showHeader={false}
      refreshing={refreshing}
      onRefresh={() => {
        void onRefresh();
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>Saved on phone · Not sent yet</Text>
      ) : null}

      <View style={styles.weekStrip} accessibilityRole="summary">
        {weekDates.map((date) => {
          const assignment = byDate.get(date);
          const isToday = date === today;
          let caption = "Rest";
          if (assignment) {
            if (
              assignment.status === "completed" ||
              assignment.status === "modified"
            ) {
              caption = "✓";
            } else {
              caption = assignment.workoutDayName;
            }
          }
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${weekdayShort(timeZone, date)} ${caption}`}
              disabled={!assignment}
              onPress={() => {
                if (assignment) openDayDetail(assignment);
              }}
              style={[styles.weekDay, isToday ? styles.weekDayToday : null]}
            >
              <Text style={styles.weekDow}>
                {weekdayShort(timeZone, date)}
              </Text>
              {caption === "✓" ? (
                <Check color={colors.success} size={16} />
              ) : (
                <Text
                  style={styles.weekCaption}
                  numberOfLines={2}
                >
                  {caption}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {lateLoggable.map((item) => (
        <View key={`late-${item.id}`} style={styles.lateBanner}>
          <Text style={styles.lateBody}>
            {weekdayShort(timeZone, item.localDate)}'s workout wasn't logged. If
            you did it, log it now.
          </Text>
          <PrimaryButton
            label="Log it"
            variant="tinted"
            loading={actingId === item.id}
            onPress={() => {
              void startOrContinue(item);
            }}
          />
        </View>
      ))}

      {closedMissed.map((item) => (
        <View key={`closed-${item.id}`} style={styles.closedBanner}>
          <Text style={styles.closedBody}>
            Missed · closed by {coachName}
          </Text>
        </View>
      ))}

      {loading && assignments.length === 0 ? (
        <Text style={styles.muted}>Loading workouts…</Text>
      ) : todayAssignment ? (
        <View style={styles.sessionCard}>
          <View style={styles.sessionHeader}>
            <Text style={styles.kicker} accessibilityRole="header">
              Today
            </Text>
            <OverflowMenu
              label="Workout options"
              items={[
                ...(todayAssignment.status === "assigned"
                  ? [
                      {
                        id: "not-today",
                        label: "Not today",
                        onSelect: () => {
                          setSkipReason(null);
                          setSkipTarget(todayAssignment);
                        },
                      },
                    ]
                  : []),
                ...(onOpenOverlay
                  ? [
                      {
                        id: "ask",
                        label: "Ask coach",
                        onSelect: () =>
                          onOpenOverlay({
                            screen: "ask_coach",
                            itemType: "workout_assignment",
                            itemId: todayAssignment.id,
                            itemLabel: todayAssignment.workoutDayName,
                            dateLabel: formatCivilDate(todayAssignment.localDate),
                          }),
                      },
                    ]
                  : []),
              ]}
            />
          </View>
          <Text style={styles.bannerTitle} accessibilityRole="header">
            {todayAssignment.workoutDayName}
          </Text>
          {duration != null ? (
            <Text style={styles.bannerBody}>About {duration} min</Text>
          ) : null}
          {todayAssignment.workoutDay.instructions?.trim() ? (
            <Text style={styles.trainerNote}>
              {todayAssignment.workoutDay.instructions}
            </Text>
          ) : null}

          {todayAssignment.workoutDay.exercises.map((exercise) => (
            <View key={exercise.id} style={styles.exerciseRow}>
              <Text style={styles.rowTitle}>{exercise.name}</Text>
              <Text style={styles.rowMeta}>{exerciseLine(exercise)}</Text>
            </View>
          ))}

          <PrimaryButton
            label="See workout overview"
            variant="secondary"
            onPress={() => openDayDetail(todayAssignment)}
          />

          {todayAssignment.status === "completed" ||
          todayAssignment.status === "modified" ? (
            <PrimaryButton
              label="View summary"
              onPress={() => {
                void (async () => {
                  if (!todayAssignment.execution) return;
                  setActingId(todayAssignment.id);
                  try {
                    const execution = await api.getWorkoutExecution(
                      todayAssignment.execution.id,
                    );
                    setSummaryExecution(
                      enrichExecutionFromAssignmentDay(
                        execution,
                        todayAssignment,
                      ),
                    );
                  } catch (err) {
                    setError(
                      err instanceof ApiClientError
                        ? err.message
                        : "Could not open summary.",
                    );
                  } finally {
                    setActingId(null);
                  }
                })();
              }}
            />
          ) : null}

          {todayAssignment.status === "assigned" ||
          todayAssignment.status === "missed" ? (
            <PrimaryButton
              label="Start workout"
              loading={actingId === todayAssignment.id}
              onPress={() => {
                void startOrContinue(todayAssignment);
              }}
            />
          ) : null}

          {todayAssignment.execution &&
          (todayAssignment.status === "in_progress" ||
            todayAssignment.status === "paused") ? (
            <PrimaryButton
              label={continueLabel}
              loading={actingId === todayAssignment.id}
              onPress={() => {
                void startOrContinue(todayAssignment);
              }}
            />
          ) : null}

          {todayAssignment.status === "missed" &&
          !closedMissedIds.has(todayAssignment.id) &&
          todayAssignment.workoutDay.required !== false ? (
            <Text style={styles.missedHint}>
              Missed · you can still log it
            </Text>
          ) : null}
        </View>
      ) : assignments.length === 0 ? (
        <View style={styles.sessionCard}>
          <Text style={styles.bannerTitle} accessibilityRole="header">
            No plan yet
          </Text>
          <Text style={styles.bannerBody}>
            Workouts appear here when {coachName} publishes your plan.
          </Text>
        </View>
      ) : (
        <View style={styles.sessionCard}>
          <Text style={styles.bannerTitle} accessibilityRole="header">
            Rest day
          </Text>
          <Text style={styles.bannerBody}>
            No workout planned for this day. Enjoy the recovery.
          </Text>
        </View>
      )}

      <BottomSheet
        visible={skipTarget != null}
        title="Not today"
        subtitle="Tell your coach why (optional)"
        onDismiss={() => {
          setSkipTarget(null);
          setSkipReason(null);
        }}
      >
        <View style={styles.reasonRow}>
          {SKIP_REASONS.map((reason) => (
            <Pressable
              key={reason}
              accessibilityRole="button"
              accessibilityState={{ selected: skipReason === reason }}
              onPress={() => setSkipReason(reason)}
              style={[
                styles.reasonChip,
                skipReason === reason ? styles.reasonChipActive : null,
              ]}
            >
              <Text
                style={
                  skipReason === reason
                    ? styles.reasonChipTextActive
                    : styles.reasonChipText
                }
              >
                {reason}
              </Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton
          label="Skip workout"
          loading={actingId?.startsWith("skip-") ?? false}
          onPress={() => {
            void confirmSkip(skipReason);
          }}
        />
        <PrimaryButton
          label="Cancel"
          variant="ghost"
          onPress={() => {
            setSkipTarget(null);
            setSkipReason(null);
          }}
        />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  weekStrip: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  weekDay: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    minHeight: TARGET + 8,
  },
  weekDayToday: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.control,
    paddingVertical: spacing.xs,
  },
  weekDow: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "600",
  },
  weekCaption: {
    color: colors.deepNavy,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  lateBanner: {
    backgroundColor: colors.softCoral,
    borderRadius: radii.card,
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  lateBody: {
    color: colors.deepNavy,
    fontSize: 15,
    lineHeight: 22,
  },
  closedBanner: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  closedBody: {
    color: colors.midGrey,
    fontSize: 14,
  },
  sessionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  sessionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
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
  trainerNote: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  exerciseRow: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    minHeight: TARGET,
    paddingTop: spacing.sm,
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
  missedHint: {
    color: colors.midGrey,
    fontSize: 13,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  reasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  reasonChip: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.control,
    minHeight: TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  reasonChipActive: {
    backgroundColor: colors.indigo,
  },
  reasonChipText: {
    color: colors.deepNavy,
    fontWeight: "600",
  },
  reasonChipTextActive: {
    color: colors.white,
    fontWeight: "700",
  },
});
