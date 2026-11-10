import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { formatCivilDate, labelFor } from "@fitbud/core";
import { FitText as Text } from "./FitText.js";
import { colors, radii, spacing, touchTargetMin } from "./theme.js";
import { typeScale } from "./typography.js";

export type DateNavigatorDay = {
  localDate: string;
  weekdayLabel: string;
  dayLabel: string;
  state: "done" | "partial" | "due" | "open" | "rest" | "future" | "unknown";
};

type Props = {
  days: DateNavigatorDay[];
  selectedDate: string;
  todayDate: string;
  onSelect: (localDate: string) => void;
  onToday: () => void;
};

function dotColor(state: DateNavigatorDay["state"]): string {
  switch (state) {
    case "done":
      return colors.success;
    case "partial":
      return colors.warning;
    case "due":
      // Planned today, nothing logged yet: neutral and open, never the
      // partial colour (D-W6-10).
      return colors.darkGrey;
    case "open":
      return colors.indigo;
    case "rest":
      return colors.lightGrey;
    case "future":
      return colors.midGrey;
    case "unknown":
      // Same no-information colour the strip used when unknown was stored as
      // rest. The spoken label is what tells the states apart.
      return colors.lightGrey;
  }
}

/**
 * Spoken day state from `labelFor("week_day_state")` (D-W7-13).
 * `done`, `partial`, `due`, `rest` and `future` are that namespace.
 * `open` and `unknown` are strip-local, so `labelFor` sentence-cases them.
 */
function stateLabel(state: DateNavigatorDay["state"]): string {
  return labelFor("week_day_state", state);
}

export function DateNavigator({
  days,
  selectedDate,
  todayDate,
  onSelect,
  onToday,
}: Props) {
  const showTodayPill = selectedDate !== todayDate;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {showTodayPill ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            onPress={onToday}
            style={styles.todayPill}
          >
            <Text style={styles.todayPillText}>Today</Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>
      <View style={styles.stripCard}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          <View style={styles.stripRow}>
            {days.map((day) => {
              const selected = day.localDate === selectedDate;
              return (
                <Pressable
                  key={day.localDate}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${formatCivilDate(day.localDate)}, ${stateLabel(day.state)}`}
                  onPress={() => onSelect(day.localDate)}
                  style={[styles.day, selected ? styles.daySelected : null]}
                >
                  <Text
                    style={[
                      styles.weekday,
                      selected ? styles.textSelected : null,
                    ]}
                  >
                    {String(day.weekdayLabel)}
                  </Text>
                  <Text
                    style={[
                      styles.dayNum,
                      selected ? styles.textSelected : null,
                    ]}
                  >
                    {String(day.dayLabel)}
                  </Text>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: dotColor(day.state) },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  stripRow: {
    flexDirection: "row",
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    minHeight: touchTargetMin / 2,
  },
  todayPill: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  todayPillText: {
    color: colors.indigo,
    fontSize: typeScale.caption,
    fontWeight: "600",
  },
  stripCard: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  strip: {
    paddingVertical: spacing.xs,
  },
  day: {
    alignItems: "center",
    borderRadius: radii.control,
    marginRight: spacing.sm,
    minHeight: touchTargetMin,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  daySelected: {
    backgroundColor: colors.white,
  },
  weekday: {
    color: colors.midGrey,
    fontSize: 11,
    fontWeight: "500",
  },
  dayNum: {
    color: colors.deepNavy,
    fontSize: typeScale.body,
    fontWeight: "700",
  },
  textSelected: {
    color: colors.indigo,
  },
  dot: {
    borderRadius: 4,
    height: 6,
    marginTop: 2,
    width: 6,
  },
});
