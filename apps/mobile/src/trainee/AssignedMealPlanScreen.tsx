import type { EffectivePlanResponse, MealPrescription } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import {
  dayMacrosFromScaledItems,
  formatCivilDate,
  formatHhMmTime,
  formatKcal,
  formatNumber,
} from "@fitbud/core";
import { spacing } from "@fitbud/ui-mobile";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { EffectivePlanState } from "./TodayTab";
import {
  ChevronLeft,
  CloudOff,
  Coffee,
  Cookie,
  MessageCircle,
  Moon,
  RefreshCw,
  Soup,
  Sparkles,
  Sunrise,
  UtensilsCrossed,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { Card2, NoteCallout, initialsFromName } from "../components/m2";
import { ThemeScope, createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { sortMealsByTime } from "./scheduledAssignments";

type Props = {
  /**
   * The shell's four-state plan (CU24). `null` used to mean loading, which
   * is also what `planFromState` returns for `none` and `unavailable`, so
   * this screen spun forever after a failed load (BT15, D-W4-16).
   */
  planState: EffectivePlanState;
  /** Same handler as Today's pull-to-refresh. Required for the retry to be real. */
  onRetryPlan?: () => void;
  coachName?: string;
  onBack: () => void;
  onAskCoach?: () => void;
  /** Ignored: the overlay owns the whole screen (Z14-14). */
  insetTabBar?: boolean;
};

type Item = MealPrescription["items"][number];

function mealMacros(meal: MealPrescription) {
  const calculated = meal.items.map((item) =>
    "calculated" in item && item.calculated ? item.calculated : null,
  );
  return dayMacrosFromScaledItems(calculated);
}

/** Kcal of one food row from its own calculated nutrients; null when it has none. */
function itemKcal(item: Item): { kcal: number; unknown: boolean } | null {
  if (!("calculated" in item) || !item.calculated) return null;
  const totals = dayMacrosFromScaledItems([item.calculated]);
  return { kcal: totals.kcal, unknown: totals.unknown };
}

/** The tile icon for a meal, from its scheduled time. */
function mealIcon(localTime: string | null | undefined) {
  const hour = localTime ? Number(localTime.slice(0, 2)) : Number.NaN;
  if (Number.isNaN(hour)) return UtensilsCrossed;
  if (hour < 7) return Sunrise;
  if (hour < 11) return Coffee;
  if (hour < 15) return Soup;
  if (hour < 19) return Cookie;
  return Moon;
}

function itemLabel(item: Item): string {
  if ("label" in item && typeof item.label === "string" && item.label) {
    return item.label;
  }
  if ("name" in item && typeof item.name === "string" && item.name) {
    return item.name;
  }
  return "Item";
}

export function itemPortion(item: Item): string | null {
  if ("portionLabel" in item && typeof item.portionLabel === "string") {
    return item.portionLabel;
  }
  if ("serving" in item && item.serving?.label) {
    const qty =
      "snapshotKind" in item && item.snapshotKind === "calculated"
        ? item.quantityScaled / NUTRIENT_SCALE
        : 1;
    const q =
      Math.abs(qty - 0.5) < 0.01
        ? "½"
        : Math.abs(qty - Math.round(qty)) < 0.01
          ? String(Math.round(qty))
          : qty.toFixed(2).replace(/\.?0+$/, "");
    return qty === 1 ? item.serving.label : `${q} × ${item.serving.label}`;
  }
  if ("servingLabel" in item && typeof item.servingLabel === "string") {
    return item.servingLabel;
  }
  return null;
}

export function AssignedMealPlanScreen(props: Props) {
  // Dark follows the system (D-W12-12); the overlay is not a `<Screen v3>`.
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <AssignedMealPlanBody {...props} />
    </ThemeScope>
  );
}

function AssignedMealPlanBody({
  planState,
  onRetryPlan,
  coachName = "Your coach",
  onBack,
  onAskCoach,
}: Props) {
  // Z14-14: the overlay owns the whole screen, so the old tab-bar inset (a
  // blank band at the bottom) no longer applies; `insetTabBar` is ignored.
  const theme = useTheme();
  const styles = useStyles();
  const [scrolled, setScrolled] = useState(false);
  const effectivePlan: EffectivePlanResponse | null =
    planState.status === "loaded" ? planState.plan : null;
  const meals = sortMealsByTime(
    effectivePlan?.version?.content.mealPrescriptions ?? [],
  );
  const planTitle = effectivePlan?.plan?.title ?? "Your meal plan";
  const coachFirst = coachName.split(/\s+/)[0] ?? coachName;
  const publishedAt = effectivePlan?.version?.publishedAt ?? effectivePlan?.version?.effectiveFrom;
  const sinceAt = effectivePlan?.version?.effectiveFrom ?? effectivePlan?.version?.publishedAt;
  const untilAt = effectivePlan?.version?.effectiveTo ?? null;
  // "Week 3 of 12" has no backend source (a plan has no length), so it is left out.
  const sinceLine = sinceAt
    ? `Since ${formatCivilDate(sinceAt.slice(0, 10))} · ${
        untilAt ? `until ${formatCivilDate(untilAt.slice(0, 10))}` : "no end date"
      }`
    : null;

  const dayTotals = useMemo(() => {
    const items = meals.flatMap((meal) =>
      meal.items.map((item) =>
        "calculated" in item && item.calculated ? item.calculated : null,
      ),
    );
    return dayMacrosFromScaledItems(items);
  }, [meals]);

  const loading = planState.status === "loading";
  const unavailable = planState.status === "unavailable";
  const changeNote = publishedAt
    ? `From ${formatCivilDate(publishedAt.slice(0, 10))}: your coach updated this plan.`
    : null;
  const showPlanTitle = scrolled && effectivePlan !== null;

  return (
    <View style={styles.root}>
      <View style={styles.header} testID="assigned-plan-header">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Diet"
          onPress={onBack}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color={theme.colors.brand} strokeWidth={2} />
          <Text style={styles.backLabel}>Diet</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
            {showPlanTitle ? planTitle : "Meal plan"}
          </Text>
          {showPlanTitle ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              From {coachFirst}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {onAskCoach ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ask ${coachFirst} about this plan`}
              onPress={onAskCoach}
              style={styles.askPill}
            >
              <MessageCircle size={18} color={theme.colors.ink} strokeWidth={2} />
              <Text style={styles.askPillText}>Ask {coachFirst}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={32}
        onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 70)}
      >
        {loading ? (
          <View
            accessible
            accessibilityLabel="Loading meal plan"
            accessibilityState={{ busy: true }}
            testID="assigned-plan-skeleton"
          >
            <View style={[styles.bone, { height: 14, width: 150 }]} />
            <View style={[styles.bone, { height: 32, marginTop: 10, width: 230 }]} />
            <View style={[styles.bone, { height: 76, marginTop: 20 }]} />
            <View style={[styles.bone, { height: 150, marginTop: 14 }]} />
            <View style={[styles.bone, { height: 190, marginTop: 14 }]} />
          </View>
        ) : unavailable ? (
          <View style={styles.errorWrap}>
            <View style={styles.errorTile}>
              <CloudOff size={30} color={theme.colors.ink} strokeWidth={1.75} />
            </View>
            <Text style={styles.errorTitle}>Couldn&apos;t load your meal plan</Text>
            <Text style={styles.errorBody}>
              Something went wrong on our side. Your Diet tab still works.
            </Text>
            {onRetryPlan ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                onPress={() => {
                  onRetryPlan();
                }}
                style={styles.retry}
              >
                <RefreshCw size={18} color={theme.colors.ink} strokeWidth={2} />
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : meals.length === 0 ? (
          <>
            <View style={styles.lt2}>
              <Text style={styles.eb}>FROM {coachFirst.toUpperCase()}</Text>
              <Text style={styles.h1}>{planTitle}</Text>
            </View>
            <Text style={styles.muted}>
              Meals from your coach&apos;s plan appear here when a plan is published.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.lt2}>
              <Text style={styles.eb}>FROM {coachFirst.toUpperCase()}</Text>
              <Text style={styles.h1}>{planTitle}</Text>
              {sinceLine ? <Text style={styles.since}>{sinceLine}</Text> : null}
            </View>

            <Card2 style={styles.summary}>
              <View style={styles.stat}>
                <Text style={styles.statMain}>
                  {dayTotals.unknown ? "≥ " : ""}
                  {formatNumber(dayTotals.kcal)}
                </Text>
                <Text style={styles.statLabel}>kcal a day</Text>
              </View>
              <View style={[styles.stat, styles.statMid]}>
                <Text style={styles.statMain}>{dayTotals.proteinG} g</Text>
                <Text style={styles.statLabel}>protein</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statMain}>{meals.length}</Text>
                <Text style={styles.statLabel}>meals</Text>
              </View>
            </Card2>

            {changeNote ? (
              <NoteCallout icon={<Sparkles size={18} color={theme.colors.brand} />}>
                <Text>
                  <Text style={styles.changeBold}>What changed</Text> · {changeNote}
                </Text>
              </NoteCallout>
            ) : null}

            {meals.map((meal) => {
              const macros = mealMacros(meal);
              const timeLabel = meal.localTime
                ? formatHhMmTime(meal.localTime)
                : null;
              const Icon = mealIcon(meal.localTime);
              const macroLine = `P ${macros.proteinG} · C ${macros.carbsG} · F ${macros.fatG} g`;
              return (
                <Card2 key={meal.id} style={styles.slot}>
                  <View style={styles.slotHead}>
                    <View style={styles.mealTile}>
                      <Icon size={22} color={theme.colors.ink2} strokeWidth={1.75} />
                    </View>
                    <View style={styles.slotTx}>
                      <Text style={styles.slotTitle}>{meal.name}</Text>
                      <Text style={styles.slotSub}>
                        {timeLabel ? `${timeLabel} · ` : ""}
                        {macroLine}
                      </Text>
                    </View>
                    <Text style={styles.slotKcal}>
                      {macros.unknown ? "≥ " : ""}
                      {formatNumber(Math.round(macros.kcal))}
                      <Text style={styles.kcalUnit}> kcal</Text>
                    </Text>
                  </View>
                  {meal.items.map((item, index) => {
                    const kcal = itemKcal(item);
                    const portion = itemPortion(item);
                    return (
                      <View key={`${meal.id}-${index}`} style={styles.foodRow}>
                        <View style={styles.foodTx}>
                          <Text style={styles.foodName}>{itemLabel(item)}</Text>
                          {portion ? <Text style={styles.foodPortion}>{portion}</Text> : null}
                        </View>
                        {kcal ? (
                          <Text style={styles.foodKcal}>
                            {kcal.unknown ? "≥ " : ""}
                            {formatNumber(Math.round(kcal.kcal))}
                            <Text style={styles.kcalUnit}> kcal</Text>
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                  {meal.instructions ? (
                    <View style={styles.coachNote}>
                      <View style={styles.coachAvatar}>
                        <Text style={styles.coachAvatarText}>{initialsFromName(coachName)}</Text>
                      </View>
                      <Text style={styles.coachNoteText}>{meal.instructions}</Text>
                    </View>
                  ) : null}
                </Card2>
              );
            })}
            <View style={styles.dayTotal}>
              <Text style={styles.slotSub}>Day total</Text>
              <Text style={styles.dayTotalKcal}>
                {dayTotals.unknown ? "≥ " : ""}
                {formatKcal(dayTotals.kcal, false)}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  root: { backgroundColor: t.colors.bg, flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderBottomColor: t.colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  backBtn: { alignItems: "center", flexDirection: "row", minHeight: 44, minWidth: 76 },
  backLabel: { color: t.colors.brand, fontSize: 17, fontWeight: "600" },
  headerCenter: { alignItems: "center", flex: 1 },
  headerTitle: { color: t.colors.ink, fontSize: 17, fontWeight: "700", textAlign: "center" },
  headerSub: { color: t.colors.ink2, fontSize: 13, marginTop: 1 },
  headerRight: { alignItems: "flex-end", minWidth: 76 },
  askPill: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 22,
    flexDirection: "row",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  askPillText: { color: t.colors.ink, fontSize: 15, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.lg * 2 },
  bone: { backgroundColor: t.colors.skel1, borderRadius: 14 },
  errorWrap: { alignItems: "center", paddingHorizontal: spacing.md, paddingTop: 64 },
  errorTile: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 20,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  errorTitle: {
    color: t.colors.ink,
    fontSize: 21,
    fontWeight: "700",
    marginTop: 20,
    textAlign: "center",
  },
  errorBody: {
    color: t.colors.ink2,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  stat: { alignItems: "center", flex: 1 },
  statMid: {
    borderColor: t.colors.line,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  statMain: { color: t.colors.ink, fontSize: 20, fontWeight: "700" },
  statLabel: { color: t.colors.ink2, fontSize: 14, marginTop: 2 },
  dayTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingHorizontal: 4,
  },
  dayTotalKcal: { color: t.colors.ink, fontSize: 14, fontWeight: "700" },
  lt2: { marginBottom: spacing.md, marginTop: spacing.sm },
  eb: { color: t.colors.ink, fontSize: 14, fontWeight: "600", letterSpacing: 0.3 },
  h1: {
    color: t.colors.ink,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 38,
    marginTop: 2,
  },
  since: { color: t.colors.ink2, fontSize: 16, marginTop: 4 },
  muted: { color: t.colors.ink2, fontSize: 15, lineHeight: 22, marginTop: spacing.lg },
  retry: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: t.colors.fill,
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 52,
  },
  retryLabel: { color: t.colors.ink, fontSize: 17, fontWeight: "700" },
  summary: { alignItems: "center", flexDirection: "row", marginTop: spacing.md, paddingVertical: 12 },
  changeBold: { color: t.colors.ink, fontWeight: "700" },
  slot: { marginTop: spacing.md },
  slotHead: {
    alignItems: "center",
    borderBottomColor: t.colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingBottom: spacing.sm,
  },
  mealTile: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  slotTx: { flex: 1 },
  slotTitle: { color: t.colors.ink, fontSize: 18, fontWeight: "700" },
  slotSub: { color: t.colors.ink2, fontSize: 14, marginTop: 1 },
  slotKcal: { color: t.colors.ink, fontSize: 20, fontWeight: "700" },
  kcalUnit: { color: t.colors.ink2, fontSize: 14, fontWeight: "400" },
  foodRow: {
    alignItems: "center",
    borderTopColor: t.colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  foodTx: { flex: 1 },
  foodName: { color: t.colors.ink, fontSize: 17 },
  foodPortion: { color: t.colors.ink2, fontSize: 15, marginTop: 1 },
  foodKcal: { color: t.colors.ink, fontSize: 17, fontWeight: "700" },
  coachNote: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 6 },
  coachAvatar: {
    alignItems: "center",
    backgroundColor: t.colors.coach,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  coachAvatarText: { color: t.colors.onBrand, fontSize: 11, fontWeight: "700" },
  coachNoteText: { color: t.colors.ink, flex: 1, fontSize: 15, lineHeight: 21 },
}));
