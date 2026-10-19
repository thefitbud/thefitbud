import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, spacing, typeScale } from "@fitbud/ui-mobile";
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
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadNotifications > 0 ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  titleLine: {
    fontSize: 17,
    lineHeight: 22,
  },
  titleLead: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  titleRest: {
    color: colors.midGrey,
    fontSize: 17,
    fontWeight: "500",
  },
  subtitle: {
    color: colors.midGrey,
    fontSize: typeScale.body,
    lineHeight: 22,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  bell: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    position: "relative",
  },
  bellIcon: {
    fontSize: 20,
  },
  unreadDot: {
    backgroundColor: colors.indigo,
    borderRadius: 4,
    height: 8,
    position: "absolute",
    right: 6,
    top: 6,
    width: 8,
  },
});
