import { StyleSheet, View } from "react-native";
import type { WeekDayState } from "@fitbud/contracts";
import { FitText as Text } from "./FitText.js";
import { colors, spacing } from "./theme.js";
import { fontFamilyMedium, typeScale } from "./typography.js";

type Props = {
  workoutCompleted: number;
  workoutAssigned: number;
  mealsLogged: number;
  mealsAssigned: number;
  days: Array<{ date: string; state: WeekDayState }>;
  encouragement?: string | null;
};

function dayDot(state: WeekDayState): string {
  switch (state) {
    case "done":
      return colors.success;
    case "partial":
      return colors.warning;
    case "missed":
      return colors.error;
    case "rest":
      return colors.lightGrey;
    case "future":
      return colors.midGrey;
    default:
      return colors.lightGrey;
  }
}

export function WeeklyConsistency({
  workoutCompleted,
  workoutAssigned,
  mealsLogged,
  mealsAssigned,
  days,
  encouragement,
}: Props) {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>This week</Text>
      <View style={styles.dots}>
        {days.map((day) => (
          <View
            key={day.date}
            style={[styles.dot, { backgroundColor: dayDot(day.state) }]}
            accessibilityLabel={`${day.date} ${day.state}`}
          />
        ))}
      </View>
      <Text style={styles.counts}>
        {workoutCompleted} of {workoutAssigned} workouts · {mealsLogged} of{" "}
        {mealsAssigned} meals
      </Text>
      {encouragement ? (
        <Text style={styles.encouragement}>{encouragement}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  title: {
    color: colors.deepNavy,
    fontFamily: fontFamilyMedium,
    fontSize: typeScale.title,
    fontWeight: "700",
  },
  dots: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  dot: {
    borderRadius: 6,
    flex: 1,
    height: 8,
  },
  counts: {
    color: colors.darkGrey,
    fontSize: typeScale.body,
    lineHeight: 22,
  },
  encouragement: {
    color: colors.midGrey,
    fontSize: typeScale.body,
    lineHeight: 22,
  },
});
