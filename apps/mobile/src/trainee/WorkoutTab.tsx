import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Dumbbell,
  Play,
  X,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  EffectivePlanResponse,
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
import {
  assignmentDayEyebrow,
  coachInitials,
  missedLogHeadline,
  shortWorkoutDayName,
  totalSetsInDay,
  weekPlanEyebrow,
  weekStripStatus,
} from "./workoutDisplay";

const TARGET = 44;
const SKIP_REASONS = [
  "Sick",
  "Travelling",
  "No time",
  "Injury",
  "Other",
] as const;

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
  effectivePlan = null,
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
  effectivePlan?: EffectivePlanResponse | null;
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
        assignment={sourceAssignment}
        coachName={coachName}
        weekAssignments={assignments}
        weekStart={weekStart}
        timeZone={timeZone}
        today={today}
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
        assignment={activeAssignment ?? todayAssignment}
        coachName={coachName}
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

  const focusAssignment = byDate.get(focusDate) ?? null;

  const duration =
    focusAssignment != null
      ? estimateDurationMinutesFromDay(focusAssignment.workoutDay)
      : null;

  const exerciseCount = focusAssignment?.workoutDay.exercises.length ?? 0;
  const setCount =
    focusAssignment != null ? totalSetsInDay(focusAssignment.workoutDay) : 0;

  const pausedCaption =
    focusAssignment != null
      ? continueCaption(
          focusAssignment,
          pausedProgress?.assignmentId === focusAssignment.id
            ? pausedProgress
            : null,
        )
      : null;

  const startLabel = pausedCaption ? "Continue workout" : "Start workout";
  const planEyebrow = weekPlanEyebrow(effectivePlan, weekStart);
  const trainerInitials = coachInitials(
    relationship.trainerDisplayName ?? coachName,
  );
  const heroInstructions = focusAssignment?.workoutDay.instructions?.trim();

  const heroOverflowItems = focusAssignment
    ? [
        ...(focusAssignment.status === "assigned"
          ? [
              {
                id: "not-today",
                label: "Not today",
                onSelect: () => {
                  setSkipReason(null);
                  setSkipTarget(focusAssignment);
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
                    itemId: focusAssignment.id,
                    itemLabel: focusAssignment.workoutDayName,
                    dateLabel: formatCivilDate(focusAssignment.localDate),
                  }),
              },
            ]
          : []),
      ]
    : [];

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

      <View style={styles.ttlrow}>
        <View style={styles.lt2}>
          {planEyebrow ? (
            <Text style={styles.planEyebrow}>{planEyebrow}</Text>
          ) : null}
          <Text style={styles.pageTitle} accessibilityRole="header">
            Workout
          </Text>
        </View>
      </View>

      <View style={styles.wks} accessibilityRole="summary">
        {weekDates.map((date) => {
          const assignment = byDate.get(date);
          const status = weekStripStatus(date, today, assignment);
          const isOn = date === focusDate;
          const shortName = assignment
            ? shortWorkoutDayName(assignment.workoutDayName)
            : "Rest";
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${weekdayShort(timeZone, date)} ${shortName}`}
              disabled={!assignment}
              onPress={() => {
                if (assignment) openDayDetail(assignment);
              }}
              style={[styles.wksDay, isOn ? styles.wksDayOn : null]}
            >
              <Text style={[styles.wksDow, isOn ? styles.wksDowOn : null]}>
                {weekdayShort(timeZone, date)}
              </Text>
              <View
                style={[
                  styles.wksIcon,
                  status === "done" ? styles.wksIconDone : null,
                  status === "miss" ? styles.wksIconMiss : null,
                  status === "rest" ? styles.wksIconRest : null,
                  status === "today" ? styles.wksIconToday : null,
                  status === "future" ? styles.wksIconFut : null,
                ]}
              >
                {status === "done" ? (
                  <Check color={colors.white} size={15} strokeWidth={2.5} />
                ) : null}
                {status === "miss" ? (
                  <X color={colors.coral} size={15} strokeWidth={2.5} />
                ) : null}
                {status === "today" ? (
                  <Dumbbell color={colors.white} size={15} strokeWidth={2.5} />
                ) : null}
                {status === "rest" ? <View style={styles.wksDash} /> : null}
              </View>
              <Text
                style={[
                  styles.wksLabel,
                  status === "rest" ? styles.wksLabelMuted : null,
                ]}
                numberOfLines={2}
              >
                {assignment ? shortName : "Rest"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && assignments.length === 0 ? (
        <Text style={styles.muted}>Loading workouts…</Text>
      ) : focusAssignment ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${focusAssignment.workoutDayName}, workout details`}
          onPress={() => openDayDetail(focusAssignment)}
          style={styles.wheroWrap}
        >
          <View style={styles.whero}>
            {heroOverflowItems.length > 0 ? (
              <View style={styles.wheroMenu}>
                <OverflowMenu label="Workout options" items={heroOverflowItems} />
              </View>
            ) : null}
            <View style={styles.wheroChip}>
              <CalendarClock color="rgba(255,255,255,0.9)" size={15} />
              <Text style={styles.wheroChipText}>
                {assignmentDayEyebrow(focusAssignment, timeZone, today)}
              </Text>
            </View>
            <Text style={styles.wheroTitle}>{focusAssignment.workoutDayName}</Text>
            <View style={styles.wheroMeta}>
              <Text style={styles.wheroMetaText}>
                <Text style={styles.wheroMetaB}>{exerciseCount}</Text> exercises
              </Text>
              <Text style={styles.wheroMetaText}>
                <Text style={styles.wheroMetaB}>{setCount}</Text> sets
              </Text>
              {duration != null ? (
                <Text style={styles.wheroMetaText}>
                  about <Text style={styles.wheroMetaB}>{duration}</Text> min
                </Text>
              ) : null}
            </View>
            {heroInstructions ? (
              <View style={styles.wheroNote}>
                <View style={styles.wheroAv}>
                  <Text style={styles.wheroAvText}>{trainerInitials}</Text>
                </View>
                <Text style={styles.wheroNoteBody}>
                  <Text style={styles.wheroNoteBold}>{coachName}:</Text>{" "}
                  {heroInstructions}
                </Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={startLabel}
              disabled={
                actingId === focusAssignment.id ||
                !(
                  focusAssignment.status === "assigned" ||
                  focusAssignment.status === "missed" ||
                  focusAssignment.status === "in_progress" ||
                  focusAssignment.status === "paused"
                )
              }
              onPress={(event) => {
                event.stopPropagation();
                void startOrContinue(focusAssignment);
              }}
              style={styles.wheroStart}
            >
              <Play color={colors.deepNavy} size={20} fill={colors.deepNavy} />
              <Text style={styles.wheroStartText}>{startLabel}</Text>
            </Pressable>
            {focusAssignment.status === "completed" ||
            focusAssignment.status === "modified" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View summary"
                onPress={(event) => {
                  event.stopPropagation();
                  void (async () => {
                    if (!focusAssignment.execution) return;
                    setActingId(focusAssignment.id);
                    try {
                      const execution = await api.getWorkoutExecution(
                        focusAssignment.execution.id,
                      );
                      setSummaryExecution(
                        enrichExecutionFromAssignmentDay(
                          execution,
                          focusAssignment,
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
                style={styles.wheroSecondary}
              >
                <Text style={styles.wheroSecondaryText}>View summary</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      ) : assignments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle} accessibilityRole="header">
            No plan yet
          </Text>
          <Text style={styles.emptyBody}>
            Workouts appear here when {coachName} publishes your plan.
          </Text>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle} accessibilityRole="header">
            Rest day
          </Text>
          <Text style={styles.emptyBody}>
            No workout planned for this day. Enjoy the recovery.
          </Text>
        </View>
      )}

      {lateLoggable.length > 0 ? (
        <View style={styles.missb}>
          <View style={styles.missbHead}>
            <AlertTriangle color={colors.warning} size={18} />
            <Text style={styles.missbHeadText}>
              {missedLogHeadline(lateLoggable.length)}
            </Text>
          </View>
          {lateLoggable.map((item) => (
            <View key={`late-${item.id}`} style={styles.missbRow}>
              <View style={styles.missbTx}>
                <Text style={styles.missbTitle}>
                  {item.workoutDayName} · {weekdayShort(timeZone, item.localDate)}
                </Text>
                <Text style={styles.missbSub}>Missed · you can still log it</Text>
              </View>
              <PrimaryButton
                label="Log it"
                variant="tinted"
                loading={actingId === item.id}
                onPress={() => {
                  void startOrContinue(item);
                }}
                style={styles.missbBtn}
              />
            </View>
          ))}
        </View>
      ) : null}

      {closedMissed.map((item) => (
        <View key={`closed-${item.id}`} style={styles.closedBanner}>
          <Text style={styles.closedBody}>
            Missed · closed by {coachName}
          </Text>
        </View>
      ))}

      {focusAssignment ? (
        <>
          <View style={styles.sh}>
            <Text style={styles.shTitle} accessibilityRole="header">
              Exercises
            </Text>
          </View>
          <View style={styles.exl}>
            {focusAssignment.workoutDay.exercises.map((exercise, index) => {
              const first = exercise.setTargets[0];
              const reps = first?.reps != null ? String(first.reps) : "?";
              const sets = exercise.setTargets.length;
              const load = first?.loadLabel?.trim();
              const rest = first?.restSeconds;
              return (
                <View
                  key={exercise.id}
                  style={[styles.exlRow, index > 0 ? styles.exlBorder : null]}
                >
                  <View style={styles.exlNum}>
                    <Text style={styles.exlNumText}>{index + 1}</Text>
                  </View>
                  <View style={styles.exlTx}>
                    <Text style={styles.exlName}>{exercise.name}</Text>
                    {rest != null && rest > 0 ? (
                      <Text style={styles.exlSub}>Rest {rest} s</Text>
                    ) : null}
                  </View>
                  <View style={styles.exlRight}>
                    <Text style={styles.exlPres}>
                      {sets} × {reps}
                    </Text>
                    {load ? (
                      <Text style={styles.exlLoad}>{load}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

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
  ttlrow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  lt2: {
    flex: 1,
  },
  planEyebrow: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  pageTitle: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 36,
    marginTop: 2,
  },
  wks: {
    flexDirection: "row",
    gap: 4,
    marginBottom: spacing.lg,
    marginTop: 4,
  },
  wksDay: {
    alignItems: "center",
    flex: 1,
    gap: 5,
    paddingVertical: 8,
    borderRadius: 14,
  },
  wksDayOn: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderWidth: 1,
    shadowColor: "#0F0C28",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  wksDow: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "600",
  },
  wksDowOn: {
    color: colors.indigo,
  },
  wksIcon: {
    alignItems: "center",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  wksIconDone: {
    backgroundColor: colors.deepNavy,
  },
  wksIconMiss: {
    borderColor: colors.coral,
    borderWidth: 1.5,
  },
  wksIconRest: {},
  wksIconToday: {
    backgroundColor: colors.indigo,
    shadowColor: colors.indigo,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  wksIconFut: {
    borderColor: colors.lightGrey,
    borderWidth: 1.5,
  },
  wksDash: {
    backgroundColor: colors.midGrey,
    borderRadius: 1,
    height: 2,
    width: 10,
  },
  wksLabel: {
    color: colors.darkGrey,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 13,
    textAlign: "center",
  },
  wksLabelMuted: {
    color: colors.midGrey,
    fontWeight: "500",
  },
  wheroWrap: {
    marginBottom: spacing.md,
  },
  whero: {
    backgroundColor: "#1A1248",
    borderRadius: 22,
    overflow: "hidden",
    padding: 18,
    shadowColor: "#1A1248",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  wheroMenu: {
    position: "absolute",
    right: 4,
    top: 4,
    zIndex: 2,
  },
  wheroChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    flexDirection: "row",
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
  },
  wheroChipText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    fontWeight: "600",
  },
  wheroTitle: {
    color: colors.white,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 32,
    marginTop: 12,
  },
  wheroMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 6,
  },
  wheroMetaText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
  },
  wheroMetaB: {
    color: colors.white,
    fontWeight: "700",
  },
  wheroNote: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    padding: 12,
  },
  wheroAv: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  wheroAvText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  wheroNoteBody: {
    color: "rgba(255,255,255,0.9)",
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  wheroNoteBold: {
    color: colors.white,
    fontWeight: "700",
  },
  wheroStart: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.control,
    flexDirection: "row",
    gap: spacing.sm,
    height: 56,
    justifyContent: "center",
    marginTop: 14,
  },
  wheroStartText: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  wheroSecondary: {
    alignItems: "center",
    marginTop: 10,
    minHeight: TARGET,
    justifyContent: "center",
  },
  wheroSecondaryText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  missb: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  missbHead: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 6,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  missbHeadText: {
    color: colors.darkGrey,
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  missbRow: {
    alignItems: "center",
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  missbTx: {
    flex: 1,
    minWidth: 0,
  },
  missbTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
  },
  missbSub: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 2,
  },
  missbBtn: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
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
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.deepNavy,
    fontSize: 24,
    fontWeight: "700",
  },
  emptyBody: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  sh: {
    marginBottom: 10,
    marginTop: spacing.sm,
    paddingHorizontal: 4,
  },
  shTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  exl: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: spacing.xl,
    overflow: "hidden",
  },
  exlRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  exlBorder: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  exlNum: {
    alignItems: "center",
    backgroundColor: "#F6F4FF",
    borderColor: "#E6E0FF",
    borderRadius: 10,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  exlNumText: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "700",
  },
  exlTx: {
    flex: 1,
    minWidth: 0,
  },
  exlName: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  exlSub: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 2,
  },
  exlRight: {
    alignItems: "flex-end",
  },
  exlPres: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
  },
  exlLoad: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 2,
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
