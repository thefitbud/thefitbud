import type { EffectivePlanResponse, MealPrescription } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import {
  dayMacrosFromScaledItems,
  formatCivilDate,
  formatHhMmTime,
  formatKcal,
  formatNumber,
} from "@fitbud/core";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { EffectivePlanState } from "./TodayTab";
import {
  ChevronLeft,
  CloudOff,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { Card2, NoteCallout } from "../components/m2";
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

function mealMacros(meal: MealPrescription) {
  const calculated = meal.items.map((item) =>
    "calculated" in item && item.calculated ? item.calculated : null,
  );
  return dayMacrosFromScaledItems(calculated);
}

function itemLabel(item: MealPrescription["items"][number]): string {
  if ("label" in item && typeof item.label === "string" && item.label) {
    return item.label;
  }
  if ("name" in item && typeof item.name === "string" && item.name) {
    return item.name;
  }
  return "Item";
}

export function itemPortion(item: MealPrescription["items"][number]): string | null {
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

export function AssignedMealPlanScreen({
  planState,
  onRetryPlan,
  coachName = "Your coach",
  onBack,
  onAskCoach,
}: Props) {
  // Z14-14: the overlay owns the whole screen, so the old tab-bar inset (a
  // blank band at the bottom) no longer applies; `insetTabBar` is ignored.
  const [scrolled, setScrolled] = useState(false);
  const effectivePlan: EffectivePlanResponse | null =
    planState.status === "loaded" ? planState.plan : null;
  const meals = sortMealsByTime(
    effectivePlan?.version?.content.mealPrescriptions ?? [],
  );
  const planTitle = effectivePlan?.plan?.title ?? "Your meal plan";
  const coachFirst = coachName.split(/\s+/)[0] ?? coachName;
  const publishedAt = effectivePlan?.version?.publishedAt ?? effectivePlan?.version?.effectiveFrom;

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
  const headerTitle = scrolled && effectivePlan ? `${planTitle} · From ${coachFirst}` : "Meal plan";

  return (
    <View style={styles.root}>
      <View style={styles.header} testID="assigned-plan-header">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Diet"
          onPress={onBack}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color={colors.indigo} strokeWidth={2} />
          <Text style={styles.backLabel}>Diet</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
          {headerTitle}
        </Text>
        <View style={styles.headerRight}>
          {onAskCoach ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ask ${coachFirst} about this plan`}
              onPress={onAskCoach}
              style={styles.askPill}
            >
              <MessageCircle size={18} color={colors.deepNavy} strokeWidth={2} />
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
              <CloudOff size={30} color={colors.deepNavy} strokeWidth={1.75} />
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
                <RefreshCw size={18} color={colors.deepNavy} strokeWidth={2} />
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : meals.length === 0 ? (
          <>
            <View style={styles.lt2}>
              <Text style={styles.eb}>
                {planTitle} · from {coachFirst}
              </Text>
            </View>
            <Text style={styles.muted}>
              Meals from your coach&apos;s plan appear here when a plan is published.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.lt2}>
              <Text style={styles.eb}>
                {planTitle} · from {coachFirst}
              </Text>
              <Text style={styles.h1}>Meal plan</Text>
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
              <NoteCallout icon={<Sparkles size={18} color={colors.indigo} />}>
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
              return (
                <Card2 key={meal.id} style={styles.slot}>
                  <View style={styles.slotHead}>
                    <Text style={styles.slotTitle}>{meal.name}</Text>
                    {timeLabel ? (
                      <Text style={styles.slotTime}>{timeLabel}</Text>
                    ) : null}
                  </View>
                  {meal.items.map((item, index) => (
                    <View
                      key={`${meal.id}-${index}`}
                      style={[
                        styles.foodRow,
                        index === 0 && styles.foodRowFirst,
                      ]}
                    >
                      <Text style={styles.foodName}>{itemLabel(item)}</Text>
                      {itemPortion(item) ? (
                        <Text style={styles.foodPortion}>
                          {itemPortion(item)}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                  {meal.instructions ? (
                    <View style={styles.coachNote}>
                      <MessageCircle
                        size={14}
                        color={colors.indigo}
                        strokeWidth={1.75}
                      />
                      <Text style={styles.coachNoteText}>
                        {coachFirst}: {meal.instructions}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.slotFoot}>
                    <Text style={styles.slotMacros}>
                      P {macros.proteinG} · C {macros.carbsG} · F {macros.fatG} g
                    </Text>
                    <Text style={styles.slotKcal}>
                      {macros.unknown ? "≥ " : ""}
                      {formatKcal(macros.kcal, false)}
                    </Text>
                  </View>
                </Card2>
              );
            })}
            <View style={styles.dayTotal}>
              <Text style={styles.slotMacros}>Day total</Text>
              <Text style={styles.slotKcal}>
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

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#F3F4F8",
    flex: 1,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderBottomColor: "#E7E9F2",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  backBtn: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 44,
    minWidth: 76,
  },
  backLabel: {
    color: colors.indigo,
    fontSize: 17,
    fontWeight: "600",
  },
  headerTitle: {
    color: colors.deepNavy,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  headerRight: {
    alignItems: "flex-end",
    minWidth: 76,
  },
  askPill: {
    alignItems: "center",
    backgroundColor: "#EAE8F3",
    borderRadius: 22,
    flexDirection: "row",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  askPillText: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg * 2,
  },
  bone: {
    backgroundColor: "#E3E5EC",
    borderRadius: 14,
  },
  errorWrap: {
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: 64,
  },
  errorTile: {
    alignItems: "center",
    backgroundColor: "#EAE8F3",
    borderRadius: 20,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  errorTitle: {
    color: colors.deepNavy,
    fontSize: 21,
    fontWeight: "700",
    marginTop: 20,
    textAlign: "center",
  },
  errorBody: {
    color: colors.midGrey,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  stat: {
    alignItems: "center",
    flex: 1,
  },
  statMid: {
    borderColor: "#E7E9F2",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  statMain: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: 2,
  },
  dayTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingHorizontal: 4,
  },
  lt2: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  eb: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  h1: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 36,
    marginTop: 2,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.lg,
  },
  retry: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#EAE8F3",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 52,
  },
  retryLabel: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  summary: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: spacing.md,
    paddingVertical: 12,
  },
  changeBold: {
    color: colors.deepNavy,
    fontWeight: "700",
  },
  slot: {
    marginTop: spacing.md,
  },
  slotHead: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  slotTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  slotTime: {
    color: colors.nearBlack,
    fontSize: 14,
    fontWeight: "600",
  },
  foodRow: {
    borderTopColor: "#E7E9F2",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
  },
  foodRowFirst: {
    borderTopWidth: 0,
    marginTop: spacing.sm,
  },
  foodName: {
    color: colors.nearBlack,
    flex: 1,
    fontSize: 15,
  },
  foodPortion: {
    color: colors.midGrey,
    fontSize: 14,
  },
  coachNote: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  coachNoteText: {
    color: colors.indigo,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  slotFoot: {
    borderTopColor: "#E7E9F2",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  slotMacros: {
    color: colors.midGrey,
    fontSize: 14,
  },
  slotKcal: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "700",
  },
});
