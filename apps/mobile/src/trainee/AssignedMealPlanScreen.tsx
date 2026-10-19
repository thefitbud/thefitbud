import type { EffectivePlanResponse, MealPrescription } from "@fitbud/contracts";
import {
  dayMacrosFromScaledItems,
  formatCivilDate,
  formatHhMmTime,
  formatKcal,
  formatNumber,
} from "@fitbud/core";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MessageCircle, Sparkles } from "lucide-react-native";
import { Text } from "../components/Text";
import { Button } from "../components/Button";
import {
  Card2,
  M2ScrollBody,
  M2TopNav,
  NoteCallout,
} from "../components/m2";
import { WhatsAppGlyph } from "../components/m2/WhatsAppGlyph";
import { SegmentedControl } from "../components/SegmentedControl";
import { sortMealsByTime } from "./scheduledAssignments";

type DayKind = "training" | "rest";

type Props = {
  effectivePlan: EffectivePlanResponse | null;
  coachName?: string;
  onBack: () => void;
  onAskCoach?: () => void;
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

function itemPortion(item: MealPrescription["items"][number]): string | null {
  if ("portionLabel" in item && typeof item.portionLabel === "string") {
    return item.portionLabel;
  }
  if ("servingLabel" in item && typeof item.servingLabel === "string") {
    return item.servingLabel;
  }
  return null;
}

export function AssignedMealPlanScreen({
  effectivePlan,
  coachName = "Your coach",
  onBack,
  onAskCoach,
  insetTabBar = false,
}: Props) {
  const [dayKind, setDayKind] = useState<DayKind>("training");
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
    const base = dayMacrosFromScaledItems(items);
    if (dayKind === "rest" && base.kcal > 0) {
      return {
        ...base,
        kcal: Math.round(base.kcal * 0.92),
        proteinG: Math.round(base.proteinG * 0.95),
        carbsG: Math.round(base.carbsG * 0.95),
        fatG: Math.round(base.fatG * 0.95),
      };
    }
    return base;
  }, [dayKind, meals]);

  const loading = effectivePlan === null;
  const changeNote = publishedAt
    ? `From ${formatCivilDate(publishedAt.slice(0, 10))}: your coach updated this plan.`
    : null;

  const footer = onAskCoach ? (
    <Pressable accessibilityRole="button" onPress={onAskCoach} style={styles.askLink}>
      <WhatsAppGlyph />
      <Text style={styles.askLinkText}>Ask {coachFirst} about this plan</Text>
    </Pressable>
  ) : null;

  return (
    <View style={styles.root}>
      <M2ScrollBody footer={footer} insetTabBar={insetTabBar}>
        <M2TopNav backLabel="Diet" onBack={onBack} />
        <View style={styles.lt2}>
          <Text style={styles.eb}>
            {planTitle} · from {coachFirst}
          </Text>
          <Text style={styles.h1}>Meal plan</Text>
        </View>

        <SegmentedControl<DayKind>
          value={dayKind}
          onChange={setDayKind}
          options={[
            { id: "training", label: "Training day" },
            { id: "rest", label: "Rest day" },
          ]}
        />

        {loading ? (
          <Text style={styles.muted}>Loading meal plan…</Text>
        ) : meals.length === 0 ? (
          <Text style={styles.muted}>
            Meals from your coach&apos;s plan appear here when a plan is published.
          </Text>
        ) : (
          <>
            <Card2 style={styles.summary}>
              <View>
                <Text style={styles.kcalMain}>
                  {dayTotals.unknown ? "≥ " : ""}
                  {formatNumber(dayTotals.kcal)} kcal
                </Text>
                <Text style={styles.macLine}>
                  P <Text style={styles.macBold}>{dayTotals.proteinG}</Text>
                  {"  "}
                  C <Text style={styles.macBold}>{dayTotals.carbsG}</Text>
                  {"  "}
                  F <Text style={styles.macBold}>{dayTotals.fatG}</Text> g
                </Text>
              </View>
              <Text style={styles.mealCount}>{meals.length} meals</Text>
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
          </>
        )}

        <Button label="Back" variant="tertiary" onPress={onBack} />
      </M2ScrollBody>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.white,
    flex: 1,
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
  summary: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingVertical: 12,
  },
  kcalMain: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "700",
  },
  macLine: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: 2,
  },
  macBold: {
    color: colors.nearBlack,
    fontWeight: "700",
  },
  mealCount: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
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
  askLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 44,
  },
  askLinkText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
});
