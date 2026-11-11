import { Pressable, StyleSheet, View } from "react-native";
import { CircleCheck, CloudAlert, WifiOff } from "lucide-react-native";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";

export const ATTENTION_EMPTY_TITLE = "Nobody needs you right now";
export const ATTENTION_EMPTY_BODY =
  "New items show up here as your clients log, or miss a log. Pull down to check again.";
export const ATTENTION_ERROR_TITLE = "Couldn't load Attention";
export const ATTENTION_ERROR_BODY =
  "Pull down to try again. If it keeps happening, email tech@thefitbud.com from More > Help.";

/** Frame 43: all clear. */
export function AttentionEmptyState() {
  return (
    <View style={styles.state}>
      <View style={[styles.tile, { backgroundColor: "#EAFBF1" }]}>
        <CircleCheck color="#0B7A4B" size={36} strokeWidth={1.75} />
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
  return (
    <View style={styles.state} accessibilityRole="alert">
      <View style={[styles.tile, { backgroundColor: "#FDF0EF" }]}>
        <CloudAlert color="#B42318" size={36} strokeWidth={1.75} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {ATTENTION_ERROR_TITLE}
      </Text>
      <Text style={styles.body}>{ATTENTION_ERROR_BODY}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry"
        onPress={onRetry}
        style={styles.retry}
      >
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

/** Frame 44: cached list with the offline line, shown above the title. */
export function AttentionOfflineBanner({ updatedAt }: { updatedAt: string }) {
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <WifiOff color="#8A4B06" size={20} strokeWidth={1.75} />
      <Text style={styles.offlineText}>
        {`You're offline. Showing the last update from ${updatedAt}.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: "center", paddingHorizontal: 8, paddingTop: 48 },
  tile: {
    alignItems: "center",
    borderRadius: 24,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  title: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 24,
    lineHeight: 30,
    marginTop: 24,
    textAlign: "center",
  },
  body: {
    color: "#5B5F73",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
    textAlign: "center",
  },
  retry: {
    alignItems: "center",
    backgroundColor: "#EDEAFF",
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 24,
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: 24,
  },
  retryText: {
    color: colors.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  offline: {
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    borderColor: "#F3DC9A",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    padding: 12,
  },
  offlineText: { color: "#8A4B06", flex: 1, fontSize: 16, lineHeight: 22 },
});
