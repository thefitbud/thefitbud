import { View } from "react-native";
import { Bell, Utensils } from "lucide-react-native";
import { Text } from "../Text";
import { createThemedStyles, shadowColor, useTheme } from "../../providers/ThemeProvider";
import type { NoticeLeading } from "./noticeQueue";

/** "Rahul Verma" → "RV", "Aarav" → "A". */
export function noticeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function Leading({ leading }: { leading: NoticeLeading }) {
  const styles = useStyles();
  const theme = useTheme();
  if (leading.kind === "meal" || leading.kind === "app") {
    const Icon = leading.kind === "meal" ? Utensils : Bell;
    return (
      <View
        style={[styles.avatar, styles.avatarClient]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Icon color={theme.colors.brandInk} size={20} strokeWidth={2} />
      </View>
    );
  }
  const coach = leading.tone === "coach";
  return (
    <View
      style={[styles.avatar, coach ? styles.avatarCoach : styles.avatarClient]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.initials, coach ? styles.initialsCoach : styles.initialsClient]}>
        {noticeInitials(leading.name)}
      </Text>
    </View>
  );
}

/**
 * The v3 in-app banner card (TR-06h, TM-13b): avatar, title, "now", one or two
 * lines of body. The kit paints TR-06h on `--glass` with a backdrop blur; React
 * Native core has no blur, and iOS cannot draw a shadow efficiently over a
 * translucent fill (RCTView ADVICE, D-W12-33), so the fill is the opaque card
 * token in both themes: the level-3 shadow in light, a hairline edge in dark.
 */
export function NoticeBannerView({
  title,
  body,
  leading = { kind: "app" },
}: {
  title: string;
  body?: string;
  leading?: NoticeLeading;
}) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Leading leading={leading} />
      <View style={styles.main}>
        <View style={styles.top}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text variant="caption">now</Text>
        </View>
        {body ? (
          <Text variant="subhead" tone="ink" numberOfLines={2} style={styles.body}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  card: {
    alignItems: "flex-start",
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 20,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.22,
    shadowRadius: 17,
    elevation: t.scheme === "dark" ? 0 : 10,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    overflow: "hidden",
    width: 40,
  },
  avatarCoach: { backgroundColor: t.colors.coach },
  avatarClient: { backgroundColor: t.colors.brandTint },
  initials: { fontSize: 14, fontWeight: "700" },
  initialsCoach: { color: t.colors.onBrand },
  initialsClient: { color: t.colors.brandInk },
  main: { flex: 1, minWidth: 0 },
  top: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  title: { flexShrink: 1, fontSize: 15, lineHeight: 20 },
  body: { marginTop: 2 },
}));
