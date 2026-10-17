import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { Notification } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

type Props = {
  onBack: () => void;
};

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function NotificationsScreen({ onBack }: Props) {
  const { api } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.listNotifications();
      setItems(page.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Notifications" subtitle="In-app inbox from FitBud.">
      {error ? <ErrorBanner message={error} /> : null}
      <PrimaryButton
        label="Refresh"
        variant="secondary"
        loading={loading}
        onPress={() => {
          void load();
        }}
      />
      {loading && items.length === 0 ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : items.length === 0 ? (
        <Text style={styles.muted}>No notifications yet.</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable key={item.id} style={styles.row}>
              <Text style={styles.title}>
                {item.type.replace(/_/g, " ")}
              </Text>
              <Text style={styles.body}>
                {item.state === "read" ? "Read" : "Unread"} ·{" "}
                {item.domainEntityType.replace(/_/g, " ")}
              </Text>
              <Text style={styles.meta}>{formatWhen(item.createdAt)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <PrimaryButton label="Done" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: colors.midGrey,
    fontSize: 15,
    marginTop: spacing.lg,
  },
  list: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  title: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  body: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    color: colors.midGrey,
    fontSize: 12,
  },
});
