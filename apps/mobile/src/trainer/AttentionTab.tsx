import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { AttentionItem } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import { statusLabel, typeLabel } from "./labels";

type Props = {
  onReviewException: (exceptionId: string) => void;
  onOpenClients: () => void;
};

export function AttentionTab({ onReviewException, onOpenClients }: Props) {
  const { api, relationships, refreshSession } = useAuth();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const attention = await api.getAttentionFeed({ limit: 30 });
      setItems(attention.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load attention feed.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeHints(
    api,
    relationships.map((item) => item.id),
    () => {
      void load();
    },
  );

  return (
    <Screen
      title="Attention"
      subtitle="Who needs you today — deterministic exceptions only."
    >
      {error ? <ErrorBanner message={error} /> : null}

      <PrimaryButton
        label="Refresh"
        variant="secondary"
        onPress={() => {
          void refreshSession();
          void load();
        }}
      />

      {loading ? (
        <Text style={styles.muted}>Loading attention…</Text>
      ) : items.length === 0 ? (
        <View style={styles.empty} accessibilityRole="summary">
          <Text style={styles.emptyTitle}>No attention items</Text>
          <Text style={styles.muted}>
            FitBud surfaces meaningful exceptions from configured expectations.
            Look up a client when you need context.
          </Text>
          <PrimaryButton label="Open clients" onPress={onOpenClients} />
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.exception.id}
              accessibilityRole="button"
              accessibilityLabel={`Review ${item.traineeDisplayName ?? "trainee"} exception`}
              onPress={() => onReviewException(item.exception.id)}
              style={styles.card}
            >
              <Text style={styles.who}>
                {item.traineeDisplayName ?? "Trainee"}
              </Text>
              <Text style={styles.meta}>
                {statusLabel(item.exception.status)} ·{" "}
                {typeLabel(item.exception.type)}
              </Text>
              <Text style={styles.summary}>{item.exception.summary}</Text>
              <Text style={styles.action}>Review</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  empty: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "600",
  },
  list: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    borderRadius: 14,
    padding: spacing.lg,
    gap: spacing.sm,
    minHeight: 48,
  },
  who: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  meta: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  summary: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  action: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
});
