import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import type { OutboxEntry } from "../../sync/engine";
import { useSyncEngine } from "../../sync/SyncProvider";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
};

type RowState = "queued" | "syncing" | "synced" | "failed";

function mapOutboxStatus(status: OutboxEntry["status"]): RowState {
  if (status === "in_flight") return "syncing";
  if (status === "pending") return "queued";
  if (status === "acked") return "synced";
  return "failed";
}

function stateLabel(state: RowState): string {
  switch (state) {
    case "queued":
      return "Queued";
    case "syncing":
      return "Syncing";
    case "synced":
      return "Synced";
    case "failed":
      return "Failed";
  }
}

export function SyncStatusScreen({ onBack }: Props) {
  const sync = useSyncEngine();
  const [rows, setRows] = useState<OutboxEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await sync.store.listOutbox();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const active = all.filter(
      (row) =>
        row.status === "pending" ||
        row.status === "in_flight" ||
        row.status === "rejected" ||
        row.status === "conflicted",
    );
    const recentSynced = all
      .filter((row) => row.status === "acked")
      .filter(
        (row) => now - new Date(row.updatedAt).getTime() < dayMs,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 10);
    setRows(
      [...active, ...recentSynced].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
  }, [sync]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const queued = rows.filter((row) => mapOutboxStatus(row.status) === "queued");
  const inFlight = rows.filter(
    (row) => mapOutboxStatus(row.status) === "syncing",
  );
  const synced = rows.filter((row) => mapOutboxStatus(row.status) === "synced");
  const failed = rows.filter((row) => mapOutboxStatus(row.status) === "failed");

  async function retrySync() {
    setSyncing(true);
    setLastError(null);
    try {
      await sync.runCycle();
      await refresh();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Screen
      title="Sync status"
      subtitle="Logs save on your phone first, then upload when you're online."
    >
      <View style={styles.stack}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {queued.length + inFlight.length === 0 && failed.length === 0
              ? synced.length > 0
                ? "Recently synced"
                : "All caught up"
              : `${queued.length} queued · ${inFlight.length} syncing`}
          </Text>
          <Text style={styles.body}>
            {failed.length > 0
              ? `${failed.length} item(s) need attention. Tap retry after you are back online.`
              : "Your recent logs are safe on this device until they upload."}
          </Text>
        </View>

        {rows.length > 0 ? (
          <View style={styles.list}>
            <Text style={styles.listTitle}>Offline queue</Text>
            {rows.map((row) => {
              const state = mapOutboxStatus(row.status);
              return (
                <View key={row.mutationId} style={styles.row}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowOp}>{row.operation}</Text>
                    <Text
                      style={[
                        styles.state,
                        state === "failed" ? styles.stateFailed : null,
                        state === "syncing" ? styles.stateSyncing : null,
                      ]}
                    >
                      {stateLabel(state)}
                    </Text>
                  </View>
                  <Text style={styles.rowMeta}>
                    {row.recordId.slice(0, 8)}… ·{" "}
                    {new Date(row.updatedAt).toLocaleString("en-IN")}
                  </Text>
                  {row.lastError ? (
                    <Text style={styles.rowError}>{row.lastError}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {lastError ? (
          <Text style={styles.error}>Sync problem: {lastError}</Text>
        ) : null}
        <PrimaryButton
          label="Retry sync now"
          loading={syncing}
          onPress={() => {
            void retrySync();
          }}
        />
        <PrimaryButton label="Done" variant="ghost" onPress={onBack} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
  },
  body: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  listTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
  },
  row: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowOp: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
  },
  state: {
    color: colors.indigo,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  stateSyncing: {
    color: colors.midGrey,
  },
  stateFailed: {
    color: colors.warning,
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 12,
  },
  rowError: {
    color: colors.warning,
    fontSize: 12,
  },
  error: {
    color: colors.warning,
    fontSize: 14,
  },
});
