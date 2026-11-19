import { View } from "react-native";
import type { WeekDayState } from "@fitbud/contracts";
import { formatCivilDate, labelFor } from "@fitbud/core";
import { spacing } from "@fitbud/ui-mobile";
import type { ColorToken } from "@fitbud/tokens";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

const DOT: Record<WeekDayState, ColorToken> = {
  done: "done",
  partial: "warn",
  due: "ink2",
  missed: "crit",
  rest: "fill2",
  future: "ink4",
};

/**
 * "This week" on Today: one dot per day, then the counts. The same read model
 * as before (`GET /me/week`), drawn on the v3 tokens so it follows the system
 * theme. State is never colour alone: each dot is labelled with its day and
 * state.
 */
export function WeekCard({
  workoutCompleted,
  workoutAssigned,
  mealsLogged,
  mealsAssigned,
  days,
  encouragement,
}: {
  workoutCompleted: number;
  workoutAssigned: number;
  mealsLogged: number;
  mealsAssigned: number;
  days: Array<{ date: string; state: WeekDayState }>;
  encouragement?: string | null;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.dots}>
        {days.map((day) => (
          <View
            key={day.date}
            style={[
              styles.dot,
              { backgroundColor: theme.colors[DOT[day.state] ?? "fill2"] },
            ]}
            accessibilityLabel={`${formatCivilDate(day.date)}, ${labelFor("week_day_state", day.state)}`}
          />
        ))}
      </View>
      <Text variant="body" tone="ink2">
        {workoutCompleted} of {workoutAssigned} workouts · {mealsLogged} of{" "}
        {mealsAssigned} meals
      </Text>
      {encouragement ? (
        <Text variant="body" tone="ink3">
          {encouragement}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  dots: { flexDirection: "row", gap: spacing.sm },
  dot: { borderRadius: 6, flex: 1, height: 8 },
}));
