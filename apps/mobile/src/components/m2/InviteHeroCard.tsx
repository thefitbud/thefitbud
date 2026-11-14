import { View } from "react-native";
import {
  Calendar,
  ChartLine,
  CircleCheck,
} from "lucide-react-native";
import { fontFamilyBold, spacing } from "@fitbud/ui-mobile";
import {
  createThemedStyles,
  shadowColor,
  useTheme,
  withAlpha,
} from "../../providers/ThemeProvider";
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
  const styles = useStyles();
  const theme = useTheme();
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
              <Icon size={18} color={withAlpha(theme.colors.heroFg, 0.72)} strokeWidth={1.75} />
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  card: {
    // v3 hero surface: navy in light, a raised charcoal card in dark (DESIGN-SYSTEM-v3 §9).
    backgroundColor: t.colors.heroB,
    borderRadius: 22,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.edge,
    marginTop: spacing.lg,
    overflow: "hidden",
    padding: 18,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.3,
    shadowRadius: 24,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: withAlpha(t.colors.heroFg, 0.14),
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: {
    color: t.colors.heroFg,
    fontSize: 17,
    fontWeight: "700",
  },
  title: {
    color: t.colors.heroFg,
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
    color: withAlpha(t.colors.heroFg, 0.88),
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
}));
