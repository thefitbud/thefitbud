import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import type {
  Checkin,
  CoachingRelationship,
  EffectivePlanResponse,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatKcal,
  formatNumber,
} from "@fitbud/core";
import {
  WeeklyConsistency,
  colors,
  fontFamilySemiBold,
  radii,
  semanticColors,
  spacing,
} from "@fitbud/ui-mobile";
import { Check, Clock, CloudUpload, Moon } from "lucide-react-native";
import { surface } from "@fitbud/tokens";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import { formatInstant } from "@fitbud/core";
import {
  addDays,
  localDateInTimezone,
  startOfWeekMonday,
} from "../lib/dates";
import { reportError } from "../lib/reportError";
import { stage1Api } from "../lib/stage1Api";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { useSyncEngine } from "../sync/SyncProvider";
import { TodayCheckinCard } from "./CheckinScreen";
import {
  TraineeDateNavigator,
  WEEK_UNAVAILABLE_MESSAGE,
  loadWeekModel,
  type WeekModelState,
} from "./TraineeDateNavigator";
import { confirmMealAssignment, MealSyncError } from "./mealActions";
import {
  canShowMealLogActions,
  cleanFoodLabel,
  mealKcalFromDayTotals,
  mealLockCopy,
} from "./mealHelpers";
import {
  durationMinutesFromExecution,
  estimateDurationMinutesFromDay,
} from "./workoutDuration";
import { subscribeAll } from "./dataCache";
import {
  buildNutritionRings,
  isMealLoggedForCount,
  nutrientsFromMealPrescription,
} from "./nutrition";
import { nextUp, nextUpEyebrow } from "./nextUp";
import { pickTodayCheckin } from "./pickTodayCheckin";
import { RemindersPausedCard } from "./today/RemindersPausedCard";
import { ReviewedBanner } from "./today/ReviewedBanner";
import {
  scheduledAssignments,
  sortMealsByTime,
} from "./scheduledAssignments";
import { StepsCard } from "./steps/StepsCard";
import {
  TodaySummaryCard,
  type StepsChipState,
} from "./today/TodaySummaryCard";
import { INFO_BORDER, PastDayBanner } from "./today/PastDayBanner";
import { TodayHeader } from "./today/TodayHeader";
import { TodaySkeleton } from "./today/TodaySkeleton";
import {
  queuedLogsLabel,
  useDeviceOffline,
  useQueuedLogs,
} from "./today/queuedLogs";

function mealItemLine(meal: MealAssignment): string {
  const items = meal.prescription.items
    .slice(0, 3)
    .map((item) => {
      if ("label" in item && typeof item.label === "string" && item.label) {
        return cleanFoodLabel(item.label);
      }
      if ("name" in item && typeof item.name === "string" && item.name) {
        return cleanFoodLabel(item.name);
      }
      return null;
    })
    .filter(Boolean);
  return items.join(" · ");
}

function exerciseCountLabel(count: number): string {
  return count === 1 ? "1 exercise" : `${count} exercises`;
}

/**
 * The trainee's effective plan as an explicit load state (CU22, D-W3b-24;
 * the fourth `unavailable` member is CU24, D-W3b-27).
 *
 * `effectivePlan: EffectivePlanResponse | null` used to carry two different
 * facts — "not loaded yet" and "no plan published" — and the shell's initial
 * value was the same `null` a plan-less trainee ends on. The shell's plan
 * load awaits a full sync pull first, so it always settles after `TodayTab`'s
 * own day load; every trainee with a published plan therefore saw their real
 * workout under "<Coach> is preparing your plan" on every cold start.
 *
 * This is a discriminated union, not a nullable plan and not a boolean: the
 * plan is reachable only through the `loaded` member, so `loading` and
 * `unavailable` cannot be read as `none` (nor any of them as "ready") without
 * narrowing on `status` first. Keep it that way — a `plan | null` prop
 * anywhere on this path, or a boolean beside the union, is the same defect
 * again.
 */
export type EffectivePlanState =
  | { readonly status: "loading" }
  | { readonly status: "none" }
  | { readonly status: "loaded"; readonly plan: EffectivePlanResponse }
  | { readonly status: "unavailable" };

/** The state before the first load settles. Never means "no plan published". */
export const EFFECTIVE_PLAN_LOADING: EffectivePlanState = { status: "loading" };

/**
 * The fourth state (CU24, D-W3b-27): the app could not ask, and has nothing
 * cached to fall back to.
 *
 * It is a fourth member of the union rather than a boolean beside it for the
 * same reason `loading` is a member: a boolean can be read without narrowing,
 * so it would collapse back into `none` at the first call site that forgets
 * it — which is the defect CU22 removed. A fetch failure *with* a cached plan
 * is still `loaded`; this state is only "could not ask and have nothing", not
 * "could not refresh".
 */
export const EFFECTIVE_PLAN_UNAVAILABLE: EffectivePlanState = {
  status: "unavailable",
};

/**
 * What a trainee reads when the plan could not be loaded (CU24, D-W3b-27,
 * decided by Firoz 4 Nov 2026, verbatim copy).
 *
 * Static text: nothing derived from the error reaches the screen, which is
 * what AGENTS.md's error-message rule requires (D-W3-12, D-W3b-7) and what
 * D-W3b-30 settled for the sibling cache-write message. The failure's own
 * detail goes to `reportError` only.
 *
 * "try again" is actionable on both screens that render it. On Today the card
 * carries a Try again control that calls the same handler as pull-to-refresh
 * (`onRefresh` -> `onRefreshPlan` -> the shell's `loadEffectivePlan`); on the
 * Workout tab it calls that tab's own `onRefresh` -> `load`, the fetch that
 * failed. Neither screen promises a retry it cannot perform.
 */
export const PLAN_UNAVAILABLE_MESSAGE =
  "Couldn't load your plan. Check your connection and try again";

/**
 * Maps a settled plan response (or no response at all) onto the union. A
 * response without a `version` is a relationship whose trainer has published
 * nothing yet, which is `none`: the one place that judgement is made.
 */
export function effectivePlanStateFor(
  plan: EffectivePlanResponse | null | undefined,
): EffectivePlanState {
  return plan?.version != null ? { status: "loaded", plan } : { status: "none" };
}

/**
 * The plan for the one consumer that still takes `EffectivePlanResponse |
 * null`: `TraineeOverlayHost`, which is outside CU24's `files_owned`, so the
 * shell narrows for it here instead of leaving it to re-derive readiness from
 * a nullable. It renders none of the plan-state copy.
 *
 * `WorkoutTab` used to be narrowed here too; CU24 (D-W3b-29) moved it onto
 * the union, because it did re-derive readiness from a nullable — its "No
 * plan yet" card was gated on an empty assignment list, which is also true
 * while loading and when the load failed.
 */
export function planFromState(
  state: EffectivePlanState,
): EffectivePlanResponse | null {
  return state.status === "loaded" ? state.plan : null;
}

function mealStatusChip(
  meal: MealAssignment,
  nextId: string | undefined,
  now = new Date(),
): { label: string; tone: "neutral" | "positive" | "attention" | "info" } {
  if (isMealLoggedForCount(meal.status)) {
    return { label: "Logged", tone: "positive" };
  }
  if (
    meal.status === "overdue" ||
    now.getTime() > new Date(meal.windowEndsAt).getTime()
  ) {
    return { label: "Overdue", tone: "attention" };
  }
  if (meal.id === nextId) {
    // Lavender, not amber: "Up next" is not a warning (frames 04 empty/partial).
    return { label: "Up next", tone: "info" };
  }
  if (now.getTime() >= new Date(meal.windowStartsAt).getTime()) {
    return { label: "Due", tone: "attention" };
  }
  return { label: "Later", tone: "neutral" };
}

/**
 * "Up next" in the lavender brandSelected tone with a clock (frames 04 empty/partial).
 * StatusChip's tone-only API has no info tone and lives outside this lane,
 * so the same chip shape is drawn here from the shared tokens.
 */
function UpNextChip({ label }: { label: string }) {
  const palette = semanticColors.brandSelected;
  return (
    <View style={[styles.upNextChip, { backgroundColor: palette.fill }]}>
      <Clock size={14} color={palette.text} strokeWidth={1.75} />
      <Text style={[styles.upNextLabel, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

/** A log saved on the phone and not yet sent (frame 104). */
function WaitingChip() {
  const palette = semanticColors.info;
  return (
    <View
      style={[
        styles.upNextChip,
        { backgroundColor: palette.fill, borderColor: INFO_BORDER, borderWidth: 1 },
      ]}
      accessibilityLabel="Waiting to send"
    >
      <CloudUpload size={14} color={palette.text} strokeWidth={1.75} />
      <Text style={[styles.upNextLabel, { color: palette.text }]}>
        Waiting to send
      </Text>
    </View>
  );
}

type CoachNote = Awaited<
  ReturnType<ReturnType<typeof stage1Api>["listMeCoachNotes"]>
>["items"][number];

export function TodayTab({
  relationship,
  planState,
  planCacheError,
  selectedDate,
  onSelectDate,
  onStartWorkout,
  onOpenDiet,
  onOpenCheckin,
  onRefreshPlan,
  onOpenOverlay,
  unreadNotifications = 0,
  onViewSummary,
}: {
  relationship: CoachingRelationship;
  /** Three-state, never a nullable plan: see `EffectivePlanState` above. */
  planState: EffectivePlanState;
  /** Set when the plan loaded but writing it to the device cache failed. */
  planCacheError: string | null;
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
  onStartWorkout: () => void;
  onOpenDiet: () => void;
  onOpenCheckin: (checkin: Checkin) => void;
  onRefreshPlan: () => void;
  onOpenOverlay: TraineeOverlayOpener;
  /** Unread count for the title-row bell (frame 04). */
  unreadNotifications?: number;
  /**
   * "View summary" on the done card: the shell switches to Workout and opens
   * that execution's summary (D-W10-9).
   */
  onViewSummary?: (executionId: string) => void;
}) {
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const s1 = stage1Api(api);
  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;

  const [workout, setWorkout] = useState<WorkoutAssignment | null>(null);
  const [meals, setMeals] = useState<MealAssignment[]>([]);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  /** False until listMealAssignments returns derived loggingLocked flags. */
  const [lockStateKnown, setLockStateKnown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Four-state, never a nullable model: see `WeekModelState` (CU23,
  // D-W3b-25). `getMeWeek(...).catch(() => null)` used to make a failed
  // `GET /me/week` indistinguishable from "not loaded yet", so the "This
  // week" rollup silently vanished and the date strip filled its day states
  // in from the date alone.
  const [weekState, setWeekState] = useState<WeekModelState>({
    status: "loading",
  });
  const [dayTotals, setDayTotals] = useState<Awaited<
    ReturnType<typeof s1.getMeDay>
  > | null>(null);
  // Steps chip (D-W9-3): the server's answer, not native sync.
  const [stepsChip, setStepsChip] = useState<StepsChipState>({
    status: "loading",
  });
  // Rest-day card: the next scheduled workout, from the same assignments
  // endpoint. Null when none is scheduled or the read failed (line omitted).
  const [nextWorkout, setNextWorkout] = useState<WorkoutAssignment | null>(
    null,
  );
  const [coachNotes, setCoachNotes] = useState<CoachNote[]>([]);
  // Trainee listExceptions is 403 — late-log gate uses a positive sentinel.
  const unresolvedExceptions = 1;
  const [mealActingId, setMealActingId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const coachName =
    relationship.trainerDisplayName?.split(/\s+/)[0] ?? "Your coach";

  const load = useCallback(async () => {
    setLoading(true);
    setLockStateKnown(false);
    setError(null);
    try {
      const weekStart = startOfWeekMonday(selectedDate);
      const nextDay = addDays(selectedDate, 1);
      const [workouts, mealList, week, day, notes, checkins] =
        await Promise.all([
          api.listWorkoutAssignments(relationship.id, {
            fromDate: selectedDate,
            toDate: nextDay,
          }),
          api.listMealAssignments(relationship.id, {
            fromDate: selectedDate,
            toDate: selectedDate,
          }),
          loadWeekModel(
            (start) => s1.getMeWeek(start),
            weekStart,
            "TodayTab.getMeWeek",
          ),
          s1.getMeDay(selectedDate).catch(() => null),
          s1.listMeCoachNotes().catch(() => ({ items: [] as CoachNote[] })),
          api.listCheckins(relationship.id).catch(() => ({ items: [] as Checkin[] })),
        ]);
      setWeekState(week);
      setDayTotals(day);
      setCoachNotes(notes.items.slice(0, 2));
      setWorkout(
        scheduledAssignments(workouts.items).find(
          (item) => item.localDate === selectedDate,
        ) ?? null,
      );
      setMeals(sortMealsByTime(scheduledAssignments(mealList.items)));
      setCheckin(pickTodayCheckin(checkins.items));
      setOfflineHint(false);
      setLockStateKnown(true);
    } catch {
      setError("Couldn't refresh · pull to try again.");
      setOfflineHint(true);
      setWorkout(null);
      setMeals([]);
      setLockStateKnown(false);
      // The whole day load failed, so there is no week to show either. It
      // settles on `unavailable` rather than staying `loading` for ever:
      // "This week" disappearing with no explanation is the same silent
      // degradation CU23 removes.
      setWeekState({ status: "unavailable" });
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, selectedDate, s1]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  useEffect(() => {
    return subscribeAll(() => {
      setRefreshNonce((value) => value + 1);
    });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    onRefreshPlan();
    setRefreshNonce((value) => value + 1);
    await load();
    setRefreshing(false);
  }, [load, onRefreshPlan]);

  useEffect(() => {
    if (!isToday) return;
    let cancelled = false;
    api
      .getStepsToday()
      .then((res) => {
        if (cancelled) return;
        setStepsChip(
          res.steps == null
            ? { status: "not_synced", target: res.target }
            : { status: "synced", steps: res.steps, target: res.target },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        reportError("TodayTab.getStepsToday", err);
        setStepsChip({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [api, isToday, refreshNonce]);

  // Rest only after a successful day load: a failed load also leaves
  // `workout` null, and must not read as a rest day.
  const doneMinutes = workout?.execution
    ? durationMinutesFromExecution(workout.execution)
    : null;
  // "N of M" on the done card (frame 04 done): exercises the trainee executed
  // out of the planned ones. The day's execution here is a summary without
  // exercises, so the full one is read through the API client; when that
  // cannot be read the card keeps its plain "N exercises" label.
  const doneExecutionId =
    workout &&
    (workout.status === "completed" || workout.status === "modified")
      ? (workout.execution?.id ?? null)
      : null;
  const [doneExecuted, setDoneExecuted] = useState<number | null>(null);
  useEffect(() => {
    setDoneExecuted(null);
    if (!doneExecutionId) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => api.getWorkoutExecution(doneExecutionId))
      .then((execution) => {
        // An execution with no exercise rows (nothing was recorded per
        // exercise) is no source for a count: keep the plain label.
        if (cancelled || execution.exercises.length === 0) return;
        setDoneExecuted(
          // Same rule as the summary screen's "Exercises N of M": an exercise
          // counts once none of its sets is still pending.
          execution.exercises.filter((ex) =>
            ex.sets.every((set) => set.status !== "pending"),
          ).length,
        );
      })
      .catch((err) => {
        reportError("TodayTab.getWorkoutExecution", err);
      });
    return () => {
      cancelled = true;
    };
  }, [api, doneExecutionId, refreshNonce]);
  const restDay =
    planState.status === "loaded" && !loading && lockStateKnown && !workout;
  useEffect(() => {
    if (!restDay || !isToday) {
      setNextWorkout(null);
      return;
    }
    let cancelled = false;
    api
      .listWorkoutAssignments(relationship.id, {
        fromDate: addDays(selectedDate, 1),
        toDate: addDays(selectedDate, 7),
      })
      .then((res) => {
        if (cancelled) return;
        const upcoming = scheduledAssignments(res.items)
          .filter(
            (item) =>
              item.localDate > today &&
              item.status !== "missed" &&
              item.status !== "completed" &&
              item.status !== "modified" &&
              item.status !== "skipped",
          )
          .sort((a, b) => a.windowStartsAt.localeCompare(b.windowStartsAt));
        setNextWorkout(upcoming[0] ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        reportError("TodayTab.listUpcomingWorkouts", err);
        setNextWorkout(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api, relationship.id, restDay, isToday, today, selectedDate, refreshNonce]);

  const rings = useMemo(
    () => buildNutritionRings(meals, dayTotals?.totals ?? null),
    [meals, dayTotals],
  );

  const mealsDone = useMemo(
    () => meals.filter((m) => isMealLoggedForCount(m.status)).length,
    [meals],
  );

  // The frames lead with the workout whenever one is scheduled and not yet
  // finished; otherwise the usual next-up item (meal, check-in).
  const hero = useMemo(() => {
    if (!isToday) return null;
    if (
      workout &&
      workout.status !== "completed" &&
      workout.status !== "modified" &&
      workout.status !== "skipped" &&
      workout.status !== "missed"
    ) {
      return { kind: "workout" as const, workout };
    }
    // Done and rest cards lead the day (frames 04 done / rest); the meal
    // is then carried by the Meals list. A due check-in still shows.
    const next = nextUp({ meals, workout, checkin });
    const workoutCardLeads =
      !workout ||
      workout.status === "completed" ||
      workout.status === "modified";
    return next && next.kind === "meal" && workoutCardLeads ? null : next;
  }, [checkin, isToday, meals, workout]);

  const nextOpenMeal = meals.find(
    (meal) => meal.status === "pending" || meal.status === "overdue",
  );

  // Offline means the day load failed or the device reports no network. The
  // outbox is read only then: that is when "waiting to send" is news.
  const deviceOffline = useDeviceOffline();
  const offline = offlineHint || deviceOffline;
  const queued = useQueuedLogs(offline);

  const lateLoggableCount = meals.filter((meal) =>
    canShowMealLogActions({
      lockStateKnown,
      selectedDate,
      today,
      meal,
      unresolvedExceptionCount: unresolvedExceptions,
    }),
  ).length;

  async function handleConfirmMeal(meal: MealAssignment) {
    setMealActingId(meal.id);
    setError(null);
    try {
      await confirmMealAssignment(
        api,
        sync,
        relationship.id,
        meal,
        coachName,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof MealSyncError
          ? err.message
          : "Couldn't save that meal. Try again when you're online.",
      );
    } finally {
      setMealActingId(null);
    }
  }

  const workoutSets = (workout?.workoutDay.exercises ?? []).reduce(
    (sum, ex) => sum + ex.setTargets.length,
    0,
  );
  const workoutMins = workout
    ? estimateDurationMinutesFromDay(workout.workoutDay)
    : null;

  return (
    <>
      {isToday ? (
        <ReviewedBanner coachName={coachName} onOpenCheckin={onOpenCheckin} />
      ) : null}
    <Screen
      chrome="app"
      title="Today"
      showHeader={false}
      refreshing={refreshing}
      onRefresh={() => {
        void onRefresh();
      }}
    >
      <View style={styles.stack}>
        <TodayHeader
          selectedDate={selectedDate}
          isToday={isToday}
          unreadNotifications={unreadNotifications}
          onOpenSync={() => onOpenOverlay({ screen: "sync" })}
          onOpenNotifications={() => onOpenOverlay({ screen: "notifications" })}
        />
        {/*
          The strip renders this screen's own week state (CU23 review fix).
          It used to fetch `GET /me/week` a second time for the same week and
          could never re-fetch, so it kept telling the trainee to pull down —
          which did nothing for it — while the "This week" card below showed
          the real rollup. One load, one state, one retry.
        */}
        <TraineeDateNavigator
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          weekState={weekState}
          day={dayTotals}
        />

        {offline ? (
          <Text style={styles.offlineHint} accessibilityRole="text">
            {queued && queued.count > 0
              ? queuedLogsLabel(queued.count)
              : "Saved on phone · showing last sync"}
          </Text>
        ) : null}
        {error ? <ErrorBanner message={error} /> : null}
        {/*
          The plan was fetched but could not be cached on the device. That is
          a real failure with its own cause, so it is shown rather than
          swallowed or disguised as "no plan" (D-W3-12, D-W3-18).
        */}
        {planCacheError ? <ErrorBanner message={planCacheError} /> : null}

        {/*
          The plan could not be loaded and nothing was cached (CU24,
          D-W3b-27). Before this state existed that case resolved to `none`,
          so an offline first run told the trainee their coach was preparing a
          plan when the truth was that the app could not ask. The copy is
          static and the retry is the same action as pull-to-refresh.
        */}
        {planState.status === "unavailable" ? (
          <View style={styles.card} accessibilityLabel={PLAN_UNAVAILABLE_MESSAGE}>
            <Text style={styles.cardTitle}>Couldn&apos;t load your plan</Text>
            <Text style={styles.body}>{PLAN_UNAVAILABLE_MESSAGE}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              style={styles.retry}
              onPress={() => {
                void onRefresh();
              }}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {planState.status === "none" ? (
          <View
            style={styles.card}
            accessibilityLabel="Your coach is preparing your plan"
          >
            <Text style={styles.cardTitle}>
              Your coach is preparing your plan
            </Text>
            <Text style={styles.body}>
              {coachName} will publish your meals and workouts soon. Pull down
              to check for updates.
            </Text>
          </View>
        ) : null}

        {!isToday && !isFuture && !loading ? (
          <PastDayBanner
            localDate={selectedDate}
            canStillLog={lateLoggableCount > 0}
            onBackToToday={() => onSelectDate(today)}
          />
        ) : null}

        {loading ? <TodaySkeleton /> : null}

        {/*
          Names the plan-loaded region for screen readers and the Maestro
          flows that wait on it (CU22, D-W3b-24: gated on the plan, so a
          plan-less trainee never gets it). Visually hidden: the frames show
          no heading here; the workout itself is in the hero below.
        */}
        {planState.status === "loaded" && isToday ? (
          <Text
            style={styles.srOnly}
            accessibilityRole="header"
            accessibilityLabel={
              restDay ? "Today's workout: rest day" : undefined
            }
          >
            Today&apos;s workout
          </Text>
        ) : null}

        {planState.status === "loaded" && !loading ? (
          <TodaySummaryCard
            rings={rings}
            workoutDone={
              workout &&
              (workout.status === "completed" || workout.status === "modified")
                ? 1
                : 0
            }
            workoutTotal={workout ? 1 : 0}
            mealsDone={mealsDone}
            mealsTotal={meals.length}
            steps={isToday ? stepsChip : { status: "unavailable" }}
            workoutUnknown={!lockStateKnown}
            onOpenSteps={() => onOpenOverlay({ screen: "steps_settings" })}
          />
        ) : null}

        {planState.status === "loaded" &&
        !loading &&
        workout &&
        (workout.status === "completed" || workout.status === "modified") ? (
          <View
            style={styles.hero}
            accessibilityLabel={`Workout done: ${workout.workoutDayName}`}
          >
            <View style={styles.doneChip}>
              <Check size={16} color={colors.white} strokeWidth={2.25} />
              <Text style={styles.doneChipLabel}>
                {workout.execution?.completedAt
                  ? `Done · ${formatClockTime(workout.execution.completedAt, timeZone)}`
                  : "Done"}
              </Text>
            </View>
            <Text style={styles.heroTitle}>{workout.workoutDayName}</Text>
            <Text style={styles.heroItems}>
              {doneExecuted != null
                ? `${doneExecuted} of ${workout.workoutDay.exercises.length} exercises`
                : exerciseCountLabel(workout.workoutDay.exercises.length)}
              {doneMinutes != null ? ` · ${doneMinutes} min` : ""}
            </Text>
            {workout.execution && onViewSummary ? (
              <View style={styles.heroBtns}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="View summary"
                  onPress={() => onViewSummary(workout.execution!.id)}
                  style={styles.heroPrimary}
                >
                  <Text style={styles.heroPrimaryLabel}>View summary</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {restDay ? (
          <View
            style={styles.restCard}
            accessibilityLabel="Rest day. Recovery is part of the plan"
          >
            <View style={styles.restChip}>
              <Moon size={16} color={semanticColors.neutral.text} strokeWidth={1.75} />
              <Text style={styles.restChipLabel}>Rest day</Text>
            </View>
            <Text style={styles.restTitle}>Recovery is part of the plan</Text>
            {nextWorkout && isToday ? (
              <Text style={styles.restNext}>
                {`Next: ${nextWorkout.workoutDayName} · ${formatCivilDate(nextWorkout.localDate)}, ${formatClockTime(nextWorkout.windowStartsAt, timeZone)}`}
              </Text>
            ) : null}
          </View>
        ) : null}

        {planState.status === "loaded" && hero && !loading ? (
          <View style={styles.hero} accessibilityLabel={nextUpEyebrow(hero)}>
            <Text style={styles.heroEyebrow}>
              {hero.kind === "workout" &&
              hero.workout.status !== "in_progress" &&
              hero.workout.status !== "paused"
                ? `Today · ${formatClockTime(hero.workout.windowStartsAt, timeZone)}`
                : nextUpEyebrow(hero)}
            </Text>
            {hero.kind === "meal" ? (
              <>
                <Text style={styles.heroTitle}>
                  {hero.meal.mealName}
                  {" · "}
                  {formatClockTime(hero.meal.windowStartsAt, timeZone)}
                </Text>
                {mealItemLine(hero.meal) ? (
                  <Text style={styles.heroItems}>{mealItemLine(hero.meal)}</Text>
                ) : null}
                {(() => {
                  const macros = nutrientsFromMealPrescription(hero.meal);
                  return (
                    <Text style={styles.heroMacros}>
                      <Text style={styles.heroMacroBold}>
                        {formatNumber(macros.kcal)}
                      </Text>{" "}
                      kcal{"  "}P{" "}
                      <Text style={styles.heroMacroBold}>{macros.protein}</Text> g
                      {"  "}C{" "}
                      <Text style={styles.heroMacroBold}>{macros.carbs}</Text> g
                      {"  "}F{" "}
                      <Text style={styles.heroMacroBold}>{macros.fat}</Text> g
                    </Text>
                  );
                })()}
                {(() => {
                  if (!lockStateKnown) {
                    return null;
                  }
                  const lockCopy = mealLockCopy(hero.meal, coachName);
                  if (lockCopy) {
                    return (
                      <Text style={styles.heroItems}>{lockCopy}</Text>
                    );
                  }
                  if (
                    !canShowMealLogActions({
                      lockStateKnown,
                      selectedDate,
                      today,
                      meal: hero.meal,
                      unresolvedExceptionCount: unresolvedExceptions,
                    })
                  ) {
                    return null;
                  }
                  return (
                    <View style={styles.heroBtns}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Eaten as planned"
                        disabled={mealActingId === hero.meal.id}
                        onPress={() => {
                          void handleConfirmMeal(hero.meal);
                        }}
                        style={styles.heroPrimary}
                      >
                        <Text style={styles.heroPrimaryLabel}>
                          {mealActingId === hero.meal.id
                            ? "Saving…"
                            : "Eaten as planned"}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Something different"
                        onPress={() =>
                          onOpenOverlay({
                            screen: "something_different",
                            assignmentId: hero.meal.id,
                          })
                        }
                        style={styles.heroSecondary}
                      >
                        <Text style={styles.heroSecondaryLabel}>
                          Something different
                        </Text>
                      </Pressable>
                    </View>
                  );
                })()}
              </>
            ) : null}
            {hero.kind === "workout" ? (
              <>
                <Text style={styles.heroTitle}>
                  {hero.workout.workoutDayName}
                </Text>
                <Text style={styles.heroItems}>
                  {exerciseCountLabel(hero.workout.workoutDay.exercises.length)}
                  {workoutMins != null ? ` · about ${workoutMins} min` : ""}
                  {workoutSets > 0
                    ? ` · ${workoutSets} ${workoutSets === 1 ? "set" : "sets"}`
                    : ""}
                </Text>
                <View style={styles.heroBtns}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      hero.workout.status === "in_progress" ||
                      hero.workout.status === "paused"
                        ? "Continue workout"
                        : "Start workout"
                    }
                    onPress={onStartWorkout}
                    style={styles.heroPrimary}
                  >
                    <Text style={styles.heroPrimaryLabel}>
                      {hero.workout.status === "in_progress" ||
                      hero.workout.status === "paused"
                        ? "Continue workout"
                        : "Start workout"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            {hero.kind === "checkin" ? (
              <>
                <Text style={styles.heroTitle}>Weekly check-in</Text>
                <Text style={styles.heroItems}>
                  Due · keep your coach in the loop
                </Text>
                <View style={styles.heroBtns}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Start check-in"
                    onPress={() => onOpenCheckin(hero.checkin)}
                    style={styles.heroPrimary}
                  >
                    <Text style={styles.heroPrimaryLabel}>Start check-in</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {isToday ? <RemindersPausedCard /> : null}

        {planState.status === "loaded" && !loading ? (
          <View style={styles.mealsSection}>
            <View style={styles.mealsHead}>
              <Text style={styles.mealsLabel} accessibilityRole="header">
                Meals
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open diet"
                onPress={onOpenDiet}
                style={styles.secLink}
              >
                <Text style={styles.mealsCount}>
                  {meals.length === 0
                    ? "Diet ›"
                    : `${mealsDone} of ${meals.length} logged ›`}
                </Text>
              </Pressable>
            </View>
            {rings.some((r) => r.unknown) ? (
              <Text style={styles.footnote}>
                Some foods have no nutrition data. Totals show ≥ when unknown.
              </Text>
            ) : null}
            {meals.length === 0 && !loading ? (
              <Text style={styles.body}>No meals planned today.</Text>
            ) : (
              <View style={styles.mealsList}>
                {meals.map((meal, index) => {
                  const chip = mealStatusChip(meal, nextOpenMeal?.id);
                  const kcal = mealKcalFromDayTotals(
                    meal,
                    dayTotals?.totals.perMeal,
                  );
                  const logged = isMealLoggedForCount(meal.status);
                  // A logged meal is "Logged" whatever the lock says; the lock
                  // only closes meals that were never logged.
                  const lockCopy =
                    lockStateKnown && !logged
                      ? mealLockCopy(meal, coachName)
                      : null;
                  const sub = [
                    mealItemLine(meal),
                    kcal != null ? formatKcal(kcal, false) : null,
                    lockCopy,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <View
                      key={meal.id}
                      style={[styles.mealRow, index > 0 && styles.mealRowRule]}
                    >
                      <Text style={styles.mealTime}>
                        {formatClockTime(meal.windowStartsAt, timeZone)}
                      </Text>
                      <View style={styles.mealMain}>
                        <Text style={styles.mealName}>
                          {cleanFoodLabel(meal.mealName)}
                        </Text>
                        <Text style={styles.mealMeta} numberOfLines={1}>
                          {sub}
                        </Text>
                      </View>
                      {!lockCopy &&
                      !isMealLoggedForCount(meal.status) &&
                      queued?.mealAssignmentIds.has(meal.id) ? (
                        <WaitingChip />
                      ) : !lockCopy && chip.tone === "info" ? (
                        <UpNextChip label={chip.label} />
                      ) : (
                        <StatusChip
                          label={lockCopy ? "Closed" : chip.label}
                          tone={
                            lockCopy || chip.tone === "info"
                              ? "neutral"
                              : chip.tone
                          }
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        <StepsCard />

        {/*
          "This week" renders only from a loaded week read model. On failure
          the trainee gets the honest unavailable card below with a retry
          (CU23, D-W3b-25) — never counts or day states invented locally.
          D-W3b-25's "Weekly view isn't available yet" rehearsal fallback is
          retired by D-W3b-37; this is the real endpoint's failure state.
        */}
        {weekState.status === "loaded" ? (
          <>
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>This week</Text>
            </View>
            <View style={styles.card}>
              <WeeklyConsistency
                workoutCompleted={weekState.week.workouts.completed}
                workoutAssigned={weekState.week.workouts.assigned}
                mealsLogged={weekState.week.meals.logged}
                mealsAssigned={weekState.week.meals.assigned}
                days={weekState.week.days}
                encouragement={
                  isToday
                    ? "Yesterday got away from you? Today's a fresh start."
                    : null
                }
              />
            </View>
          </>
        ) : null}

        {weekState.status === "unavailable" ? (
          <>
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>This week</Text>
            </View>
            <View style={styles.card} accessibilityLabel={WEEK_UNAVAILABLE_MESSAGE}>
              <Text style={styles.body}>{WEEK_UNAVAILABLE_MESSAGE}</Text>
              {/*
                Distinct from the plan card's "Try again" label so each
                control names what it reloads: this screen can show both
                cards at once (CU24's plan state and CU23's week state are
                independent loads).
              */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reload this week"
                style={styles.retry}
                onPress={() => {
                  void onRefresh();
                }}
              >
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {coachNotes.length > 0 ? (
          <>
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>From your coach</Text>
            </View>
            <View style={styles.card}>
              {coachNotes.map((note) => (
                <View key={note.id} style={styles.note}>
                  <Text style={styles.noteBody}>{note.body}</Text>
                  <Text style={styles.noteMeta}>
                    {note.seenAt ? "Read" : "New"} ·{" "}
                    {formatInstant(note.sharedAt ?? note.createdAt, timeZone)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <TodayCheckinCard
          relationship={relationship}
          onOpen={onOpenCheckin}
        />

        {planState.status === "loaded" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View meal plan"
            onPress={() => onOpenOverlay({ screen: "meal_plan" })}
          >
            <Text style={styles.planLink}>View assigned meal plan ›</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  offlineHint: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
  },
  hero: {
    backgroundColor: colors.deepNavy,
    borderRadius: 22,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  heroEyebrow: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: spacing.xs,
  },
  heroItems: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 16,
    lineHeight: 24,
  },
  heroMacros: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    marginTop: spacing.xs,
  },
  heroMacroBold: {
    color: colors.white,
    fontWeight: "700",
  },
  heroBtns: {
    gap: 4,
    marginTop: spacing.md,
  },
  heroPrimary: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.control,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  heroPrimaryLabel: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  heroSecondary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  heroSecondaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  secHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  secTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  secLink: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  secLinkText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  retry: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.indigo,
    borderRadius: radii.card,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  retryLabel: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.white,
    borderColor: surface.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  cardTitle: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  footnote: {
    color: colors.midGrey,
    fontSize: 12,
    lineHeight: 16,
  },
  woTop: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  exRow: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  srOnly: {
    height: 1,
    overflow: "hidden",
    position: "absolute",
    width: 1,
  },
  mealsSection: { gap: spacing.xs, marginTop: spacing.sm },
  mealsList: {
    backgroundColor: colors.white,
    borderColor: surface.border,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  mealRowRule: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mealTime: {
    color: colors.darkGrey,
    fontSize: 14,
    minWidth: 64,
    ...({ fontVariant: ["tabular-nums"] } as object),
  },
  mealsHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  mealsLabel: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  mealsCount: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "500",
  },
  upNextChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  upNextLabel: {
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    fontWeight: "600",
  },
  doneChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  doneChipLabel: { color: colors.white, fontSize: 14, fontWeight: "600" },
  restCard: {
    backgroundColor: colors.white,
    borderColor: surface.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  restChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: semanticColors.neutral.fill,
    borderRadius: 16,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  restChipLabel: {
    color: semanticColors.neutral.text,
    fontSize: 14,
    fontWeight: "600",
  },
  restTitle: {
    color: colors.deepNavy,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: spacing.xs,
  },
  restNext: { color: colors.darkGrey, fontSize: 15 },
  mealRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  mealMain: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  mealName: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  mealMeta: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  mealRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  mealKcal: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "700",
  },
  note: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  noteBody: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  noteMeta: {
    color: colors.midGrey,
    fontSize: 12,
  },
  planLink: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: spacing.md,
    textAlign: "center",
  },
});
