import { View } from "react-native";
import { Lock } from "lucide-react-native";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

/** Border for info-toned chips and banners (the token has fill and text only). */
export const INFO_BORDER = "#BFDBFE";

/**
 * The past-day copy (TR-06c). The second sentence shows only while a meal
 * of that day can still be logged late (D-W12-7: past days stay loggable as
 * late logs until the coach closes the day's exception).
 */
export function pastDayMessage(coachName: string, canStillLog: boolean): string {
  return canStillLog
    ? `Past days are read-only. You can still log a missed meal until ${coachName} reviews the day.`
    : "Past days are read-only.";
}

/**
 * Notice above a past day (TR-06c): the kit's neutral banner with the lock
 * icon. It is a statement, not a control: the way back to today is the
 * coral-ringed day in the strip (or the strip's "Today" pill when today is
 * in another week).
 */
export function PastDayBanner({
  coachName,
  canStillLog,
}: {
  coachName: string;
  canStillLog: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const message = pastDayMessage(coachName, canStillLog);
  return (
    <View
      style={styles.banner}
      accessibilityRole="text"
      accessibilityLabel={`Past day. ${message}`}
      testID="past-day-banner"
    >
      <Lock size={18} color={theme.colors.ink2} strokeWidth={2} />
      <Text variant="subhead" tone="ink2" style={styles.message}>
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
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  message: {
    flex: 1,
  },
}));
