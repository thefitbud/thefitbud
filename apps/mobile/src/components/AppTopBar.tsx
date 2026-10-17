import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typeScale } from "@fitbud/ui-mobile";
import { SyncIndicator } from "./SyncIndicator";

type Props = {
  title: string;
  subtitle?: string;
  unreadNotifications?: number;
  onOpenNotifications?: () => void;
  onOpenSync?: () => void;
};

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
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
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
    alignItems: "flex-start",
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
  subtitle: {
    color: colors.midGrey,
    fontSize: typeScale.body,
    lineHeight: 22,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  bell: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    minWidth: 40,
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
