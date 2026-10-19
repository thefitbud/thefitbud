import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";

function formatEndedDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
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

export function CoachingEndedBanner({
  coachName,
  endedAt,
}: {
  coachName: string;
  endedAt?: string | null;
}) {
  return (
    <View style={styles.banner} accessibilityRole="text">
      <Text style={styles.text}>
        {coachingEndedBannerText(coachName, endedAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.md,
  },
  text: {
    color: colors.deepNavy,
    fontSize: 14,
    lineHeight: 20,
  },
});
