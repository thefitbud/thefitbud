import { ThemeScope, createThemedStyles } from "../providers/ThemeProvider";
import { View } from "react-native";
import { formatCivilDate, formatLocalDate } from "@fitbud/core";
import { Text } from "../components/Text";
import { radii, spacing } from "@fitbud/ui-mobile";

function formatEndedDate(iso: string): string {
  const local = formatLocalDate(new Date(iso), "Asia/Kolkata");
  return formatCivilDate(local);
}

export function coachingEndedBannerText(
  coachName: string,
  endedAt: string | null | undefined,
): string {
  const name = coachName.trim() || "Your coach";
  if (endedAt) {
    return `Coaching with ${name} ended on ${formatEndedDate(endedAt)}. Your history is still here.`;
  }
  return `Coaching with ${name} has ended. Your history is still here.`;
}

function CoachingEndedBannerBody({
  coachName,
  endedAt,
}: {
  coachName: string;
  endedAt?: string | null;
}) {
  const styles = useStyles();
  return (
    <View style={styles.banner} accessibilityRole="text">
      <Text style={styles.text}>
        {coachingEndedBannerText(coachName, endedAt)}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  banner: {
    backgroundColor: t.colors.brandTint,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  text: {
    color: t.colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
}));

/** CoachingEndedBanner in the system theme (Z12-49): its own styles read the scope. */
export function CoachingEndedBanner(props: Parameters<typeof CoachingEndedBannerBody>[0]) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <CoachingEndedBannerBody {...props} />
    </ThemeScope>
  );
}
