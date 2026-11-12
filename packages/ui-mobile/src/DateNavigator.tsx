import { Pressable, StyleSheet, View } from "react-native";
import { addDaysToLocalDate, formatCivilDate, labelFor } from "@fitbud/core";
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
  /** Hosts with their own way back to today (a past-day banner) pass false. */
  showTodayPill?: boolean;
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
 * Spoken day state from `labelFor("week_day_state")` (D-W7-13). The strip's
 * `open` is the server's `missed`. `unknown` is not a server state, so it has
 * no shared label: it is the fixed phrase the web strip also speaks.
 */
function stateLabel(state: DateNavigatorDay["state"]): string {
  switch (state) {
    case "open":
      return labelFor("week_day_state", "missed");
    case "unknown":
      return "State not known";
    default:
      return labelFor("week_day_state", state);
  }
}

export function DateNavigator({
  days,
  selectedDate,
  todayDate,
  onSelect,
  onToday,
  showTodayPill: allowTodayPill = true,
}: Props) {
  const showTodayPill = allowTodayPill && selectedDate !== todayDate;

  return (
    <View style={styles.wrap}>
      {showTodayPill ? (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            onPress={onToday}
            style={styles.todayPill}
          >
            <Text style={styles.todayPillText}>Today</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.stripRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          hitSlop={{ top: 0, bottom: 0, left: 2, right: 2 }}
          onPress={() => onSelect(addDaysToLocalDate(selectedDate, -7))}
          style={styles.chevron}
        >
          <Text style={styles.chevronGlyph} accessibilityElementsHidden importantForAccessibility="no">{"\u2039"}</Text>
        </Pressable>
        {days.map((day) => {
          const selected = day.localDate === selectedDate;
          const isToday = day.localDate === todayDate;
          return (
            <Pressable
              key={day.localDate}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${formatCivilDate(day.localDate)}, ${stateLabel(day.state)}`}
              onPress={() => onSelect(day.localDate)}
              style={[
                styles.day,
                isToday && !selected ? styles.dayToday : null,
                selected ? styles.daySelected : null,
              ]}
            >
              <Text
                style={[styles.weekday, selected ? styles.textSelected : null]}
              >
                {isToday && selected ? "Today" : String(day.weekdayLabel)}
              </Text>
              <Text
                style={[styles.dayNum, selected ? styles.textSelected : null]}
              >
                {String(day.dayLabel)}
              </Text>
              <View
                style={[
                  styles.dot,
                  selected ? styles.dotOnSelected : null,
                  { backgroundColor: dotColor(day.state) },
                ]}
              />
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          hitSlop={{ top: 0, bottom: 0, left: 2, right: 2 }}
          onPress={() => onSelect(addDaysToLocalDate(selectedDate, 7))}
          style={styles.chevron}
        >
          <Text style={styles.chevronGlyph} accessibilityElementsHidden importantForAccessibility="no">{"\u203A"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  // Full bleed: the host's 24 pt gutters would leave day cells under 44 pt
  // at 393 wide, so the row takes them back (day cells >= 44 pt, chevrons
  // 44 pt effective).
  stripRow: {
    alignItems: "center",
    flexDirection: "row",
    marginHorizontal: -spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: spacing.xs,
  },
  todayPill: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.pill,
    justifyContent: "center",
    minHeight: touchTargetMin,
    paddingHorizontal: spacing.md,
  },
  todayPillText: {
    color: colors.indigo,
    fontSize: typeScale.caption,
    fontWeight: "600",
  },
  // 40 wide plus 2 pt of hit slop each side is 44 effective; the strip runs
  // edge to edge (see `stripRow`) so seven day cells still get 44 or more.
  chevron: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTargetMin,
    width: 40,
  },
  chevronGlyph: {
    color: colors.midGrey,
    fontSize: 28,
    lineHeight: 32,
  },
  day: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: 1.5,
    flex: 1,
    justifyContent: "center",
    minHeight: 76,
    minWidth: 44,
    paddingVertical: spacing.sm,
  },
  dayToday: {
    borderColor: colors.indigo,
  },
  daySelected: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  weekday: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
  },
  dayNum: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "600",
  },
  textSelected: {
    color: colors.white,
  },
  dot: {
    borderRadius: 4,
    height: 6,
    marginTop: 4,
    width: 6,
  },
  // A white ring keeps the state colour readable on the indigo pill; the
  // state is also in the day's spoken label, never colour alone.
  dotOnSelected: {
    borderColor: colors.white,
    borderWidth: 1,
    height: 8,
    width: 8,
  },
});
