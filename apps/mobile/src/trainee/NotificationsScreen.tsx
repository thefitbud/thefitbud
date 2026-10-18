import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { Notification } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { stage1Api } from "../lib/stage1Api";
import {
  formatRelativeTime,
  notificationRowBody,
  notificationRowTitle,
  notificationTypeIcon,
} from "../notifications/copy";
import {
  deepLinkFromNotification,
  type NotificationDeepLink,
} from "../notifications/routing";

type Props = {
  onBack: () => void;
  onOpenSettings: () => void;
  onNavigate: (link: NotificationDeepLink) => void;
};

function isToday(iso: string, today: string): boolean {
  return iso.slice(0, 10) === today;
}

export function NotificationsScreen({
  onBack,
  onOpenSettings,
  onNavigate,
}: Props) {
  const { api, refreshSession } = useAuth();
  const s1 = stage1Api(api);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

  const { todayItems, earlierItems } = useMemo(() => {
    const todayRows: Notification[] = [];
    const earlier: Notification[] = [];
    for (const item of items) {
      if (isToday(item.createdAt, today)) todayRows.push(item);
      else earlier.push(item);
    }
    return { todayItems: todayRows, earlierItems: earlier };
  }, [items, today]);

  async function openItem(item: Notification) {
    if (item.readAt == null) {
      try {
        await s1.markNotificationRead(item.id);
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  state: "read" as const,
                  readAt: new Date().toISOString(),
                }
              : row,
          ),
        );
      } catch {
        // Still navigate if mark-read fails offline.
      }
    }
    const link = deepLinkFromNotification(item);
    if (link) onNavigate(link);
  }

  async function markAllRead() {
    for (const item of items) {
      if (item.readAt != null) continue;
      try {
        await s1.markNotificationRead(item.id);
      } catch {
        break;
      }
    }
    await load();
  }

  function renderSection(title: string, rows: Notification[]) {
    if (rows.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {rows.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.row, item.readAt == null ? styles.unread : null]}
            onPress={() => {
              void openItem(item);
            }}
          >
            <View style={styles.rowTop}>
              <Text style={styles.icon}>{notificationTypeIcon(item.type)}</Text>
              <Text style={styles.title}>{notificationRowTitle(item)}</Text>
              {item.readAt == null ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.body}>{notificationRowBody(item)}</Text>
            <Text style={styles.meta}>{formatRelativeTime(item.createdAt)}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <Screen
      title="Notifications"
      subtitle="In-app inbox from FitBud."
      refreshing={loading}
      onRefresh={() => {
        void refreshSession?.();
        void load();
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      <PrimaryButton
        label="Mark all read"
        variant="secondary"
        disabled={items.every((item) => item.readAt != null)}
        onPress={() => {
          void markAllRead();
        }}
      />
      {loading && items.length === 0 ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : items.length === 0 ? (
        <Text style={styles.muted}>No notifications yet.</Text>
      ) : (
        <View style={styles.list}>
          {renderSection("Today", todayItems)}
          {renderSection("Earlier", earlierItems)}
        </View>
      )}
      <PrimaryButton
        label="Notification settings"
        variant="secondary"
        onPress={onOpenSettings}
      />
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
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.deepNavy,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.xs,
    padding: spacing.md,
  },
  unread: {
    borderColor: colors.paleLavender,
    borderWidth: 2,
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  icon: {
    fontSize: 18,
  },
  dot: {
    backgroundColor: colors.indigo,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  title: {
    color: colors.deepNavy,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  body: {
    color: colors.darkGrey,
    fontSize: 14,
  },
  meta: {
    color: colors.midGrey,
    fontSize: 12,
  },
});
