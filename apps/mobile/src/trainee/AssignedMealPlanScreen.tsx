import type { EffectivePlanResponse, MealPrescription } from "@fitbud/contracts";
import {
  dayMacrosFromScaledItems,
  formatHhMmTime,
  formatKcal,
  formatNumber,
} from "@fitbud/core";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { sortMealsByTime } from "./scheduledAssignments";

type Props = {
  effectivePlan: EffectivePlanResponse | null;
  onBack: () => void;
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

export function AssignedMealPlanScreen({ effectivePlan, onBack }: Props) {
  const meals = sortMealsByTime(
    effectivePlan?.version?.content.mealPrescriptions ?? [],
  );
  const title = effectivePlan?.plan?.title ?? "Your meal plan";

  const dayTotals = useMemo(() => {
    const items = meals.flatMap((meal) =>
      meal.items.map((item) =>
        "calculated" in item && item.calculated ? item.calculated : null,
      ),
    );
    return dayMacrosFromScaledItems(items);
  }, [meals]);

  const loading = effectivePlan === null;

  return (
    <Screen title="Assigned meal plan" subtitle={title}>
      {loading ? (
        <Text style={styles.muted} accessibilityLabel="Loading meal plan">
          Loading meal plan…
        </Text>
      ) : meals.length === 0 ? (
        <Text style={styles.muted}>
          Meals from your coach&apos;s plan appear here when a plan is published.
        </Text>
      ) : (
        <View style={styles.list}>
          <Text style={styles.dayTotal} accessibilityLabel="Day totals">
            {dayTotals.unknown ? "≥ " : ""}
            {formatNumber(dayTotals.kcal)} kcal · P {dayTotals.proteinG} · C{" "}
            {dayTotals.carbsG} · F {dayTotals.fatG} g
          </Text>
          {meals.map((meal) => {
            const macros = mealMacros(meal);
            const timeLabel = meal.localTime
              ? formatHhMmTime(meal.localTime)
              : null;
            return (
              <View key={meal.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.mealName}>{meal.name}</Text>
                  {timeLabel ? (
                    <Text style={styles.meta}>{timeLabel}</Text>
                  ) : null}
                </View>
                {meal.items.length > 0 ? (
                  <Text style={styles.items}>
                    {meal.items.map(itemLabel).join(" · ")}
                  </Text>
                ) : null}
                <Text style={styles.macros}>
                  {macros.unknown ? "≥ " : ""}
                  {formatKcal(macros.kcal, false)} · P {macros.proteinG} · C{" "}
                  {macros.carbsG} · F {macros.fatG} g
                </Text>
                {meal.instructions ? (
                  <Text style={styles.body}>{meal.instructions}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask coach about this plan"
        style={styles.ask}
      >
        <Text style={styles.askLabel}>Ask your coach about this plan</Text>
      </Pressable>
      <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    gap: spacing.md,
  },
  dayTotal: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  cardHead: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  mealName: {
    color: colors.deepNavy,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
  },
  meta: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
  },
  body: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  items: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  macros: {
    color: colors.deepNavy,
    fontSize: 13,
    fontWeight: "600",
  },
  ask: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: spacing.lg,
  },
  askLabel: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
});
