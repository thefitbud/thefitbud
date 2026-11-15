import { Pressable, View } from "react-native";
import { Bell } from "lucide-react-native";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { SyncIndicator } from "./SyncIndicator";

type Props = {
  title: string;
  subtitle?: string;
  unreadNotifications?: number;
  onOpenNotifications?: () => void;
  onOpenSync?: () => void;
};

/** Renders "Today · Sun 18 Oct" with bold lead + mid-grey date (mockup 04). */
function TitleLine({ title }: { title: string }) {
  const styles = useStyles();
  const sep = title.indexOf(" · ");
  if (sep > 0) {
    const lead = title.slice(0, sep);
    const rest = title.slice(sep);
    return (
      <Text style={styles.titleLine} accessibilityRole="header">
        <Text style={styles.titleLead}>{lead}</Text>
        <Text style={styles.titleRest}>{rest}</Text>
      </Text>
    );
  }
  return (
    <Text style={styles.title} accessibilityRole="header">
      {title}
    </Text>
  );
}

export function AppTopBar({
  title,
  subtitle,
  unreadNotifications = 0,
  onOpenNotifications,
  onOpenSync,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.titles}>
        <TitleLine title={title} />
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actions}>
        <SyncIndicator onPress={onOpenSync} />
        {onOpenNotifications ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={onOpenNotifications}
            style={styles.bell}
          >
            <Bell
              size={22}
              color={theme.colors.ink}
              strokeWidth={2}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            {unreadNotifications > 0 ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  wrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.md,
    justifyContent: "space-between",
    paddingBottom: t.spacing.sm,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...t.text.largeTitle.style,
    color: t.colors.ink,
  },
  titleLine: {
    fontSize: 17,
    lineHeight: 22,
  },
  titleLead: {
    color: t.colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  titleRest: {
    color: t.colors.ink3,
    fontSize: 17,
    fontWeight: "500",
  },
  subtitle: {
    color: t.colors.ink2,
    fontSize: 16,
    lineHeight: 22,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.sm,
  },
  bell: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: t.touchTarget,
    minWidth: t.touchTarget,
    position: "relative",
  },
  // Kit `.circbtn .dot`: coral-strong with a 2 pt card ring (coral = new/due, never an error).
  unreadDot: {
    backgroundColor: t.colors.coralStrong,
    borderColor: t.colors.card,
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    position: "absolute",
    right: 7,
    top: 7,
    width: 12,
  },
}));
