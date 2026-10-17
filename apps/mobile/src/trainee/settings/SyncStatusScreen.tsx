import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useSyncEngine } from "../../sync/SyncProvider";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
};

export function SyncStatusScreen({ onBack }: Props) {
  const sync = useSyncEngine();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshCounts = useCallback(async () => {
    const rows = await sync.store.listPendingOutbox();
    setPending(rows.length);
  }, [sync]);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  async function retrySync() {
    setSyncing(true);
    setLastError(null);
    try {
      await sync.runCycle();
      await refreshCounts();
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
            {pending === 0 ? "All caught up" : `${pending} item(s) waiting to upload`}
          </Text>
          <Text style={styles.body}>
            {pending === 0
              ? "Your recent logs are synced with FitBud."
              : "They're safe on this device. We'll keep trying in the background."}
          </Text>
        </View>
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
  error: {
    color: colors.warning,
    fontSize: 14,
  },
});
