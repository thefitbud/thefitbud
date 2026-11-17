import { useEffect, useState } from "react";
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
import { reportError } from "../../lib/reportError";
import { useSyncEngine } from "../../sync/SyncProvider";
import { indicatorFromCounts, type IndicatorKind } from "../../sync/outboxCopy";

/**
 * The sync button's state, read from the outbox the way `SyncIndicator` reads
 * it (same counts, same `indicatorFromCounts`). Unlike that indicator the
 * button is always there (frame 04), so the idle state is "Synced".
 */
function useSyncButtonState(): { kind: IndicatorKind; label: string } {
  const sync = useSyncEngine();
  const [state, setState] = useState<{ kind: IndicatorKind; label: string }>({
    kind: "synced",
    label: "Synced",
  });
  useEffect(() => {
    let active = true;
    let reported = false;
    async function read() {
      try {
        const [rows, meta] = await Promise.all([
          sync.store.listOutbox(),
          sync.store.getMeta(),
        ]);
        if (!active) return;
        const count = (...statuses: string[]) =>
          rows.filter((row) => statuses.includes(row.status)).length;
        const syncedAt = meta.lastSyncedAt
          ? new Date(meta.lastSyncedAt).getTime()
          : null;
        const view = indicatorFromCounts({
          pending: count("pending"),
          inFlight: count("in_flight"),
          failed: count("rejected", "conflicted"),
          offline:
            typeof navigator !== "undefined" && navigator.onLine === false,
          syncedAt: Number.isFinite(syncedAt) ? syncedAt : null,
          now: Date.now(),
        });
        setState({ kind: view.kind, label: view.label });
      } catch (err) {
        // Keeps the last known state; reported once, not on every poll.
        if (!reported) reportError("TodayHeader.syncState", err);
        reported = true;
      }
    }
    void read();
    const timer = setInterval(() => {
      void read();
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sync]);
  return state;
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
