import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  Bell,
  BookOpen,
  Check,
  Clock,
  Coffee,
  Ellipsis,
  Lock,
  Moon,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { CoachingRelationship, MealAssignment } from "@fitbud/contracts";
import { formatClockTime, formatKcal, formatNumber } from "@fitbud/core";
import { rings } from "@fitbud/tokens";
import {
  colors,
  radii,
  spacing,
  type DateNavigatorDay,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import { localDateInTimezone, startOfWeekMonday, weekDatesFrom, weekdayShort, dayOfMonth } from "../lib/dates";
import { plannedSummaryLine } from "../lib/plannedMealItems";
import { stage1Api } from "../lib/stage1Api";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { useSyncEngine } from "../sync/SyncProvider";
import {
  attachMealPhotoBestEffort,
  confirmMealAssignment,
  MealSyncError,
} from "./mealActions";
import {
  canShowMealLogActions,
  cleanFoodLabel,
  mealKcalFromDayTotals,
  mealLockCopy,
} from "./mealHelpers";
import { invalidateRelationshipDayData, subscribeAll } from "./dataCache";
import { nextUp } from "./nextUp";
import {
  buildNutritionRings,
  isMealLoggedForCount,
  mealsLoggedSummary,
  nutrientsFromMealPrescription,
} from "./nutrition";
import {
  scheduledAssignments,
  sortMealsByTime,
} from "./scheduledAssignments";
import type { WeekDayState } from "@fitbud/contracts";

function mapWeekState(state: WeekDayState): DateNavigatorDay["state"] {
  switch (state) {
    case "done":
      return "done";
    case "partial":
      return "partial";
    case "missed":
      return "open";
    case "rest":
      return "rest";
    case "future":
      return "future";
    default:
      return "open";
  }
}

function MacroBar({
  label,
  logged,
  assigned,
  color,
}: {
  label: string;
  logged: number;
  assigned: number;
  color: string;
}) {
  const pct = assigned > 0 ? Math.min(100, (logged / assigned) * 100) : 0;
  return (
    <View style={styles.macCol}>
      <Text style={styles.macLabel}>{label}</Text>
      <Text style={styles.macNums}>
        <Text style={styles.macLogged}>{formatNumber(logged)}</Text>
        {" of "}
        {formatNumber(assigned)} g
      </Text>
      <View style={styles.macTrack}>
        <View style={[styles.macFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function KcalRing({ logged, assigned }: { logged: number; assigned: number }) {
  const size = 76;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const progress = assigned > 0 ? Math.min(logged / assigned, 1) : 0;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * progress;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={rings.track}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={rings.kcal}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringKcal}>{formatNumber(logged)}</Text>
        <Text style={styles.ringUnit}>kcal</Text>
      </View>
    </View>
  );
}

function mealTileIcon(meal: MealAssignment, variant: "due" | "logged" | "later" | "locked") {
  if (variant === "locked") return <Lock size={19} color={colors.midGrey} />;
  if (variant === "logged") return <Check size={19} color={colors.success} />;
  if (variant === "due") return <Coffee size={19} color={colors.indigo} />;
  return <Moon size={19} color={colors.midGrey} />;
}

export function DietTab({
  relationship,
  selectedDate,
  onSelectDate,
  onOpenOverlay,
  unreadNotifications = 0,
}: {
  relationship: CoachingRelationship;
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
  onOpenOverlay: TraineeOverlayOpener;
  unreadNotifications?: number;
}) {
  const { api, me } = useAuth();
  const s1 = stage1Api(api);
  const sync = useSyncEngine();
  const [assignments, setAssignments] = useState<MealAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [lockStateKnown, setLockStateKnown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [dayTotals, setDayTotals] = useState<Awaited<
    ReturnType<typeof s1.getMeDay>
  > | null>(null);
  const unresolvedExceptions = 1;
  const [skippedUndo, setSkippedUndo] = useState<{
    assignmentId: string;
    mealName: string;
  } | null>(null);
  const [photoPromptId, setPhotoPromptId] = useState<string | null>(null);
  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null);
  const coachName =
    relationship.trainerDisplayName?.split(/\s+/)[0] ?? "Your coach";

  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const weekStart = useMemo(
    () => startOfWeekMonday(selectedDate),
    [selectedDate],
  );
  const [weekModel, setWeekModel] = useState<Awaited<
    ReturnType<typeof s1.getMeWeek>
  > | null>(null);

  const loadWeek = useCallback(async () => {
    try {
      const week = await s1.getMeWeek(weekStart);
      setWeekModel(week);
    } catch {
      setWeekModel(null);
    }
  }, [s1, weekStart]);

  const load = useCallback(async () => {
    setError(null);
    setLockStateKnown(false);
    try {
      const [listed, day] = await Promise.all([
        api.listMealAssignments(relationship.id, {
          fromDate: selectedDate,
          toDate: selectedDate,
        }),
        s1.getMeDay(selectedDate).catch(() => null),
      ]);
      setAssignments(sortMealsByTime(scheduledAssignments(listed.items)));
      setDayTotals(day);
      setOffline(false);
      setLockStateKnown(true);
    } catch (err) {
      setOffline(true);
      setLockStateKnown(false);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't refresh diet. Pull to try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, selectedDate, s1]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    return subscribeAll(() => {
      void load();
    });
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    await loadWeek();
    setRefreshing(false);
  }, [load, loadWeek]);

  const nutritionRings = useMemo(
    () => buildNutritionRings(assignments, dayTotals?.totals ?? null),
    [assignments, dayTotals],
  );
  const kcalRing = nutritionRings.find((r) => r.key === "kcal");
  const proteinRing = nutritionRings.find((r) => r.key === "protein");
  const carbsRing = nutritionRings.find((r) => r.key === "carbs");
  const fatRing = nutritionRings.find((r) => r.key === "fat");

  const weekDays = useMemo((): DateNavigatorDay[] => {
    const dates = weekDatesFrom(weekStart);
    const byDate = new Map(
      (weekModel?.days ?? []).map((day) => [day.date, day.state]),
    );
    return dates.map((localDate) => ({
      localDate,
      weekdayLabel: weekdayShort(timeZone, localDate),
      dayLabel: dayOfMonth(timeZone, localDate),
      state: mapWeekState(
        byDate.get(localDate) ?? (localDate > today ? "future" : "missed"),
      ),
    }));
  }, [weekModel?.days, weekStart, timeZone, today]);

  const focusMealId = useMemo(() => {
    if (photoPromptId) return photoPromptId;
    const hero = nextUp({
      meals: assignments,
      workout: null,
      checkin: null,
    });
    if (hero?.kind === "meal") return hero.meal.id;
    return null;
  }, [assignments, photoPromptId]);

  async function confirmMeal(assignment: MealAssignment) {
    setActingId(assignment.id);
    setError(null);
    try {
      await confirmMealAssignment(
        api,
        sync,
        relationship.id,
        assignment,
        coachName,
      );
      invalidateRelationshipDayData(relationship.id);
      setPhotoPromptId(assignment.id);
      await load();
    } catch (err) {
      setError(
        err instanceof MealSyncError
          ? err.message
          : err instanceof ApiClientError
            ? err.message
            : "Could not confirm meal.",
      );
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

  function renderCompactRow(meal: MealAssignment, index: number) {
    const lockCopy = lockStateKnown ? mealLockCopy(meal, coachName) : null;
    const kcal = mealKcalFromDayTotals(meal, dayTotals?.totals.perMeal);
    const planKcal = nutrientsFromMealPrescription(meal).kcal;
    const loggedKcal =
      meal.status === "modified" && meal.compliance?.loggedTotals?.energyKcal != null
        ? meal.compliance.loggedTotals.energyKcal
        : kcal;
    const timeLabel = formatClockTime(meal.windowStartsAt, timeZone);
    const isLocked = Boolean(lockCopy);
    const isLogged = isMealLoggedForCount(meal.status) && meal.id !== photoPromptId;
    const isLater =
      !isLocked &&
      !isLogged &&
      meal.id !== focusMealId &&
      (meal.status === "pending" || meal.status === "overdue");

    return (
      <View
        key={meal.id}
        style={[
          styles.lrow,
          index === 0 && styles.lrowFirst,
          isLocked && styles.lrowLocked,
        ]}
      >
        <View
          style={[
            styles.tile,
            isLogged ? styles.tilePos : isLocked || isLater ? styles.tileNeu : null,
          ]}
        >
          {mealTileIcon(
            meal,
            isLocked ? "locked" : isLogged ? "logged" : "later",
          )}
        </View>
        <View style={styles.lrowText}>
          <Text style={[styles.mealTitle, isLocked && styles.mealTitleMuted]}>
            {cleanFoodLabel(meal.mealName)}
            <Text style={styles.mealTime}> {timeLabel}</Text>
          </Text>
          {isLocked ? (
            <Text style={styles.mealSub}>{lockCopy}</Text>
          ) : isLogged ? (
            <Text style={styles.mealSub}>
              {meal.status === "modified" ? "Changed" : "Logged"}
              {loggedKcal != null ? ` · ${formatKcal(loggedKcal)}` : ""}
              {planKcal > 0 ? ` · plan ${formatKcal(planKcal)}` : ""}
            </Text>
          ) : (
            <Text style={styles.mealSub} numberOfLines={1}>
              {plannedSummaryLine(meal)}
            </Text>
          )}
        </View>
        {isLogged && meal.status === "modified" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onOpenOverlay({
                screen: "something_different",
                assignmentId: meal.id,
              })
            }
            style={styles.changeBtn}
          >
            <Text style={styles.changeBtnText}>Change</Text>
          </Pressable>
        ) : isLater && kcal != null ? (
          <View style={styles.lrowRight}>
            <Text style={styles.laterKcal}>{formatKcal(kcal)}</Text>
            <Text style={styles.laterLabel}>Later</Text>
          </View>
        ) : null}
      </View>
    );
  }

  function renderExpandedMeal(meal: MealAssignment) {
    const canLog = canShowMealLogActions({
      lockStateKnown,
      selectedDate,
      today,
      meal,
      unresolvedExceptionCount: unresolvedExceptions,
    });
    const kcal = mealKcalFromDayTotals(meal, dayTotals?.totals.perMeal);
    const macros = nutrientsFromMealPrescription(meal);
    const itemsLine = plannedSummaryLine(meal);
    const showPhotoPrompt =
      photoPromptId === meal.id &&
      (meal.status === "confirmed" || meal.status === "logged_later");
    const dueNow = canLog && !showPhotoPrompt;

    return (
      <View
        key={meal.id}
        style={[styles.mealc, dueNow && styles.mealcDue]}
      >
        <View style={styles.mealHd}>
          <View style={[styles.tileLg, showPhotoPrompt && styles.tilePos]}>
            {showPhotoPrompt ? (
              <Check size={22} color={colors.success} />
            ) : (
              <Coffee size={22} color={colors.indigo} />
            )}
          </View>
          <View style={styles.mealHdText}>
            <Text style={styles.mealHdTitle}>{cleanFoodLabel(meal.mealName)}</Text>
            {showPhotoPrompt ? (
              <View style={styles.savedRow}>
                <Check size={14} color={colors.success} strokeWidth={2.4} />
                <Text style={styles.savedText}>Eaten as planned</Text>
              </View>
            ) : (
              <View style={styles.dueRow}>
                <Clock size={14} color={colors.indigo} strokeWidth={2.1} />
                <Text style={styles.dueText}>
                  {formatClockTime(meal.windowStartsAt, timeZone)} · due now
                </Text>
              </View>
            )}
          </View>
          {kcal != null ? (
            <Text style={styles.mealKcalRight}>{formatKcal(kcal)}</Text>
          ) : null}
          <Pressable accessibilityRole="button" style={styles.moreBtn}>
            <Ellipsis size={22} color={colors.darkGrey} />
          </Pressable>
        </View>
        {itemsLine ? <Text style={styles.itemsLine}>{itemsLine}</Text> : null}
        {!showPhotoPrompt ? (
          <View style={styles.metaRow}>
            <Text style={styles.macLine}>
              P <Text style={styles.macBold}>{macros.protein}</Text> · C{" "}
              <Text style={styles.macBold}>{macros.carbs}</Text> · F{" "}
              <Text style={styles.macBold}>{macros.fat}</Text> g
            </Text>
            <Pressable accessibilityRole="button" style={styles.seeDetails}>
              <Text style={styles.seeDetailsText}>See details</Text>
            </Pressable>
          </View>
        ) : null}
        {canLog ? (
          <View style={styles.btn2}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Eaten as planned"
              disabled={actingId === meal.id}
              onPress={() => void confirmMeal(meal)}
              style={[styles.eatenBtn, actingId === meal.id && styles.btnDisabled]}
            >
              {actingId === meal.id ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Check size={18} color={colors.white} strokeWidth={1.75} />
                  <Text style={styles.eatenBtnText}>Eaten as planned</Text>
                </>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Something different"
              onPress={() =>
                onOpenOverlay({
                  screen: "something_different",
                  assignmentId: meal.id,
                })
              }
              style={styles.diffBtn}
            >
              <Text style={styles.diffBtnText}>Something different</Text>
            </Pressable>
          </View>
        ) : null}
        {showPhotoPrompt ? (
          <View style={styles.photop}>
            <View style={styles.photopHead}>
              <Text style={styles.photopTitle}>Add a photo for {coachName}?</Text>
            </View>
            <Text style={styles.photopBody}>
              Your log is saved. A photo is optional and can follow later.
            </Text>
            <View style={styles.photopBtns}>
              <Pressable
                accessibilityRole="button"
                style={styles.photopBtn}
                onPress={() => void addMealPhoto(meal)}
              >
                <Text style={styles.photopBtnText}>Camera</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.photopBtn}
                onPress={() => void addMealPhoto(meal)}
              >
                <Text style={styles.photopBtnText}>Gallery</Text>
              </Pressable>
            </View>
            {photoUploadingId === meal.id ? (
              <ActivityIndicator color={colors.indigo} style={{ marginTop: 8 }} />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  const compactMeals = assignments.filter((m) => m.id !== focusMealId);
  const focusMeal = assignments.find((m) => m.id === focusMealId);

  const compactBefore = compactMeals.filter((meal) => {
    if (!focusMeal) return true;
    return (
      new Date(meal.windowStartsAt).getTime() <
      new Date(focusMeal.windowStartsAt).getTime()
    );
  });
  const compactAfter = compactMeals.filter((meal) => {
    if (!focusMeal) return false;
    return (
      new Date(meal.windowStartsAt).getTime() >=
      new Date(focusMeal.windowStartsAt).getTime()
    );
  });

  return (
    <Screen
      chrome="app"
      title="Diet"
      showHeader={false}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <View style={styles.ttlrow}>
        <Text style={styles.h1} accessibilityRole="header">
          Diet
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Meal plan"
            onPress={() => onOpenOverlay({ screen: "meal_plan" })}
            style={styles.ibtn}
          >
            <BookOpen size={22} color={colors.darkGrey} strokeWidth={1.75} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => onOpenOverlay({ screen: "notifications" })}
            style={styles.iconbtn}
          >
            <Bell size={22} color={colors.darkGrey} strokeWidth={1.75} />
            {unreadNotifications > 0 ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        </View>
      </View>

      <View style={styles.wk7}>
        {weekDays.map((day) => {
          const selected = day.localDate === selectedDate;
          return (
            <Pressable
              key={day.localDate}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelectDate(day.localDate)}
              style={[styles.wkDay, selected && styles.wkDayOn]}
            >
              <Text style={[styles.wkDow, selected && styles.wkTextOn]}>
                {day.weekdayLabel}
              </Text>
              <Text style={[styles.wkNum, selected && styles.wkTextOn]}>
                {day.dayLabel}
              </Text>
              <View
                style={[
                  styles.wkDot,
                  selected && styles.wkDotOn,
                  day.state === "future" && !selected && styles.wkDotFut,
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.offline}>Saved on phone · Not sent yet</Text>
      ) : null}

      <View style={styles.daysum2}>
        <KcalRing
          logged={kcalRing?.logged ?? 0}
          assigned={kcalRing?.assigned ?? 0}
        />
        <View style={styles.daysumBody}>
          <Text style={styles.daysumHead}>
            {formatNumber(kcalRing?.logged ?? 0)}{" "}
            <Text style={styles.daysumOf}>
              of {formatNumber(kcalRing?.assigned ?? 0)} kcal
            </Text>
          </Text>
          <Text style={styles.daysumSub}>{mealsLoggedSummary(assignments)} today</Text>
          <View style={styles.mac3}>
            <MacroBar
              label="Protein"
              logged={proteinRing?.logged ?? 0}
              assigned={proteinRing?.assigned ?? 0}
              color={rings.protein}
            />
            <MacroBar
              label="Carbs"
              logged={carbsRing?.logged ?? 0}
              assigned={carbsRing?.assigned ?? 0}
              color={rings.carbs}
            />
            <MacroBar
              label="Fat"
              logged={fatRing?.logged ?? 0}
              assigned={fatRing?.assigned ?? 0}
              color={rings.fat}
            />
          </View>
        </View>
      </View>

      <View style={styles.sh}>
        <Text style={styles.shTitle}>Today&apos;s meals</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenOverlay({ screen: "meal_plan" })}
        >
          <Text style={styles.shLink}>Meal plan</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text style={styles.muted}>Loading meals…</Text>
      ) : assignments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No meals planned today.</Text>
        </View>
      ) : (
        <>
          {compactBefore.length > 0 ? (
            <View style={styles.listCard}>
              {compactBefore.map((meal, index) => renderCompactRow(meal, index))}
            </View>
          ) : null}
          {focusMeal ? renderExpandedMeal(focusMeal) : null}
          {compactAfter.length > 0 ? (
            <View style={[styles.listCard, styles.listCardGap]}>
              {compactAfter.map((meal, index) => renderCompactRow(meal, index))}
            </View>
          ) : null}
        </>
      )}

      {skippedUndo ? (
        <Snackbar
          message={`${skippedUndo.mealName} skipped`}
          actionLabel="Undo"
          onAction={() => {
            setSkippedUndo(null);
            setError(
              "Undo is not synced yet — log the meal again if you skipped by mistake.",
            );
          }}
          onDismiss={() => setSkippedUndo(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ttlrow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  h1: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.66,
    lineHeight: 36,
  },
  headerActions: {
    flexDirection: "row",
    gap: 4,
  },
  ibtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
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
  wk7: {
    flexDirection: "row",
    gap: 2,
    marginBottom: 14,
    marginHorizontal: -4,
  },
  wkDay: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
    gap: 3,
    paddingBottom: 8,
    paddingTop: 7,
  },
  wkDayOn: {
    backgroundColor: colors.indigo,
    ...Platform.select({
      ios: {
        shadowColor: colors.indigo,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 5,
      },
      default: { elevation: 4 },
    }),
  },
  wkDow: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "600",
  },
  wkNum: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  wkTextOn: {
    color: colors.white,
  },
  wkDot: {
    backgroundColor: colors.deepNavy,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  wkDotOn: {
    backgroundColor: colors.white,
    opacity: 0.6,
  },
  wkDotFut: {
    backgroundColor: "#D5D6DE",
  },
  daysum2: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    marginBottom: spacing.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#1A1248",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      default: { elevation: 1 },
    }),
  },
  ringCenter: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    inset: 0,
  },
  ringKcal: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  ringUnit: {
    color: colors.midGrey,
    fontSize: 11,
    fontWeight: "500",
    marginTop: -2,
  },
  daysumBody: {
    flex: 1,
  },
  daysumHead: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  daysumOf: {
    color: colors.midGrey,
    fontSize: 15,
    fontWeight: "500",
  },
  daysumSub: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 1,
  },
  mac3: {
    flexDirection: "row",
    gap: 10,
    marginTop: 9,
  },
  macCol: {
    flex: 1,
  },
  macLabel: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
  },
  macNums: {
    color: colors.midGrey,
    fontSize: 12,
    lineHeight: 16,
  },
  macLogged: {
    color: colors.darkGrey,
    fontWeight: "700",
  },
  macTrack: {
    backgroundColor: rings.track,
    borderRadius: 3,
    height: 5,
    marginTop: 4,
    overflow: "hidden",
  },
  macFill: {
    borderRadius: 3,
    height: 5,
  },
  sh: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  shTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  shLink: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  listCard: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  listCardGap: {
    marginTop: 10,
  },
  lrowFirst: {
    borderTopWidth: 0,
  },
  lrow: {
    alignItems: "center",
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  lrowLocked: {},
  tile: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  tileNeu: {
    backgroundColor: colors.background,
  },
  tilePos: {
    backgroundColor: "#ECFDF5",
  },
  lrowText: {
    flex: 1,
    minWidth: 0,
  },
  mealTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  mealTitleMuted: {
    color: colors.midGrey,
  },
  mealTime: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "500",
  },
  mealSub: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 19,
  },
  changeBtn: {
    minHeight: 44,
    justifyContent: "center",
  },
  changeBtnText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  lrowRight: {
    alignItems: "flex-end",
  },
  laterKcal: {
    color: colors.darkGrey,
    fontSize: 15,
    fontWeight: "600",
  },
  laterLabel: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
  },
  mealc: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 10,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#1A1248",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      default: { elevation: 1 },
    }),
  },
  mealcDue: {
    borderColor: "#D9D2FF",
    ...Platform.select({
      ios: {
        shadowColor: colors.indigo,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.07,
        shadowRadius: 6,
      },
      default: { elevation: 2 },
    }),
  },
  mealHd: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  tileLg: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  mealHdText: {
    flex: 1,
  },
  mealHdTitle: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
  },
  dueRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
  },
  dueText: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  savedRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 2,
  },
  savedText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "600",
  },
  mealKcalRight: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "700",
  },
  moreBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginRight: -10,
    width: 44,
  },
  itemsLine: {
    color: colors.darkGrey,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    marginTop: 8,
  },
  macLine: {
    color: colors.midGrey,
    fontSize: 14,
  },
  macBold: {
    color: colors.darkGrey,
    fontWeight: "700",
  },
  seeDetails: {
    minHeight: 44,
    justifyContent: "center",
  },
  seeDetailsText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  btn2: {
    flexDirection: "row",
    gap: 8,
  },
  eatenBtn: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 16,
    flex: 1.08,
    flexDirection: "row",
    gap: 6,
    height: 56,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  eatenBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  diffBtn: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    height: 56,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  diffBtnText: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.7,
  },
  photop: {
    backgroundColor: colors.paleLavender,
    borderColor: "#E4DEFF",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  photopHead: {
    flexDirection: "row",
    gap: 8,
  },
  photopTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  photopBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
    marginTop: 2,
  },
  photopBtns: {
    flexDirection: "row",
    gap: 8,
  },
  photopBtn: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 16,
    flex: 1,
    height: 48,
    justifyContent: "center",
  },
  photopBtnText: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
});
