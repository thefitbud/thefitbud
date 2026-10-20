import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import {
  Bell,
  CalendarCheck,
  Check,
  ChevronLeft,
  ClipboardList,
  CloudMoon,
  Dumbbell,
  MessageCircle,
  Moon,
  Pause,
  RefreshCw,
  Settings,
  Settings2,
  Sun,
  Utensils,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { Notification, NotificationType } from "@fitbud/contracts";
import { colors, radii, semanticColors, spacing, touchTargetMin } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { addDays, localDateInTimezone } from "../lib/dates";
import { stage1Api } from "../lib/stage1Api";
import {
  formatRelativeTime,
  notificationRowBody,
  notificationRowTitle,
} from "../notifications/copy";
import {
  quietWindow,
  type QuietHoursInput,
} from "../notifications/actions";
import { MealInlineButtons } from "./notifications/Surfaces";
import {
  deepLinkFromNotification,
  type NotificationDeepLink,
} from "../notifications/routing";
import { getCached, setCached, subscribe } from "./dataCache";

const CACHE_KEY = "notifications:inbox";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type Props = {
  coachName?: string;
  onBack: () => void;
  coachName?: string | null;
  onOpenSettings: () => void;
  onNavigate: (link: NotificationDeepLink) => void;
};

type TileTone = "default" | "navy" | "neu" | "info";

function isToday(
  iso: string,
  today: string,
  timeZone = "Asia/Kolkata",
): boolean {
  return localDateInTimezone(timeZone, new Date(iso)) === today;
}

function withinRetention(iso: string, now = Date.now()): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= RETENTION_MS;
}

function coachFirstFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? "Your coach";
}

function displayTitle(notification: Notification, coachFirst: string): string {
  const base = notificationRowTitle(notification);
  if (notification.type === "trainer_note_shared") {
    return `${coachFirst} has a note for you`;
  }
  if (notification.type === "checkin_reviewed") {
    return `${coachFirst} reviewed your check-in`;
  }
  return base;
}

function notificationDetail(
  notification: Notification,
  coachFirst: string,
): string {
  const body = notificationRowBody(notification);
  const short = body.split(".")[0]?.trim() ?? "";
  switch (notification.type) {
    case "checkin_reviewed": {
      // Match review outcome copy — default Acknowledged (most common Save).
      const lower = body.toLowerCase();
      if (lower.includes("follow")) return `${coachFirst} will follow up`;
      if (lower.includes("updating") || lower.includes("adjust")) {
        return `${coachFirst} is updating your plan`;
      }
      return "Acknowledged";
    }
    case "trainer_note_shared":
      return "About your check-in";
    case "plan_published":
      return "See what's new";
    case "workout_reminder":
      return short.length > 48 ? `${short.slice(0, 48)}…` : short;
    case "meal_reminder":
      return short.length > 48 ? `${short.slice(0, 48)}…` : short;
    default:
      return short;
  }
}

function timePrefix(
  iso: string,
  today: string,
  now = new Date(),
  timeZone = "Asia/Kolkata",
): string {
  // Compare trainee-local calendar days — never UTC date from the ISO prefix.
  const day = localDateInTimezone(timeZone, new Date(iso));
  if (day === today) {
    return formatRelativeTime(iso, now);
  }
  const yesterday = addDays(today, -1);
  if (day === yesterday) return "Yesterday";
  const d = new Date(`${day}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  }).format(d);
  if (day.slice(0, 7) === today.slice(0, 7)) return weekday;
  return formatRelativeTime(iso, now);
}

function iconForType(type: NotificationType): {
  Icon: typeof Bell;
  tone: TileTone;
} {
  switch (type) {
    case "meal_reminder":
      return { Icon: Utensils, tone: "default" };
    case "workout_reminder":
      return { Icon: Dumbbell, tone: "neu" };
    case "checkin_reminder":
      return { Icon: CalendarCheck, tone: "info" };
    case "daily_summary":
      return { Icon: Sun, tone: "neu" };
    case "activity_nudge":
      return { Icon: CloudMoon, tone: "neu" };
    case "subscription_renewal_reminder":
    case "trainer_renewal":
      return { Icon: Bell, tone: "default" };
    case "plan_published":
      return { Icon: ClipboardList, tone: "info" };
    case "checkin_reviewed":
      return { Icon: ClipboardList, tone: "info" };
    case "coach_answered":
    case "trainer_note_shared":
    case "trainer_ask_coach":
      return { Icon: MessageCircle, tone: "navy" };
    case "reminders_paused":
      return { Icon: Pause, tone: "neu" };
    case "relationship_ended":
    case "reactivation_requested":
      return { Icon: RefreshCw, tone: "neu" };
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
      return { Icon: ClipboardList, tone: "info" };
    case "trainer_critical_digest":
      return { Icon: Bell, tone: "default" };
    case "trainer_meal_times_changed":
      return { Icon: Moon, tone: "neu" };
    case "admin_whatsapp_budget":
      return { Icon: Settings, tone: "neu" };
    default: {
      const _exhaustive: never = type;
      return { Icon: Bell, tone: "default" };
    }
  }
}

function tileStyle(tone: TileTone) {
  switch (tone) {
    case "navy":
      return styles.tileNavy;
    case "neu":
      return styles.tileNeu;
    case "info":
      return styles.tileInfo;
    default:
      return styles.tileDefault;
  }
}

function iconColor(tone: TileTone) {
  switch (tone) {
    case "navy":
      return colors.white;
    case "neu":
      return colors.midGrey;
    case "info":
      return semanticColors.info.text;
    default:
      return colors.indigo;
  }
}

export function NotificationsScreen({
  onBack,
  coachName = "Your coach",
  onOpenSettings,
  onNavigate,
}: Props) {
  const { api, me, refreshSession } = useAuth();
  const s1 = stage1Api(api);
  const coachFirst = coachFirstFromName(coachName);
  const [items, setItems] = useState<Notification[]>(
    () => getCached<Notification[]>(CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState(items.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [quiet, setQuiet] = useState<QuietHoursInput>(() =>
    quietWindow(me?.timezone ?? "Asia/Kolkata"),
  );
  const today = useMemo(
    () => localDateInTimezone(me?.timezone ?? "Asia/Kolkata"),
    [me?.timezone],
  );

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
    let cancelled = false;
    void api
      .getNotificationPreferences()
      .then((prefs) => {
        if (cancelled) return;
        setQuiet(
          quietWindow(
            me?.timezone ?? "Asia/Kolkata",
            prefs.quietHoursStart,
            prefs.quietHoursEnd,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setQuiet(quietWindow(me?.timezone ?? "Asia/Kolkata"));
      });
    return () => {
      cancelled = true;
    };
  }, [api, me?.timezone]);

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

  const timeZone = me?.timezone ?? "Asia/Kolkata";
  const { todayItems, earlierItems } = useMemo(() => {
    const todayRows: Notification[] = [];
    const earlier: Notification[] = [];
    for (const item of retained) {
      if (isToday(item.createdAt, today, timeZone)) todayRows.push(item);
      else earlier.push(item);
    }
    return { todayItems: todayRows, earlierItems: earlier };
  }, [retained, today, timeZone]);

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

  function renderRow(item: Notification) {
    const unread = item.readAt == null;
    const suppressed = item.state === "suppressed";
    const { Icon, tone } = iconForType(item.type);
    const prefix = timePrefix(
      item.createdAt,
      today,
      new Date(),
      me?.timezone ?? "Asia/Kolkata",
    );
    const detail = notificationDetail(item, coachFirst);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={displayTitle(item, coachFirst)}
        style={[styles.nrow, unread ? styles.nrowUnread : styles.nrowRead]}
        onPress={() => {
          void openItem(item);
        }}
      >
        <View style={[styles.tile, tileStyle(tone)]}>
          <Icon size={19} color={iconColor(tone)} strokeWidth={1.75} />
        </View>
        <View style={styles.nrowBody}>
          <Text style={[styles.nrowTitle, !unread && styles.nrowTitleRead]}>
            {displayTitle(item, coachFirst)}
          </Text>
          {suppressed ? (
            <View style={styles.okRow}>
              <Text style={styles.okPrefix}>{prefix} ·</Text>
              <Check
                size={14}
                color={semanticColors.positive.text}
                strokeWidth={2.4}
              />
              <Text style={styles.okLabel}>Already logged</Text>
            </View>
          ) : (
            <Text style={styles.nrowSub}>
              {prefix} · {detail}
            </Text>
          )}
        </View>
        <View style={styles.nrowTrail}>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
      </Pressable>
    );
  }

  function renderSection(title: string, rows: Notification[]) {
    if (rows.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.listCard}>
          {rows.map((item, index) => (
            <View
              key={item.id}
              style={index > 0 ? styles.nrowBorder : undefined}
            >
              {renderRow(item)}
              {item.type === "meal_reminder" ? (
                <MealInlineButtons
                  mealId={item.domainEntityId}
                  title={displayTitle(item, coachFirst)}
                  body={notificationDetail(item, coachFirst)}
                  quiet={quiet}
                  onOpen={() => {
                    void openItem(item);
                  }}
                  onSnoozed={setToast}
                />
              ) : null}
            </View>
          ))}
        </View>
      </View>
    );
  }

  const allRead = retained.every((item) => item.readAt != null);

  return (
    <Screen
      chrome="app"
      title="Notifications"
      showHeader={false}
      refreshing={refreshing || loading}
      onRefresh={() => {
        setRefreshing(true);
        void refreshSession?.();
        void load({ soft: true });
      }}
    >
      <View style={styles.topnav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Today"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronLeft size={24} color={colors.indigo} strokeWidth={2} />
          <Text style={styles.backLabel}>Today</Text>
        </Pressable>
        <View style={styles.topnavSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark all read"
          disabled={allRead}
          onPress={() => {
            void markAllRead();
          }}
          style={styles.markAllBtn}
        >
          <Text style={[styles.markAllLabel, allRead && styles.markAllDisabled]}>
            Mark all read
          </Text>
        </Pressable>
      </View>

      <Text style={styles.h1} accessibilityRole="header">
        Notifications
      </Text>

      {error ? <ErrorBanner message={error} /> : null}
      {toast ? <Text accessibilityLiveRegion="polite">{toast}</Text> : null}
      {offline ? (
        <Text style={styles.offline}>Showing saved notifications</Text>
      ) : null}

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
        style={styles.footlink}
        onPress={onOpenSettings}
      >
        <Settings2 size={18} color={colors.indigo} strokeWidth={1.75} />
        <Text style={styles.footlinkLabel}>Notification settings</Text>
      </Pressable>
    </Screen>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#1A1248",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  default: { elevation: 1 },
});

const styles = StyleSheet.create({
  topnav: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    justifyContent: "space-between",
    marginHorizontal: -6,
    marginBottom: spacing.xs,
  },
  back: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 44,
    paddingLeft: 2,
  },
  backLabel: {
    color: colors.indigo,
    fontSize: 16,
    fontWeight: "600",
  },
  topnavSpacer: {
    flex: 1,
  },
  markAllBtn: {
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 10,
  },
  markAllLabel: {
    color: colors.indigo,
    fontSize: 16,
    fontWeight: "600",
  },
  markAllDisabled: {
    color: colors.midGrey,
  },
  h1: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.66,
    lineHeight: 36,
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
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
  list: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  listCard: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: "hidden",
    ...cardShadow,
  },
  nrow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  nrowUnread: {
    backgroundColor: "rgba(237, 234, 255, 0.55)",
  },
  nrowRead: {
    backgroundColor: colors.white,
  },
  nrowBorder: {
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
  },
  tile: {
    alignItems: "center",
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  tileDefault: {
    backgroundColor: colors.paleLavender,
  },
  tileNavy: {
    backgroundColor: colors.deepNavy,
  },
  tileNeu: {
    backgroundColor: colors.background,
  },
  tileInfo: {
    backgroundColor: semanticColors.info.fill,
  },
  nrowBody: {
    flex: 1,
    minWidth: 0,
  },
  nrowTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  nrowTitleRead: {
    color: colors.darkGrey,
    fontWeight: "500",
  },
  nrowSub: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 1,
  },
  okRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 1,
  },
  okPrefix: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "500",
  },
  okLabel: {
    color: semanticColors.positive.text,
    fontSize: 14,
    fontWeight: "600",
  },
  nrowTrail: {
    alignItems: "flex-end",
    minWidth: 10,
    paddingTop: 7,
  },
  unreadDot: {
    backgroundColor: colors.indigo,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  footlink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: touchTargetMin,
    paddingVertical: spacing.md,
  },
  footlinkLabel: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
});
