import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SegmentedControl } from "../components/SegmentedControl";
import { ActivityFeedScreen } from "./ActivityFeedScreen";
import {
  clientListQueryForChip,
  filterClientRows,
  mapDirectoryItemToRow,
  onboardingStatusLabel,
  type ClientDirectoryRow,
  type ClientListFilter,
} from "./clients";

type Segment = "clients" | "activity";

const FILTER_CHIPS: Array<{
  id: ClientListFilter;
  label: string;
  icon: string;
}> = [
  { id: "all", label: "All", icon: "◎" },
  { id: "needs_attention", label: "Needs attention", icon: "!" },
  { id: "checkin_due", label: "Check-in due", icon: "✓" },
  { id: "onboarding", label: "Onboarding", icon: "…" },
  { id: "ended", label: "Ended", icon: "×" },
];

type Props = {
  onOpenClient: (row: ClientDirectoryRow) => void;
  initialSegment?: Segment;
};

export function ClientsTab({ onOpenClient, initialSegment = "clients" }: Props) {
  const { api, refreshSession } = useAuth();
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [rows, setRows] = useState<ClientDirectoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ClientListFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.listClients(
        clientListQueryForChip(chip, query),
      );
      setRows(page.items.map(mapDirectoryItemToRow));
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load clients.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, chip, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSegment(initialSegment);
  }, [initialSegment]);

  const filtered = useMemo(
    () => filterClientRows(rows, "", chip),
    [rows, chip],
  );

  return (
    <Screen title="Clients" subtitle="Lookup and recent activity.">
      <SegmentedControl
        options={[
          { id: "clients", label: "Clients" },
          { id: "activity", label: "Activity" },
        ]}
        value={segment}
        onChange={setSegment}
      />

      {segment === "activity" ? (
        <View style={styles.activity}>
          <ActivityFeedScreen />
        </View>
      ) : (
        <>
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

          <View style={styles.chipRow}>
            {FILTER_CHIPS.map((option) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                style={[
                  styles.filterChip,
                  chip === option.id ? styles.filterChipActive : null,
                ]}
                onPress={() => setChip(option.id)}
              >
                <Text
                  style={
                    chip === option.id
                      ? styles.filterChipTextActive
                      : styles.filterChipText
                  }
                >
                  {option.icon} {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

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
                  ? "Invite trainees from trainer web."
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
                        Invitation pending — open after accept
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  activity: {
    marginTop: spacing.lg,
  },
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  filterChip: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: colors.paleLavender,
    borderColor: colors.indigo,
  },
  filterChipText: {
    color: colors.deepNavy,
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: colors.indigo,
    fontSize: 12,
    fontWeight: "700",
  },
});
