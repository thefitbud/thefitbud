import { View, type StyleProp, type ViewStyle } from "react-native";
import { WifiOff } from "lucide-react-native";
import { formatClockTime } from "@fitbud/core";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/**
 * The trainee's offline line (TR-06e, D-W14-9): what the screen shows was
 * saved on the phone at {time}, and logs send when the phone is back online.
 * Without a time when nothing says when the screen's data was saved.
 */
export function offlineSavedAtText(
  savedAt: number | null | undefined,
  timeZone: string,
): string {
  if (savedAt == null || !Number.isFinite(savedAt)) {
    return "You're offline. Showing what was saved on your phone. Logs will send when you're back.";
  }
  const time = formatClockTime(new Date(savedAt).toISOString(), timeZone);
  return `You're offline. Showing what was saved at ${time}. Logs will send when you're back.`;
}

/**
 * Offline is a state, not a failure (D-W14-9, TR-06e / TR-07d): a neutral
 * fill, the wifi-off glyph and secondary ink. It carries no alert role, so a
 * screen reader reads it in place instead of interrupting with it.
 */
export function OfflineBanner({
  message,
  testID = "offline-banner",
  style,
}: {
  message: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={[styles.banner, style]} testID={testID}>
      <WifiOff
        size={20}
        color={theme.colors.ink2}
        strokeWidth={1.9}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text variant="subhead" tone="ink2" style={styles.text}>
        {message}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  banner: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    marginBottom: t.spacing.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  text: { flex: 1 },
}));
