import { Pressable, View } from "react-native";
import { CircleAlert } from "lucide-react-native";
import { USER_FACING_OFFLINE } from "@fitbud/api-client";
import { Text } from "./Text";
import { OfflineBanner } from "./OfflineBanner";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/**
 * Offline copy is a state, not a failure (D-W14-9). The shared offline
 * message from `userFacingMessage`, and every screen's own "You're offline…"
 * line, read as offline here so the 58 call sites stop painting it crit.
 */
export function isOfflineMessage(message: string): boolean {
  const text = message.trim();
  return (
    text === USER_FACING_OFFLINE ||
    /^you(?:'|’)re offline\b/i.test(text) ||
    /^offline\./i.test(text)
  );
}

/**
 * Kit `.banner.crit`: crit tint with crit-ink text (quiet danger, never a red
 * screen), for real failures only. Offline (the `offline` prop, or an offline
 * message) renders the neutral `OfflineBanner` instead, with no alert role
 * (D-W14-9). `onRetry` adds the TR-06g Retry action and leading alert glyph.
 */
export function ErrorBanner({
  message,
  offline,
  onRetry,
  retryLabel = "Retry",
}: {
  message: string;
  /** Force the neutral offline variant whatever the message says. */
  offline?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  if (offline ?? isOfflineMessage(message)) {
    return <OfflineBanner message={message} />;
  }
  if (!onRetry) {
    return (
      <View style={styles.banner} accessibilityRole="alert">
        <Text tone="critInk" style={styles.text}>
          {message}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.banner, styles.row]}>
      <View style={styles.rowMain} accessibilityRole="alert">
        <CircleAlert
          size={20}
          color={theme.colors.critInk}
          strokeWidth={1.9}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text tone="critInk" style={[styles.text, styles.rowText]}>
          {message}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
        onPress={onRetry}
        hitSlop={8}
        style={styles.retry}
      >
        <Text tone="critInk" style={[styles.text, styles.retryLabel]}>
          {retryLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  banner: {
    backgroundColor: t.colors.critTint,
    borderRadius: t.radii.toast,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: t.spacing.lg,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  rowMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  rowText: { flex: 1 },
  retry: {
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 4,
  },
  retryLabel: { fontWeight: "700" },
  text: {
    ...t.text.subhead.style,
  },
}));
