import { View } from "react-native";
import { BellButton } from "./BellButton";
import { Text } from "./Text";
import { createThemedStyles } from "../providers/ThemeProvider";
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
          <BellButton unread={unreadNotifications} onPress={onOpenNotifications} />
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
}));
