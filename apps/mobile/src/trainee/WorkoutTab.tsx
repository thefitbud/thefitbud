import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import {
  CalendarX,
  Check,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  MessageCircle,
  MoonStar,
  Play,
  Send,
  Timer,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatNumber,
  whatsappHref,
} from "@fitbud/core";
import { DateNavigator, type DateNavigatorDay } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { OverflowMenu, type OverflowMenuItem } from "../components/OverflowMenu";
import { Screen } from "../components/Screen";
import {
  addDays,
  dayOfMonth,
  startOfWeekMonday,
  weekDatesFrom,
  weekdayShort,
} from "../lib/dates";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { FutureDayOpensNote } from "./FutureDayBanner";
import { isFutureDay, opensOnLabel, useLocalToday } from "./futureDay";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";
import { ActiveWorkoutScreen } from "./ActiveWorkoutScreen";
import { WorkoutOverviewScreen } from "./WorkoutOverviewScreen";
import {
  cacheGeneration,
  cacheKey,
  getCached,
  invalidateRelationshipDayData,
  setCached,
  subscribe,
  subscribeAll,
} from "./dataCache";
import { scheduledAssignments } from "./scheduledAssignments";
import { dayEyebrow, longDayLabel, useDayState } from "./useDayState";
import { fetchDayInto } from "./useTraineeDayCache";
import {
  EFFECTIVE_PLAN_LOADING,
  PLAN_UNAVAILABLE_MESSAGE,
  type EffectivePlanState,
} from "./TodayTab";
import { WorkoutSummaryScreen } from "./WorkoutSummaryScreen";
import {
  durationMinutesFromExecution,
  elapsedSeconds,
  estimateDurationMinutesFromDay,
  formatElapsedClock,
} from "./workoutDuration";
import {
  exercisePrescription,
  isWorkoutDone,
  planWeekLabel,
  weekWorkoutSummary,
  withFinishedExecution,
  workoutHeroState,
  type WeekWorkoutDay,
  type WorkoutHeroState,
} from "./workoutHeroState";
import {
  enrichExecutionFromAssignmentDay,
  nextUpSet,
  openActiveWorkout,
  restSecondsBySetTargetId,
  sessionSetCounts,
  sessionVolumeKg,
  workoutStartError,
} from "./workoutSession";
import { reportError } from "../lib/reportError";
import { CoachLoggedWorkoutScreen } from "./workout/coach-logged/CoachLoggedWorkoutScreen";
import { coachInitials } from "./workoutDisplay";
import {
  closeActiveSession,
  openActiveSession,
  updateActiveSession,
  useActiveSession,
} from "./workout/activeSession";
import { OpenSessionPrompts } from "./workout/OpenSessionPrompts";

/**
 * The week's workout assignments as an explicit load state (CU24, D-W3b-29).
 *
 * "No plan yet" used to be gated on `assignments.length === 0`, which is
 * equally true before the first load settles and after a load that failed.
 * The assignments are reachable only through `loaded`, so no call site can
 * read "nothing to show" as "nothing published" without narrowing on
 * `status`. `none` is a judgement made only on an answer the server gave (an
 * empty week); `unavailable` is "could not ask and have nothing cached".
 */
export type WorkoutWeekState =
  | { readonly status: "loading" }
  | { readonly status: "none" }
  | {
      readonly status: "loaded";
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

const SKIP_REASONS = [
  "Sick",
  "Travelling",
  "No time",
  "Injury",
  "Other",
] as const;

/**
 * The strip's dot for a day, from the workouts only (W-01a/e): green when the
 * day's workout is done, red when it was missed, grey ahead, none on a rest
 * day. Today's own workout, not yet done, is "to do". Every state is also in
 * the day's spoken label (DateNavigator), never colour alone.
 *
 * `day` is the day's entry in `weekWorkoutSummary(...).days`, the list the
 * eyebrow's "N of M done" counts (Z12-44 review): a dot is green exactly when
 * that count counts the day as done, so the two cannot disagree (a day with
 * two workouts, one done, is not done). A day with only an optional workout
 * that was not done is not in that list: ahead it is still planned, behind it
 * owed nothing and has no dot.
 */
export function workoutStripState(
  date: string,
  today: string,
  day: WeekWorkoutDay | undefined,
  hasWorkout: boolean,
): DateNavigatorDay["state"] {
  if (day?.done) return "done";
  if (!hasWorkout) return "rest";
  if (date > today) return "future";
  if (date === today) return "due";
  return day ? "open" : "rest";
}

/** A newest-first list of this week's missed workouts as TR-10c's line. */
export function missedBannerText(
  missed: ReadonlyArray<Pick<WorkoutAssignment, "workoutDayName" | "localDate">>,
): { lead: string; name: string | null; tail: string } {
  if (missed.length === 1) {
    const only = missed[0]!;
    return {
      lead: "You missed ",
      name: only.workoutDayName,
      tail: ` on ${weekdayShort("", only.localDate)}. Did it anyway?`,
    };
  }
  return {
    lead: `You missed ${missed.length} workouts this week. Did them anyway?`,
    name: null,
    tail: "",
  };
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
  pendingSummaryExecutionId = null,
  onPendingSummaryConsumed,
  onImmersiveChange,
  coachName: coachNameProp,
}: {
  relationship: CoachingRelationship;
  /**
   * The trainee's effective plan as a load state, not a nullable plan
   * (CU24, D-W3b-29). Only the `loaded` member can feed the week eyebrow.
   */
  planState?: EffectivePlanState;
  selectedDate?: string;
  onSelectDate?: (localDate: string) => void;
  onOpenOverlay?: import("../navigation/TraineeOverlay").TraineeOverlayOpener;
  /**
   * The shell's unread count. The v3 Workout header has no bell (W-01a);
   * notifications stay one tap away on Today. Kept so the shell's props
   * still type-check.
   */
  unreadNotifications?: number;
  autoStartToday?: boolean;
  onAutoStartConsumed?: () => void;
  pendingStartAssignmentId?: string | null;
  onPendingStartConsumed?: () => void;
  /**
   * Opens this execution's summary (or the coach-logged view) once the week
   * has loaded, then calls `onPendingSummaryConsumed`. Set by Today's "View
   * summary" (D-W10-9), as `pendingStartAssignmentId` is set by its start.
   */
  pendingSummaryExecutionId?: string | null;
  onPendingSummaryConsumed?: () => void;
  /** True while active workout or summary fills the tab (hide shell tab bar). */
  onImmersiveChange?: (immersive: boolean) => void;
  /** Optional override; defaults to relationship.trainerDisplayName. */
  coachName?: string;
}) {
  const { api, me, refreshSession } = useAuth();
  const sync = useSyncEngine();
  const [weekState, setWeekState] =
    useState<WorkoutWeekState>(WORKOUT_WEEK_LOADING);
  const assignments =
    weekState.status === "loaded" ? weekState.assignments : NO_ASSIGNMENTS;
  const loading = weekState.status === "loading";
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // The open workout lives in the session store (Z12-45), so minimising the
  // log (W-14) and leaving this tab both keep it.
  const session = useActiveSession(relationship.id);
  const activeExecution =
    session && !session.minimised ? session.execution : null;
  const [finishNowRequested, setFinishNowRequested] = useState(false);
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
  const [dayDetailAssignmentId, setDayDetailAssignmentId] = useState<
    string | null
  >(null);

  const coachName =
    coachNameProp?.trim() ||
    relationship.trainerDisplayName?.split(/\s+/)[0] ||
    "Your coach";

  const timeZone = me?.timezone ?? "Asia/Kolkata";
  // One day state for Today, Diet and Workout (Z12-40): with a shell, the
  // day is the shell's `selectedDate`; the local pick is only for a tab
  // rendered on its own.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const pickDate = useCallback(
    (date: string) => {
      if (onSelectDate) onSelectDate(date);
      else setPickedDate(date);
    },
    [onSelectDate],
  );
  // Kept current across local midnight and app foregrounding (Z12-39).
  const today = useLocalToday(timeZone);
  const focusDate =
    (onSelectDate ? selectedDate : (pickedDate ?? selectedDate)) ?? today;
  const dayState = useDayState({
    selectedDate: focusDate,
    onSelectDate: pickDate,
    timeZone,
  });
  /** D-W12-7: a workout on a future day is a preview; it cannot be started or skipped. */
  const onFutureDay = (assignment: WorkoutAssignment) =>
    isFutureDay(assignment.localDate, today);
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
  const nextWeekStart = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const nextWeekKey = cacheKey(
    "workouts",
    relationship.id,
    nextWeekStart,
    addDays(nextWeekStart, 6),
  );

  const load = useCallback(async () => {
    setError(null);
    // The generation this read starts in (Z12-40): a write that lands while
    // it is in flight makes its answer stale, and `setCached` then drops it
    // instead of overwriting fresher data. The write's own invalidation has
    // already told the subscription below to load again.
    const generation = cacheGeneration(workoutsCacheKey);
    try {
      const listed = await api.listWorkoutAssignments(relationship.id, {
        fromDate: weekStart,
        toDate: rangeEnd,
      });
      const next = scheduledAssignments(
        listed.items as WorkoutAssignment[],
      );
      setOffline(false);
      if (!setCached(workoutsCacheKey, next, { generation })) return;
      setWeekState(workoutWeekStateFor(next));
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

  // The weeks either side are fetched once the week on screen has loaded,
  // so a swipe or a chevron across a week boundary paints from cache
  // (Z12-40). A failed prefetch shows nothing; the visit retries it.
  useEffect(() => {
    if (weekState.status !== "loaded" && weekState.status !== "none") return;
    for (const start of [addDays(weekStart, -7), addDays(weekStart, 7)]) {
      const end = addDays(start, 6);
      const key = cacheKey("workouts", relationship.id, start, end);
      if (getCached(key)) continue;
      fetchDayInto(key, async () =>
        scheduledAssignments(
          (
            await api.listWorkoutAssignments(relationship.id, {
              fromDate: start,
              toDate: end,
            })
          ).items as WorkoutAssignment[],
        ),
      ).catch(() => undefined);
    }
  }, [api, relationship.id, weekStart, weekState.status]);

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
      // Adopt the week another screen (or this load) wrote, rather than
      // refetching it: refetching here made every load trigger the next one.
      // A *cleared* key (an `invalidate`) has nothing to adopt and refetches.
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

  // The next week, for the "Next" row when nothing later is left this week
  // (W-01c on a Saturday). Read from the prefetch above; never fetched here.
  const [nextWeek, setNextWeek] = useState<WorkoutAssignment[] | null>(
    () => getCached<WorkoutAssignment[]>(nextWeekKey) ?? null,
  );
  useEffect(() => {
    setNextWeek(getCached<WorkoutAssignment[]>(nextWeekKey) ?? null);
    return subscribe(nextWeekKey, () =>
      setNextWeek(getCached<WorkoutAssignment[]>(nextWeekKey) ?? null),
    );
  }, [nextWeekKey]);

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
    if (session && session.execution.assignmentId === todayAssignment.id) {
      updateActiveSession(relationship.id, { minimised: false });
      onAutoStartConsumed?.();
      return;
    }
    void (async () => {
      setActingId(todayAssignment.id);
      setError(null);
      try {
        const execution = await openActiveWorkout(api, sync, todayAssignment);
        setActiveAssignment(todayAssignment);
        openActiveSession({
          relationshipId: relationship.id,
          execution,
          assignment: todayAssignment,
        });
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

  const focusAssignment = byDate.get(focusDate) ?? null;
  const hero = workoutHeroState(focusAssignment, today);

  // Every open missed workout of the current week, newest first (TR-10c).
  const missedThisWeek = useMemo(() => {
    const weekStartToday = startOfWeekMonday(today);
    return assignments
      .filter(
        (item) =>
          workoutHeroState(item, today).kind === "missed" &&
          item.localDate >= weekStartToday &&
          item.workoutDay.required !== false &&
          !closedMissedIds.has(item.id),
      )
      .sort((a, b) => b.localDate.localeCompare(a.localDate));
  }, [assignments, today, closedMissedIds]);

  const closedMissed = useMemo(() => {
    return assignments.filter(
      (item) =>
        item.status === "missed" &&
        item.workoutDay.required !== false &&
        closedMissedIds.has(item.id),
    );
  }, [assignments, closedMissedIds]);

  // The full execution for the day's card: W-01b's set count and "Up next",
  // W-01c's volume and sets. The list carries only a summary. Keyed on the
  // execution's version, so a change elsewhere refetches it.
  const heroExecutionId =
    (hero.kind === "in_progress" || hero.kind === "done") &&
    focusAssignment?.execution
      ? focusAssignment.execution.id
      : null;
  const heroExecutionVersion = focusAssignment?.execution?.recordVersion ?? 0;
  const [heroExecution, setHeroExecution] = useState<WorkoutExecution | null>(
    null,
  );
  useEffect(() => {
    if (!heroExecutionId) {
      setHeroExecution(null);
      return;
    }
    let cancelled = false;
    Promise.resolve()
      .then(() => api.getWorkoutExecution(heroExecutionId))
      .then((execution) => {
        if (!cancelled) setHeroExecution(execution);
      })
      .catch((err: unknown) => {
        // The card keeps what the list gave it; the figures show a dash.
        if (!cancelled) setHeroExecution(null);
        reportError("WorkoutTab.getWorkoutExecution", err);
      });
    return () => {
      cancelled = true;
    };
  }, [api, heroExecutionId, heroExecutionVersion]);

  /**
   * The week as it stands once `execution` has finished, kept until the
   * reload answers (Z12-44 review). Leaving the summary invalidates the week
   * and reloads it; without this the card painted the list read before the
   * finish ("Continue workout" on a finished day) until that reload landed.
   */
  const markFinished = useCallback((execution: WorkoutExecution) => {
    if (execution.status !== "completed" && execution.status !== "modified") {
      return;
    }
    setWeekState((prev) => {
      if (prev.status !== "loaded") return prev;
      const next = withFinishedExecution(prev.assignments, execution);
      return next === prev.assignments ? prev : workoutWeekStateFor(next);
    });
  }, []);

  async function startOrContinue(assignment: WorkoutAssignment) {
    const state = workoutHeroState(assignment, today);
    if (state.kind === "coach_logged") {
      void viewLoggedWorkout(assignment);
      return;
    }
    // Nothing offers this on a future or finished day; the guard keeps any
    // other path (a stale render, a deep link) from queueing a start.
    if (state.action !== "start" && state.action !== "continue" && state.action !== "log_late") {
      return;
    }
    setDayDetailAssignmentId(null);
    // The session is still in memory (minimised, W-14): show it as it is,
    // with what was logged since, instead of reading it again.
    if (session && session.execution.assignmentId === assignment.id) {
      updateActiveSession(relationship.id, { minimised: false });
      return;
    }
    setActingId(assignment.id);
    setError(null);
    try {
      const execution = await openActiveWorkout(api, sync, assignment);
      setActiveAssignment(assignment);
      openActiveSession({
        relationshipId: relationship.id,
        execution,
        assignment,
      });
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

  useEffect(() => {
    if (!pendingSummaryExecutionId || loading) return;
    const assignment = assignments.find(
      (item) => item.execution?.id === pendingSummaryExecutionId,
    );
    if (assignment) {
      void viewLoggedWorkout(assignment);
    }
    onPendingSummaryConsumed?.();
  }, [pendingSummaryExecutionId, loading, assignments, onPendingSummaryConsumed]);

  /**
   * Opens a finished workout: the trainee's own summary (View summary,
   * W-01c), or the read-only view of a coach's log (R1).
   */
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
    if (workoutHeroState(assignment, today).kind === "coach_logged") {
      void viewLoggedWorkout(assignment);
      return;
    }
    // Prefer the overlay so day detail (10b) is a real navigation target.
    if (onOpenOverlay) {
      onOpenOverlay({
        screen: "workout_overview",
        assignmentId: assignment.id,
        viewOnly: onFutureDay(assignment),
      });
      return;
    }
    setDayDetailAssignmentId(assignment.id);
  }

  async function confirmSkip(reason: string | null) {
    if (!skipTarget) return;
    const assignment = skipTarget;
    if (onFutureDay(assignment)) {
      setSkipTarget(null);
      return;
    }
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
    const sourceAssignment =
      assignments.find((item) => item.execution?.id === summaryExecution.id) ??
      assignments.find((item) => item.id === summaryExecution.assignmentId) ??
      activeAssignment;
    const enriched = enrichExecutionFromAssignmentDay(
      summaryExecution,
      sourceAssignment,
    );
    if (enriched.loggedByRole === "coach") {
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
    // The week the summary's dots and count read: the summary patches the
    // finished assignment itself (ISSUE-MAP #10), so the list may be stale.
    const summaryWeekStart = sourceAssignment
      ? startOfWeekMonday(sourceAssignment.localDate)
      : weekStart;
    const summaryWeek =
      summaryWeekStart === weekStart
        ? assignments
        : (getCached<WorkoutAssignment[]>(
            cacheKey(
              "workouts",
              relationship.id,
              summaryWeekStart,
              addDays(summaryWeekStart, 6),
            ),
          ) ?? (sourceAssignment ? [sourceAssignment] : []));
    return (
      <WorkoutSummaryScreen
        execution={enriched}
        assignment={sourceAssignment}
        coachName={coachName}
        weekAssignments={summaryWeek}
        weekStart={summaryWeekStart}
        timeZone={timeZone}
        today={today}
        offline={offline}
        onDone={() => {
          markFinished(summaryExecution);
          setSummaryExecution(null);
          setActiveAssignment(null);
          invalidateRelationshipDayData(relationship.id);
          void load();
        }}
      />
    );
  }

  if (dayDetailAssignmentId) {
    const detailAssignment = assignments.find(
      (item) => item.id === dayDetailAssignmentId,
    );
    return (
      <WorkoutOverviewScreen
        assignmentId={dayDetailAssignmentId}
        coachName={coachName}
        startLoading={actingId === dayDetailAssignmentId}
        onBack={() => setDayDetailAssignmentId(null)}
        // D-W12-7: a future day's overview is a preview with no Start.
        onStart={
          detailAssignment && onFutureDay(detailAssignment)
            ? undefined
            : (assignment) => {
                void startOrContinue(assignment);
              }
        }
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
    const sessionAssignment =
      session?.assignment ?? activeAssignment ?? focusAssignment;
    return (
      <ActiveWorkoutScreen
        execution={activeExecution}
        assignment={sessionAssignment}
        coachName={coachName}
        sessionName={sessionAssignment?.workoutDayName}
        restSecondsBySetTargetId={
          sessionAssignment ? restSecondsBySetTargetId(sessionAssignment) : {}
        }
        onChange={(execution) =>
          updateActiveSession(relationship.id, { execution })
        }
        rest={session?.rest ?? null}
        onRestChange={(rest) => updateActiveSession(relationship.id, { rest })}
        onMinimise={() => {
          updateActiveSession(relationship.id, { minimised: true });
          // The card behind the log shows the session as the server has it.
          invalidateRelationshipDayData(relationship.id);
          void load();
        }}
        onAskCoach={
          onOpenOverlay && sessionAssignment
            ? (exerciseName) =>
                onOpenOverlay({
                  screen: "ask_coach",
                  itemType: "workout_assignment",
                  itemId: sessionAssignment.id,
                  // The message names the exercise it is about (W-09).
                  itemLabel: exerciseName
                    ? `${exerciseName} · ${sessionAssignment.workoutDayName}`
                    : sessionAssignment.workoutDayName,
                  dateLabel: formatCivilDate(sessionAssignment.localDate),
                })
            : undefined
        }
        onFinished={(execution) => {
          setActiveAssignment(sessionAssignment ?? null);
          closeActiveSession(relationship.id);
          setSummaryExecution(execution);
        }}
        onExit={() => {
          closeActiveSession(relationship.id);
          setActiveAssignment(null);
          invalidateRelationshipDayData(relationship.id);
          void load();
        }}
      />
    );
  }

  const plan = planState.status === "loaded" ? planState.plan : null;
  // TR-10b: the trainee has no plan. Said only on an answer: the plan says
  // "none", or (with the plan's own state not settled as loaded) the server
  // answered with an empty week. A failed read is never "no plan" (CU24).
  const noPlan =
    planState.status === "none" ||
    (planState.status !== "loaded" && weekState.status === "none");
  const week = weekWorkoutSummary(assignments, weekStart);
  const weekDays = new Map(week.days.map((day) => [day.localDate, day]));
  const weekLabel = planWeekLabel(plan, weekStart);
  const planName = `${coachName}’s plan`;
  const eyebrow = noPlan
    ? longDayLabel(focusDate)
    : weekState.status === "loading" || weekState.status === "unavailable"
      ? dayEyebrow(focusDate, dayState.kind, planName)
      : hero.kind === "rest"
        ? `${longDayLabel(focusDate)} · rest day`
        : dayState.isPast
          ? dayEyebrow(focusDate, "past")
          : hero.kind === "done" && dayState.isToday
            ? `${weekLabel ?? "This week"} · ${week.completed} of ${week.total} done`
            : weekLabel
              ? `${weekLabel} · ${planName}`
              : planName;

  // The next workout after the day on screen that is still to do (W-01c,
  // TR-10a), from this week and the prefetched next one.
  const nextAssignment =
    [...assignments, ...(nextWeek ?? [])]
      .filter(
        (item) =>
          item.localDate > focusDate &&
          item.localDate >= today &&
          !isWorkoutDone(item) &&
          item.status !== "skipped",
      )
      .sort((a, b) => a.windowStartsAt.localeCompare(b.windowStartsAt))[0] ??
    null;

  const overflowItems: OverflowMenuItem[] = focusAssignment
    ? [
        // "Not today" skips today's workout before it starts (old frame 99:
        // no v3 mock, current behaviour kept, Z12-23 → Z12-44).
        ...(hero.kind === "not_started"
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
        ...(onOpenOverlay && hero.kind !== "rest"
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
    // A horizontal swipe anywhere on the screen moves a day (Z12-40): a
    // native pan around the whole screen, so the empty space under a short
    // day counts too. `v3` opts the tab into the system theme (D-W12-12).
    <GestureDetector gesture={dayState.swipeGesture}>
      <Screen
        v3
        chrome="app"
        title="Workout"
        showHeader={false}
        refreshing={refreshing}
        onRefresh={() => {
          void onRefresh();
        }}
      >
        <WorkoutDayView
          eyebrow={eyebrow}
          overflowItems={overflowItems}
          showStrip={!noPlan}
          weekDates={weekDates}
          stripDays={weekDates.map((date) => ({
            localDate: date,
            weekdayLabel: weekdayShort(timeZone, date),
            dayLabel: dayOfMonth(timeZone, date),
            state:
              weekState.status === "loaded" || weekState.status === "none"
                ? workoutStripState(
                    date,
                    today,
                    weekDays.get(date),
                    byDate.has(date),
                  )
                : "unknown",
          }))}
          focusDate={focusDate}
          today={today}
          onSelectDate={pickDate}
          error={error}
          offline={offline}
          weekState={weekState}
          noPlan={noPlan}
          coachName={coachName}
          coachInitialsText={coachInitials(
            relationship.trainerDisplayName ?? coachName,
          )}
          trainerWhatsappE164={relationship.trainerWhatsappE164 ?? null}
          focusAssignment={focusAssignment}
          hero={hero}
          // Seeded and coach-built executions can come without exercise
          // rows; the plan fills them in, as on the summary (TR-12).
          heroExecution={
            heroExecution
              ? enrichExecutionFromAssignmentDay(heroExecution, focusAssignment)
              : null
          }
          timeZone={timeZone}
          isToday={dayState.isToday}
          weekCompleted={week.completed}
          weekTotal={week.total}
          nextAssignment={nextAssignment}
          missed={dayState.isToday ? missedThisWeek : []}
          closedMissed={closedMissed}
          actingId={actingId}
          onAct={(assignment) => {
            const state = workoutHeroState(assignment, today);
            if (state.action === "view_summary" || state.action === "view_workout") {
              void viewLoggedWorkout(assignment);
            } else {
              void startOrContinue(assignment);
            }
          }}
          onOpenDetail={openDayDetail}
          onFinishNow={
            hero.kind === "in_progress" && heroExecution
              ? () => setFinishNowRequested(true)
              : undefined
          }
          onRetry={() => {
            void onRefresh();
          }}
        />

        <OpenSessionPrompts
          assignment={hero.kind === "in_progress" ? (focusAssignment ?? null) : null}
          execution={
            heroExecution
              ? enrichExecutionFromAssignmentDay(heroExecution, focusAssignment)
              : null
          }
          canPrompt={session == null && actingId == null && !autoStartToday}
          finishRequested={finishNowRequested}
          onFinishRequestHandled={() => setFinishNowRequested(false)}
          coachFirst={
            coachName === "Your coach"
              ? "your coach"
              : (coachName.split(/\s+/)[0] ?? coachName)
          }
          timeZone={timeZone}
          onResume={(assignment) => {
            void startOrContinue(assignment);
          }}
          onFinished={(execution, assignment) => {
            closeActiveSession(relationship.id);
            setActiveAssignment(assignment);
            setSummaryExecution(execution);
          }}
          onDiscarded={() => {
            closeActiveSession(relationship.id);
            invalidateRelationshipDayData(relationship.id);
            void load();
          }}
        />

        <BottomSheet
          visible={skipTarget != null}
          title="Not today"
          subtitle="Tell your coach why (optional)"
          onDismiss={() => {
            setSkipTarget(null);
            setSkipReason(null);
          }}
        >
          <SkipReasons selected={skipReason} onSelect={setSkipReason} />
          <Button
            label="Skip workout"
            loading={actingId?.startsWith("skip-") ?? false}
            onPress={() => {
              void confirmSkip(skipReason);
            }}
          />
          <Button
            label="Cancel"
            variant="text"
            onPress={() => {
              setSkipTarget(null);
              setSkipReason(null);
            }}
          />
        </BottomSheet>
      </Screen>
    </GestureDetector>
  );
}

function SkipReasons({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (reason: string) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.reasonRow}>
      {SKIP_REASONS.map((reason) => (
        <Pressable
          key={reason}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === reason }}
          onPress={() => onSelect(reason)}
          style={[
            styles.reasonChip,
            selected === reason ? styles.reasonChipActive : null,
          ]}
        >
          <Text
            variant="subhead"
            tone={selected === reason ? "onBrand" : "ink"}
          >
            {reason}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Re-renders every second while `running` (W-01b's clock). */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

type DayViewProps = {
  eyebrow: string;
  overflowItems: OverflowMenuItem[];
  showStrip: boolean;
  weekDates: string[];
  stripDays: DateNavigatorDay[];
  focusDate: string;
  today: string;
  onSelectDate: (date: string) => void;
  error: string | null;
  offline: boolean;
  weekState: WorkoutWeekState;
  noPlan: boolean;
  coachName: string;
  coachInitialsText: string;
  trainerWhatsappE164: string | null;
  focusAssignment: WorkoutAssignment | null;
  hero: WorkoutHeroState;
  heroExecution: WorkoutExecution | null;
  onFinishNow?: () => void;
  timeZone: string;
  isToday: boolean;
  weekCompleted: number;
  weekTotal: number;
  nextAssignment: WorkoutAssignment | null;
  missed: WorkoutAssignment[];
  closedMissed: WorkoutAssignment[];
  actingId: string | null;
  onAct: (assignment: WorkoutAssignment) => void;
  onOpenDetail: (assignment: WorkoutAssignment) => void;
  onRetry: () => void;
};

/**
 * The tab's body. A child of `<Screen v3>`, so `useTheme()` here reads the
 * system theme the screen opted into (D-W12-12).
 */
function WorkoutDayView(props: DayViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const {
    focusAssignment,
    hero,
    weekState,
    noPlan,
    coachName,
  } = props;

  return (
    <View style={styles.swipeBody}>
      <View style={styles.ttlrow}>
        <View style={styles.titles}>
          <Text variant="subhead" tone="ink3" testID="day-eyebrow">
            {props.eyebrow}
          </Text>
          <Text variant="largeTitle" accessibilityRole="header">
            Workout
          </Text>
        </View>
        {props.overflowItems.length > 0 ? (
          <OverflowMenu label="Workout options" items={props.overflowItems} />
        ) : null}
      </View>

      {props.showStrip ? (
        <DateNavigator
          days={props.stripDays}
          selectedDate={props.focusDate}
          todayDate={props.today}
          onSelect={props.onSelectDate}
          onToday={() => props.onSelectDate(props.today)}
          showTodayPill={!props.weekDates.includes(props.today)}
          theme={theme}
        />
      ) : null}

      {props.error ? <ErrorBanner message={props.error} /> : null}
      {props.offline ? (
        <Text variant="caption" tone="ink3" style={styles.offline}>
          Saved on phone · Not sent yet
        </Text>
      ) : null}

      {props.missed.length > 0 ? (
        <MissedBanner
          missed={props.missed}
          loading={props.actingId === props.missed[0]!.id}
          onLog={() => props.onAct(props.missed[0]!)}
        />
      ) : null}

      {noPlan ? (
        <NoPlanCard
          coachName={coachName}
          phoneE164={props.trainerWhatsappE164}
        />
      ) : weekState.status === "loading" ? (
        <Text variant="body" tone="ink3" style={styles.loading}>
          Loading workouts…
        </Text>
      ) : focusAssignment && hero.kind !== "rest" ? (
        <HeroCard
          assignment={focusAssignment}
          hero={hero}
          execution={props.heroExecution}
          coachName={coachName}
          coachInitialsText={props.coachInitialsText}
          timeZone={props.timeZone}
          isToday={props.isToday}
          acting={props.actingId === focusAssignment.id}
          onAct={() => props.onAct(focusAssignment)}
          onOpenDetail={() => props.onOpenDetail(focusAssignment)}
          onFinishNow={props.onFinishNow}
        />
      ) : weekState.status === "unavailable" ? (
        /*
          The week could not be loaded and nothing was cached (CU24,
          D-W3b-29): never "no plan". The copy is static and shared with
          Today's own unavailable state (D-W3b-27).
        */
        <View style={[styles.card, styles.emptyCard]}>
          <Text variant="headline" accessibilityRole="header">
            Couldn&apos;t load your plan
          </Text>
          <Text variant="body" tone="ink2" style={styles.emptyBody}>
            {PLAN_UNAVAILABLE_MESSAGE}
          </Text>
          <Button label="Try again" variant="outline" onPress={props.onRetry} />
        </View>
      ) : (
        <RestCard coachName={coachName} isToday={props.isToday} />
      )}

      {hero.kind === "not_started" && props.weekTotal > 0 ? (
        <Text variant="subhead" tone="ink3" style={styles.weekLine}>
          {`This week: ${props.weekCompleted} of ${props.weekTotal} done`}
        </Text>
      ) : null}

      {(hero.kind === "done" || hero.kind === "rest") &&
      !noPlan &&
      weekState.status !== "loading" &&
      props.nextAssignment ? (
        <NextWorkout
          assignment={props.nextAssignment}
          today={props.today}
          timeZone={props.timeZone}
          onOpen={() => props.onSelectDate(props.nextAssignment!.localDate)}
        />
      ) : null}

      {props.closedMissed.map((item) => (
        <Text
          key={`closed-${item.id}`}
          variant="subhead"
          tone="ink3"
          style={styles.closedLine}
        >
          {`${item.workoutDayName} · Missed · closed by ${coachName}`}
        </Text>
      ))}
    </View>
  );
}

function MissedBanner({
  missed,
  loading,
  onLog,
}: {
  missed: WorkoutAssignment[];
  loading: boolean;
  onLog: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const text = missedBannerText(missed);
  const spoken = `${text.lead}${text.name ?? ""}${text.tail}`;
  return (
    <View style={styles.missBanner}>
      <CalendarX size={22} color={theme.colors.warn} strokeWidth={1.75} />
      <Text
        variant="subhead"
        tone="warnInk"
        style={styles.missText}
        accessibilityLabel={spoken}
      >
        {text.lead}
        {text.name ? (
          <Text variant="subhead" tone="warnInk" style={styles.bold}>
            {text.name}
          </Text>
        ) : null}
        {text.tail}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log it"
        accessibilityState={{ busy: loading }}
        disabled={loading}
        onPress={onLog}
        style={styles.missAction}
      >
        <Text variant="bodyStrong" tone="warnInk">
          Log it
        </Text>
      </Pressable>
    </View>
  );
}

function NoPlanCard({
  coachName,
  phoneE164,
}: {
  coachName: string;
  phoneE164: string | null;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const hasNumber = Boolean(
    phoneE164 && phoneE164.replace(/\D/g, "").length >= 10,
  );
  return (
    <View style={[styles.card, styles.centerCard]}>
      <View style={styles.bigTile}>
        <ClipboardCheck size={30} color={theme.colors.ink} strokeWidth={1.75} />
      </View>
      <Text variant="headline" style={styles.centerTitle} accessibilityRole="header">
        No workouts planned yet
      </Text>
      <Text variant="body" tone="ink2" style={styles.centerBody}>
        {`${coachName} hasn’t added workouts to your plan. You’ll get a notification when they’re added.`}
      </Text>
      {hasNumber ? (
        <Button
          label={`Message ${coachName} on WhatsApp`}
          variant="outline"
          icon={
            <MessageCircle size={20} color={theme.colors.ink} strokeWidth={1.75} />
          }
          // A wa.me prefill the trainee sends themselves (AGENTS.md: no auto-send).
          onPress={() => {
            void Linking.openURL(
              whatsappHref({ phoneE164, draftText: `Hi ${coachName}, ` }),
            ).catch((err: unknown) => reportError("WorkoutTab.openWhatsApp", err));
          }}
          style={styles.centerButton}
        />
      ) : null}
    </View>
  );
}

function RestCard({
  coachName,
  isToday,
}: {
  coachName: string;
  isToday: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.card, styles.centerCard]}>
      <View style={styles.bigTile}>
        <MoonStar size={30} color={theme.colors.ink} strokeWidth={1.75} />
      </View>
      <Text variant="headline" style={styles.centerTitle} accessibilityRole="header">
        Rest day
      </Text>
      <Text variant="body" tone="ink2" style={styles.centerBody}>
        {isToday
          ? `${coachName} planned recovery today. A walk counts, so your steps still show on Today.`
          : `No workout planned for this day.`}
      </Text>
    </View>
  );
}

function NextWorkout({
  assignment,
  today,
  timeZone,
  onOpen,
}: {
  assignment: WorkoutAssignment;
  today: string;
  timeZone: string;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const day =
    assignment.localDate === addDays(today, 1)
      ? "Tomorrow"
      : formatCivilDate(assignment.localDate);
  const count = assignment.workoutDay.exercises.length;
  const detail = `${day} · ${formatClockTime(assignment.windowStartsAt, timeZone)} · ${count} ${count === 1 ? "exercise" : "exercises"}`;
  return (
    <>
      <Text variant="title" style={styles.sectionTitle} accessibilityRole="header">
        Next
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Next: ${assignment.workoutDayName}, ${detail}`}
        onPress={onOpen}
        style={[styles.card, styles.nextRow]}
      >
        <View style={styles.nextTile}>
          <Dumbbell size={24} color={theme.colors.ink} strokeWidth={1.75} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{assignment.workoutDayName}</Text>
          <Text variant="subhead" tone="ink2">
            {detail}
          </Text>
        </View>
        <ChevronRight size={20} color={theme.colors.ink3} strokeWidth={1.75} />
      </Pressable>
    </>
  );
}

function ExerciseRows({
  exercises,
}: {
  exercises: WorkoutAssignment["workoutDay"]["exercises"];
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View>
      {exercises.map((exercise) => (
        <View key={exercise.id} style={styles.exRow}>
          <View style={styles.exTile}>
            <Dumbbell size={20} color={theme.colors.ink} strokeWidth={1.75} />
          </View>
          <Text variant="body" style={styles.flex} numberOfLines={2}>
            {exercise.name}
          </Text>
          <Text variant="body" tone="ink2">
            {exercisePrescription(exercise)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function HeroCard({
  assignment,
  hero,
  execution,
  coachName,
  coachInitialsText,
  timeZone,
  isToday,
  acting,
  onAct,
  onOpenDetail,
  onFinishNow,
}: {
  assignment: WorkoutAssignment;
  hero: WorkoutHeroState;
  execution: WorkoutExecution | null;
  coachName: string;
  coachInitialsText: string;
  timeZone: string;
  isToday: boolean;
  acting: boolean;
  onAct: () => void;
  onOpenDetail: () => void;
  /** W-01b "Finish now"; absent until the session's sets are read. */
  onFinishNow?: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const ticking =
    hero.kind === "in_progress" && !hero.paused && assignment.execution != null;
  const now = useNow(ticking);
  const exercises = [...assignment.workoutDay.exercises].sort(
    (a, b) => a.order - b.order,
  );
  const instructions = assignment.workoutDay.instructions?.trim();
  const time = formatClockTime(assignment.windowStartsAt, timeZone);
  const dateCaps = (
    isToday ? "Today" : formatCivilDate(assignment.localDate)
  ).toUpperCase();
  const duration = estimateDurationMinutesFromDay(assignment.workoutDay);

  // The title and plan open the day's detail (10b). It is its own control,
  // beside the action, never around it: on iOS an accessible parent hides
  // the button inside it from VoiceOver and Maestro (Z12-40 review).
  const title = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${assignment.workoutDayName}, workout details`}
      onPress={onOpenDetail}
      style={styles.titlePress}
    >
      <Text variant="title" style={styles.heroTitle}>
        {assignment.workoutDayName}
      </Text>
    </Pressable>
  );

  const coachNote = instructions ? (
    <View
      style={styles.coachNote}
      accessible
      accessibilityLabel={`${coachName}: ${instructions}`}
    >
      <View style={styles.avatar}>
        <Text variant="label" tone="onCoach" style={styles.avatarText}>
          {coachInitialsText}
        </Text>
      </View>
      <Text variant="body" style={styles.flex}>
        {instructions}
      </Text>
    </View>
  ) : null;

  if (hero.kind === "in_progress") {
    const counts = execution ? sessionSetCounts(execution) : null;
    const next = execution ? nextUpSet(execution) : null;
    const rest = next
      ? execution!.exercises
          .slice(next.exerciseIndex + 1)
          .map((ex) => exercises.find((planned) => planned.id === ex.exerciseId))
          .filter((ex): ex is (typeof exercises)[number] => ex != null)
      : exercises;
    const clock = assignment.execution
      ? formatElapsedClock(elapsedSeconds(assignment.execution, now))
      : null;
    const chip = `${hero.paused ? "Paused" : "In progress"}${clock ? ` · ${clock}` : ""}`;
    const progress =
      counts && counts.total > 0 ? (counts.done + counts.skipped) / counts.total : 0;
    return (
      <View style={styles.card}>
        <View style={styles.headRow}>
          <View style={[styles.chip, styles.chipNeutral]}>
            <Timer size={16} color={theme.colors.ink} strokeWidth={2} />
            <Text variant="bodyStrong" style={styles.chipText}>
              {chip}
            </Text>
          </View>
          {counts ? (
            <Text variant="subhead" tone="ink3">
              {`${counts.done} of ${counts.total} sets`}
            </Text>
          ) : null}
        </View>
        {title}
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={
            counts ? { min: 0, max: counts.total, now: counts.done } : undefined
          }
        >
          <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        {next ? (
          <View style={styles.upNext}>
            <Text variant="label" tone="ink3">
              UP NEXT
            </Text>
            <Text variant="body" style={styles.flex} numberOfLines={1}>
              {`${next.exerciseName} · set ${next.setNumber}`}
            </Text>
            <Text variant="body" tone="ink2">
              {next.target}
            </Text>
          </View>
        ) : null}
        <ExerciseRows exercises={rest} />
        <Button
          label="Continue workout"
          loading={acting}
          icon={<Play size={20} color={theme.colors.onBrand} strokeWidth={2} />}
          onPress={onAct}
          style={styles.action}
        />
        {onFinishNow ? (
          <Button label="Finish now" variant="text" onPress={onFinishNow} />
        ) : null}
      </View>
    );
  }

  if (hero.kind === "done") {
    const summary = assignment.execution;
    const minutes = summary ? durationMinutesFromExecution(summary) : null;
    const counts = execution ? sessionSetCounts(execution) : null;
    const volume = execution ? sessionVolumeKg(execution) : null;
    const doneAt = summary?.completedAt
      ? formatClockTime(summary.completedAt, timeZone)
      : null;
    return (
      <View style={styles.card}>
        <View style={styles.headRow}>
          <View style={[styles.chip, styles.chipDone]}>
            <Check size={16} color={theme.colors.done} strokeWidth={2.5} />
            <Text variant="bodyStrong" tone="done" style={styles.chipText}>
              {doneAt ? `Done · ${doneAt}` : "Done"}
            </Text>
          </View>
        </View>
        {title}
        <View style={styles.tiles}>
          <StatTile
            label="Duration"
            value={minutes != null ? String(minutes) : "—"}
            unit={minutes != null ? " min" : ""}
          />
          <StatTile
            label="Volume"
            value={volume != null ? formatNumber(volume) : "—"}
            unit={volume != null ? " kg" : ""}
          />
          <StatTile
            label="Sets"
            value={counts ? String(counts.done) : "—"}
            unit={counts ? ` / ${counts.total}` : ""}
          />
        </View>
        {doneAt ? (
          <View style={styles.sharedRow}>
            <Send size={18} color={theme.colors.done} strokeWidth={1.75} />
            <Text variant="body" tone="ink2">
              {`Shared with ${coachName} at ${doneAt}`}
            </Text>
          </View>
        ) : null}
        <Button
          label="View summary"
          variant="secondary"
          loading={acting}
          onPress={onAct}
          style={styles.action}
        />
      </View>
    );
  }

  // Not started, missed (logged late), future, skipped, coach-logged.
  const action =
    hero.action === "start"
      ? "Start workout"
      : hero.action === "log_late"
        ? "Log workout"
        : hero.action === "view_workout"
          ? "View workout"
          : null;
  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text variant="label" tone={isToday ? "ink" : "ink3"}>
          {`${dateCaps} · ${time.toUpperCase()}`}
        </Text>
        {duration != null && hero.kind !== "skipped" && hero.kind !== "coach_logged" ? (
          <Text variant="subhead" tone="ink3">
            {`about ${duration} min`}
          </Text>
        ) : null}
      </View>
      {title}
      {hero.kind === "skipped" ? (
        <Text variant="subhead" tone="ink3">
          Skipped
        </Text>
      ) : null}
      {hero.kind === "coach_logged" ? (
        <Text variant="subhead" tone="ink3">
          Logged by your coach
        </Text>
      ) : null}
      {coachNote}
      <View style={coachNote ? styles.divider : null} />
      <ExerciseRows exercises={exercises} />
      {hero.kind === "future" ? (
        <View style={styles.opensOn}>
          <FutureDayOpensNote text={opensOnLabel(assignment.localDate)} />
        </View>
      ) : action ? (
        <Button
          label={action}
          variant={hero.action === "view_workout" ? "secondary" : "primary"}
          loading={acting}
          icon={
            hero.action === "view_workout" ? undefined : (
              <Play size={20} color={theme.colors.onBrand} strokeWidth={2} />
            )
          }
          onPress={onAct}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

/** A figure on the done card (W-01c): the number large, its unit small. */
function StatTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  const styles = useStyles();
  return (
    <View
      style={styles.tile}
      accessible
      accessibilityLabel={`${label} ${value}${unit}`}
    >
      <Text variant="subhead" tone="ink2">
        {label}
      </Text>
      <Text
        variant="numberMd"
        style={styles.tileValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
        {unit ? (
          <Text variant="subhead" tone="ink2">
            {unit}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  swipeBody: {
    flexGrow: 1,
  },
  ttlrow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: t.spacing.md,
  },
  titles: {
    flex: 1,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  bold: {
    fontWeight: "700",
  },
  offline: {
    marginBottom: t.spacing.sm,
  },
  loading: {
    marginTop: t.spacing.lg,
  },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card,
    borderWidth: 1,
    marginTop: t.spacing.sm,
    padding: 20,
  },
  emptyCard: {
    gap: t.spacing.sm,
  },
  emptyBody: {
    marginBottom: t.spacing.sm,
  },
  centerCard: {
    alignItems: "center",
    paddingVertical: 28,
  },
  bigTile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 22,
    height: 76,
    justifyContent: "center",
    marginBottom: t.spacing.lg,
    width: 76,
  },
  centerTitle: {
    textAlign: "center",
  },
  centerBody: {
    marginTop: t.spacing.sm,
    textAlign: "center",
  },
  centerButton: {
    alignSelf: "stretch",
    marginTop: t.spacing.xl,
  },
  headRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 24,
  },
  titlePress: {
    justifyContent: "center",
    minHeight: 44,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  coachNote: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.md,
    paddingBottom: t.spacing.md,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: t.colors.coach,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  avatarText: {
    fontSize: 11,
  },
  divider: {
    backgroundColor: t.colors.line,
    height: 1,
  },
  exRow: {
    alignItems: "center",
    borderBottomColor: t.colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: t.spacing.md,
    minHeight: 58,
    paddingVertical: t.spacing.sm,
  },
  exTile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  action: {
    marginTop: t.spacing.xl,
  },
  opensOn: {
    alignItems: "center",
    marginTop: t.spacing.lg,
  },
  chip: {
    alignItems: "center",
    borderRadius: t.radii.full,
    flexDirection: "row",
    gap: 6,
    minHeight: 30,
    paddingHorizontal: t.spacing.md,
  },
  chipNeutral: {
    backgroundColor: t.colors.fill,
  },
  chipDone: {
    backgroundColor: t.colors.doneTint,
  },
  chipText: {
    fontSize: 15,
  },
  track: {
    backgroundColor: t.colors.fill,
    borderRadius: 4,
    height: 6,
    marginVertical: t.spacing.sm,
    overflow: "hidden",
  },
  trackFill: {
    backgroundColor: t.colors.brand,
    height: 6,
  },
  upNext: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    gap: t.spacing.md,
    marginTop: t.spacing.sm,
    minHeight: 48,
    paddingHorizontal: t.spacing.lg,
  },
  tiles: {
    flexDirection: "row",
    gap: 10,
    marginTop: t.spacing.sm,
  },
  tile: {
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 10,
  },
  tileValue: {
    marginTop: 2,
  },
  sharedRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.sm,
    marginTop: t.spacing.lg,
  },
  weekLine: {
    marginTop: t.spacing.lg,
    textAlign: "center",
  },
  sectionTitle: {
    marginBottom: t.spacing.xs,
    marginTop: t.spacing.xl,
  },
  nextRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.lg,
    paddingVertical: t.spacing.lg,
  },
  nextTile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  missBanner: {
    alignItems: "center",
    backgroundColor: t.colors.warnTint,
    borderRadius: t.radii.card,
    flexDirection: "row",
    gap: t.spacing.md,
    marginBottom: t.spacing.sm,
    paddingLeft: t.spacing.lg,
    paddingVertical: t.spacing.md,
  },
  missText: {
    flex: 1,
  },
  missAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: t.spacing.lg,
  },
  closedLine: {
    marginTop: t.spacing.md,
  },
  reasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.spacing.sm,
    marginBottom: t.spacing.lg,
  },
  reasonChip: {
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.chip,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: t.spacing.lg,
  },
  reasonChipActive: {
    backgroundColor: t.colors.brand,
  },
}));
