import { View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { createThemedStyles } from "../providers/ThemeProvider";

type Props = {
  /** Unread count; 0 or less renders nothing. Ignored when `dot` is set. */
  count?: number;
  /** A plain dot (kit `.dotb`) instead of a number. */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Shown count: the number, capped at 99+. */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(Math.floor(count));
}

/**
 * Notification badge (kit `.tab .badge` / `.dotb`, v3 colour roles):
 * coral-strong with a navy numeral and a 2 pt card ring. The numeral stays
 * navy in both themes (fixed-navy on coral, 4.67:1 light and 5.67:1 dark).
 * Decorative for assistive tech: the control it sits on names the count.
 */
export function Badge({ count = 0, dot = false, style, testID }: Props) {
  const styles = useStyles();
  if (dot) {
    return (
      <View
        testID={testID}
        style={[styles.dot, style]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }
  if (count <= 0) return null;
  return (
    <View
      testID={testID}
      style={[styles.badge, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={styles.numeral}>{badgeText(count)}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  badge: {
    alignItems: "center",
    backgroundColor: t.colors.coralStrong,
    borderColor: t.colors.card,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    minWidth: 21,
    height: 21,
    paddingHorizontal: 5,
  },
  numeral: {
    color: t.colors.fixedNavy,
    fontSize: 10.5,
    fontWeight: "700",
    lineHeight: 13,
    fontVariant: ["tabular-nums"],
  },
  dot: {
    backgroundColor: t.colors.coralStrong,
    borderColor: t.colors.card,
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    width: 12,
  },
}));
