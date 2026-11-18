import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle } from "react-native-svg";
import {
  Bell,
  BookOpen,
  Check,
  CloudOff,
  Cookie,
  Coffee,
  Ellipsis,
  Lock,
  Pizza,
  RefreshCw,
  Soup,
  Sunrise,
  Utensils,
  UtensilsCrossed,
  WifiOff,
  type LucideIcon,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { CoachingRelationship, MealAssignment } from "@fitbud/contracts";
import { formatClockTime, formatCivilDate, formatNumber } from "@fitbud/core";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { useAuth } from "../auth/AuthProvider";
import { reportError } from "../lib/reportError";
import { FutureDayBanner } from "./FutureDayBanner";
import { PlannedMealSheet } from "./PlannedMealSheet";
import { dietFutureBannerText } from "./futureDay";
import { plannedSummaryLine } from "../lib/plannedMealItems";
import { stage1Api } from "../lib/stage1Api";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { useSyncEngine } from "../sync/SyncProvider";
import { useDeviceOffline } from "./today/queuedLogs";
import {
  attachMealPhotoBestEffort,
  confirmMealAssignment,
  isMealLogPending,
  MealSyncError,
  pendingMealLogIds,
} from "./mealActions";
import {
  canChangeLoggedMeal,
  canShowMealLogActions,
  cleanFoodLabel,
  mealLockCopy,
} from "./mealHelpers";
import { cacheKey, invalidateRelationshipDayData } from "./dataCache";
import { dayEyebrow, useDayState } from "./useDayState";
import {
  sharedRead,
  useTraineeDayCache,
  useTraineeWeek,
} from "./useTraineeDayCache";
import { isNetworkFailure } from "../trainer/attention/offline";
import { mealDueStatusLabel, nextUp } from "./nextUp";
import {
  buildNutritionRings,
  dayKcalSummary,
  mealsForDay,
  isMealLoggedForCount,
  nutrientsFromMealPrescription,
} from "./nutrition";
import { scheduledAssignments, sortMealsByTime } from "./scheduledAssignments";
import {
  TraineeDateNavigator,
  WEEK_UNAVAILABLE_MESSAGE,
} from "./TraineeDateNavigator";
import { CoachLogBadge } from "./coach-log/CoachLogBadge";
import { deviationLabel, LoggedMealSheet } from "./food/LoggedMealSheet";
import { formatAmount } from "./food/logLines";
import {
  takeMealSaved,
  useMealSavedNotice,
  type MealSavedNotice,
} from "./food/mealSavedNotice";

/** Meal-type glyph by the meal's name (TR-07a): the plan carries no meal type. */
function mealGlyph(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/early|morning|wake|pre.?workout/.test(n)) return Sunrise;
  if (/breakfast/.test(n)) return Coffee;
  if (/lunch/.test(n)) return Soup;
  if (/snack|tea|evening/.test(n)) return Cookie;
  if (/dinner|supper/.test(n)) return Pizza;
  return Utensils;
}

type MacroRowProps = {
  label: string;
  logged: number;
  assigned: number;
  color: string;
};

/**
 * One macro: label, then "104 / 102 g" on one line, then a bar (TR-07a).
 * Over the goal the logged number turns critical and the bar stays full;
 * the figure is never the only signal, the "/ goal" reads next to it.
 */
function MacroRow({ label, logged, assigned, color }: MacroRowProps) {
  const styles = useStyles();
  const over = assigned > 0 && logged > assigned;
  const pct = assigned > 0 ? Math.min(100, (logged / assigned) * 100) : 0;
  return (
    <View style={styles.macroRow} testID={`macro-${label.toLowerCase()}`}>
      <View style={styles.macroHead}>
        <Text variant="body">{label}</Text>
        <Text
          variant="body"
          style={styles.macroNums}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.2}
        >
          <Text variant="bodyStrong" tone={over ? "crit" : "ink"}>
            {formatNumber(logged)}
          </Text>
          <Text variant="body" tone="ink3">
            {` / ${formatNumber(assigned)} g`}
          </Text>
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <View
          style={[
            styles.macroFill,
            { width: `${pct}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * How the ring number is fitted: one line, shrinking to the ring's inner slot,
 * and never scaled past 1.2 by the system font size. Native only; Expo web
 * ignores `adjustsFontSizeToFit`, so a test reads these props from here.
 */
export const RING_NUMBER_FIT = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.5,
  maxFontSizeMultiplier: 1.2,
} as const;

/**
 * The kcal ring (TR-07a, TR-07e). The number sits in a fixed-width slot and
 * shrinks to fit on one line, so 12,345 and large system fonts never spill
 * across the ring (`maxFontSizeMultiplier` 1.2). Over the goal the ring stays
 * full and the overshoot shows as a critical arc.
 */
export function KcalRing({
  logged,
  assigned,
}: {
  logged: number;
  assigned: number;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const size = 120;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = assigned > 0 ? Math.min(logged / assigned, 1) : 0;
  const overshoot =
    assigned > 0 && logged > assigned
      ? Math.min((logged - assigned) / assigned, 1)
      : 0;
  const mid = size / 2;
  const slot = size - stroke * 2 - 6;
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={`${formatNumber(logged)} kcal eaten${
        assigned > 0 ? ` of ${formatNumber(assigned)}` : ""
      }`}
      testID="kcal-ring"
    >
      <Svg width={size} height={size}>
        <Circle
          cx={mid}
          cy={mid}
          r={radius}
          stroke={theme.colors.fill}
          strokeWidth={stroke}
          fill="none"
        />
        {progress > 0 ? (
          <Circle
            cx={mid}
            cy={mid}
            r={radius}
            stroke={theme.colors.brand}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference * progress} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        ) : null}
        {overshoot > 0 ? (
          <Circle
            cx={mid}
            cy={mid}
            r={radius}
            stroke={theme.colors.crit}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference * overshoot} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        ) : null}
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <View style={{ width: slot, alignItems: "center" }}>
          <Text
            variant="numberXl"
            style={styles.ringNumber}
            {...RING_NUMBER_FIT}
            testID="kcal-ring-number"
          >
            {formatNumber(logged)}
          </Text>
        </View>
        <Text variant="subhead" maxFontSizeMultiplier={1.2}>
          kcal eaten
        </Text>
      </View>
    </View>
  );
}

/** The ring card: ring, "left" or "over", the goal, and the three macros (TR-07a/e). */
function DaySummaryCard({
  logged,
  planned,
  protein,
  carbs,
  fat,
}: {
  logged: number;
  planned: number;
  protein: { logged: number; assigned: number };
  carbs: { logged: number; assigned: number };
  fat: { logged: number; assigned: number };
}) {
  const styles = useStyles();
  const theme = useTheme();
  const over = planned > 0 && logged > planned;
  const diff = Math.abs(planned - logged);
  return (
    <View style={styles.summary} testID="diet-summary">
      <KcalRing logged={logged} assigned={planned} />
      <View style={styles.summaryBody}>
        {planned > 0 ? (
          <View style={styles.leftRow}>
            <View style={styles.leftNums}>
              <Text
                variant="numberLg"
                tone={over ? "crit" : "ink"}
                maxFontSizeMultiplier={1.2}
              >
                {formatNumber(diff)}
              </Text>
              <Text
                variant="subhead"
                tone={over ? "crit" : "ink"}
                maxFontSizeMultiplier={1.2}
              >
                {over ? "kcal over" : "kcal left"}
              </Text>
            </View>
            <Text variant="caption" maxFontSizeMultiplier={1.2}>
              Goal {formatNumber(planned)}
            </Text>
          </View>
        ) : null}
        <View style={styles.macros}>
          <MacroRow label="Protein" {...protein} color={theme.colors.protein} />
          <MacroRow label="Carbs" {...carbs} color={theme.colors.carbs} />
          <MacroRow label="Fat" {...fat} color={theme.colors.fat} />
        </View>
      </View>
    </View>
  );
}

/** A centred card state: icon tile, title, body and buttons (TR-07c, TR-07i). */
function StateCard({
  icon: Icon,
  title,
  body,
  primary,
  secondary,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  primary?: { label: string; icon?: LucideIcon; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const PrimaryIcon = primary?.icon;
  return (
    <View style={styles.stateCard} testID={testID}>
      <View style={styles.stateTile}>
        <Icon size={30} strokeWidth={2} color={theme.colors.ink} />
      </View>
      <Text
        variant="title"
        style={styles.stateTitle}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="ink2" style={styles.stateBody}>
          {body}
        </Text>
      ) : null}
      {primary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          onPress={primary.onPress}
          style={styles.stateBtn}
        >
          {PrimaryIcon ? (
            <PrimaryIcon size={20} strokeWidth={2.2} color={theme.colors.ink} />
          ) : null}
          <Text variant="bodyStrong">{primary.label}</Text>
        </Pressable>
      ) : null}
      {secondary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondary.label}
          onPress={secondary.onPress}
          style={styles.stateLink}
        >
          <Text variant="bodyStrong">{secondary.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
type MeDay = Awaited<ReturnType<ReturnType<typeof stage1Api>["getMeDay"]>>;

/** One day of Diet as cached per relationship and civil date (Z12-40). */
type DietDayBundle = {
  meals: MealAssignment[];
  day: MeDay | null;
};

/** The meal's window has opened (or passed): only then does it offer a log. */
function windowOpened(meal: MealAssignment, now: Date): boolean {
  return (
    meal.status === "overdue" ||
    now.getTime() >= new Date(meal.windowStartsAt).getTime()
  );
}

/** The meal's window has closed with nothing logged. */
function windowClosed(meal: MealAssignment, now: Date): boolean {
  return (
    meal.status === "overdue" ||
    now.getTime() > new Date(meal.windowEndsAt).getTime()
  );
}

/**
 * Meals whose log still waits in the outbox: eaten as planned, skipped, or
 * logged another way (`meal.deviate`, TR-08 and TR-26).
 */
function pendingDietLogIds(
  outbox: ReadonlyArray<{ status: string; operation: string; recordId: string }>,
): Set<string> {
  const ids = pendingMealLogIds(outbox);
  for (const row of outbox) {
    if (
      (row.status === "pending" || row.status === "in_flight") &&
      row.operation === "meal.deviate"
    ) {
      ids.add(row.recordId);
    }
  }
  return ids;
}

/** Lowercase a later item's first letter ("Roti × 2, ragi dosa"), not an acronym's. */
function laterItemName(name: string): string {
  if (name.length > 1 && name[1] === name[1]!.toUpperCase() && /[A-Z]/.test(name[1]!)) {
    return name;
  }
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * What a changed meal's row reads after its label (TR-26f, TR-07e): the foods
 * the trainee logged, or an ate-out meal's kcal. Null keeps the plan's line.
 */
function changedMealSummary(meal: MealAssignment): string | null {
  const compliance = meal.compliance;
  if (!compliance) return null;
  if (compliance.deviationKind === "logged_foods") {
    const names = (compliance.loggedItems ?? []).map((item, index) => {
      const name = cleanFoodLabel(item.name);
      const shown = index === 0 ? name : laterItemName(name);
      return item.quantity != null && item.quantity !== 1
        ? `${shown} × ${formatAmount(item.quantity)}`
        : shown;
    });
    return names.length > 0 ? names.join(", ") : null;
  }
  if (compliance.deviationKind === "restaurant") {
    const kcal = compliance.loggedTotals?.energyKcal;
    if (kcal != null) return `${formatNumber(Math.round(kcal))} kcal`;
    return compliance.notes?.trim() || null;
  }
  return null;
}

type DietTabProps = {
  relationship: CoachingRelationship;
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
  onOpenOverlay: TraineeOverlayOpener;
  unreadNotifications?: number;
};

/**
 * Diet day, v3 (Z12-42). The scope makes this body follow the system light or
 * dark setting; the screen below opts in with `<Screen v3>`.
 */
export function DietTab(props: DietTabProps) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <DietTabBody {...props} />
    </ThemeScope>
  );
}

function DietTabBody({
  relationship,
  selectedDate,
  onSelectDate,
  onOpenOverlay,
  unreadNotifications = 0,
}: DietTabProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { api, me } = useAuth();
  const s1 = stage1Api(api);
  const sync = useSyncEngine();
  const timeZone = me?.timezone ?? "UTC";
  // One day state for Today, Diet and Workout (Z12-40); kept current across
  // local midnight and app foregrounding (Z12-39).
  const dayState = useDayState({ selectedDate, onSelectDate, timeZone });
  const { today } = dayState;
  /** D-W12-7: a future day shows the plan with no way to log it. */
  const isFuture = dayState.isFuture;
  /** A planned meal opened read-only on a future day (TR-07j without actions). */
  const [plannedMeal, setPlannedMeal] = useState<MealAssignment | null>(null);

  /**
   * One day of Diet, cached per relationship and date (Z12-40). The meals and
   * the week are reads Today shares, so a day seen on either tab is not
   * fetched twice.
   */
  const fetchDay = useCallback(
    async (
      date: string,
      { force }: { force: boolean },
    ): Promise<DietDayBundle> => {
      const [listed, day] = await Promise.all([
        sharedRead(
          cacheKey("meals", relationship.id, date, date),
          () =>
            api.listMealAssignments(relationship.id, {
              fromDate: date,
              toDate: date,
            }),
          { force },
        ),
        s1.getMeDay(date).catch(() => null),
      ]);
      return {
        meals: sortMealsByTime(
          mealsForDay(scheduledAssignments(listed.items), date),
        ),
        day,
      };
    },
    [api, relationship.id, s1],
  );
  const dayCache = useTraineeDayCache({
    screen: "diet",
    relationshipId: relationship.id,
    date: selectedDate,
    fetchDay,
  });
  const bundle = dayCache.data;
  /** The skeleton case only: a first visit to a day with nothing cached. */
  const loading = dayCache.firstLoad;
  const loadError = dayCache.error;
  const loadFailedOffline = loadError != null && isNetworkFailure(loadError);
  const lockStateKnown = bundle !== undefined && loadError == null;
  // A failed load is reported once per error (AGENTS.md: client error handling).
  useEffect(() => {
    if (loadError != null) reportError("DietTab.load", loadError);
  }, [loadError]);
  const dayTotals = bundle?.day ?? null;
  // Four-state, never a nullable model: see `WeekModelState` (CU23,
  // D-W3b-25). Cached per week and shared with Today (Z12-40).
  const { weekState, refresh: refreshWeek } = useTraineeWeek({
    relationshipId: relationship.id,
    selectedDate,
    getMeWeek: (start) => s1.getMeWeek(start),
    where: "DietTab.getMeWeek",
  });
  // The strip keeps the last `GET /me/day` answer while the next day loads;
  // `navigatorDaysFor` applies it only to the date it names (Z5-8).
  const [stripDay, setStripDay] = useState<MeDay | null>(null);
  useEffect(() => {
    if (bundle?.day) setStripDay(bundle.day);
  }, [bundle]);

  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const deviceOffline = useDeviceOffline();
  const [actingId, setActingId] = useState<string | null>(null);
  const unresolvedExceptions = 1;
  /**
   * Statuses this phone applied before the server has them (a log saved in
   * the outbox). Shown over the cached day until the server's copy is logged
   * or the outbox no longer holds the log.
   */
  const optimisticStatus = useRef(new Map<string, MealAssignment["status"]>());
  const [optimisticVersion, setOptimisticVersion] = useState(0);
  const [pendingSendIds, setPendingSendIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [photoPromptId, setPhotoPromptId] = useState<string | null>(null);
  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null);
  const coachName =
    relationship.trainerDisplayName?.split(/\s+/)[0] ?? "Your coach";

  // Z11b-1: every count, ring and row reads the selected day's meals only.
  const assignments = useMemo(() => {
    void optimisticVersion;
    return mealsForDay(bundle?.meals ?? [], selectedDate).map((meal) => {
      const next = optimisticStatus.current.get(meal.id);
      if (!next || isMealLoggedForCount(meal.status)) return meal;
      return meal.status === "pending" || meal.status === "overdue"
        ? { ...meal, status: next }
        : meal;
    });
  }, [bundle, selectedDate, optimisticVersion]);

  // After each load of the day: read which logs still wait in the outbox,
  // and drop optimistic statuses the server now has (or the outbox lost).
  useEffect(() => {
    if (!bundle) return;
    let active = true;
    void (async () => {
      let pendingIds: Set<string>;
      try {
        pendingIds = pendingDietLogIds(await sync.store.listOutbox());
      } catch (err) {
        // Unreadable outbox: keep what this phone applied as waiting rather
        // than claiming it was sent.
        reportError("DietTab.listOutbox", err);
        pendingIds = new Set(optimisticStatus.current.keys());
      }
      if (!active) return;
      let changed = false;
      for (const meal of bundle.meals) {
        if (!optimisticStatus.current.has(meal.id)) continue;
        const stillWaiting =
          pendingIds.has(meal.id) &&
          (meal.status === "pending" || meal.status === "overdue");
        if (isMealLoggedForCount(meal.status) || !stillWaiting) {
          optimisticStatus.current.delete(meal.id);
          changed = true;
        }
      }
      setPendingSendIds(pendingIds);
      if (changed) setOptimisticVersion((n) => n + 1);
    })();
    return () => {
      active = false;
    };
  }, [bundle, sync]);

  /** A plain refetch of the selected day (after a log). */
  const load = dayCache.refresh;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setActionError(null);
    await Promise.all([dayCache.refresh(), refreshWeek()]);
    setRefreshing(false);
  }, [dayCache, refreshWeek]);

  const nutritionRings = useMemo(
    () => buildNutritionRings(assignments, dayTotals?.totals ?? null),
    [assignments, dayTotals],
  );
  // One kcal source for the ring and the meal rows (D-W11-6); each day sum is
  // rounded once (Z12-42).
  const kcalSummary = useMemo(
    () => dayKcalSummary(assignments, dayTotals?.totals ?? null, selectedDate),
    [assignments, dayTotals, selectedDate],
  );
  const kcalRowById = useMemo(
    () => new Map(kcalSummary.rows.map((row) => [row.id, row])),
    [kcalSummary],
  );
  const showOffline = loadFailedOffline || deviceOffline;
  const ringOf = (key: "protein" | "carbs" | "fat") => {
    const ring = nutritionRings.find((r) => r.key === key);
    return { logged: ring?.logged ?? 0, assigned: ring?.assigned ?? 0 };
  };
  const now = new Date();

  const focusMealId = useMemo(() => {
    if (photoPromptId) return photoPromptId;
    // A future day has no "due now" meal: every meal is a planned row.
    if (isFuture) return null;
    const hero = nextUp({
      meals: assignments,
      workout: null,
      checkin: null,
    });
    // A meal whose window has not opened yet offers no log (Z12-41 hand-off):
    // it stays a planned row until it opens.
    if (hero?.kind === "meal" && windowOpened(hero.meal, new Date())) {
      return hero.meal.id;
    }
    return null;
  }, [assignments, photoPromptId, isFuture]);

  function applyOptimistic(id: string, status: MealAssignment["status"]) {
    optimisticStatus.current.set(id, status);
    setOptimisticVersion((n) => n + 1);
  }

  /**
   * TR-26f: a meal saved on another screen (food search, Something
   * different) comes back here as a toast. Taken once, so the toast shows on
   * this visit only. A log still in the outbox reads as changed and waiting.
   */
  const savedNotice = useMealSavedNotice(relationship.id);
  const [savedToast, setSavedToast] = useState<MealSavedNotice | null>(null);
  const [viewMealId, setViewMealId] = useState<string | null>(null);
  /** How each waiting changed meal was logged, for its "not sent yet" row. */
  const pendingKind = useRef(new Map<string, MealSavedNotice["kind"]>());
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!savedNotice) return;
    // Taking the notice re-renders with none, so the outbox read below must
    // not be tied to this effect's cleanup.
    const notice = savedNotice;
    takeMealSaved(notice.id);
    setSavedToast(notice);
    void (async () => {
      let waiting = false;
      try {
        waiting = pendingDietLogIds(await sync.store.listOutbox()).has(notice.assignmentId);
      } catch (err) {
        reportError("DietTab.listOutbox", err);
      }
      if (!mountedRef.current || !waiting) return;
      pendingKind.current.set(notice.assignmentId, notice.kind);
      optimisticStatus.current.set(notice.assignmentId, "modified");
      setOptimisticVersion((n) => n + 1);
      setPendingSendIds((ids) => new Set(ids).add(notice.assignmentId));
    })();
  }, [savedNotice, sync]);

  async function confirmMeal(assignment: MealAssignment) {
    setActingId(assignment.id);
    setActionError(null);
    applyOptimistic(assignment.id, "confirmed");
    try {
      await confirmMealAssignment(
        api,
        sync,
        relationship.id,
        assignment,
        coachName,
      );
      invalidateRelationshipDayData(relationship.id);
      if (await isMealLogPending(sync, assignment.id)) {
        // Saved on this phone, not sent (TR-07d): it counts as planned until
        // the server has it, and a photo can only follow once it is sent.
        setPendingSendIds((ids) => new Set(ids).add(assignment.id));
      } else {
        setPhotoPromptId(assignment.id);
      }
      await load();
    } catch (err) {
      // `MealSyncError` carries the app's own static text; anything else is
      // shown as fixed copy, never the raw error (AGENTS.md client errors).
      reportError("DietTab.confirmMeal", err);
      setActionError(
        err instanceof MealSyncError
          ? err.message
          : "Couldn't save that meal. Try again.",
      );
      optimisticStatus.current.delete(assignment.id);
      setOptimisticVersion((n) => n + 1);
    } finally {
      setActingId(null);
    }
  }

  async function addMealPhoto(assignment: MealAssignment) {
    setPhotoUploadingId(assignment.id);
    try {
      await attachMealPhotoBestEffort(api, relationship.id, assignment);
    } finally {
      setPhotoUploadingId(null);
      setPhotoPromptId(null);
    }
  }

  const openSomethingDifferent = (meal: MealAssignment) =>
    onOpenOverlay({ screen: "something_different", assignmentId: meal.id });

  /**
   * D-W12-7 (TR-07k): on a future day a meal is a planned row. Tapping it
   * opens the read-only planned meal; there is no log action anywhere on it.
   */
  function renderPlannedRow(meal: MealAssignment) {
    const planKcal = nutrientsFromMealPrescription(meal).kcal;
    const timeLabel = formatClockTime(meal.windowStartsAt, timeZone);
    const name = cleanFoodLabel(meal.mealName);
    const Glyph = mealGlyph(name);
    return (
      <Pressable
        key={meal.id}
        accessibilityRole="button"
        accessibilityLabel={`${name}, planned`}
        accessibilityHint="Shows the planned meal"
        onPress={() => setPlannedMeal(meal)}
        style={styles.row}
      >
        <View style={[styles.tile, styles.tileNeutral]}>
          <Glyph size={22} strokeWidth={1.9} color={theme.colors.ink2} />
        </View>
        <View style={styles.rowText}>
          <Text variant="headline" numberOfLines={1}>
            {name}
            <Text variant="caption"> {timeLabel}</Text>
          </Text>
          <Text variant="subhead" numberOfLines={1}>
            {plannedSummaryLine(meal)}
          </Text>
        </View>
        {planKcal > 0 ? (
          <View style={styles.kcalCol}>
            <Text variant="numberMd">{formatNumber(planKcal)}</Text>
            <Text variant="caption">planned</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  function renderRow(meal: MealAssignment) {
    if (isFuture) return renderPlannedRow(meal);
    const lockCopy = lockStateKnown ? mealLockCopy(meal, coachName) : null;
    const isLocked = Boolean(lockCopy);
    const isLogged =
      isMealLoggedForCount(meal.status) && meal.id !== photoPromptId;
    const isSkipped = meal.status === "skipped";
    const waiting = pendingSendIds.has(meal.id) && isLogged && !isSkipped;
    const kcalRow = kcalRowById.get(meal.id);
    const planKcal = nutrientsFromMealPrescription(meal).kcal;
    const shownKcal = isLogged
      ? isSkipped
        ? null
        : (kcalRow?.kcal ?? null)
      : planKcal;
    const missed = !isLogged && !isLocked && windowClosed(meal, now);
    const name = cleanFoodLabel(meal.mealName);
    const timeLabel = formatClockTime(meal.windowStartsAt, timeZone);
    const Glyph = mealGlyph(name);
    const canLogNow =
      !isLogged &&
      canShowMealLogActions({
        lockStateKnown,
        selectedDate,
        today,
        meal,
        unresolvedExceptionCount: unresolvedExceptions,
      }) &&
      windowOpened(meal, now);
    // A logged, changed meal can be changed again, unless it is closed
    // (TR-07f) or the coach logged it.
    const canChange = canChangeLoggedMeal({
      lockStateKnown,
      isLogged,
      meal,
      isLocked,
    });
    const summary = plannedSummaryLine(meal);

    const tileStyle = waiting
      ? styles.tileWarn
      : isLogged
        ? styles.tileDone
        : isLocked
          ? styles.tileNeutral
          : missed
            ? styles.tileCrit
            : styles.tileNeutral;
    const iconColor = waiting
      ? theme.colors.warn
      : isLogged
        ? theme.colors.done
        : isLocked
          ? theme.colors.ink3
          : missed
            ? theme.colors.crit
            : theme.colors.ink2;

    // An unlogged, unlocked row opens its planned meal (TR-07j).
    const opensDetail = !isLogged && !isLocked;
    return (
      <View key={meal.id} style={styles.rowCard}>
        <View style={styles.row}>
          <Pressable
            disabled={!opensDetail}
            accessibilityRole="button"
            accessibilityLabel={opensDetail ? `${name}, planned` : undefined}
            accessibilityHint={
              opensDetail ? "Shows the planned meal" : undefined
            }
            onPress={() => setPlannedMeal(meal)}
            style={styles.rowMain}
          >
            <View style={[styles.tile, tileStyle]}>
              <Glyph size={22} strokeWidth={1.9} color={iconColor} />
            </View>
            <View style={styles.rowText}>
              <Text
                variant="headline"
                numberOfLines={1}
                style={isLocked ? styles.muted : null}
              >
                {name}
                <Text variant="caption"> {timeLabel}</Text>
              </Text>
              {isLocked ? (
                <Text variant="subhead" numberOfLines={1}>
                  {lockCopy}
                </Text>
              ) : waiting ? (
                <Text variant="subhead" numberOfLines={1}>
                  {meal.status === "modified"
                    ? `${deviationLabel(pendingKind.current.get(meal.id))} · not sent yet`
                    : "Eaten as planned · not sent yet"}
                </Text>
              ) : isSkipped ? (
                <Text variant="subhead" numberOfLines={1}>
                  Skipped
                </Text>
              ) : (
                <Text variant="subhead" numberOfLines={1}>
                  {meal.status === "modified" ? (
                    <Text variant="subhead" tone="warn" style={styles.strong}>
                      {deviationLabel(meal.compliance?.deviationKind)}
                    </Text>
                  ) : missed ? (
                    <Text variant="subhead" tone="crit" style={styles.strong}>
                      Not logged yet
                    </Text>
                  ) : null}
                  {meal.status === "modified" || missed ? " · " : ""}
                  {(meal.status === "modified" ? changedMealSummary(meal) : null) ??
                    summary}
                </Text>
              )}
              {isLogged ? (
                <CoachLogBadge
                  loggedByRole={meal.compliance?.loggedByRole}
                  lastEditedByRole={meal.compliance?.lastEditedByRole}
                  editedAt={meal.compliance?.updatedAt}
                  timeZone={timeZone}
                />
              ) : null}
            </View>
            {shownKcal != null && !isSkipped ? (
              <View style={styles.kcalCol}>
                <Text variant="numberMd">{formatNumber(shownKcal)}</Text>
                <Text variant="caption">{isLogged ? "kcal" : "planned"}</Text>
              </View>
            ) : null}
          </Pressable>
          {waiting ? (
            <View
              style={[styles.badge, styles.tileWarn]}
              accessibilityLabel="Not sent yet"
            >
              <CloudOff size={18} strokeWidth={2} color={theme.colors.warn} />
            </View>
          ) : isLogged && !isSkipped ? (
            <View
              style={[styles.badge, styles.badgeDone]}
              accessibilityLabel="Logged"
            >
              <Check size={18} strokeWidth={2.6} color={theme.colors.onBrand} />
            </View>
          ) : isLocked ? (
            <View style={styles.badge} accessibilityLabel="Closed">
              <Lock size={20} strokeWidth={1.9} color={theme.colors.ink3} />
            </View>
          ) : missed && canLogNow ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Log ${name}`}
              onPress={() => openSomethingDifferent(meal)}
              style={[styles.badge, styles.badgeTap]}
            >
              <Ellipsis size={22} color={theme.colors.ink2} />
            </Pressable>
          ) : null}
        </View>
        {canChange ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change ${name}`}
            onPress={() => openSomethingDifferent(meal)}
            style={styles.changeBtn}
          >
            <Text variant="bodyStrong" tone="coachInk">
              Change
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  function renderFocusMeal(meal: MealAssignment) {
    const canLog = canShowMealLogActions({
      lockStateKnown,
      selectedDate,
      today,
      meal,
      unresolvedExceptionCount: unresolvedExceptions,
    });
    const kcal = kcalRowById.get(meal.id)?.kcal ?? null;
    const showPhotoPrompt =
      photoPromptId === meal.id &&
      (meal.status === "confirmed" || meal.status === "logged_later");
    const dueNow = canLog && !showPhotoPrompt;
    const name = cleanFoodLabel(meal.mealName);
    const Glyph = mealGlyph(name);
    const due = mealDueStatusLabel(meal, timeZone, now);
    const overdue = due === "Overdue";

    return (
      <View
        key={meal.id}
        style={[styles.rowCard, dueNow && styles.focusCard]}
        testID="diet-focus-meal"
      >
        <View style={styles.row}>
          <View
            style={[
              styles.tile,
              showPhotoPrompt ? styles.tileDone : styles.tileBrand,
            ]}
          >
            {showPhotoPrompt ? (
              <Check size={22} color={theme.colors.done} strokeWidth={2.4} />
            ) : (
              <Glyph
                size={22}
                strokeWidth={1.9}
                color={theme.colors.brandInk}
              />
            )}
          </View>
          <View style={styles.rowText}>
            <Text variant="headline" numberOfLines={1}>
              {name}
              <Text variant="caption">
                {" "}
                {formatClockTime(meal.windowStartsAt, timeZone)}
              </Text>
              {!showPhotoPrompt ? (
                <Text
                  variant="caption"
                  tone={overdue ? "crit" : "coralInk"}
                  style={styles.strong}
                >
                  {"  "}
                  {overdue ? "Overdue" : due === "due now" ? "Due now" : due}
                </Text>
              ) : null}
            </Text>
            <Text variant="subhead" numberOfLines={1}>
              {showPhotoPrompt ? "Eaten as planned" : plannedSummaryLine(meal)}
            </Text>
          </View>
          {kcal != null ? (
            <View style={styles.kcalCol}>
              <Text variant="numberMd">{formatNumber(kcal)}</Text>
              <Text variant="caption">kcal</Text>
            </View>
          ) : null}
        </View>
        {canLog && !showPhotoPrompt ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Eaten as planned"
              disabled={actingId === meal.id}
              onPress={() => void confirmMeal(meal)}
              style={[
                styles.primaryBtn,
                actingId === meal.id && styles.btnDisabled,
              ]}
            >
              {actingId === meal.id ? (
                <ActivityIndicator color={theme.colors.onBrand} />
              ) : (
                <>
                  <Check
                    size={18}
                    color={theme.colors.onBrand}
                    strokeWidth={2.2}
                  />
                  <Text variant="bodyStrong" tone="onBrand" numberOfLines={1}>
                    Eaten as planned
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable
              testID="diet-something-different"
              accessibilityRole="button"
              accessibilityLabel="Something different"
              onPress={() => openSomethingDifferent(meal)}
              style={styles.secondaryBtn}
            >
              <Text variant="bodyStrong" numberOfLines={1}>
                Something different
              </Text>
            </Pressable>
          </View>
        ) : null}
        {showPhotoPrompt ? (
          <View style={styles.photoPrompt}>
            <Text variant="bodyStrong">Add a photo for {coachName}?</Text>
            <Text variant="subhead">
              Your log is saved. A photo is optional and can follow later.
            </Text>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryBtn}
                onPress={() => void addMealPhoto(meal)}
              >
                <Text variant="bodyStrong">Camera</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryBtn}
                onPress={() => void addMealPhoto(meal)}
              >
                <Text variant="bodyStrong">Gallery</Text>
              </Pressable>
            </View>
            {photoUploadingId === meal.id ? (
              <ActivityIndicator
                color={theme.colors.brand}
                style={styles.photoSpinner}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  const loggedCount = assignments.filter((m) =>
    isMealLoggedForCount(m.status),
  ).length;
  // The centred error state: nothing to show for the day and the load failed
  // (TR-07i). With a cached day the content stays and a short banner says so.
  const showLoadError = loadError != null && bundle === undefined;
  // The connection copy only when the failure was a connection one; an API
  // error shows its own curated message, anything else (a ZodError included)
  // stays neutral (AGENTS.md: no misleading catch).
  const loadErrorBody = loadFailedOffline
    ? "Check your connection. Anything you logged is saved on your phone."
    : loadError instanceof ApiClientError
      ? loadError.message
      : "Something went wrong. Try again.";
  const staleError =
    loadError != null && bundle !== undefined && !loadFailedOffline;
  const sentCount = pendingSendIds.size;
  const viewMeal = viewMealId
    ? (assignments.find((meal) => meal.id === viewMealId) ?? null)
    : null;
  const savedToastMessage = savedToast
    ? savedToast.kcal != null
      ? `${savedToast.mealName} saved · ${formatNumber(savedToast.kcal)} kcal`
      : `${savedToast.mealName} saved`
    : null;
  const offlineNote =
    sentCount > 0
      ? `Offline. ${sentCount === 1 ? "1 meal is" : `${sentCount} meals are`} saved on your phone and will send when you’re back.`
      : `Offline. Your logs are saved on your phone and will send when you’re back.`;

  return (
    // A horizontal swipe anywhere on the screen moves a day (Z12-40): a
    // native pan around the whole screen, so the empty space under a short
    // day counts too.
    <GestureDetector gesture={dayState.swipeGesture}>
      <Screen
        v3
        chrome="app"
        title="Diet"
        showHeader={false}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        footerVariant="toast"
        footer={
          savedToast && savedToastMessage ? (
            <Snackbar
              key={savedToast.id}
              leadingCheck
              message={savedToastMessage}
              actionLabel="View"
              onAction={() => {
                if (savedToast.localDate !== selectedDate) {
                  onSelectDate(savedToast.localDate);
                }
                setViewMealId(savedToast.assignmentId);
              }}
            />
          ) : undefined
        }
      >
        <View style={styles.swipeBody}>
          <View style={styles.ttlrow}>
            <View style={styles.titles}>
              <Text variant="subhead" testID="day-eyebrow">
                {dayEyebrow(selectedDate, dayState.kind, `${coachName}’s plan`)}
              </Text>
              <Text variant="largeTitle" accessibilityRole="header">
                Diet
              </Text>
            </View>
            <View style={styles.headerActions}>
              {!showOffline && sentCount > 0 ? (
                <View
                  style={styles.chip}
                  accessibilityLabel={`Waiting to send ${sentCount}`}
                >
                  <CloudOff
                    size={16}
                    strokeWidth={2}
                    color={theme.colors.warn}
                  />
                  <Text variant="bodyStrong" tone="ink2">
                    Waiting to send {sentCount}
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Meal plan"
                onPress={() => onOpenOverlay({ screen: "meal_plan" })}
                style={styles.iconBtn}
              >
                <BookOpen
                  size={22}
                  color={theme.colors.ink2}
                  strokeWidth={1.9}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                onPress={() => onOpenOverlay({ screen: "notifications" })}
                style={styles.iconBtn}
              >
                <Bell size={22} color={theme.colors.ink2} strokeWidth={1.9} />
                {unreadNotifications > 0 ? (
                  <View style={styles.unreadDot} />
                ) : null}
              </Pressable>
            </View>
          </View>

          {/*
            The shared v3 strip (Z12-40): the same control, day states and
            moves as Today and Workout. Its states come from `GET /me/week`
            and the day's own `GET /me/day` (Z5-8), so the tabs never disagree.
          */}
          <TraineeDateNavigator
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            weekState={weekState}
            day={dayTotals ?? stripDay}
            showPreviewBanner={false}
          />

          {actionError ? <ErrorBanner message={actionError} /> : null}
          {staleError ? (
            <ErrorBanner message="Couldn’t refresh your meals. Pull down to try again." />
          ) : null}
          {/*
            The week strip's states come from `GET /me/week`. When that call
            fails the dots carry no state and the trainee is told so (CU23,
            D-W3b-25): they are never filled in from the date alone.
          */}
          {weekState.status === "unavailable" ? (
            <ErrorBanner message={WEEK_UNAVAILABLE_MESSAGE} />
          ) : null}
          {isFuture ? (
            <View style={styles.gap}>
              <FutureDayBanner
                kind="neutral"
                text={dietFutureBannerText(coachName, selectedDate)}
              />
            </View>
          ) : null}
          {showOffline && !showLoadError ? (
            <View style={styles.offlineBanner} accessibilityRole="alert">
              <WifiOff size={20} color={theme.colors.ink2} strokeWidth={1.9} />
              <Text variant="body" tone="ink2" style={styles.offlineText}>
                {offlineNote}
              </Text>
            </View>
          ) : null}

          {showLoadError ? (
            <StateCard
              testID="diet-load-error"
              icon={CloudOff}
              title="Couldn’t load your meals"
              body={loadErrorBody}
              primary={{
                label: "Try again",
                icon: RefreshCw,
                onPress: () => void onRefresh(),
              }}
            />
          ) : loading ? (
            <Text variant="subhead" style={styles.loadingText}>
              Loading meals…
            </Text>
          ) : assignments.length === 0 ? (
            isFuture ? (
              <StateCard
                testID="diet-no-meals"
                icon={Utensils}
                title="No meals planned"
              />
            ) : (
              <StateCard
                testID="diet-no-meals"
                icon={UtensilsCrossed}
                title="No meals planned today"
                body={`${coachName} hasn’t set meals for today.`}
                secondary={{
                  label: `Ask ${coachName} on WhatsApp`,
                  onPress: () =>
                    onOpenOverlay({
                      screen: "ask_coach",
                      itemType: "plan_version",
                      itemId: "plan",
                      itemLabel: "Meal plan",
                      dateLabel: formatCivilDate(selectedDate),
                    }),
                }}
              />
            )
          ) : (
            <>
              <DaySummaryCard
                logged={kcalSummary.loggedTotal}
                planned={kcalSummary.plannedTotal}
                protein={ringOf("protein")}
                carbs={ringOf("carbs")}
                fat={ringOf("fat")}
              />
              <View style={styles.sectionHead}>
                <Text variant="title" accessibilityRole="header">
                  Meals
                </Text>
                {isFuture ? null : (
                  <Text variant="subhead" testID="meals-logged">
                    {loggedCount} of {assignments.length} logged
                  </Text>
                )}
              </View>
              <View style={styles.list}>
                {assignments.map((meal) =>
                  meal.id === focusMealId
                    ? renderFocusMeal(meal)
                    : renderRow(meal),
                )}
              </View>
            </>
          )}

          {viewMeal ? (
            <LoggedMealSheet
              meal={viewMeal}
              coachName={coachName}
              timeZone={timeZone}
              waitingToSend={pendingSendIds.has(viewMeal.id)}
              onClose={() => setViewMealId(null)}
            />
          ) : null}
          {plannedMeal ? (
            <PlannedMealSheet
              meal={plannedMeal}
              coachName={coachName}
              timeZone={timeZone}
              onClose={() => setPlannedMeal(null)}
              actions={
                !isFuture &&
                canShowMealLogActions({
                  lockStateKnown,
                  selectedDate,
                  today,
                  meal: plannedMeal,
                  unresolvedExceptionCount: unresolvedExceptions,
                }) &&
                windowOpened(plannedMeal, now)
                  ? {
                      onEaten: () => {
                        const meal = plannedMeal;
                        setPlannedMeal(null);
                        void confirmMeal(meal);
                      },
                      onDifferent: () => {
                        const meal = plannedMeal;
                        setPlannedMeal(null);
                        openSomethingDifferent(meal);
                      },
                    }
                  : undefined
              }
            />
          ) : null}
        </View>
      </Screen>
    </GestureDetector>
  );
}

const useStyles = createThemedStyles((t) => ({
  swipeBody: { flexGrow: 1 },
  ttlrow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  titles: { flex: 1 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 4 },
  iconBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    position: "relative",
    width: 44,
  },
  unreadDot: {
    backgroundColor: t.colors.coral,
    borderRadius: 5,
    height: 9,
    position: "absolute",
    right: 11,
    top: 10,
    width: 9,
  },
  chip: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  gap: { marginBottom: 12 },
  offlineBanner: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    padding: 14,
  },
  offlineText: { flex: 1 },
  loadingText: { paddingVertical: 24, textAlign: "center" },
  summary: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card + 4,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    marginTop: 4,
    padding: 14,
  },
  summaryBody: { flex: 1, minWidth: 0 },
  leftRow: {
    alignItems: "baseline",
    borderBottomColor: t.colors.line,
    borderBottomWidth: 1,
    columnGap: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  leftNums: {
    alignItems: "baseline",
    columnGap: 4,
    flexDirection: "row",
    flexShrink: 0,
  },
  macros: { gap: 8, paddingTop: 8 },
  macroRow: { gap: 4 },
  macroHead: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  macroNums: { flexShrink: 1, textAlign: "right" },
  macroTrack: {
    backgroundColor: t.colors.fill,
    borderRadius: 4,
    height: 8,
    overflow: "hidden",
  },
  macroFill: { borderRadius: 4, height: 8 },
  ringCenter: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  ringNumber: { fontSize: 28, lineHeight: 32, textAlign: "center" },
  sectionHead: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 22,
    paddingHorizontal: 4,
  },
  list: { gap: 10 },
  rowCard: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.meal,
    borderWidth: 1,
    overflow: "hidden",
  },
  focusCard: { borderColor: t.colors.coral, borderWidth: 2 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    padding: 12,
  },
  rowMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minWidth: 0,
  },
  rowText: { flex: 1, gap: 2, minWidth: 0 },
  muted: { color: t.colors.ink3 },
  strong: { fontWeight: "700" },
  tile: {
    alignItems: "center",
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  tileNeutral: { backgroundColor: t.colors.fill },
  tileBrand: { backgroundColor: t.colors.brandTint },
  tileDone: { backgroundColor: t.colors.doneTint },
  tileWarn: { backgroundColor: t.colors.warnTint },
  tileCrit: { backgroundColor: t.colors.critTint },
  kcalCol: { alignItems: "flex-end", minWidth: 44 },
  badge: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  /** 44 pt touch target for the "Log {meal}" ellipsis (AGENTS.md). */
  badgeTap: { borderRadius: 22, height: 44, width: 44 },
  badgeDone: { backgroundColor: t.colors.done },
  changeBtn: {
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    paddingBottom: 4,
    paddingHorizontal: 72,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  primaryBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: t.radii.button,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 8,
  },
  secondaryBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.button,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 8,
  },
  btnDisabled: { opacity: 0.6 },
  photoPrompt: { gap: 4, paddingBottom: 4, paddingHorizontal: 12 },
  photoSpinner: { marginTop: 8 },
  stateCard: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card + 4,
    borderWidth: 1,
    marginTop: 4,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  stateTile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 24,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  stateTitle: { marginTop: 16, textAlign: "center" },
  stateBody: { marginTop: 8, textAlign: "center" },
  stateBtn: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: t.colors.brandTint,
    borderRadius: t.radii.button,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 52,
  },
  stateLink: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    minHeight: 48,
  },
}));
