import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Check,
  CloudOff,
  Dumbbell,
  Stethoscope,
  Utensils,
} from "lucide-react-native";
import { brand, ink, semantic } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { BottomSheet } from "../../components/BottomSheet";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useConfig } from "../../providers/ConfigProvider";
import {
  buildSupportMailto,
  DEFAULT_SUPPORT_EMAIL,
} from "../../lib/support";
import { Linking } from "react-native";
import { useSyncEngine } from "../../sync/SyncProvider";
import {
  conflictCopy,
  describeOutboxEntry,
  lastSyncedLabel,
} from "../../sync/outboxCopy";
import type { OutboxEntry } from "../../sync/engine";
import { M2Button, M2Group, M2Hero, M2Note, M2Page, M2Row } from "./m2";

type Props = {
  onBack: () => void;
  coachName?: string;
};

export function SyncStatusScreen({ onBack, coachName = "your coach" }: Props) {
  const sync = useSyncEngine();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;
  const first = coachName.split(/\s+/)[0] || "your coach";
  const [rows, setRows] = useState<OutboxEntry[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [outbox, meta] = await Promise.all([
        sync.store.listOutbox(),
        sync.store.getMeta(),
      ]);
      setRows(outbox);
      setSyncedAt(meta.lastSyncedAt);
    } catch {
      setError("Could not load sync status.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sync]);

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = rows.filter(
    (row) => row.status === "pending" || row.status === "in_flight",
  );
  const failed = rows.filter(
    (row) => row.status === "rejected" || row.status === "conflicted",
  );
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  async function syncNow() {
    setBusy(true);
    setError(null);
    try {
      await sync.runCycle();
    } catch {
      setError(
        offline
          ? "You're offline. Your logs stay on this phone."
          : "Could not sync just now.",
      );
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function retry(row: OutboxEntry) {
    await sync.store.updateOutboxStatus(row.mutationId, "pending", null);
    await syncNow();
  }

  const quiet =
    waiting.length === 0 && failed.length === 0 && !offline;
  const heroTitle = offline
    ? `Offline · ${waiting.length} waiting`
    : quiet
      ? "All saved"
      : `${waiting.length} waiting`;

  return (
    <M2Page
      title="Sync status"
      subtitle={`Your logs are saved on this phone and sent to ${first} when you're online.`}
      onBack={onBack}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline ? (
        <Text style={styles.muted}>You're offline. Nothing is lost.</Text>
      ) : null}
      {loading ? (
        <Text accessibilityLabel="Loading sync status" style={styles.muted}>
          Loading…
        </Text>
      ) : null}
      <M2Hero
        tone={quiet ? "ok" : "wait"}
        icon={
          quiet ? (
            <Check color={brand.indigo} size={22} strokeWidth={2} />
          ) : (
            <CloudOff color={ink[700]} size={22} strokeWidth={1.75} />
          )
        }
        title={heroTitle}
        subtitle={lastSyncedLabel(syncedAt)}
      />

      {waiting.length === 0 ? (
        <Text style={styles.muted}>Nothing waiting.</Text>
      ) : (
        <M2Group>
          {waiting.map((row) => (
            <M2Row
              key={row.mutationId}
              icon={queueIcon(row.operation)}
              label={describeOutboxEntry(row)}
              showChevron={false}
            />
          ))}
        </M2Group>
      )}

      <Text style={styles.section}>Couldn't send ({failed.length})</Text>
      {failed.length === 0 ? (
        <Text style={styles.muted}>Nothing failed.</Text>
      ) : (
        <View style={styles.stack}>
          {failed.map((row) => (
            <View key={row.mutationId} style={styles.fail}>
              <Text style={styles.failTitle}>{describeOutboxEntry(row)}</Text>
              <Text style={styles.failWhy}>{conflictCopy(row.lastError)}</Text>
              <M2Button
                label="Retry"
                variant="secondary"
                onPress={() => {
                  void retry(row);
                }}
              />
            </View>
          ))}
        </View>
      )}

      <M2Button
        label={busy ? "Syncing…" : "Sync now"}
        disabled={busy}
        onPress={() => {
          void syncNow();
        }}
      />

      <M2Group>
        <M2Row
          icon={<Stethoscope color={brand.indigo} size={18} strokeWidth={1.75} />}
          label="Diagnostics"
          hint="FitBud on this phone"
          onPress={() => setDiagOpen((open) => !open)}
        />
      </M2Group>
      {diagOpen ? (
        <M2Note>
          FitBud on this phone. Email support includes this screen.
        </M2Note>
      ) : null}
      <M2Button
        label="Email support"
        variant="secondary"
        onPress={() => {
          const url = buildSupportMailto({
            supportEmail,
            screenId: "TR-19",
            role: "trainee",
            extra: `Last synced: ${syncedAt ?? "never"}\nWaiting: ${waiting.length}\nCouldn't send: ${failed.length}`,
          });
          void Linking.canOpenURL(url).then(async (can) => {
            if (can) {
              await Linking.openURL(url);
              return;
            }
            setHelpOpen(true);
          });
        }}
      />

      <BottomSheet
        visible={helpOpen}
        title="Email support"
        subtitle="Copy this address if mail didn't open."
        onDismiss={() => setHelpOpen(false)}
      >
        <Text style={styles.mail}>{supportEmail}</Text>
      </BottomSheet>
    </M2Page>
  );
}

function queueIcon(operation: string) {
  if (operation.startsWith("meal.")) {
    return <Utensils color={brand.indigo} size={18} strokeWidth={1.75} />;
  }
  if (operation.startsWith("workout.")) {
    return <Dumbbell color={brand.indigo} size={18} strokeWidth={1.75} />;
  }
  return <CloudOff color={ink[700]} size={18} strokeWidth={1.75} />;
}

const styles = StyleSheet.create({
  muted: { color: ink[500], fontSize: 15 },
  section: {
    color: ink[700],
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
    marginTop: 4,
  },
  stack: { gap: 8 },
  fail: {
    backgroundColor: "#fff",
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  failTitle: { color: ink[900], fontSize: 15, lineHeight: 21 },
  failWhy: { color: semantic.critical.text, fontSize: 14, lineHeight: 20 },
  mail: { color: brand.deepNavy, fontSize: 16 },
});
