import { Pressable, StyleSheet, View } from "react-native";
import { Bell, Cloud } from "lucide-react-native";
import { formatCivilDate } from "@fitbud/core";
import { colors, spacing } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";

/**
 * Today's own title row (frame 04): the civil date as an eyebrow, the title,
 * and the two controls `AppTopBar` used to give this tab, the sync (cloud)
 * button and the bell, each 44 pt and labelled. On a past day the title is
 * the date ("Fri, 16 Oct"), not "Today".
 */
export function TodayHeader({
  selectedDate,
  isToday,
  unreadNotifications,
  onOpenSync,
  onOpenNotifications,
}: {
  selectedDate: string;
  isToday: boolean;
  unreadNotifications: number;
  onOpenSync: () => void;
  onOpenNotifications: () => void;
}) {
  const date = formatCivilDate(selectedDate);
  // "Fri 16 Oct" reads "Fri, 16 Oct" as a title (frame 04 past).
  const title = isToday ? "Today" : date.replace(" ", ", ");
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Text style={styles.eyebrow}>{date}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sync status"
        onPress={onOpenSync}
        style={styles.iconBtn}
      >
        <Cloud size={22} color={colors.deepNavy} strokeWidth={1.75} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        onPress={onOpenNotifications}
        style={styles.iconBtn}
      >
        <Bell size={22} color={colors.deepNavy} strokeWidth={1.75} />
        {unreadNotifications > 0 ? <View style={styles.unreadDot} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  titles: {
    flex: 1,
  },
  eyebrow: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 36,
    marginTop: 2,
  },
  iconBtn: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  unreadDot: {
    backgroundColor: colors.coral,
    borderRadius: 5,
    height: 10,
    position: "absolute",
    right: 9,
    top: 8,
    width: 10,
  },
});
