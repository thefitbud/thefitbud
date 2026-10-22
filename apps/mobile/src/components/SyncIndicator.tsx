import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, spacing, typeScale } from "@fitbud/ui-mobile";
import { useSyncEngine } from "../sync/SyncProvider";
import { indicatorFromCounts, type IndicatorKind } from "../sync/outboxCopy";

type Props = {
  onPress?: () => void;
};

export function SyncIndicator({ onPress }: Props) {
  const sync = useSyncEngine();
  const [view, setView] = useState<{
    kind: IndicatorKind;
    label: string;
    visible: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function read() {
      const [rows, meta] = await Promise.all([
        sync.store.listOutbox(),
        sync.store.getMeta(),
      ]);
      if (!active) return;
      const pending = rows.filter((row) => row.status === "pending").length;
      const inFlight = rows.filter((row) => row.status === "in_flight").length;
      const failed = rows.filter(
        (row) => row.status === "rejected" || row.status === "conflicted",
      ).length;
      const syncedAt = meta.lastSyncedAt
        ? new Date(meta.lastSyncedAt).getTime()
        : null;
      setView(
        indicatorFromCounts({
          pending,
          inFlight,
          failed,
          offline: typeof navigator !== "undefined" && navigator.onLine === false,
          syncedAt: Number.isFinite(syncedAt) ? syncedAt : null,
          now: Date.now(),
        }),
      );
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

  if (!view?.visible) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={view.label}
      onPress={onPress}
      style={styles.wrap}
    >
      <View
        style={[
          styles.dot,
          view.kind === "problem"
            ? styles.dotProblem
            : view.kind === "syncing"
              ? styles.dotSyncing
              : view.kind === "synced"
                ? styles.dotSynced
                : styles.dotNeutral,
        ]}
      />
      <Text style={styles.text}>{view.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotNeutral: { backgroundColor: colors.midGrey },
  dotProblem: { backgroundColor: colors.warning },
  dotSyncing: { backgroundColor: colors.indigo },
  dotSynced: { backgroundColor: colors.indigo },
  text: {
    color: colors.midGrey,
    fontSize: typeScale.caption,
    fontWeight: "500",
  },
});
