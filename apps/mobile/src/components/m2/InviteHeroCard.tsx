import { StyleSheet, View } from "react-native";
import {
  Calendar,
  ChartLine,
  CircleCheck,
} from "lucide-react-native";
import { colors, fontFamilyBold, spacing } from "@fitbud/ui-mobile";
import { Text } from "../Text";

type Props = {
  coachName: string;
};

const BULLETS = [
  { icon: Calendar, text: "Your plan, day by day" },
  { icon: CircleCheck, text: "Log meals and workouts in a tap" },
  { icon: ChartLine, text: (coach: string) => `${coach} sees your progress` },
] as const;

export function InviteHeroCard({ coachName }: Props) {
  const coachFirst = coachName.split(/\s+/)[0] ?? coachName;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {coachName
              .trim()
              .split(/\s+/)
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {coachName} invited you to coaching on FitBud
        </Text>
      </View>
      <View style={styles.list}>
        {BULLETS.map((bullet) => {
          const Icon = bullet.icon;
          const line =
            typeof bullet.text === "function"
              ? bullet.text(coachFirst)
              : bullet.text;
          return (
            <View key={line} style={styles.bulletRow}>
              <Icon size={18} color="#B7A9F5" strokeWidth={1.75} />
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.deepNavy,
    borderRadius: 22,
    marginTop: spacing.lg,
    overflow: "hidden",
    padding: 18,
    shadowColor: "#1A1248",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
  title: {
    color: colors.white,
    flex: 1,
    fontFamily: fontFamilyBold,
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 27,
  },
  list: {
    gap: spacing.sm,
    marginTop: 14,
  },
  bulletRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  bulletText: {
    color: "rgba(255,255,255,0.88)",
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
});
