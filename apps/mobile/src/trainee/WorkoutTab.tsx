import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  AlertTriangle,
  Bell,
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
import {
  EFFECTIVE_PLAN_LOADING,
  PLAN_UNAVAILABLE_MESSAGE,
  type EffectivePlanState,
} from "./TodayTab";
import { WorkoutSummaryScreen } from "./WorkoutSummaryScreen";
import { estimateDurationMinutesFromDay } from "./workoutDuration";
import {
  enrichExecutionFromAssignmentDay,
  openActiveWorkout,
  restSecondsBySetTargetId,
  workoutStartError,
} from "./workoutSession";
import { reportError } from "../lib/reportError";
import { CoachLoggedWorkoutScreen } from "./workout/coach-logged/CoachLoggedWorkoutScreen";
import {
  coachLogState,
  coachLogTitle,
} from "./workout/coach-logged/coachLogged";
import {
  assignmentDayEyebrow,
  coachInitials,
  shortWorkoutDayName,
  totalSetsInDay,
  weekPlanEyebrow,
  weekStripStatus,
} from "./workoutDisplay";

/**
 * The week's workout assignments as an explicit load state (CU24, D-W3b-29).
 *
 * The same defect CU22 removed from Today lived here: "No plan yet /
 * Workouts appear here when <Coach> publishes your plan" was gated on
 * `assignments.length === 0`, which is equally true before the first load
 * settles and after a load that failed. A trainee offline on a first run was
 * told their coach had published nothing.
 *
 * It is the four states of D-W3b-27, not a second ad-hoc boolean: the
 * assignments are reachable only through `loaded`, so no call site can read
 * "nothing to show" as "nothing published" without narrowing on `status`.
 * `none` is a judgement made only on an answer the server actually gave —
 * an empty week, which is what "No plan yet" means. `unavailable` is "could
 * not ask and have nothing cached"; a failed refresh with something cached
 * stays `loaded`, exactly as the plan's own state does.
 */
export type WorkoutWeekState =
  | { readonly status: "loading" }
  | { readonly status: "none" }
  | {
      readonly status: "loaded";
      // Mutable element type, not `readonly WorkoutAssignment[]`:
      // `WorkoutSummaryScreen` takes a mutable `weekAssignments` and is
      // outside CU24's `files_owned`. The member itself is `readonly`, so the
      // state cannot be reassigned in place.
      readonly assignments: WorkoutAssignment[];
    }
  | { readonly status: "unavailable" };

/** The state before the first load settles. Never means "no plan published". */
export const WORKOUT_WEEK_LOADING: WorkoutWeekState = { status: "loading" };

/** The app could not ask and has nothing cached (CU24, D-W3b-29). */
export const WORKOUT_WEEK_UNAVAILABLE: WorkoutWeekState = {
  status: "unavailable",
};

/**
 * Maps a settled list of assignments onto the union. An empty list from a
 * successful read is a week with nothing published, which is `none`: the one
 * place that judgement is made.
 */
export function workoutWeekStateFor(
  assignments: WorkoutAssignment[],
): WorkoutWeekState {
  return assignments.length === 0
    ? { status: "none" }
    : { status: "loaded", assignments };
}

/** No assignments to derive from, shared so each render does not allocate. */
const NO_ASSIGNMENTS: WorkoutAssignment[] = [];

const COUNT_WORDS = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];

/**
 * Frame 10's headline for the missed card: the count is spelled as a word for
 * 1-10 (digits beyond that), with a singular form for one.
 */
export function missedCardHeadline(count: number): string {
  const word = (count >= 1 && COUNT_WORDS[count]) || String(count);
  return count === 1
    ? `${word} workout this week wasn't logged. If you did it, log it now.`
    : `${word} workouts this week weren't logged. If you did them, log them now.`;
}

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
  planState = EFFECTIVE_PLAN_LOADING,
  selectedDate,
  onSelectDate,
  onOpenOverlay,
  autoStartToday = false,
  onAutoStartConsumed,
  pendingStartAssignmentId = null,
  onPendingStartConsumed,
  onImmersiveChange,
  coachName: coachNameProp,
  unreadNotifications = 0,
}: {
  relationship: CoachingRelationship;
  /**
   * The trainee's effective plan as a load state, not a nullable plan
   * (CU24, D-W3b-29). Only the `loaded` member can feed the week eyebrow,
   * so a plan that is still loading or could not be loaded cannot be read
   * as a plan with no phase or week number.
   */
  planState?: EffectivePlanState;
  selectedDate?: string;
  onSelectDate?: (localDate: string) => void;
  onOpenOverlay?: import("../navigation/TraineeOverlay").TraineeOverlayOpener;
  /** Unread count for the title-row bell (frame 10), as DietTab does. */
  unreadNotifications?: number;
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
  const [weekState, setWeekState] =
    useState<WorkoutWeekState>(WORKOUT_WEEK_LOADING);
  // Derived, never state of its own: the one way to reach the assignments is
  // through the `loaded` member, so a screen cannot treat "not loaded" or
  // "could not load" as an empty week (CU24, D-W3b-29).
  const assignments =
    weekState.status === "loaded" ? weekState.assignments : NO_ASSIGNMENTS;
  const loading = weekState.status === "loading";
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

  const timeZone = me?.timezone ?? "Asia/Kolkata";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const focusDate = pickedDate ?? selectedDate ?? today;
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
      setWeekState(workoutWeekStateFor(next));
      setCached(workoutsCacheKey, next);
      setOffline(false);
    } catch (err) {
      setOffline(true);
      // A failed read with something cached keeps showing the cached week;
      // with nothing cached it is `unavailable`, never `none` (CU24,
      // D-W3b-29). The branch is on the cache, not on the error, so it
      // claims no cause it did not check (D-W3-12, D-W3-18).
      const cached = getCached<WorkoutAssignment[]>(workoutsCacheKey);
      setWeekState(
        cached ? workoutWeekStateFor(cached) : WORKOUT_WEEK_UNAVAILABLE,
      );
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't refresh workouts. Pull to try again.",
      );
    }
  }, [api, relationship.id, weekStart, rangeEnd, workoutsCacheKey]);

  useEffect(() => {
    const cached = getCached<WorkoutAssignment[]>(workoutsCacheKey);
    // A week with no cache starts at `loading`, not at an empty list: the
    // week key changes as the trainee navigates, so this runs again and must
    // not leave the previous week's assignments reading as this week's.
    setWeekState(cached ? workoutWeekStateFor(cached) : WORKOUT_WEEK_LOADING);
    void load();
  }, [load, workoutsCacheKey]);

  useEffect(() => {
    return subscribe(workoutsCacheKey, () => {
      // Adopt the week another screen wrote, rather than refetching it.
      // `setCached` notifies this key's subscribers, and `load` itself writes
      // the cache, so refetching here made every successful load trigger the
      // next one — an unbounded refetch loop on this tab, on device and in
      // any test whose fetch resolves immediately. A *cleared* key (an
      // `invalidate`) has nothing to adopt and does refetch, which is what
      // the subscription is for.
      const cached = getCached<WorkoutAssignment[]>(workoutsCacheKey);
      if (cached) {
        setWeekState(workoutWeekStateFor(cached));
        return;
      }
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

  // Every open missed workout of the current week: the headline counts these,
  // the card shows at most three rows, and the dismiss closes all of them.
  const missedThisWeek = useMemo(() => {
    const weekStartToday = startOfWeekMonday(today);
    return assignments.filter(
      (item) =>
        item.status === "missed" &&
        item.localDate < today &&
        item.localDate >= weekStartToday &&
        item.workoutDay.required !== false &&
        !closedMissedIds.has(item.id),
    );
  }, [assignments, today, closedMissedIds]);
  const lateLoggable = useMemo(
    () => missedThisWeek.slice(0, 3),
    [missedThisWeek],
  );

  const closedMissed = useMemo(() => {
    return assignments.filter(
      (item) =>
        item.status === "missed" &&
        item.workoutDay.required !== false &&
        closedMissedIds.has(item.id),
    );
  }, [assignments, closedMissedIds]);

  async function startOrContinue(assignment: WorkoutAssignment) {
    if (coachLogState(assignment.execution) === "logged") {
      void viewLoggedWorkout(assignment);
      return;
    }
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

  /** A coach-logged workout is read-only: open it instead of the start flow (R1). */
  async function viewLoggedWorkout(assignment: WorkoutAssignment) {
    if (!assignment.execution) return;
    setActingId(assignment.id);
    setError(null);
    try {
      const execution = await api.getWorkoutExecution(assignment.execution.id);
      setActiveAssignment(assignment);
      setSummaryExecution(
        enrichExecutionFromAssignmentDay(execution, assignment),
      );
    } catch (err) {
      reportError("workout.openLogged", err);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not open this workout. (WORKOUT-OPEN)",
      );
    } finally {
      setActingId(null);
    }
  }

  function openDayDetail(assignment: WorkoutAssignment) {
    if (coachLogState(assignment.execution) === "logged") {
      onSelectDate?.(assignment.localDate);
      void viewLoggedWorkout(assignment);
      return;
    }
    onSelectDate?.(assignment.localDate);
    // Prefer overlay so day-detail (mockup 10b) is a real navigation target,
    // not a silent in-tab state that can look like the week overview stayed up.
    if (onOpenOverlay) {
      onOpenOverlay({
        screen: "workout_overview",
        assignmentId: assignment.id,
      });
      return;
    }
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
    if (coachLogState(enriched) === "logged") {
      return (
        <CoachLoggedWorkoutScreen
          execution={enriched}
          assignment={sourceAssignment}
          coachName={coachName}
          timeZone={timeZone}
          onBack={() => {
            setSummaryExecution(null);
            setActiveAssignment(null);
          }}
        />
      );
    }
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

  const heroLogState = coachLogState(focusAssignment?.execution);
  const startLabel = pausedCaption ? "Continue workout" : "Start workout";
  const planEyebrow = weekPlanEyebrow(
    planState.status === "loaded" ? planState.plan : null,
    weekStart,
  );
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => onOpenOverlay?.({ screen: "notifications" })}
          style={styles.iconbtn}
        >
          <Bell size={22} color={colors.darkGrey} strokeWidth={1.75} />
          {unreadNotifications > 0 ? <View style={styles.unreadDot} /> : null}
        </Pressable>
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
                setPickedDate(date);
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

      {weekState.status === "loading" ? (
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
                <Text style={styles.wheroMetaB}>{exerciseCount}</Text>
                {exerciseCount === 1 ? " exercise" : " exercises"}
              </Text>
              <Text style={styles.wheroMetaText}>
                <Text style={styles.wheroMetaB}>{setCount}</Text>
                {setCount === 1 ? " set" : " sets"}
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
            {heroLogState ? (
              <Text style={styles.wheroLogged}>
                {coachLogTitle(heroLogState)}
              </Text>
            ) : null}
            {heroLogState === "logged" ? null : (
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
            )}
            {heroLogState === "logged" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View workout"
                onPress={(event) => {
                  event.stopPropagation();
                  void viewLoggedWorkout(focusAssignment);
                }}
                style={styles.wheroSecondary}
              >
                <Text style={styles.wheroSecondaryText}>View workout</Text>
              </Pressable>
            ) : null}
            {heroLogState !== "logged" &&
            (focusAssignment.status === "completed" ||
              focusAssignment.status === "modified") ? (
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
      ) : weekState.status === "unavailable" ? (
        /*
          The week could not be loaded and nothing was cached (CU24,
          D-W3b-29). This used to fall into "No plan yet" below, telling the
          trainee their coach had published nothing when the truth was that
          the app could not ask. The copy is static and shared with Today's
          own unavailable state (D-W3b-27); the retry is the same action as
          this screen's pull-to-refresh.
        */
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle} accessibilityRole="header">
            Couldn&apos;t load your plan
          </Text>
          <Text style={styles.emptyBody}>{PLAN_UNAVAILABLE_MESSAGE}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={styles.emptyRetry}
            onPress={() => {
              void onRefresh();
            }}
          >
            <Text style={styles.emptyRetryText}>Try again</Text>
          </Pressable>
        </View>
      ) : weekState.status === "none" ? (
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

      {missedThisWeek.length > 0 ? (
        <View style={styles.missb}>
          <View style={styles.missbHead}>
            <AlertTriangle color={colors.warning} size={18} />
            <Text style={styles.missbHeadText}>
              {missedCardHeadline(missedThisWeek.length)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss missed workout reminder"
              onPress={() => {
                setClosedMissedIds((prev) => {
                  const next = new Set(prev);
                  for (const item of missedThisWeek) {
                    next.add(item.id);
                  }
                  return next;
                });
              }}
              style={styles.missbClose}
            >
              <X size={20} color={colors.midGrey} strokeWidth={2.2} />
            </Pressable>
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
  iconbtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    position: "relative",
    width: 44,
  },
  unreadDot: {
    backgroundColor: colors.indigo,
    borderRadius: 5,
    height: 9,
    position: "absolute",
    right: 11,
    top: 10,
    width: 9,
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
  wheroLogged: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 12,
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
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingBottom: 6,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  missbClose: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginLeft: "auto",
    width: 44,
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
  emptyRetry: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.indigo,
    borderRadius: radii.card,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: TARGET,
    paddingHorizontal: spacing.lg,
  },
  emptyRetryText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
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
