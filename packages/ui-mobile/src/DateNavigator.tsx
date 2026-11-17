import { Pressable, StyleSheet, View } from "react-native";
import { addDaysToLocalDate, formatCivilDate, labelFor } from "@fitbud/core";
import { FitText as Text } from "./FitText.js";
import { spacing, themes, touchTargetMin, type Theme } from "./theme.js";
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
  /**
   * The host's theme (`useTheme()`), so the strip follows a screen that opted
   * in to dark (D-W12-12). Light when omitted.
   */
  theme?: Theme;
};

/**
 * The dot under a day (TR-06a/c/d): green when the day is done, grey when it
 * is planned. The colour is never the only signal: every state is also in the
 * day's spoken label. Rest and unknown days have no dot, as in the mocks.
 */
export function dotColor(
  state: DateNavigatorDay["state"],
  colors: Theme["colors"] = themes.light.colors,
): string {
  switch (state) {
    case "done":
      return colors.done;
    case "partial":
      return colors.warn;
    case "due":
      // Planned today, nothing logged yet: neutral, never the partial colour
      // (D-W6-10).
      return colors.ink3;
    case "open":
      return colors.crit;
    case "future":
      return colors.ink4;
    case "rest":
    case "unknown":
      return "transparent";
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

/**
 * The week strip (v3, TR-06a/c/d, TR-07a/k, W-01a/e; Z12-40). One letter for
 * the weekday, the day number in a 44 pt circle and a state dot. Today is
 * the coral ring; another selected day is an ink ring. Changing day is a tap
 * here, or a swipe on the host's body; the chevrons move a week.
 *
 * No hooks, so it renders as a plain function (see its unit test) and stays
 * cheap on every day change: styles are built once per theme.
 */
export function DateNavigator({
  days,
  selectedDate,
  todayDate,
  onSelect,
  onToday,
  showTodayPill: allowTodayPill = true,
  theme = themes.light,
}: Props) {
  const showTodayPill = allowTodayPill && selectedDate !== todayDate;
  const styles = stylesFor(theme);

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
          <Text style={styles.chevronGlyph} accessibilityElementsHidden importantForAccessibility="no">{"‹"}</Text>
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
              style={styles.day}
            >
              <Text
                style={[styles.weekday, selected ? styles.weekdaySelected : null]}
              >
                {String(day.weekdayLabel).charAt(0)}
              </Text>
              <View
                style={[
                  styles.circle,
                  // Today keeps its coral ring when selected (TR-06a).
                  isToday
                    ? styles.circleToday
                    : selected
                      ? styles.circleSelected
                      : null,
                ]}
              >
                <Text style={styles.dayNum}>{String(day.dayLabel)}</Text>
              </View>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: dotColor(day.state, theme.colors) },
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
          <Text style={styles.chevronGlyph} accessibilityElementsHidden importantForAccessibility="no">{"›"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const cache = new Map<Theme, ReturnType<typeof buildStyles>>();

function stylesFor(theme: Theme) {
  let styles = cache.get(theme);
  if (!styles) {
    styles = buildStyles(theme);
    cache.set(theme, styles);
  }
  return styles;
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
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
      backgroundColor: colors.brandTint,
      borderRadius: 999,
      justifyContent: "center",
      minHeight: touchTargetMin,
      paddingHorizontal: spacing.md,
    },
    todayPillText: {
      color: colors.brandInk,
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
      color: colors.ink4,
      fontSize: 24,
      lineHeight: 28,
    },
    day: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: 76,
      minWidth: 44,
      paddingVertical: spacing.xs,
    },
    weekday: {
      color: colors.ink3,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 18,
    },
    weekdaySelected: {
      color: colors.ink,
      fontWeight: "700",
    },
    circle: {
      alignItems: "center",
      borderColor: "transparent",
      borderRadius: 22,
      borderWidth: 2,
      height: 44,
      justifyContent: "center",
      marginTop: 4,
      width: 44,
    },
    circleToday: {
      borderColor: colors.coralStrong,
    },
    circleSelected: {
      borderColor: colors.ink,
      borderWidth: 1.5,
    },
    dayNum: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "600",
    },
    dot: {
      borderRadius: 3,
      height: 6,
      marginTop: 4,
      width: 6,
    },
  });
}
