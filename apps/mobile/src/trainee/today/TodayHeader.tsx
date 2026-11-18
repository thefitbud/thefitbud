import { Pressable, View } from "react-native";
import {
  Bell,
  CloudAlert,
  CloudCheck,
  CloudUpload,
} from "lucide-react-native";
import { spacing } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { pillFromStatus, type IndicatorKind } from "../../sync/outboxCopy";
import { useApiReachable, useSyncView } from "../../sync/useSyncStatus";

/**
 * The sync button's state, from the same outbox view as `SyncIndicator`
 * (`useSyncView`, Z12-41): "Saved on phone" while a log waits, "Sending…"
 * while one is in flight, "Couldn't send" after a refusal. The button is
 * always there (TR-06a), so the idle state is "Synced". An outbox that could
 * not be read says so; it is never "Synced".
 */
export function useSyncButtonState(): { kind: IndicatorKind; label: string } {
  const view = useSyncView();
  const reachable = useApiReachable();
  if (!view) return { kind: "problem", label: "Couldn't check" };
  const pill = pillFromStatus(view.status);
  if (pill) return pill;
  // Nothing waiting but the API was last seen unreachable (TR-06e): the
  // button must not say "Synced" about a phone that can't reach FitBud.
  if (reachable === false) return { kind: "waiting", label: "Offline" };
  return { kind: "synced", label: "Synced" };
}

/**
 * Today's own title row (TR-06a/c/d): the day as an eyebrow ("Thursday,
 * 12 Nov · past day", "Monday, 16 Nov · planned", from `dayEyebrow`), the
 * title "Today" on every day as in the mocks, and the two controls
 * `AppTopBar` used to give this tab, the sync (cloud) button and the bell,
 * each 44 pt and labelled.
 */
export function TodayHeader({
  eyebrow,
  unreadNotifications,
  onOpenSync,
  onOpenNotifications,
}: {
  /** `dayEyebrow(selectedDate, kind)` (`useDayState.ts`). */
  eyebrow: string;
  unreadNotifications: number;
  onOpenSync: () => void;
  onOpenNotifications: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const syncState = useSyncButtonState();
  const SyncIcon =
    syncState.kind === "problem"
      ? CloudAlert
      : syncState.kind === "waiting" || syncState.kind === "syncing"
        ? CloudUpload
        : CloudCheck;
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Text variant="subhead" tone="ink3" testID="day-eyebrow">
          {eyebrow}
        </Text>
        <Text
          variant="largeTitle"
          style={styles.title}
          accessibilityRole="header"
        >
          Today
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sync status, ${syncState.label}`}
        onPress={onOpenSync}
        style={styles.iconBtn}
      >
        <SyncIcon size={22} color={theme.colors.ink} strokeWidth={1.75} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        onPress={onOpenNotifications}
        style={styles.iconBtn}
      >
        <Bell size={22} color={theme.colors.ink} strokeWidth={1.75} />
        {unreadNotifications > 0 ? <View style={styles.unreadDot} /> : null}
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  titles: {
    flex: 1,
  },
  title: {
    marginTop: 2,
  },
  iconBtn: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  unreadDot: {
    backgroundColor: t.colors.coralStrong,
    borderRadius: 5,
    height: 10,
    position: "absolute",
    right: 9,
    top: 8,
    width: 10,
  },
}));
