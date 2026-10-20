import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  CalendarDays,
  CircleUserRound,
  Dumbbell,
  House,
  Utensils,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";
import type {
  Checkin,
  CoachingRelationship,
  EffectivePlanResponse,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { useAuth } from "../auth/AuthProvider";
import { AppTopBar } from "../components/AppTopBar";
import {
  addDays,
  formatHeadingDate,
  localDateInTimezone,
  startOfWeekMonday,
} from "../lib/dates";
import {
  TraineeOverlayHost,
  type TraineeOverlay,
  type TraineeOverlayOpener,
} from "../navigation/TraineeOverlay";
import {
  routeFromParsedLink,
  type ParsedDeepLink,
} from "../navigation/linking";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import { useSyncEngine } from "../sync/SyncProvider";
import { CheckinScreen } from "./CheckinScreen";
import { DietTab } from "./DietTab";
import { MoreScreen } from "./MoreScreen";
import { ProgressTab } from "./ProgressTab";
import { TodayTab } from "./TodayTab";
import { WorkoutTab } from "./WorkoutTab";
import { ActiveWorkoutScreen } from "./ActiveWorkoutScreen";
import { WorkoutSummaryScreen } from "./WorkoutSummaryScreen";
import { openActiveWorkout } from "./workoutSession";
import {
  isCaptureModeEnabled,
  registerTraineeCaptureNav,
} from "../dev/captureBridge";
import { scheduledAssignments } from "./scheduledAssignments";
import { pickTodayCheckin } from "./pickTodayCheckin";
import { invalidateRelationshipDayData } from "./dataCache";
import { subscribeMealNotificationResponses } from "../notifications/nativeActions";
import type { NotificationDeepLink } from "../notifications/routing";
import { ForegroundBanner } from "./notifications/ForegroundBanner";

type TraineeTab = "today" | "workout" | "diet" | "progress" | "more";

const TABS: Array<{
  id: TraineeTab;
  label: string;
  Icon: typeof House;
}> = [
  { id: "today", label: "Today", Icon: House },
  { id: "workout", label: "Workout", Icon: Dumbbell },
  { id: "diet", label: "Diet", Icon: Utensils },
  { id: "progress", label: "Progress", Icon: CalendarDays },
  { id: "more", label: "More", Icon: CircleUserRound },
];

const TAB_TITLES: Record<TraineeTab, string> = {
  today: "Today",
  workout: "Workout",
  diet: "Diet",
  progress: "Progress",
  more: "More",
};

export function TraineeShell({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const {
    me,
    signOut,
    refreshSession,
    setActiveRelationship,
    api,
    pendingNotificationLink,
    clearPendingNotificationLink,
    pendingDeepLink,
    clearPendingDeepLink,
  } = useAuth();
  const sync = useSyncEngine();
  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);

  const [tab, setTab] = useState<TraineeTab>("today");
  const [selectedDate, setSelectedDate] = useState(today);
  const [workoutAutostart, setWorkoutAutostart] = useState(false);
  const [pendingWorkoutStartId, setPendingWorkoutStartId] = useState<
    string | null
  >(null);
  const [workoutImmersive, setWorkoutImmersive] = useState(false);
  const [overlay, setOverlay] = useState<TraineeOverlay | null>(null);
  const [activeCheckin, setActiveCheckin] = useState<Checkin | null>(null);
  const [effectivePlan, setEffectivePlan] =
    useState<EffectivePlanResponse | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [captureWorkout, setCaptureWorkout] =
    useState<WorkoutExecution | null>(null);
  const [captureWorkoutSummary, setCaptureWorkoutSummary] = useState<{
    execution: WorkoutExecution;
    assignment: WorkoutAssignment | null;
    weekAssignments: WorkoutAssignment[];
    weekStart: string;
  } | null>(null);
  const captureWorkoutRef = useRef<WorkoutExecution | null>(null);
  captureWorkoutRef.current = captureWorkout;

  const openOverlay: TraineeOverlayOpener = useCallback((next) => {
    setOverlay(next);
  }, []);

  const handleStartWorkoutFromOverview = useCallback((assignmentId: string) => {
    setTab("workout");
    setPendingWorkoutStartId(assignmentId);
  }, []);

  const handleNotificationNavigate = useCallback(
    (link: NotificationDeepLink) => {
      const route = link.route;
      if (route.type === "unavailable") {
        setOverlay({ screen: "deep_link", reason: route.reason });
        return;
      }
      if (route.type === "workout_overview" || route.type === "workout_active") {
        setTab("workout");
        setOverlay({
          screen: "workout_overview",
          assignmentId: route.assignmentId,
        });
        return;
      }
      if (route.type === "meal") {
        setTab("diet");
        void (async () => {
          try {
            const listed = await api.listMealAssignments(relationship.id, {
              fromDate: addDays(today, -30),
              toDate: addDays(today, 7),
            });
            const match = listed.items.find(
              (item) => item.id === route.assignmentId,
            );
            if (!match) {
              setOverlay({
                screen: "deep_link",
                reason: "This meal isn't available anymore.",
              });
              return;
            }
            setSelectedDate(match.localDate);
            setOverlay({
              screen: "something_different",
              assignmentId: match.id,
            });
          } catch {
            setOverlay({
              screen: "deep_link",
              reason: "This meal isn't available anymore.",
            });
          }
        })();
        return;
      }
      if (route.type === "checkin") {
        setTab("today");
        void (async () => {
          try {
            const list = await api.listCheckins(relationship.id);
            const match = list.items.find(
              (item) => item.id === route.checkinId,
            );
            if (match) setActiveCheckin(match);
            else
              setOverlay({
                screen: "deep_link",
                reason: "This check-in isn't available anymore.",
              });
          } catch {
            setOverlay({
              screen: "deep_link",
              reason: "This check-in isn't available anymore.",
            });
          }
        })();
        return;
      }
      if (route.type === "note") {
        setTab("today");
        setOverlay(null);
        return;
      }
      if (route.type === "reactivate") {
        setTab("today");
        setOverlay({ screen: "ended" });
        return;
      }
      if (route.type === "reminders") {
        setTab("more");
        setOverlay({ screen: "reminder_settings" });
        return;
      }
      if (route.type === "tab") {
        setTab(route.tab);
        return;
      }
      setTab(
        link.tab === "workout"
          ? "workout"
          : link.tab === "diet"
            ? "diet"
            : link.tab === "progress"
              ? "progress"
              : link.tab === "more"
                ? "more"
                : "today",
      );
    },
    [api, relationship.id, today],
  );

  const applyParsedDeepLink = useCallback(
    (link: ParsedDeepLink) => {
      const route = routeFromParsedLink(link);
      const domainEntityType =
        link.kind === "meal"
          ? ("meal_assignment" as const)
          : link.kind === "workout"
            ? ("workout_assignment" as const)
            : link.kind === "checkin"
              ? ("checkin" as const)
              : ("coaching_relationship" as const);
      handleNotificationNavigate({
        tab:
          route.type === "meal"
            ? "diet"
            : route.type === "workout_overview" ||
                route.type === "workout_active" ||
                route.type === "workout_summary"
              ? "workout"
              : route.type === "reminders"
                ? "more"
                : route.type === "tab"
                  ? route.tab
                  : "today",
        domainEntityType,
        domainEntityId: link.id,
        route,
        path: `/go/${link.kind}/${link.id}`,
        refetchRequired: true,
      });
    },
    [handleNotificationNavigate],
  );

  const loadEffectivePlan = useCallback(async () => {
    try {
      await sync.pullAndApply().catch(() => undefined);
      const result = await api.getEffectivePlan(relationship.id);
      setEffectivePlan(result);
      if (result.version) {
        await sync.store.upsertLocal({
          entityType: "effective_plan",
          recordId: result.version.id,
          serverVersion: result.version.recordVersion,
          payloadJson: JSON.stringify(result),
          tombstone: false,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      const cached = await sync.store.listLocal("effective_plan");
      const newest = cached
        .filter((row) => !row.tombstone && row.payloadJson)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (newest?.payloadJson) {
        setEffectivePlan(JSON.parse(newest.payloadJson) as EffectivePlanResponse);
      } else {
        setEffectivePlan(null);
      }
    }
  }, [api, relationship.id, sync]);

  const refreshUnread = useCallback(async () => {
    try {
      const page = await api.listNotifications();
      setUnreadNotifications(
        page.items.filter((item) => item.readAt == null).length,
      );
    } catch {
      setUnreadNotifications(0);
    }
  }, [api]);

  useEffect(() => {
    void loadEffectivePlan();
    void refreshUnread();
  }, [loadEffectivePlan, refreshUnread]);

  useEffect(() => {
    return subscribeMealNotificationResponses((event) => {
      if (event.kind !== "open") return;
      if (event.mealAssignmentId) {
        setTab("diet");
        setOverlay({
          screen: "something_different",
          assignmentId: event.mealAssignmentId,
        });
        return;
      }
      setTab("diet");
    });
  }, []);

  useEffect(() => {
    setSelectedDate(today);
  }, [today]);

  useRealtimeHints(api, relationship.id, () => {
    void loadEffectivePlan();
    void refreshUnread();
  });

  useEffect(() => {
    if (!isCaptureModeEnabled()) return;
    registerTraineeCaptureNav({
      setTab,
      openOverlay,
      openCheckin: setActiveCheckin,
      signOut,
      async startTodayWorkout() {
        setWorkoutAutostart(true);
        setTab("workout");
        await new Promise((resolve) => setTimeout(resolve, 3500));
      },
      async openSomethingDifferent() {
        const listed = await api.listMealAssignments(relationship.id, {
          fromDate: today,
          toDate: today,
        });
        const scheduled = scheduledAssignments(listed.items);
        const meal =
          scheduled.find(
            (item) => item.status === "pending" || item.status === "overdue",
          ) ?? (isCaptureModeEnabled() ? scheduled[0] : undefined);
        if (meal) {
          openOverlay({
            screen: "something_different",
            assignmentId: meal.id,
          });
        }
      },
      async openFoodSearch() {
        const listed = await api.listMealAssignments(relationship.id, {
          fromDate: today,
          toDate: today,
        });
        const scheduled = scheduledAssignments(listed.items);
        const meal =
          scheduled.find(
            (item) => item.status === "pending" || item.status === "overdue",
          ) ?? scheduled[0];
        if (meal) {
          openOverlay({
            screen: "food_search",
            assignmentId: meal.id,
          });
        }
      },
      async openWorkoutOverview() {
        const from = addDays(today, -7);
        const listed = await api.listWorkoutAssignments(relationship.id, {
          fromDate: from,
          toDate: addDays(today, 7),
        });
        const scheduled = scheduledAssignments(listed.items).filter(
          (item) => item.workoutDay.exercises.length > 0,
        );
        const startable = (item: (typeof scheduled)[number]) =>
          item.status === "assigned" ||
          item.status === "missed" ||
          item.status === "in_progress" ||
          item.status === "paused";
        const actionable = scheduled.filter(startable);
        // Prefer a startable Lower body B so the sticky CTA is "Start workout".
        const workout =
          actionable.find((item) =>
            /lower body b/i.test(item.workoutDayName),
          ) ??
          actionable.find((item) => item.localDate === selectedDate) ??
          actionable.find((item) => item.localDate === today) ??
          actionable[0] ??
          scheduled.find((item) =>
            /lower body b/i.test(item.workoutDayName),
          ) ??
          scheduled.find((item) => item.localDate === selectedDate) ??
          scheduled.find((item) => item.localDate === today) ??
          scheduled[0];
        if (workout) {
          setSelectedDate(workout.localDate);
          openOverlay({
            screen: "workout_overview",
            assignmentId: workout.id,
          });
        }
      },
      async openTodayCheckin() {
        const list = await api.listCheckins(relationship.id);
        const due = pickTodayCheckin(list.items) ?? list.items[0];
        if (due) setActiveCheckin(due);
      },
      closeOverlay() {
        setOverlay(null);
        setActiveCheckin(null);
      },
      async ensureWorkoutDay() {
        const from = addDays(today, -21);
        const listed = await api.listWorkoutAssignments(relationship.id, {
          fromDate: from,
          toDate: addDays(today, 14),
        });
        const scheduled = scheduledAssignments(listed.items).filter(
          (item) => item.workoutDay.exercises.length > 0,
        );
        const startable = (item: (typeof scheduled)[number]) =>
          item.status === "assigned" ||
          item.status === "missed" ||
          item.status === "in_progress" ||
          item.status === "paused";
        const actionable = scheduled.filter(startable);
        const workout =
          actionable.find((item) =>
            /lower body b/i.test(item.workoutDayName),
          ) ??
          actionable.find((item) => item.localDate === today) ??
          actionable[0] ??
          scheduled.find((item) =>
            /lower body b/i.test(item.workoutDayName),
          ) ??
          scheduled.find((item) => item.localDate === today) ??
          scheduled[0];
        if (workout?.localDate) {
          setSelectedDate(workout.localDate);
        }
      },
      async startCaptureWorkout() {
        setCaptureWorkoutSummary(null);
        setOverlay(null);
        const from = addDays(today, -21);
        const listed = await api.listWorkoutAssignments(relationship.id, {
          fromDate: from,
          toDate: addDays(today, 14),
        });
        const scheduled = scheduledAssignments(listed.items).filter(
          (item) => item.workoutDay.exercises.length > 0,
        );
        const assignment =
          scheduled.find(
            (item) =>
              item.status === "assigned" ||
              item.status === "in_progress" ||
              item.status === "paused",
          ) ?? scheduled[0];
        if (!assignment) return;
        setSelectedDate(assignment.localDate);
        if (
          assignment.status === "completed" ||
          assignment.status === "modified" ||
          assignment.status === "skipped"
        ) {
          // Capture stub so TR-11 empty/done guard is visible; TR-12 uses summary stub.
          const stubExecution =
            assignment.execution != null
              ? await api.getWorkoutExecution(assignment.execution.id)
              : null;
          if (stubExecution) {
            setCaptureWorkout(stubExecution);
          }
          return;
        }
        const execution = await openActiveWorkout(api, sync, assignment);
        setCaptureWorkout(execution);
      },
      async showCaptureWorkoutSummary() {
        setOverlay(null);
        let stub = captureWorkoutRef.current;
        const weekStart = startOfWeekMonday(today);
        const listed = await api.listWorkoutAssignments(relationship.id, {
          fromDate: addDays(today, -28),
          toDate: addDays(today, 7),
        });
        const scheduled = scheduledAssignments(listed.items);
        const weekAssignments = scheduled.filter((item) => {
          const d = item.localDate;
          return d >= weekStart && d <= addDays(weekStart, 6);
        });
        const done =
          scheduled.find(
            (item) =>
              /lower body b/i.test(item.workoutDayName) &&
              item.execution &&
              (item.status === "completed" || item.status === "modified"),
          ) ??
          scheduled.find(
            (item) =>
              item.execution &&
              (item.status === "completed" || item.status === "modified"),
          );
        if (!stub && done?.execution) {
          stub = await api.getWorkoutExecution(done.execution.id);
        }
        if (!stub) return;
        const completedAt =
          stub.completedAt ?? new Date().toISOString();
        const startedAt =
          stub.startedAt &&
          Date.parse(completedAt) - Date.parse(stub.startedAt) > 30 * 60_000
            ? stub.startedAt
            : new Date(Date.parse(completedAt) - 52 * 60_000).toISOString();
        const needsDayEnrich =
          stub.exercises.length === 0 ||
          stub.exercises.every((exercise) => exercise.sets.length === 0);
        const dayExercises = done?.workoutDay.exercises ?? [];
        const sourceExercises = needsDayEnrich
          ? dayExercises.map((exercise, index) => {
              const now = completedAt;
              return {
                id: exercise.id,
                workoutExecutionId: stub!.id,
                exerciseId: exercise.id,
                name: exercise.name,
                order: index + 1,
                status: "completed" as const,
                sets: exercise.setTargets.map((target, setIndex) => ({
                  id: target.id,
                  exerciseExecutionId: exercise.id,
                  setTargetId: target.id,
                  order: setIndex + 1,
                  status: "completed" as const,
                  prescribedReps: target.reps,
                  prescribedLoadLabel: target.loadLabel,
                  actualReps: target.reps,
                  actualLoadLabel: target.loadLabel,
                  completedAt: now,
                  createdAt: now,
                  updatedAt: now,
                })),
                createdAt: now,
                updatedAt: now,
              };
            })
          : stub.exercises;
        // Mockup 12: RDL load bump + one skipped calf set ("Changed from the plan").
        const enrichedExercises = sourceExercises.map((exercise) => {
          const name = exercise.name.toLowerCase();
          if (name.includes("romanian") || name.includes("deadlift")) {
            return {
              ...exercise,
              status: "completed" as const,
              sets: exercise.sets.map((set) => {
                if (set.order === 2 || set.order === 3) {
                  const from =
                    set.prescribedLoadLabel?.trim() ||
                    set.actualLoadLabel?.trim() ||
                    "20 kg";
                  return {
                    ...set,
                    status: "modified" as const,
                    prescribedLoadLabel: from,
                    actualLoadLabel: "22.5 kg",
                  };
                }
                return set;
              }),
            };
          }
          if (name.includes("calf")) {
            return {
              ...exercise,
              name: exercise.name.toLowerCase().includes("seated")
                ? exercise.name
                : "Seated calf raise",
              status: "completed" as const,
              sets: exercise.sets.map((set) =>
                set.order === 3
                  ? { ...set, status: "skipped" as const, actualReps: null }
                  : set,
              ),
            };
          }
          return exercise;
        });
        // TR-12 mockup date = previous Saturday relative to today (seed bridge).
        const summarySaturday = (() => {
          let cursor = today;
          for (let i = 0; i < 7; i += 1) {
            const [y, m, d] = cursor.split("-").map(Number);
            const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
            if (dow === 6) return cursor;
            cursor = addDays(cursor, -1);
          }
          return today;
        })();
        const summaryAssignment = {
          ...(done ??
            scheduled.find((item) => /lower body b/i.test(item.workoutDayName)) ??
            scheduled[0]!),
          localDate: summarySaturday,
          workoutDayName: "Lower body B",
        };
        setCaptureWorkout(null);
        setCaptureWorkoutSummary({
          execution: {
            ...stub,
            status: "completed",
            startedAt,
            completedAt,
            sessionRpe: stub.sessionRpe ?? 7,
            requireSessionRpe: true,
            exercises: enrichedExercises,
          },
          assignment: summaryAssignment,
          weekAssignments,
          weekStart,
        });
      },
      clearCaptureWorkoutScreens() {
        setCaptureWorkout(null);
        setCaptureWorkoutSummary(null);
      },
    });
    return () => registerTraineeCaptureNav(null);
  }, [api, openOverlay, relationship.id, selectedDate, signOut, today]);

  useEffect(() => {
    if (!pendingNotificationLink) return;
    void refreshSession();
    void loadEffectivePlan();
    handleNotificationNavigate(pendingNotificationLink);
    clearPendingNotificationLink();
  }, [
    pendingNotificationLink,
    clearPendingNotificationLink,
    refreshSession,
    loadEffectivePlan,
    handleNotificationNavigate,
  ]);

  useEffect(() => {
    if (!pendingDeepLink) return;
    applyParsedDeepLink(pendingDeepLink);
    clearPendingDeepLink();
  }, [pendingDeepLink, applyParsedDeepLink, clearPendingDeepLink]);

  const handleCoachingResumed = useCallback(
    (updated: CoachingRelationship) => {
      setActiveRelationship(updated);
      setOverlay(null);
      void refreshSession();
    },
    [refreshSession, setActiveRelationship],
  );

  if (relationship.status === "ended" && overlay?.screen !== "past_coaching") {
    return (
      <TraineeOverlayHost
        overlay={{ screen: "ended" }}
        relationship={relationship}
        effectivePlan={effectivePlan}
        onClose={() => setOverlay({ screen: "past_coaching" })}
        onOpen={openOverlay}
        onSignOut={signOut}
        onCoachingResumed={handleCoachingResumed}
        onStartWorkout={handleStartWorkoutFromOverview}
      />
    );
  }

  if (captureWorkoutSummary && isCaptureModeEnabled()) {
    const coach =
      relationship.trainerDisplayName?.trim() || "Your coach";
    return (
      <WorkoutSummaryScreen
        execution={captureWorkoutSummary.execution}
        assignment={captureWorkoutSummary.assignment}
        coachName={coach}
        weekAssignments={captureWorkoutSummary.weekAssignments}
        weekStart={captureWorkoutSummary.weekStart}
        today={today}
        timeZone={timeZone}
        weekCompleted={2}
        weekTotal={4}
        onDone={() => setCaptureWorkoutSummary(null)}
      />
    );
  }

  if (captureWorkout && isCaptureModeEnabled()) {
    return (
      <ActiveWorkoutScreen
        execution={captureWorkout}
        onChange={setCaptureWorkout}
        onFinished={(execution) => {
          setCaptureWorkout(null);
          setCaptureWorkoutSummary({
            execution,
            assignment: null,
            weekAssignments: [],
            weekStart: startOfWeekMonday(today),
          });
        }}
        onExit={() => setCaptureWorkout(null)}
      />
    );
  }

  if (activeCheckin) {
    return (
      <CheckinScreen
        relationship={relationship}
        checkin={activeCheckin}
        onDone={() => setActiveCheckin(null)}
      />
    );
  }

  const sheetOverlay =
    overlay?.screen === "something_different" ||
    overlay?.screen === "ask_coach";
  const tabbedOverlay =
    overlay?.screen === "meal_plan" || overlay?.screen === "deep_link";
  const fullscreenOverlay =
    overlay != null && !sheetOverlay && !tabbedOverlay;
  const hideTabBar =
    Boolean(activeCheckin) ||
    workoutImmersive ||
    Boolean(captureWorkout) ||
    Boolean(captureWorkoutSummary) ||
    fullscreenOverlay;

  if (fullscreenOverlay && overlay) {
    return (
      <TraineeOverlayHost
        overlay={overlay}
        relationship={relationship}
        effectivePlan={effectivePlan}
        onClose={() => setOverlay(null)}
        onOpen={openOverlay}
        onSignOut={signOut}
        onGoToday={() => {
          setOverlay(null);
          setTab("today");
        }}
        onOpenDiet={() => {
          setOverlay(null);
          setTab("diet");
        }}
        onNotificationNavigate={handleNotificationNavigate}
        onCoachingResumed={handleCoachingResumed}
        onStartWorkout={handleStartWorkoutFromOverview}
      />
    );
  }

  const headingDate = formatHeadingDate(timeZone, selectedDate);
  const topTitle =
    tab === "today"
      ? `Today · ${headingDate}`
      : tab === "diet"
        ? `Diet · ${headingDate}`
        : TAB_TITLES[tab];

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {!hideTabBar && tab !== "diet" && tab !== "more" ? (
          <View style={styles.topPad}>
            <AppTopBar
              title={topTitle}
              unreadNotifications={unreadNotifications}
              onOpenNotifications={() =>
                openOverlay({ screen: "notifications" })
              }
              onOpenSync={() => openOverlay({ screen: "sync" })}
            />
          </View>
        ) : null}

        {tab === "today" ? (
          <TodayTab
            relationship={relationship}
            effectivePlan={effectivePlan}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onStartWorkout={() => {
              setWorkoutAutostart(true);
              setTab("workout");
            }}
            onOpenDiet={() => setTab("diet")}
            onOpenCheckin={setActiveCheckin}
            onRefreshPlan={() => {
              void refreshSession();
              void loadEffectivePlan();
            }}
            onOpenOverlay={openOverlay}
          />
        ) : null}

        {tab === "workout" ? (
          <WorkoutTab
            relationship={relationship}
            effectivePlan={effectivePlan}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenOverlay={openOverlay}
            autoStartToday={workoutAutostart}
            onAutoStartConsumed={() => setWorkoutAutostart(false)}
            pendingStartAssignmentId={pendingWorkoutStartId}
            onPendingStartConsumed={() => setPendingWorkoutStartId(null)}
            onImmersiveChange={setWorkoutImmersive}
          />
        ) : null}

        {tab === "diet" ? (
          <DietTab
            relationship={relationship}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenOverlay={openOverlay}
            unreadNotifications={unreadNotifications}
          />
        ) : null}

        {tab === "progress" ? (
          <ProgressTab
            relationship={relationship}
            unreadNotifications={unreadNotifications}
            onOpenOverlay={openOverlay}
            onOpenCheckin={setActiveCheckin}
          />
        ) : null}

        {tab === "more" ? (
          <MoreScreen relationship={relationship} onOpenOverlay={openOverlay} />
        ) : null}
      </View>

      {sheetOverlay ? (
        <TraineeOverlayHost
          overlay={overlay!}
          relationship={relationship}
          effectivePlan={effectivePlan}
          presentation="sheet"
          onClose={() => {
            invalidateRelationshipDayData(relationship.id);
            setOverlay(null);
          }}
          onOpen={openOverlay}
          onSignOut={signOut}
          onGoToday={() => {
            invalidateRelationshipDayData(relationship.id);
            setOverlay(null);
            setTab("today");
          }}
          onOpenDiet={() => {
            setOverlay(null);
            setTab("diet");
          }}
          onNotificationNavigate={handleNotificationNavigate}
          onStartWorkout={handleStartWorkoutFromOverview}
        />
      ) : null}

      {tab === "today" ? (
        <ForegroundBanner
          relationship={relationship}
          coachName={relationship.trainerDisplayName?.trim() || "Your coach"}
          onOpenMeal={(assignmentId) =>
            openOverlay({ screen: "something_different", assignmentId })
          }
          onGoToday={() => setTab("today")}
        />
      ) : null}

      {tabbedOverlay ? (
        <View style={styles.tabbedOverlay}>
          <TraineeOverlayHost
            overlay={overlay!}
            relationship={relationship}
            effectivePlan={effectivePlan}
            onClose={() => {
              invalidateRelationshipDayData(relationship.id);
              setOverlay(null);
            }}
            onOpen={openOverlay}
            onSignOut={signOut}
            onGoToday={() => {
              invalidateRelationshipDayData(relationship.id);
              setOverlay(null);
              setTab("today");
            }}
            onNotificationNavigate={handleNotificationNavigate}
            onStartWorkout={handleStartWorkoutFromOverview}
          />
        </View>
      ) : null}

      {!hideTabBar ? (
        <View accessibilityRole="tablist" style={styles.tabBar}>
          {TABS.map((item) => {
            const selected = item.id === tab;
            const Icon = item.Icon;
            const tint = selected ? colors.indigo : colors.midGrey;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => setTab(item.id)}
                style={styles.tab}
              >
                <Icon
                  size={22}
                  color={tint}
                  strokeWidth={selected ? 2.25 : 1.75}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text
                  style={[
                    styles.tabLabel,
                    selected ? styles.tabLabelSelected : null,
                  ]}
                >
                  {item.label}
                </Text>
                {selected ? <View style={styles.tabIndicator} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  topPad: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lightGrey,
    backgroundColor: colors.white,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    gap: spacing.xs,
  },
  tabLabel: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
  },
  tabLabelSelected: {
    color: colors.indigo,
    fontWeight: "600",
  },
  tabIndicator: {
    width: 18,
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.indigo,
  },
  tabbedOverlay: {
    backgroundColor: colors.white,
    bottom: 56,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 12,
  },
});
