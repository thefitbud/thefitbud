import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Bell,
  CalendarCheck,
  ClipboardList,
  MessageCircle,
  Pause,
  RefreshCw,
  Sun,
  Utensils,
  Dumbbell,
  AlertCircle,
  Clock,
  Settings,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { Notification, NotificationType } from "@fitbud/contracts";
import { colors, radii, spacing, touchTargetMin } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { stage1Api } from "../lib/stage1Api";
import {
  formatRelativeTime,
  notificationRowBody,
  notificationRowTitle,
} from "../notifications/copy";
import { MealInlineButtons } from "./notifications/Surfaces";
import {
  deepLinkFromNotification,
  type NotificationDeepLink,
} from "../notifications/routing";
import { getCached, setCached, subscribe } from "./dataCache";

const CACHE_KEY = "notifications:inbox";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type Props = {
  onBack: () => void;
  coachName?: string | null;
  onOpenSettings: () => void;
  onNavigate: (link: NotificationDeepLink) => void;
};

function isToday(iso: string, today: string): boolean {
  return iso.slice(0, 10) === today;
}

function withinRetention(iso: string, now = Date.now()): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= RETENTION_MS;
}

function iconForType(type: NotificationType) {
  switch (type) {
    case "meal_reminder":
      return Utensils;
    case "workout_reminder":
      return Dumbbell;
    case "checkin_reminder":
      return CalendarCheck;
    case "daily_summary":
      return Sun;
    case "activity_nudge":
    case "trainer_note_shared":
    case "coach_answered":
    case "checkin_reviewed":
    case "trainer_ask_coach":
      return MessageCircle;
    case "plan_published":
      return ClipboardList;
    case "reminders_paused":
      return Pause;
    case "relationship_ended":
    case "reactivation_requested":
      return RefreshCw;
    case "subscription_renewal_reminder":
    case "trainer_renewal":
      return Bell;
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
      return ClipboardList;
    case "trainer_critical_digest":
      return AlertCircle;
    case "trainer_meal_times_changed":
      return Clock;
    case "admin_whatsapp_budget":
      return Settings;
    default:
      return Bell;
  }
}

export function NotificationsScreen({
  onBack,
  coachName,
  onOpenSettings,
  onNavigate,
}: Props) {
  const { api, refreshSession } = useAuth();
  const s1 = stage1Api(api);
  const [items, setItems] = useState<Notification[]>(
    () => getCached<Notification[]>(CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState(items.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!opts?.soft) setLoading(true);
      setError(null);
      try {
        const page = await api.listNotifications();
        const filtered = page.items.filter((item) =>
          withinRetention(item.createdAt),
        );
        setItems(filtered);
        setCached(CACHE_KEY, filtered);
        setOffline(false);
      } catch (err) {
        setOffline(true);
        const cached = getCached<Notification[]>(CACHE_KEY);
        if (cached && cached.length > 0) {
          setItems(cached.filter((item) => withinRetention(item.createdAt)));
        } else {
          setError(
            err instanceof ApiClientError
              ? err.message
              : "Could not load notifications.",
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe(CACHE_KEY, () => {
      const next = getCached<Notification[]>(CACHE_KEY);
      if (next) setItems(next.filter((item) => withinRetention(item.createdAt)));
    });
  }, []);

  const retained = useMemo(
    () => items.filter((item) => withinRetention(item.createdAt)),
    [items],
  );

  const { todayItems, earlierItems } = useMemo(() => {
    const todayRows: Notification[] = [];
    const earlier: Notification[] = [];
    for (const item of retained) {
      if (isToday(item.createdAt, today)) todayRows.push(item);
      else earlier.push(item);
    }
    return { todayItems: todayRows, earlierItems: earlier };
  }, [retained, today]);

  async function openItem(item: Notification) {
    if (item.readAt == null) {
      try {
        await s1.markNotificationRead(item.id);
        setItems((prev) => {
          const next = prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  state: "read" as const,
                  readAt: new Date().toISOString(),
                }
              : row,
          );
          setCached(CACHE_KEY, next);
          return next;
        });
      } catch {
        // Still navigate if mark-read fails offline.
      }
    }
    const link = deepLinkFromNotification(item);
    if (link) onNavigate(link);
  }

  async function markAllRead() {
    const unread = retained.filter((item) => item.readAt == null);
    for (const item of unread) {
      try {
        await s1.markNotificationRead(item.id);
      } catch {
        break;
      }
    }
    setItems((prev) => {
      const next = prev.map((row) =>
        row.readAt == null
          ? {
              ...row,
              state: "read" as const,
              readAt: new Date().toISOString(),
            }
          : row,
      );
      setCached(CACHE_KEY, next);
      return next;
    });
    await load({ soft: true });
  }

  function renderSection(title: string, rows: Notification[]) {
    if (rows.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {rows.map((item) => {
          const Icon = iconForType(item.type);
          const title = notificationRowTitle(item, { coachName });
          const body = notificationRowBody(item, { coachName });
          const inner = (
            <>
              <View style={styles.rowTop}>
                <Icon size={20} color={colors.indigo} strokeWidth={2} />
                <Text style={styles.title}>{title}</Text>
                {item.readAt == null ? <View style={styles.dot} /> : null}
              </View>
              <Text style={styles.body}>{body}</Text>
              <Text style={styles.meta}>
                {formatRelativeTime(item.createdAt)}
              </Text>
            </>
          );
          if (item.type === "meal_reminder") {
            return (
              <View
                key={item.id}
                style={[styles.row, item.readAt == null ? styles.unread : null]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={title}
                  onPress={() => {
                    void openItem(item);
                  }}
                >
                  {inner}
                </Pressable>
                <MealInlineButtons
                  mealId={item.domainEntityId}
                  title={title}
                  body={body}
                  onOpen={() => {
                    void openItem(item);
                  }}
                  onSnoozed={setToast}
                />
              </View>
            );
          }
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={title}
              style={[styles.row, item.readAt == null ? styles.unread : null]}
              onPress={() => {
                void openItem(item);
              }}
            >
              {inner}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <Screen
      chrome="app"
      title="Notifications"
      subtitle="Reminders and coach updates"
      refreshing={refreshing || loading}
      onRefresh={() => {
        setRefreshing(true);
        void refreshSession?.();
        void load({ soft: true });
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {toast ? <Text accessibilityLiveRegion="polite">{toast}</Text> : null}
      {offline ? (
        <Text style={styles.offline}>Showing saved notifications</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mark all read"
        style={styles.markAll}
        disabled={retained.every((item) => item.readAt != null)}
        onPress={() => {
          void markAllRead();
        }}
      >
        <Text
          style={[
            styles.markAllLabel,
            retained.every((item) => item.readAt != null)
              ? styles.markAllDisabled
              : null,
          ]}
        >
          Mark all read
        </Text>
      </Pressable>

      {loading && retained.length === 0 ? (
        <Text style={styles.muted} accessibilityLabel="Loading notifications">
          Loading…
        </Text>
      ) : retained.length === 0 ? (
        <Text style={styles.empty}>No notifications yet.</Text>
      ) : (
        <View style={styles.list}>
          {renderSection("Today", todayItems)}
          {renderSection("Earlier", earlierItems)}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notification settings"
        style={styles.settingsLink}
        onPress={onOpenSettings}
      >
        <Text style={styles.settingsLabel}>Notification settings</Text>
      </Pressable>
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
  empty: {
    color: colors.midGrey,
    fontSize: 16,
    marginTop: spacing.xl,
  },
  offline: {
    color: colors.midGrey,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  markAll: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: touchTargetMin,
    marginBottom: spacing.sm,
  },
  markAllLabel: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  markAllDisabled: {
    color: colors.midGrey,
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
    borderRadius: radii.card,
    gap: spacing.xs,
    minHeight: touchTargetMin,
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
  settingsLink: {
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: touchTargetMin,
  },
  settingsLabel: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
});
