import { Pressable, View } from "react-native";
import { CircleCheck, CloudAlert, WifiOff } from "lucide-react-native";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import {
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";

/** TM-01d: all clear. */
export const ATTENTION_EMPTY_TITLE = "All caught up";
export const ATTENTION_EMPTY_BODY =
  "Nobody needs you right now. We’ll notify you when a client misses something or asks.";
export const ATTENTION_ERROR_TITLE = "Couldn't load Needs you";
export const ATTENTION_ERROR_BODY =
  "Check your connection and try again. Pull down to refresh.";

/** TM-01d: all clear. */
export function AttentionEmptyState() {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.state}>
      <View style={[styles.tile, { backgroundColor: theme.colors.brandTint }]}>
        <View style={styles.checkRing}>
          <CircleCheck color={theme.colors.ink} size={28} strokeWidth={1.75} />
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {ATTENTION_EMPTY_TITLE}
      </Text>
      <Text style={styles.body}>{ATTENTION_EMPTY_BODY}</Text>
    </View>
  );
}

/** Frame 45: could not load, with Retry (spec Z10-2). */
export function AttentionErrorState({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.state} accessibilityRole="alert">
      <View style={[styles.tile, { backgroundColor: theme.colors.critTint }]}>
        <CloudAlert color={theme.colors.crit} size={36} strokeWidth={1.75} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {ATTENTION_ERROR_TITLE}
      </Text>
      <Text style={styles.body}>{ATTENTION_ERROR_BODY}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={onRetry}
        style={styles.retry}
      >
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

/** Frame 44: cached list with the offline line, shown above the title. */
export function AttentionOfflineBanner({ updatedAt }: { updatedAt: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <WifiOff color={theme.colors.warn} size={20} strokeWidth={1.75} />
      <Text style={styles.offlineText}>
        {`You're offline. Showing the last update from ${updatedAt}. Actions come back when you're online.`}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  state: { alignItems: "center", paddingHorizontal: 8, paddingTop: 48 },
  tile: {
    alignItems: "center",
    borderRadius: 24,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  checkRing: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  title: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 24,
    lineHeight: 30,
    marginTop: 24,
    textAlign: "center",
  },
  body: {
    color: t.colors.ink2,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
    textAlign: "center",
  },
  retry: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 24,
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: 24,
  },
  retryText: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  offline: {
    alignItems: "center",
    backgroundColor: t.colors.warnTint,
    borderColor: t.colors.line2,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    padding: 12,
  },
  offlineText: { color: t.colors.warn, flex: 1, fontSize: 16, lineHeight: 22 },
}));
