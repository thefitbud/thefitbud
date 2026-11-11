import { Pressable, StyleSheet, View } from "react-native";
import { Clock } from "lucide-react-native";
import { formatCivilDate } from "@fitbud/core";
import { semanticColors, spacing } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";

/** Border for info-toned chips and banners (the token has fill and text only). */
export const INFO_BORDER = "#BFDBFE";

/**
 * Banner above a past day (frames 04 v3 past): the civil date, whether the
 * trainee can still log, and the way back to today.
 */
export function PastDayBanner({
  localDate,
  canStillLog,
  onBackToToday,
}: {
  localDate: string;
  canStillLog: boolean;
  onBackToToday: () => void;
}) {
  const palette = semanticColors.info;
  const date = formatCivilDate(localDate);
  const message = canStillLog ? `${date} · you can still log it` : date;
  return (
    <View
      style={[styles.banner, { backgroundColor: palette.fill }]}
      accessibilityLabel={`Past day. ${message}`}
    >
      <Clock size={18} color={palette.text} strokeWidth={1.75} />
      <Text style={[styles.message, { color: palette.text }]} numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to today"
        onPress={onBackToToday}
        style={styles.back}
      >
        <Text style={[styles.backLabel, { color: palette.text }]}>
          Back to today
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: "center",
    borderColor: INFO_BORDER,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: "400",
    paddingVertical: spacing.sm,
  },
  back: {
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
  },
  backLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
});
