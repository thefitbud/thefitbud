import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import {
  buildClientDirectoryRows,
  filterClientRows,
  onboardingStatusLabel,
  type ClientDirectoryRow,
} from "./clients";

type Props = {
  onOpenClient: (row: ClientDirectoryRow) => void;
};

export function ClientsTab({ onOpenClient }: Props) {
  const { api, refreshSession } = useAuth();
  const [rows, setRows] = useState<ClientDirectoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invitations, relationships] = await Promise.all([
        api.listInvitations({ limit: 50 }),
        api.listRelationships({ limit: 50 }),
      ]);
      setRows(
        buildClientDirectoryRows({
          invitations: invitations.items,
          relationships: relationships.items,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load clients.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => filterClientRows(rows, query),
    [rows, query],
  );

  return (
    <Screen
      title="Clients"
      subtitle="Find a client and open status. Plan editing stays on trainer web."
    >
      {error ? <ErrorBanner message={error} /> : null}

      <Field
        label="Lookup"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Name, email, or status"
        hint="Filters clients you own."
      />

      <PrimaryButton
        label="Refresh"
        variant="secondary"
        loading={loading}
        onPress={() => {
          void refreshSession();
          void load();
        }}
      />

      {loading && rows.length === 0 ? (
        <Text style={styles.muted}>Loading clients…</Text>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {rows.length === 0 ? "No clients yet" : "No matches"}
          </Text>
          <Text style={styles.muted}>
            {rows.length === 0
              ? "Invite trainees from trainer web. Mobile is for quick lookup and review."
              : "Try a different name, email, or status."}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filtered.map((row) => {
            const canOpen = Boolean(row.relationshipId);
            return (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                accessibilityLabel={`${row.name}, ${onboardingStatusLabel(row.onboardingStatus)}`}
                accessibilityHint={
                  canOpen ? "Opens client status" : "Invitation still pending"
                }
                accessibilityState={{ disabled: !canOpen }}
                disabled={!canOpen}
                onPress={() => {
                  if (canOpen) onOpenClient(row);
                }}
                style={[styles.card, !canOpen && styles.cardDisabled]}
              >
                <Text style={styles.who}>{row.name}</Text>
                <Text style={styles.meta}>
                  {onboardingStatusLabel(row.onboardingStatus)}
                </Text>
                <Text style={styles.subtitle}>{row.subtitle}</Text>
                {canOpen ? (
                  <Text style={styles.action}>Open status</Text>
                ) : (
                  <Text style={styles.mutedInline}>
                    Invitation pending — open status after accept
                  </Text>
                )}
              </Pressable>
            );
          })}
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
  mutedInline: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  empty: {
    marginTop: spacing.xl,
    gap: spacing.sm,
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
    gap: spacing.xs,
    minHeight: 48,
  },
  cardDisabled: {
    opacity: 0.72,
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
  },
  subtitle: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
});
