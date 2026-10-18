import type { EffectivePlanResponse } from "@fitbud/contracts";
import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

type Props = {
  effectivePlan: EffectivePlanResponse | null;
  onBack: () => void;
};

export function AssignedMealPlanScreen({ effectivePlan, onBack }: Props) {
  const meals = effectivePlan?.version?.content.mealPrescriptions ?? [];
  const title = effectivePlan?.plan?.title ?? "Your meal plan";

  return (
    <Screen title="Assigned meal plan" subtitle={title}>
      {meals.length === 0 ? (
        <Text style={styles.muted}>
          Meals from your coach's plan appear here when a plan is published.
        </Text>
      ) : (
        <View style={styles.list}>
          {meals.map((meal) => (
            <View key={meal.id} style={styles.card}>
              <Text style={styles.mealName}>{meal.name}</Text>
              {meal.localTime ? (
                <Text style={styles.meta}>Around {meal.localTime}</Text>
              ) : null}
              {meal.instructions ? (
                <Text style={styles.body}>{meal.instructions}</Text>
              ) : null}
              {meal.items.length > 0 ? (
                <Text style={styles.items}>
                  {meal.items
                    .map((item) => ("name" in item ? item.name : "Item"))
                    .join(" · ")}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
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
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  mealName: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  meta: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "500",
  },
  body: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  items: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
  },
});
