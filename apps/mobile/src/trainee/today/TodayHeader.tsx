import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Bell,
  CloudAlert,
  CloudCheck,
  CloudUpload,
} from "lucide-react-native";
import { formatCivilDate } from "@fitbud/core";
import { colors, spacing } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
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
  const syncState = useSyncButtonState();
  const SyncIcon =
    syncState.kind === "problem"
      ? CloudAlert
      : syncState.kind === "waiting" || syncState.kind === "syncing"
        ? CloudUpload
        : CloudCheck;
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
        accessibilityLabel={`Sync status, ${syncState.label}`}
        onPress={onOpenSync}
        style={styles.iconBtn}
      >
        <SyncIcon size={22} color={colors.deepNavy} strokeWidth={1.75} />
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
