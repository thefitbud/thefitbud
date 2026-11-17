import { View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { Text } from "../components/Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/**
 * The future-day notice (D-W12-7, Z12-39): kit `.banner` with the
 * calendar-days icon. `brand` is Today's (TR-06d), `neutral` is Diet's
 * (TR-07k). It is a statement, not a control: there is nothing to tap.
 */
export function FutureDayBanner({
  text,
  kind,
}: {
  text: string;
  kind: "brand" | "neutral";
}) {
  const styles = useStyles();
  const theme = useTheme();
  const tone = kind === "brand" ? "brandInk" : "ink2";
  return (
    <View
      style={[styles.banner, kind === "brand" ? styles.brand : styles.neutral]}
      accessibilityRole="text"
      accessibilityLabel={text}
      testID="future-day-banner"
    >
      <CalendarDays size={18} strokeWidth={2.2} color={theme.colors[tone]} />
      <Text variant="subhead" tone={tone} style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

/**
 * W-01e: the line that takes the place of Start workout on a future day.
 * `onBrand` is for the navy workout hero the tab still uses until its v3
 * rework (Z12-44); W-01e itself draws it on a card in `ink2`.
 */
export function FutureDayOpensNote({
  text,
  surface = "card",
}: {
  text: string;
  surface?: "card" | "brand";
}) {
  const styles = useStyles();
  const theme = useTheme();
  const tone = surface === "brand" ? "onBrand" : "ink2";
  return (
    <View
      style={styles.note}
      accessibilityRole="text"
      accessibilityLabel={text}
      testID="future-day-opens-note"
    >
      <CalendarDays size={16} strokeWidth={2.2} color={theme.colors[tone]} />
      <Text variant="subhead" tone={tone}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  brand: { backgroundColor: t.colors.brandTint },
  neutral: { backgroundColor: t.colors.fill },
  text: { flex: 1 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
  },
}));
