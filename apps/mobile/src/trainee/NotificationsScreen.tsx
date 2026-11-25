import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Pressable, View } from "react-native";
import {
  Bell,
  BellRing,
  CalendarCheck,
  Check,
  ChevronLeft,
  ClipboardCheck,
  Dumbbell,
  MessageCircle,
  Moon,
  Pause,
  Pencil,
  RefreshCw,
  Settings,
  Sun,
  Utensils,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type { Notification, NotificationType } from "@fitbud/contracts";
import { formatCivilDate, formatClockTime } from "@fitbud/core";
import type { ColorToken } from "@fitbud/tokens";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import {
  createThemedStyles,
  useTheme,
  type Theme,
} from "../providers/ThemeProvider";
import { addDays, localDateInTimezone } from "../lib/dates";
import { isZodError, reportError } from "../lib/reportError";
import { stage1Api } from "../lib/stage1Api";
import {
  coachGivenName,
  notificationRowBody,
  notificationRowTitle,
} from "../notifications/copy";
import {
  deepLinkFromNotification,
  type NotificationDeepLink,
} from "../notifications/routing";
import { androidTopInset } from "../screens/auth/authParts";
import { getCached, setCached, subscribe } from "./dataCache";

const CACHE_KEY = "notifications:inbox";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_TZ = "Asia/Kolkata";

/** Screen content top pad cancelled so the custom nav sits at the safe top. */
export const NOTIFICATIONS_CONTENT_TOP_PAD = 24;

/**
 * Page `marginTop` for the inbox: cancel Screen's pad, then add Android's
 * status-bar inset so Back is tappable under the clock (F13 device FAIL).
 */
export function notificationsPageMarginTop(
  inset: number = androidTopInset,
): number {
  return -NOTIFICATIONS_CONTENT_TOP_PAD + inset;
}

type Props = {
  onBack: () => void;
  coachName?: string | null;
  /**
   * Kept for the overlay's call site. TR-15a and TR-15b have no settings link
   * (Z12-47); notification settings stay under More → Reminders.
   */
  onOpenSettings?: () => void;
  onNavigate: (link: NotificationDeepLink) => void;
};

function withinRetention(iso: string, now = Date.now()): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= RETENTION_MS;
}

export type InboxSection = {
  key: "today" | "yesterday" | "earlier";
  title: string;
  items: Notification[];
};

/**
 * TR-15a groups: Today, Yesterday, Earlier, by the trainee's civil day in
 * their stored timezone (never the UTC date of the timestamp). Newest first
 * within each group; empty groups are left out.
 */
export function groupInbox(
  items: readonly Notification[],
  today: string,
  timeZone: string,
): InboxSection[] {
  const yesterday = addDays(today, -1);
  const sections: InboxSection[] = [
    { key: "today", title: "Today", items: [] },
    { key: "yesterday", title: "Yesterday", items: [] },
    { key: "earlier", title: "Earlier", items: [] },
  ];
  const sorted = [...items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  for (const item of sorted) {
    const day = localDateInTimezone(timeZone, new Date(item.createdAt));
    const section = day === today ? 0 : day === yesterday ? 1 : 2;
    sections[section]!.items.push(item);
  }
  return sections.filter((section) => section.items.length > 0);
}

/**
 * The time on a row (TR-15a): "10:12 am" today, "Yesterday", a weekday within
 * the last week ("Mon"), else the date ("Sat 7 Nov").
 */
export function inboxTimeLabel(
  iso: string,
  today: string,
  timeZone: string,
  now = new Date(),
): string {
  const day = localDateInTimezone(timeZone, new Date(iso));
  if (day === today) return formatClockTime(iso, timeZone);
  if (day === addDays(today, -1)) return "Yesterday";
  const full = formatCivilDate(day, { now });
  if (day >= addDays(today, -6)) return full.split(" ")[0] ?? full;
  return full;
}

type Tile = { Icon: typeof Bell; fg: ColorToken; bg: ColorToken };

/** Rows that came from the coach use the coach tint (TR-15a, v3 CHANGELOG). */
function tileForType(type: NotificationType): Tile {
  const coach = { fg: "coachInk", bg: "coachTint" } as const;
  const brand = { fg: "brand", bg: "brandTint" } as const;
  const neutral = { fg: "ink2", bg: "fill" } as const;
  switch (type) {
    case "activity_nudge":
      return { Icon: BellRing, ...coach };
    case "trainer_note_shared":
    case "coach_answered":
      return { Icon: MessageCircle, ...coach };
    case "checkin_reviewed":
      return { Icon: ClipboardCheck, ...coach };
    case "plan_published":
    case "coach_log_updated":
      return { Icon: Pencil, ...coach };
    case "reactivation_requested":
      return { Icon: RefreshCw, ...coach };
    case "meal_reminder":
      return { Icon: Utensils, fg: "warn", bg: "warnTint" };
    case "workout_reminder":
      return { Icon: Dumbbell, ...brand };
    case "checkin_reminder":
      return { Icon: CalendarCheck, ...brand };
    case "daily_summary":
      return { Icon: Sun, ...brand };
    case "subscription_renewal_reminder":
    case "trainer_renewal":
    case "trainer_critical_digest":
      return { Icon: Bell, ...brand };
    case "reminders_paused":
      return { Icon: Pause, ...neutral };
    case "relationship_ended":
      return { Icon: RefreshCw, ...neutral };
    case "trainer_ask_coach":
      return { Icon: MessageCircle, ...brand };
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
      return { Icon: ClipboardCheck, ...brand };
    case "trainer_meal_times_changed":
      return { Icon: Moon, ...neutral };
    case "admin_whatsapp_budget":
      return { Icon: Settings, ...neutral };
    default:
      return { Icon: Bell, ...brand };
  }
}

export const INBOX_LOAD_ERROR = "Couldn't load notifications. Try again.";
export const INBOX_READ_ERROR = "Couldn't mark them as read. Try again.";
export const INBOX_PARSE_ERROR =
  "Couldn't read the notifications. Try again.";

/**
 * AGENTS.md "Client error handling": only an ApiClientError's own message is
 * shown as-is; anything else gets a short code and blames no cause it did not
 * check. The caller has already sent the error through `reportError`.
 */
export function inboxErrorCopy(err: unknown, action: "load" | "read"): string {
  if (err instanceof ApiClientError && err.message) return userFacingMessage(err);
  if (isZodError(err)) return INBOX_PARSE_ERROR;
  return action === "load" ? INBOX_LOAD_ERROR : INBOX_READ_ERROR;
}

export function NotificationsScreen({ onBack, coachName, onNavigate }: Props) {
  const { api, me, refreshSession } = useAuth();
  const s1 = stage1Api(api);
  const timeZone = me?.timezone ?? DEFAULT_TZ;
  const copyContext = useMemo(() => ({ coachName }), [coachName]);
  const coachFirst = coachGivenName(coachName) ?? "your coach";
  const [items, setItems] = useState<Notification[]>(
    () => getCached<Notification[]>(CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState(items.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);

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
        reportError("notifications.load", err);
        // A ZodError is a client/server disagreement, not a lost connection.
        const parse = isZodError(err);
        setOffline(!parse);
        const cached = getCached<Notification[]>(CACHE_KEY);
        if (cached && cached.length > 0) {
          setItems(cached.filter((item) => withinRetention(item.createdAt)));
          if (parse) setError(inboxErrorCopy(err, "load"));
        } else {
          setError(inboxErrorCopy(err, "load"));
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
      // Adopt the inbox another writer stored. `load` calls `setCached` on
      // this key, so refetching from the subscriber looped (BT15, D-W4-16;
      // same shape CU24 fixed on the workout tab).
      const next = getCached<Notification[]>(CACHE_KEY);
      if (next)
        setItems(next.filter((item) => withinRetention(item.createdAt)));
    });
  }, []);

  const retained = useMemo(
    () => items.filter((item) => withinRetention(item.createdAt)),
    [items],
  );
  const sections = useMemo(
    () => groupInbox(retained, today, timeZone),
    [retained, today, timeZone],
  );
  const anyUnread = retained.some((item) => item.readAt == null);

  function markReadLocally(ids: ReadonlySet<string>) {
    setItems((prev) => {
      const readAt = new Date().toISOString();
      const next = prev.map((row) =>
        ids.has(row.id) && row.readAt == null
          ? { ...row, state: "read" as const, readAt }
          : row,
      );
      setCached(CACHE_KEY, next);
      return next;
    });
  }

  async function openItem(item: Notification) {
    if (item.readAt == null) {
      try {
        await s1.markNotificationRead(item.id);
        markReadLocally(new Set([item.id]));
      } catch {
        // Still navigate if mark-read fails offline; the row stays unread.
      }
    }
    const link = deepLinkFromNotification(item);
    if (link) onNavigate(link);
  }

  async function markAllRead() {
    const done = new Set<string>();
    let failure: unknown = null;
    for (const item of retained) {
      if (item.readAt != null) continue;
      try {
        await s1.markNotificationRead(item.id);
        done.add(item.id);
      } catch (err) {
        // The rest stay unread and keep their dot.
        failure = err;
        break;
      }
    }
    markReadLocally(done);
    await load({ soft: true });
    if (failure) {
      // After the reload, which clears the banner.
      reportError("notifications.readAll", failure);
      setError(inboxErrorCopy(failure, "read"));
    }
  }

  function renderRow(
    item: Notification,
    index: number,
    theme: Theme,
    styles: InboxStyles,
  ) {
    const unread = item.readAt == null;
    const { Icon, fg, bg } = tileForType(item.type);
    // Server display copy wins where the record carries it, except a coach
    // reminder: its row always reads "Reminder from {Coach}" (D-W14-15), so
    // an old stored "...nudged you" title never shows.
    const title =
      item.type === "activity_nudge"
        ? notificationRowTitle(item, copyContext)
        : (item.title ?? notificationRowTitle(item, copyContext));
    const body = item.body ?? notificationRowBody(item, copyContext);
    const when = inboxTimeLabel(item.createdAt, today, timeZone);
    const alreadyLogged = item.state === "suppressed";
    const label = [
      title,
      alreadyLogged ? "Already logged" : body,
      when,
      unread ? "Unread" : null,
    ]
      .filter(Boolean)
      .join(". ");
    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          void openItem(item);
        }}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={[styles.tile, { backgroundColor: theme.colors[bg] }]}>
          <Icon size={18} color={theme.colors[fg]} strokeWidth={2} />
        </View>
        <View style={[styles.rowMain, index > 0 && styles.rowDivider]}>
          <View style={styles.rowText}>
            <View style={styles.rowTop}>
              <Text variant="bodyStrong" style={styles.rowTitle}>
                {title}
              </Text>
              <Text variant="caption" style={styles.when}>
                {when}
              </Text>
            </View>
            {alreadyLogged ? (
              <View style={styles.okRow}>
                <Check size={14} color={theme.colors.done} strokeWidth={2.4} />
                <Text variant="subhead" tone="done" style={styles.rowBody}>
                  Already logged
                </Text>
              </View>
            ) : body ? (
              <Text variant="subhead" style={styles.rowBody} numberOfLines={2}>
                {body}
              </Text>
            ) : null}
          </View>
          {unread ? (
            <View style={styles.dotSlot}>
              <View style={styles.dot} />
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Screen
      v3
      chrome="app"
      title="Notifications"
      showHeader={false}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void refreshSession?.();
        void load({ soft: true });
      }}
    >
      <WithTheme
        render={(theme, styles) => (
          <View style={styles.page}>
            <View style={styles.nav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={onBack}
                hitSlop={8}
                style={styles.navSide}
              >
                <ChevronLeft
                  size={24}
                  color={theme.colors.brand}
                  strokeWidth={2.2}
                />
              </Pressable>
              <Text
                variant="headline"
                accessibilityRole="header"
                style={styles.navTitle}
              >
                Notifications
              </Text>
              <View style={[styles.navSide, styles.navRight]}>
                {anyUnread ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Read all"
                    onPress={() => {
                      void markAllRead();
                    }}
                    style={styles.navBtn}
                  >
                    <Text
                      variant="body"
                      tone="brand"
                      style={styles.navBtnLabel}
                    >
                      Read all
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {error ? <ErrorBanner message={error} /> : null}
            {offline && retained.length > 0 ? (
              <Text variant="caption" style={styles.offline}>
                Showing saved notifications
              </Text>
            ) : null}

            {loading && retained.length === 0 ? (
              <Text
                variant="subhead"
                style={styles.loading}
                accessibilityLabel="Loading notifications"
              >
                Loading…
              </Text>
            ) : retained.length === 0 ? (
              error ? null : (
                <View style={styles.empty}>
                  <View style={styles.emptyTile}>
                    <Bell
                      size={28}
                      color={theme.colors.brand}
                      strokeWidth={2}
                    />
                  </View>
                  <Text
                    variant="title"
                    style={styles.emptyTitle}
                    accessibilityRole="header"
                  >
                    You’re all caught up
                  </Text>
                  <Text variant="subhead" style={styles.emptyBody}>
                    {`Messages from ${coachFirst}, plan changes and reminders show up here.`}
                  </Text>
                </View>
              )
            ) : (
              <View>
                {sections.map((section) => (
                  <View key={section.key}>
                    <Text
                      variant="label"
                      style={styles.groupLabel}
                      accessibilityRole="header"
                    >
                      {section.title}
                    </Text>
                    <View style={styles.group}>
                      {section.items.map((item, index) =>
                        renderRow(item, index, theme, styles),
                      )}
                    </View>
                  </View>
                ))}
                <Text variant="caption" style={styles.retention}>
                  Notifications are kept for 30 days.
                </Text>
              </View>
            )}
          </View>
        )}
      />
    </Screen>
  );
}

/**
 * The inbox draws inside `<Screen v3>`'s theme scope, so its colours follow
 * the system theme; a hook called above `Screen` would read the light theme.
 */
function WithTheme({
  render,
}: {
  render: (theme: Theme, styles: InboxStyles) => ReactNode;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return <>{render(theme, styles)}</>;
}

type InboxStyles = ReturnType<typeof useStyles>;

const useStyles = createThemedStyles((t) => ({
  page: {
    // Screen pads 24 and 32; TR-15a's content sits 16 from the edges.
    marginHorizontal: -8,
    marginTop: notificationsPageMarginTop(),
  },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
  },
  navSide: {
    justifyContent: "center",
    minHeight: t.touchTarget,
    minWidth: 80,
  },
  navRight: {
    alignItems: "flex-end",
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
  },
  navBtn: {
    justifyContent: "center",
    minHeight: t.touchTarget,
    paddingHorizontal: 8,
  },
  navBtnLabel: {
    fontWeight: "500",
  },
  offline: {
    marginTop: 8,
  },
  loading: {
    marginTop: 24,
  },
  groupLabel: {
    marginBottom: 8,
    marginHorizontal: 4,
    marginTop: 20,
  },
  group: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: t.radii.group,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    overflow: "hidden",
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    minHeight: t.touchTarget,
    paddingLeft: 14,
  },
  rowPressed: {
    backgroundColor: t.colors.fill,
  },
  tile: {
    alignItems: "center",
    borderRadius: 9,
    height: 32,
    justifyContent: "center",
    marginTop: 12,
    width: 32,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    marginLeft: 12,
    paddingBottom: 12,
    paddingRight: 14,
    paddingTop: 12,
  },
  rowDivider: {
    borderTopColor: t.colors.line,
    borderTopWidth: 0.5,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
  },
  rowTitle: {
    flex: 1,
  },
  when: {
    marginTop: 2,
  },
  rowBody: {
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 1,
  },
  okRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 1,
  },
  dotSlot: {
    marginLeft: 8,
    paddingTop: 6,
    width: 8,
  },
  dot: {
    backgroundColor: t.colors.coralStrong,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  retention: {
    marginHorizontal: 2,
    marginTop: 10,
  },
  empty: {
    alignItems: "center",
    marginTop: 140,
    paddingHorizontal: 24,
  },
  emptyTile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 20,
    height: 64,
    justifyContent: "center",
    marginBottom: 16,
    width: 64,
  },
  emptyTitle: {
    fontSize: 19,
    textAlign: "center",
  },
  emptyBody: {
    marginTop: 6,
    maxWidth: 290,
    textAlign: "center",
  },
}));
