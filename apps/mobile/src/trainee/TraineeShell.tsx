import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
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
import {
  addDays,
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
import { useLiveActivityOutboxDrain } from "../notifications/liveActivityOutbox";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import { useSyncEngine } from "../sync/SyncProvider";
import { CheckinScreen } from "./CheckinScreen";
import { DietTab } from "./DietTab";
import { EndedCoachingScreen } from "./EndedCoachingScreen";
import { MoreScreen } from "./MoreScreen";
import { ProgressTab } from "./ProgressTab";
import {
  EFFECTIVE_PLAN_LOADING,
  EFFECTIVE_PLAN_UNAVAILABLE,
  TodayTab,
  effectivePlanStateFor,
  planFromState,
  type EffectivePlanState,
} from "./TodayTab";
import { WorkoutTab } from "./WorkoutTab";
import { ActiveWorkoutScreen } from "./ActiveWorkoutScreen";
import { resumeHeldWorkoutFeedback } from "./workout/rpeRating";
import { WorkoutSummaryScreen } from "./WorkoutSummaryScreen";
import { openActiveWorkout } from "./workoutSession";
import {
  updateActiveSession,
  useActiveSession,
} from "./workout/activeSession";
import { MinimisedWorkoutBar } from "./workout/MinimisedWorkoutBar";
import {
  isCaptureModeEnabled,
  registerTraineeCaptureNav,
} from "../dev/captureBridge";
import { scheduledAssignments } from "./scheduledAssignments";
import { pickTodayCheckin } from "./pickTodayCheckin";
import { invalidateRelationshipDayData } from "./dataCache";
import { applyRealtimeHint } from "./realtimeDayUpdate";
import { HIDDEN_FROM_READERS, PushedScreen } from "../components/PushedScreen";
import { useHardwareBack } from "../lib/useHardwareBack";
import { popOverlay, pushOverlay, resetOverlays } from "./traineeOverlayStack";
import { DAY_VIEW_MAX_AGE_MS } from "./useTraineeDayCache";
import {
  bindTraineeSnapshots,
  flushTraineeSnapshots,
  snapshotsBoundFor,
} from "./snapshotStore";
import { subscribeMealNotificationResponses } from "../notifications/nativeActions";
import type { NotificationDeepLink } from "../notifications/routing";
import { ForegroundBanner } from "./notifications/ForegroundBanner";
import { useNoticeScreen } from "../components/notice/NoticeContext";
import { reportError } from "../lib/reportError";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";


/**
 * What the "unavailable" screen says when opening a notification's target
 * failed (AGENTS.md / Z12-64). "Isn't available anymore" only when the server
 * answered not-found; everything else goes through `userFacingMessage`.
 */
export function deepLinkFailureReason(
  where: string,
  err: unknown,
  noun: "meal" | "check-in",
): string {
  reportError(where, err);
  if (err instanceof ApiClientError && err.status === 404) {
    return `This ${noun} isn't available anymore.`;
  }
  return userFacingMessage(err, {
    fallback: `Couldn't open this ${noun}. Try again.`,
  });
}

type TraineeTab = "today" | "workout" | "diet" | "progress" | "more";

/**
 * How long the shell waits for the phone's snapshots before it paints
 * anyway (Z14-2). Reading them takes a few milliseconds; a storage that
 * hangs must not keep the trainee on a blank screen.
 */
export const SNAPSHOT_HYDRATE_CAP_MS = 1500;

/**
 * Puts the trainee's snapshots from the phone into the day cache before the
 * first tab renders (Z14-2, D-W14-6), so a cold start (airplane mode
 * included) paints Today, Diet, Workout and Progress from the phone with no
 * skeleton. True once that is done, or the cap ran out.
 */
export function useTraineeSnapshots(
  userId: string | null,
  relationshipId: string,
): boolean {
  const [ready, setReady] = useState(
    () => userId == null || snapshotsBoundFor(userId, relationshipId),
  );
  useEffect(() => {
    if (userId == null) {
      setReady(true);
      return;
    }
    if (snapshotsBoundFor(userId, relationshipId)) {
      setReady(true);
      return;
    }
    let active = true;
    setReady(false);
    const cap = setTimeout(() => {
      if (active) setReady(true);
    }, SNAPSHOT_HYDRATE_CAP_MS);
    void bindTraineeSnapshots({ userId, relationshipId }).finally(() => {
      clearTimeout(cap);
      if (active) setReady(true);
    });
    return () => {
      active = false;
      clearTimeout(cap);
    };
  }, [userId, relationshipId]);
  // Queued snapshot writes land before the OS can stop a backgrounded app.
  useEffect(() => {
    const subscription = AppState.addEventListener?.("change", (next) => {
      if (next !== "active") void flushTraineeSnapshots();
    });
    return () => subscription?.remove();
  }, []);
  return ready;
}

/** How an overlay sits over the tabs. */
function overlayLayer(
  overlay: TraineeOverlay | null,
): "sheet" | "tabbed" | "fullscreen" | null {
  if (overlay == null) return null;
  if (overlay.screen === "something_different" || overlay.screen === "ask_coach") {
    return "sheet";
  }
  if (overlay.screen === "meal_plan" || overlay.screen === "deep_link") {
    return "tabbed";
  }
  // "ended" is the Today tab body when coaching has ended — never a
  // fullscreen overlay that would hide the tab bar (TR-22a).
  if (overlay.screen === "ended") return null;
  return "fullscreen";
}

/**
 * A kept tab shown again after this long since it last loaded refreshes
 * underneath what it shows (Z14-2; the trainer app's 30 s rule, Z14-3).
 */
export const KEPT_TAB_STALE_MS = DAY_VIEW_MAX_AGE_MS;

/**
 * Tabs that refresh themselves when shown again (their `active` prop runs
 * the day cache's age rule, keeping scroll and what they show). The others
 * are remounted instead, and paint from the cache at once.
 */
const SELF_REFRESHING_TABS: ReadonlySet<TraineeTab> = new Set(["today", "diet"]);

/**
 * Which tab panes are mounted (Z14-2). A tab left by a tab bar press stays
 * mounted, hidden, so a switch back paints at once. A tab left any other way
 * (a notification, a deep link, a button that switches tab, a check-in or a
 * fullscreen overlay covering it) is unmounted: something open on it (an RN
 * `Modal` sheet, which ignores the parent's `display: none`, or a live
 * workout's Android Back handler) must not outlive it off screen. A hidden
 * Workout pane is never kept while immersive (the live log, a summary).
 */
export type PaneBook = {
  /** The pane on screen at the last render; null under a cover. */
  shown: TraineeTab | null;
  /** Mounted panes, the one on screen included. */
  kept: ReadonlySet<TraineeTab>;
  /** Bumped to remount a pane (its React key). */
  generation: Readonly<Partial<Record<TraineeTab, number>>>;
  /** When each pane last mounted or refreshed (ms). */
  loadedAt: Readonly<Partial<Record<TraineeTab, number>>>;
  /** The tab the tab bar just picked, until the switch it makes is seen. */
  picked: TraineeTab | null;
};

export function initialPaneBook(shown: TraineeTab | null, now: number): PaneBook {
  return {
    shown,
    kept: new Set(shown ? [shown] : []),
    generation: {},
    loadedAt: shown ? { [shown]: now } : {},
    picked: null,
  };
}

/** The book for this render; the same object when nothing changed. */
export function advancePaneBook(
  book: PaneBook,
  shown: TraineeTab | null,
  workoutImmersive: boolean,
  now: number,
): PaneBook {
  let next = book;
  if (shown !== book.shown) {
    const kept = new Set(book.kept);
    const generation = { ...book.generation };
    const loadedAt = { ...book.loadedAt };
    const left = book.shown;
    const viaTabBar = shown != null && book.picked === shown;
    if (left != null) {
      if (viaTabBar && !(left === "workout" && workoutImmersive)) kept.add(left);
      else kept.delete(left);
    }
    if (shown != null) {
      if (!kept.has(shown)) {
        kept.add(shown);
        loadedAt[shown] = now;
      } else if (
        !SELF_REFRESHING_TABS.has(shown) &&
        now - (loadedAt[shown] ?? 0) > KEPT_TAB_STALE_MS
      ) {
        generation[shown] = (generation[shown] ?? 0) + 1;
        loadedAt[shown] = now;
      } else if (SELF_REFRESHING_TABS.has(shown)) {
        loadedAt[shown] = now;
      }
    }
    next = { shown, kept, generation, loadedAt, picked: null };
  }
  if (workoutImmersive && next.shown !== "workout" && next.kept.has("workout")) {
    const kept = new Set(next.kept);
    kept.delete("workout");
    next = { ...next, kept };
  }
  return next;
}

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

/**
 * What the effective-plan load produced: a four-state plan, plus the
 * cache-write failure if there was one. Never a nullable plan (CU22,
 * D-W3b-24; the fourth state is CU24, D-W3b-27) and never a boolean.
 */
export type EffectivePlanLoadOutcome = {
  readonly state: EffectivePlanState;
  readonly cacheError: string | null;
};

/**
 * What the trainee is told when the plan loaded but could not be cached
 * (CU22, D-W3b-30, decided by Firoz 4 Nov 2026).
 *
 * Static text, deliberately. The trainee must not read a storage class name,
 * so nothing derived from the error reaches the screen: the error's own name
 * goes to `reportError` only (which sanitises, scrubs and caps it — CU5), and
 * the screen gets this one string. Being static, it satisfies AGENTS.md's
 * rule on error messages by construction (D-W3-12, D-W3b-7).
 *
 * "Try again." is actionable here and must stay so: this message is rendered
 * by `TodayTab` inside the Today screen's scroll view, whose pull-to-refresh
 * calls `onRefreshPlan` -> `loadEffectivePlan`, which retries the fetch and
 * the cache write that failed.
 */
export const PLAN_CACHE_WRITE_MESSAGE =
  "Couldn't save your plan on this phone. Try again.";

/**
 * Loads the effective plan into an explicit `loading | none | loaded` state.
 *
 * Two orderings matter here and both were wrong before CU22:
 * - The plan is set **after** the cache write, and the write has its own
 *   `try`, so a failed write can no longer discard a plan that was fetched
 *   successfully. It used to set the plan first and then let the outer
 *   `catch` reset it to `null` for the rest of the session, silently, which
 *   also read on screen as "no plan published".
 * - A cache-write failure is **returned**, not swallowed and not disguised as
 *   "no plan": the caller shows it (D-W3-12, D-W3-18).
 *
 * A fetch failure still falls back to the newest cached plan. A fetch failure
 * with **nothing** cached is `unavailable` (CU24, D-W3b-27), not `none`: it
 * cannot tell "no plan published" from "could not ask", so it says neither
 * and offers a retry. `none` is now only ever a judgement made on an answer
 * the server actually gave.
 */
export async function loadEffectivePlanState(deps: {
  pull: () => Promise<unknown>;
  fetchPlan: () => Promise<EffectivePlanResponse>;
  /** Called only for a plan that has a version; the version is passed narrowed. */
  cachePlan: (
    plan: EffectivePlanResponse,
    version: NonNullable<EffectivePlanResponse["version"]>,
  ) => Promise<unknown>;
  readCached: () => Promise<EffectivePlanResponse | null>;
}): Promise<EffectivePlanLoadOutcome> {
  // The pull has its own `try` (CU24): a pull failure is not a plan failure,
  // and the one real call site already swallows it before handing `pull`
  // over. Inside the fetch's `try` a throwing pull skipped the fetch
  // entirely, so the plan state was decided without the plan ever being
  // asked for — which now reads as `unavailable`, a claim about the network
  // that nothing checked (D-W3-12, D-W3-18).
  try {
    await deps.pull();
  } catch (pullErr) {
    reportError("trainee.effectivePlan.pull", pullErr);
  }

  let fetched: EffectivePlanResponse;
  try {
    fetched = await deps.fetchPlan();
  } catch (fetchErr) {
    reportError("trainee.effectivePlan.fetch", fetchErr);
    let cached: EffectivePlanResponse | null = null;
    try {
      cached = await deps.readCached();
    } catch (cacheReadErr) {
      reportError("trainee.effectivePlan.cacheRead", cacheReadErr);
    }
    // Nothing cached means the app has no evidence either way, so it must
    // not resolve to `none` (CU24, D-W3b-27). With a cached plan this stays
    // `loaded`: "could not refresh" keeps showing the cached plan.
    return {
      state: cached ? effectivePlanStateFor(cached) : EFFECTIVE_PLAN_UNAVAILABLE,
      cacheError: null,
    };
  }

  let cacheError: string | null = null;
  const version = fetched.version;
  if (version != null) {
    try {
      await deps.cachePlan(fetched, version);
    } catch (writeErr) {
      // The error itself goes to the reporter, which is where its name and
      // the rest of its detail belong; the screen gets static copy.
      reportError("trainee.effectivePlan.cacheWrite", writeErr);
      cacheError = PLAN_CACHE_WRITE_MESSAGE;
    }
  }
  // The plan is set from here, after the write, whatever the write did.
  return { state: effectivePlanStateFor(fetched), cacheError };
}

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
  // Z14-41: a rating and note held before a force-quit are sent when the
  // app opens and each time it returns to the foreground, not only when the
  // Workout tab mounts. The 48 h window, owner check, token reuse and
  // double-send guards live in `resumeHeldWorkoutFeedback`; a failure is
  // logged and never blocks this screen.
  const heldOwnerId = me?.userId ?? null;
  const heldResumeDeps = useRef({ sync, api });
  heldResumeDeps.current = { sync, api };
  useEffect(() => {
    if (!heldOwnerId) return;
    const resume = () => {
      const { sync: engine, api: client } = heldResumeDeps.current;
      void resumeHeldWorkoutFeedback({
        ownerId: heldOwnerId,
        sync: engine,
        api: client,
      }).catch((err: unknown) => reportError("workout.feedback.resume", err));
    };
    resume();
    const subscription = AppState.addEventListener?.("change", (next) => {
      if (next === "active") resume();
    });
    return () => subscription?.remove();
  }, [heldOwnerId]);
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);

  const [tab, setTab] = useState<TraineeTab>("today");
  const [selectedDate, setSelectedDate] = useState(today);
  const [workoutAutostart, setWorkoutAutostart] = useState(false);
  const [pendingWorkoutStartId, setPendingWorkoutStartId] = useState<
    string | null
  >(null);
  /** Set by Today's "View summary"; Workout opens it, then clears it. */
  const [pendingSummaryExecutionId, setPendingSummaryExecutionId] = useState<
    string | null
  >(null);
  const [workoutImmersive, setWorkoutImmersive] = useState(false);
  // Z14-25: the screens opened over a tab are a stack; Back pops (traineeOverlayStack.ts).
  const [overlays, setOverlays] = useState<TraineeOverlay[]>([]);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const overlay: TraineeOverlay | null = overlays[overlays.length - 1] ?? null;
  const hasFullscreenOverlay = overlays.some((o) => overlayLayer(o) === "fullscreen");
  const [activeCheckin, setActiveCheckin] = useState<Checkin | null>(null);
  // Four-state (CU22, D-W3b-24; `unavailable` is CU24, D-W3b-27): the initial
  // value is `loading`, not a null plan, because "not loaded yet", "no plan
  // published" and "could not ask" are three different facts and this screen
  // used to tell a trainee the second when either of the others was true.
  // `planCacheError` is separate on purpose: a plan that loaded but could not
  // be cached is still a loaded plan, so it must not be expressible as a plan
  // state.
  const [planState, setPlanState] =
    useState<EffectivePlanState>(EFFECTIVE_PLAN_LOADING);
  const snapshotsReady = useTraineeSnapshots(me?.userId ?? null, relationship.id);
  // A check-in or a fullscreen overlay covers the tabs (Z14-2).
  // Overlays sit over the mounted tab (so the iOS swipe shows the real screen
  // below); only a live workout is unmounted under one, so its own Android
  // Back handler cannot answer for a screen on top of it.
  const coverOn =
    Boolean(activeCheckin) ||
    (hasFullscreenOverlay && workoutImmersive && tab === "workout");
  const shownTab: TraineeTab | null = coverOn ? null : tab;
  // The Workout tab reports "not immersive" as it unmounts under the cover.
  // Taking that at face value would lift the cover, remount the tab, and
  // start the loop again; so a report made while covered is ignored (the tab
  // reports the real value when it mounts again).
  const coverOnRef = useRef(coverOn);
  coverOnRef.current = coverOn;
  const reportWorkoutImmersive = useCallback((immersive: boolean) => {
    if (!immersive && coverOnRef.current) return;
    setWorkoutImmersive(immersive);
  }, []);
  /** Which tab panes stay mounted, hidden, when left (Z14-2): `PaneBook`. */
  const [storedPanes, setPanes] = useState<PaneBook>(() =>
    initialPaneBook(shownTab, Date.now()),
  );
  const panes = advancePaneBook(
    storedPanes,
    shownTab,
    workoutImmersive,
    Date.now(),
  );
  // Adjusted while rendering, so a pane left by a notification or under a
  // cover is gone before anything paints (no frame with its sheet on top).
  if (panes !== storedPanes) setPanes(panes);
  const selectTabFromBar = useCallback((next: TraineeTab) => {
    setPanes((prev) => (prev.picked === next ? prev : { ...prev, picked: next }));
    setTab(next);
  }, []);
  /** Today painted its content once: in-app banners may show from then on. */
  const [todayPainted, setTodayPainted] = useState(false);
  const handleTodayFirstPaint = useCallback(() => setTodayPainted(true), []);
  const [planCacheError, setPlanCacheError] = useState<string | null>(null);
  const effectivePlan = planFromState(planState);
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

  // W-14: open session tucked into the bar above the tab bar (Z12-45).
  const activeWorkoutSession = useActiveSession(relationship.id);
  const showMinimisedBar =
    activeWorkoutSession != null && activeWorkoutSession.minimised;

  // Z12-38: the in-app banner queue skips a banner for the screen already open
  // (a meal, a workout, a check-in). Tabs never suppress one (TR-06h is over Today).
  useNoticeScreen(
    activeCheckin
      ? `checkin:${activeCheckin.id}`
      : overlay?.screen === "workout_overview"
        ? `workout:${overlay.assignmentId}`
        : overlay?.screen === "something_different" || overlay?.screen === "food_search"
          ? `meal:${overlay.assignmentId}`
          : `tab:${tab}`,
  );

  // Sets logged from the lock-screen Live Activity (LA2): drained into the
  // sync outbox when the app becomes active and when the workout tab opens.
  // iOS only; a no-op on Android and web.
  useLiveActivityOutboxDrain({
    sync,
    api,
    focusKey: tab === "workout" ? "workout" : "",
  });

  const openOverlay: TraineeOverlayOpener = useCallback((next) => {
    setOverlays((stack) => pushOverlay(stack, next));
  }, []);

  const handleStartWorkoutFromOverview = useCallback((assignmentId: string) => {
    setTab("workout");
    setPendingWorkoutStartId(assignmentId);
  }, []);

  const handleNotificationNavigate = useCallback(
    (link: NotificationDeepLink) => {
      const route = link.route;
      if (route.type === "unavailable") {
        setOverlays(resetOverlays({ screen: "deep_link", reason: route.reason }));
        return;
      }
      if (route.type === "workout_overview" || route.type === "workout_active") {
        setTab("workout");
        setOverlays(resetOverlays({
          screen: "workout_overview",
          assignmentId: route.assignmentId,
        }));
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
              setOverlays(resetOverlays({
                screen: "deep_link",
                reason: "This meal isn't available anymore.",
              }));
              return;
            }
            setSelectedDate(match.localDate);
            setOverlays(resetOverlays({
              screen: "something_different",
              assignmentId: match.id,
            }));
          } catch (err) {
            setOverlays(resetOverlays({
              screen: "deep_link",
              reason: deepLinkFailureReason("TraineeShell.openMeal", err, "meal"),
            }));
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
              setOverlays(resetOverlays({
                screen: "deep_link",
                reason: "This check-in isn't available anymore.",
              }));
          } catch (err) {
            setOverlays(resetOverlays({
              screen: "deep_link",
              reason: deepLinkFailureReason(
                "TraineeShell.openCheckin",
                err,
                "check-in",
              ),
            }));
          }
        })();
        return;
      }
      if (route.type === "note") {
        setTab("today");
        setOverlays(resetOverlays());
        return;
      }
      if (route.type === "reactivate") {
        setTab("today");
        setOverlays(resetOverlays({ screen: "ended" }));
        return;
      }
      if (route.type === "reminders") {
        setTab("more");
        setOverlays(resetOverlays({ screen: "reminder_settings" }));
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

  const readCachedPlan = useCallback(async () => {
    const cached = await sync.store.listLocal("effective_plan");
    const newest = cached
      .filter((row) => !row.tombstone && row.payloadJson)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return newest?.payloadJson
      ? (JSON.parse(newest.payloadJson) as EffectivePlanResponse)
      : null;
  }, [sync]);

  // Offline-first plan (D-W14-6): the plan saved on the phone answers at
  // once, so Today's gate does not wait for the pull and the fetch below
  // (which replace it when they answer). Only while nothing else has.
  useEffect(() => {
    let active = true;
    readCachedPlan()
      .then((cached) => {
        if (!active || !cached) return;
        setPlanState((prev) =>
          prev.status === "loading" ? effectivePlanStateFor(cached) : prev,
        );
      })
      .catch((err: unknown) => {
        reportError("trainee.effectivePlan.cacheRead", err);
      });
    return () => {
      active = false;
    };
  }, [readCachedPlan]);

  const loadEffectivePlan = useCallback(async () => {
    const outcome = await loadEffectivePlanState({
      // A pull failure is not a plan failure: the plan is fetched from the
      // API next either way. Unchanged from before CU22.
      pull: () => sync.pullAndApply().catch(() => undefined),
      fetchPlan: () => api.getEffectivePlan(relationship.id),
      cachePlan: (plan, version) =>
        sync.store.upsertLocal({
          entityType: "effective_plan",
          recordId: version.id,
          serverVersion: version.recordVersion,
          payloadJson: JSON.stringify(plan),
          tombstone: false,
          updatedAt: new Date().toISOString(),
        }),
      readCached: readCachedPlan,
    });
    setPlanCacheError(outcome.cacheError);
    setPlanState(outcome.state);
  }, [api, readCachedPlan, relationship.id, sync]);

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
        // Same path as a body tap: the id is checked against this
        // relationship's meals before anything opens.
        handleNotificationNavigate({
          tab: "diet",
          domainEntityType: "meal_assignment",
          domainEntityId: event.mealAssignmentId,
          route: { type: "meal", assignmentId: event.mealAssignmentId },
          path: `/go/meal/${event.mealAssignmentId}`,
          refetchRequired: true,
        });
        return;
      }
      setTab("diet");
    });
  }, [handleNotificationNavigate]);

  useEffect(() => {
    setSelectedDate(today);
  }, [today]);

  useRealtimeHints(api, relationship.id, (event) => {
    applyRealtimeHint(event, relationship.id, {
      reloadPlan: () => void loadEffectivePlan(),
      refreshUnread: () => void refreshUnread(),
    });
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
        setOverlays(resetOverlays());
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
        setOverlays(resetOverlays());
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
        setOverlays(resetOverlays());
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
        const lowerBodyB =
          scheduled.find(
            (item) =>
              /lower body b/i.test(item.workoutDayName) &&
              item.localDate === summarySaturday,
          ) ??
          scheduled.find((item) => /lower body b/i.test(item.workoutDayName));
        const dayExercises =
          lowerBodyB?.workoutDay.exercises ??
          done?.workoutDay.exercises ??
          [];
        const sourceExercises = dayExercises.map((exercise, index) => {
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
              prescribedLoadLabel: target.loadLabel ?? "20 kg",
              actualReps: target.reps,
              actualLoadLabel: target.loadLabel ?? "20 kg",
              completedAt: now,
              createdAt: now,
              updatedAt: now,
            })),
            createdAt: now,
            updatedAt: now,
          };
        });
        // Mockup 12: RDL load bump + one skipped calf set ("Changed from the plan").
        const enrichedExercises = sourceExercises.map((exercise) => {
          const name = exercise.name.toLowerCase();
          if (name.includes("romanian") || name.includes("deadlift")) {
            return {
              ...exercise,
              status: "completed" as const,
              sets: exercise.sets.map((set) => {
                if (set.order === 2 || set.order === 3) {
                  const from = "20 kg";
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
      setOverlays(resetOverlays());
      void refreshSession();
    },
    [refreshSession, setActiveRelationship],
  );

  /**
   * Back from the top screen (hardware back, the header back and the iOS edge
   * swipe all call this). A sheet or tabbed screen refreshes the day views as
   * it closes, as it did before the stack.
   */
  const popTop = useCallback(() => {
    const stack = overlaysRef.current;
    const top = stack[stack.length - 1];
    if (!top) return;
    const layer = overlayLayer(top);
    if (layer === "sheet" || layer === "tabbed") {
      invalidateRelationshipDayData(relationship.id);
    }
    setOverlays(popOverlay(stack));
  }, [relationship.id]);

  // Z14-25 (D-W14-24): one Android back handler for the shell, the table in
  // docs/specs/Z14-25.md. Sheets are Modals that close themselves first
  // (onRequestClose) and a live workout registers its own handler; both are
  // mounted later than the shell, so they answer before it. Only what is on
  // top answers: a kept tab that is hidden registers nothing here.
  useHardwareBack(() => {
    if (activeCheckin) {
      // Same function as the check-in's own Close.
      setActiveCheckin(null);
      return true;
    }
    if (overlaysRef.current.length > 0) {
      popTop();
      return true;
    }
    if (tab !== "today") {
      setTab("today");
      return true;
    }
    return false; // Today, nothing open: leave the app.
  });

  // Ended coaching (TR-22a) stays in the shell with the tab bar: Today shows
  // EndedCoachingScreen embedded; past_coaching and other overlays use the
  // normal fullscreen path below. (Z12-49 follow-up after the standalone
  // overlay landing shipped without the bar.)

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

  // The phone's snapshots go into the cache before the first tab renders
  // (Z14-2); reading them takes milliseconds, capped at
  // SNAPSHOT_HYDRATE_CAP_MS.
  if (!snapshotsReady) {
    return <View style={styles.root} testID="trainee-shell-hydrating" />;
  }

  // The Workout tab stays mounted when left (Z14-2); its immersive screens
  // only hide the tab bar while Workout is the tab on screen. Overlays are
  // layers over the tab bar, so they do not hide it (the swipe shows it).
  const hideTabBar =
    Boolean(activeCheckin) ||
    (workoutImmersive && tab === "workout") ||
    Boolean(captureWorkout) ||
    Boolean(captureWorkoutSummary);
  const topOverlayIndex = overlays.length - 1;

  /** A check-in covers the tabs instead of replacing them (Z14-2). */
  const cover = activeCheckin ? (
    <CheckinScreen
      relationship={relationship}
      checkin={activeCheckin}
      onDone={() => setActiveCheckin(null)}
    />
  ) : null;

  /** One host per stack entry. */
  const hostFor = (
    entry: TraineeOverlay,
    presentation: "fullscreen" | "sheet",
    key?: string,
  ) => (
    <TraineeOverlayHost
      key={key}
      overlay={entry}
      relationship={relationship}
      effectivePlan={effectivePlan}
      planState={planState}
      onRetryPlan={() => {
        void loadEffectivePlan();
      }}
      presentation={presentation}
      onClose={popTop}
      onDone={() => setOverlays(resetOverlays())}
      onOpen={openOverlay}
      onSignOut={signOut}
      onGoToday={() => {
        invalidateRelationshipDayData(relationship.id);
        setOverlays(resetOverlays());
        setTab("today");
      }}
      onOpenDiet={() => {
        setOverlays(resetOverlays());
        setTab("diet");
      }}
      onNotificationNavigate={handleNotificationNavigate}
      onCoachingResumed={handleCoachingResumed}
      onStartWorkout={handleStartWorkoutFromOverview}
    />
  );

  /** A kept tab stays mounted; only the one on screen is shown (Z14-2). */
  const pane = (id: TraineeTab, node: ReactNode) => {
    if (panes.shown !== id && !panes.kept.has(id)) return null;
    const shown = panes.shown === id;
    return (
      <View
        key={`${id}:${panes.generation[id] ?? 0}`}
        testID={`trainee-pane-${id}`}
        style={shown ? styles.pane : styles.paneHidden}
        aria-hidden={!shown}
        accessibilityElementsHidden={!shown}
        importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
      >
        {node}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View
        style={styles.root}
        {...(hasFullscreenOverlay && !activeCheckin ? HIDDEN_FROM_READERS : {})}
      >
      <View style={styles.content}>
        {cover}
        {pane(
          "today",
          relationship.status === "ended" ? (
            <EndedCoachingScreen
              relationship={relationship}
              coachName={
                relationship.trainerDisplayName?.trim() || "Your coach"
              }
              onOpenHistory={() => openOverlay({ screen: "past_coaching" })}
              onSignOut={signOut}
              onCoachingResumed={handleCoachingResumed}
              embedded
              unreadNotifications={unreadNotifications}
              onOpenSync={() => openOverlay({ screen: "sync" })}
              onOpenNotifications={() =>
                openOverlay({ screen: "notifications" })
              }
            />
          ) : (
            <TodayTab
              relationship={relationship}
              planState={planState}
              planCacheError={planCacheError}
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
              unreadNotifications={unreadNotifications}
              onViewSummary={(executionId) => {
                setPendingSummaryExecutionId(executionId);
                setTab("workout");
              }}
              onFirstPaint={handleTodayFirstPaint}
              active={panes.shown === "today" && !hasFullscreenOverlay}
            />
          ),
        )}

        {pane(
          "workout",
          <WorkoutTab
            relationship={relationship}
            planState={planState}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenOverlay={openOverlay}
            unreadNotifications={unreadNotifications}
            autoStartToday={workoutAutostart}
            onAutoStartConsumed={() => setWorkoutAutostart(false)}
            pendingStartAssignmentId={pendingWorkoutStartId}
            onPendingStartConsumed={() => setPendingWorkoutStartId(null)}
            pendingSummaryExecutionId={pendingSummaryExecutionId}
            onPendingSummaryConsumed={() => setPendingSummaryExecutionId(null)}
            onImmersiveChange={reportWorkoutImmersive}
          />,
        )}

        {pane(
          "diet",
          <DietTab
            relationship={relationship}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenOverlay={openOverlay}
            unreadNotifications={unreadNotifications}
            active={panes.shown === "diet" && !hasFullscreenOverlay}
          />,
        )}

        {pane(
          "progress",
          <ProgressTab
            relationship={relationship}
            unreadNotifications={unreadNotifications}
            onOpenOverlay={openOverlay}
            onOpenCheckin={setActiveCheckin}
          />,
        )}

        {pane(
          "more",
          <MoreScreen relationship={relationship} onOpenOverlay={openOverlay} />,
        )}
      </View>

      {tab === "today" &&
      relationship.status !== "ended" &&
      !cover &&
      !hasFullscreenOverlay &&
      todayPainted ? (
        <ForegroundBanner
          relationship={relationship}
          coachName={relationship.trainerDisplayName?.trim() || "Your coach"}
          onOpenMeal={(assignmentId) =>
            openOverlay({ screen: "something_different", assignmentId })
          }
          onGoToday={() => setTab("today")}
        />
      ) : null}

      {/*
        W-14: the minimised bar sits above the tab bar on every tab except
        Workout. On Workout the hero's Continue workout / Finish now is the
        only resume CTA (two resume CTAs on one screen look broken).
      */}
      {!hideTabBar && tab !== "workout" && showMinimisedBar ? (
        <View style={styles.minimisedBarSlot}>
          <MinimisedWorkoutBar
            relationshipId={relationship.id}
            onResume={() => {
              updateActiveSession(relationship.id, { minimised: false });
              setTab("workout");
            }}
          />
        </View>
      ) : null}

      {!hideTabBar ? <TraineeTabBar active={tab} onSelect={selectTabFromBar} /> : null}
      </View>
      {activeCheckin
        ? null
        : overlays.map((entry, index) => {
            const layer = overlayLayer(entry);
            if (layer == null) return null;
            const isTop = index === topOverlayIndex;
            // A sheet is a Modal that would draw over whatever opens on it:
            // only a sheet on top is mounted.
            if (layer === "sheet") {
              return isTop ? hostFor(entry, "sheet", `${index}:${entry.screen}`) : null;
            }
            const inner = (
              <PushedScreen onBack={popTop}>{hostFor(entry, "fullscreen")}</PushedScreen>
            );
            return (
              <View
                key={`${index}:${entry.screen}`}
                testID={`trainee-overlay-${entry.screen}`}
                style={[
                  layer === "tabbed" ? styles.tabbedOverlay : StyleSheet.absoluteFill,
                  { pointerEvents: isTop ? "auto" : "none" },
                ]}
                {...(isTop ? {} : HIDDEN_FROM_READERS)}
              >
                {inner}
              </View>
            );
          })}

    </View>
  );
}

/**
 * The bottom tab bar. Opted in to the system theme on its own (Z12-46,
 * D-W12-12): it used to stay light under system dark because the shell is
 * not a `<Screen v3>`. It does not drive the status bar.
 */
function TraineeTabBar({
  active,
  onSelect,
}: {
  active: TraineeTab;
  onSelect: (tab: TraineeTab) => void;
}) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <TabBarRow active={active} onSelect={onSelect} />
    </ThemeScope>
  );
}

function TabBarRow({
  active,
  onSelect,
}: {
  active: TraineeTab;
  onSelect: (tab: TraineeTab) => void;
}) {
  const theme = useTheme();
  const barStyles = useTabBarStyles();
  return (
    <View accessibilityRole="tablist" style={barStyles.tabBar}>
      {TABS.map((item) => {
        const selected = item.id === active;
        const Icon = item.Icon;
        const tint = selected ? theme.colors.brand : theme.colors.ink3;
        return (
          <Pressable
            key={item.id}
            testID={`tab-${item.id}`}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.id)}
            style={barStyles.tab}
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
                barStyles.tabLabel,
                selected ? barStyles.tabLabelSelected : null,
              ]}
            >
              {item.label}
            </Text>
            {selected ? <View style={barStyles.tabIndicator} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const useTabBarStyles = createThemedStyles((t) => ({
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.line,
    backgroundColor: t.colors.card,
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
    color: t.colors.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  tabLabelSelected: {
    color: t.colors.brand,
    fontWeight: "600",
  },
  tabIndicator: {
    width: 18,
    height: 3,
    borderRadius: 999,
    backgroundColor: t.colors.brand,
  },
}));

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  pane: {
    flex: 1,
  },
  /** A kept tab off screen: mounted, laid out nowhere, read by nothing. */
  paneHidden: {
    display: "none",
  },
  /** Same inset as Screen's toast footer: the bar floats above the tab bar. */
  minimisedBarSlot: {
    backgroundColor: "transparent",
    paddingBottom: spacing.md,
    paddingHorizontal: 16,
    paddingTop: 0,
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
