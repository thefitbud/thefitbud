import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { TrainerCheckinInboxItem } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { statusLabel } from "./labels";

type Props = {
  onReviewCheckin: (item: TrainerCheckinInboxItem) => void;
};

export function CheckinsTab({ onReviewCheckin }: Props) {
  const { api, refreshSession } = useAuth();
  const [items, setItems] = useState<TrainerCheckinInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const inbox = await api.listTrainerCheckinInbox();
      setItems(inbox.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load check-ins.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen
      title="Check-ins"
      subtitle="Due, overdue, and submitted check-ins across your clients."
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
        <Text style={styles.muted}>Loading check-ins…</Text>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No check-ins need attention</Text>
          <Text style={styles.muted}>
            Schedule check-ins from trainer web, or wait for a due submission.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.checkin.id}
              accessibilityRole="button"
              accessibilityLabel={`Review check-in due ${item.checkin.localDate}`}
              onPress={() => onReviewCheckin(item)}
              style={styles.card}
            >
              <Text style={styles.who}>Due {item.checkin.localDate}</Text>
              <Text style={styles.meta}>
                {statusLabel(item.checkin.status)} · Client{" "}
                {item.traineeUserId.slice(0, 8)}…
              </Text>
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
  action: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
  },
});
