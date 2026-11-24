import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Check,
  ClipboardCheck,
  Eye,
  RefreshCw,
  Trophy,
  UtensilsCrossed,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import { deviceTimeZone, formatLocalDate, formatPersonName } from "@fitbud/core";
import type { ColorTokens } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { stage1Api } from "../lib/stage1Api";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { ClientAvatar } from "./ClientAvatar";
import { createIdempotencyKey } from "../lib/idempotency";
import { reportError } from "../lib/reportError";
import { readTrainerCache, trainerCacheEpoch, writeTrainerCache } from "./cache";
import { UpdatingLine } from "./keptTab";
import { NoteSheet } from "./sheets/NoteSheet";
import { ActivityMealSheet } from "./activity/ActivityMealSheet";
import {
  ClientPickerSheet,
  type ActivityClientOption,
} from "./activity/ClientPickerSheet";
import {
  ACTIVITY_FILTERS,
  activityDayLabel,
  activityTag,
  activityTimeLine,
  emptyFilterCopy,
  firstName,
  lastSevenDaysSince,
  matchesActivityFilter,
  type ActivityEventLike,
  type ActivityFilter,
  type ActivityTagKind,
} from "./activity/model";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

type ActivityFeedEvent = Awaited<
  ReturnType<ReturnType<typeof stage1Api>["getActivityFeed"]>
>["events"][number];

function avatars(c: ColorTokens) {
  return [
    { backgroundColor: c.av1Bg, color: c.av1Fg },
    { backgroundColor: c.av2Bg, color: c.av2Fg },
    { backgroundColor: c.av3Bg, color: c.av3Fg },
    { backgroundColor: c.av4Bg, color: c.av4Fg },
    { backgroundColor: c.av5Bg, color: c.av5Fg },
    { backgroundColor: c.av6Bg, color: c.av6Fg },
  ] as const;
}

function avatarTone(name: string, c: ColorTokens) {
  const list = avatars(c);
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return list[code % list.length] ?? list[0]!;
}

type ActivitySnapshot = {
  events: ActivityFeedEvent[];
  nextCursor: string | null;
  savedAt: string;
};

function activityCacheKey(relationshipId: string | null | undefined): string {
  return `trainer:activity:${relationshipId ?? "all"}`;
}

type Props = {
  /** Optional fixed relationship (client workspace activity). */
  relationshipId?: string;
  clients?: ActivityClientOption[];
  onOpenClient?: (relationshipId: string, displayName: string) => void;
  /** Avatar tap: opens the client's profile on top of this screen (Z14-19). */
  onOpenProfile?: (relationshipId: string) => void;
  onOpenAsk?: (
    askId: string,
    relationshipId: string,
    displayName: string,
  ) => void;
  onOpenSession?: (
    executionId: string,
    relationshipId: string,
    displayName: string,
  ) => void;
  /** Called when the parent Screen pulls to refresh. */
  refreshToken?: number;
};

export function ActivityFeedScreen({
  relationshipId: lockedRid,
  clients = [],
  onOpenClient,
  onOpenProfile,
  onOpenAsk,
  onOpenSession,
  refreshToken = 0,
}: Props) {

  const theme = useTheme();
  const styles = useStyles();
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const zone = deviceTimeZone();
  const today = formatLocalDate(new Date(), zone);
  // Z14-3: paint the last first page at once, refresh underneath.
  const [initialSnapshot] = useState(() =>
    readTrainerCache<ActivitySnapshot>(activityCacheKey(lockedRid)),
  );
  const [events, setEvents] = useState<ActivityFeedEvent[]>(
    initialSnapshot?.events ?? [],
  );
  const [updating, setUpdating] = useState(false);
  const [cursor, setCursor] = useState<string | null>(
    initialSnapshot?.nextCursor ?? null,
  );
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [clientFilter, setClientFilter] = useState<ActivityClientOption | null>(
    null,
  );
  const [loading, setLoading] = useState(initialSnapshot == null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mealEvent, setMealEvent] = useState<ActivityEventLike | null>(null);
  const [noteFor, setNoteFor] = useState<{
    relationshipId: string;
    displayName: string;
  } | null>(null);
  const [noteActing, setNoteActing] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const activeRid = lockedRid ?? clientFilter?.relationshipId;

  const loadReset = useCallback(async () => {
    const cacheEpoch = trainerCacheEpoch();
    const snapshot = readTrainerCache<ActivitySnapshot>(
      activityCacheKey(activeRid),
    );
    if (snapshot) {
      setEvents(snapshot.events);
      setCursor(snapshot.nextCursor);
      setLoading(false);
      setUpdating(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const page = await s1.getActivityFeed({
        limit: 30,
        rid: activeRid,
        since: lastSevenDaysSince(),
      });
      setEvents(page.events);
      setCursor(page.nextCursor);
      writeTrainerCache(
        activityCacheKey(activeRid),
        {
          events: page.events,
          nextCursor: page.nextCursor,
          savedAt: new Date().toISOString(),
        } satisfies ActivitySnapshot,
        cacheEpoch,
      );
    } catch (err) {
      setError(
        userFacingMessage(err, { fallback: "Could not load activity." }),
      );
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, [activeRid, s1]);

  useEffect(() => {
    void loadReset();
  }, [loadReset, refreshToken]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await s1.getActivityFeed({
        limit: 30,
        cursor,
        rid: activeRid,
        since: lastSevenDaysSince(),
      });
      setEvents((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(
        userFacingMessage(err, { fallback: "Could not load activity." }),
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = useMemo(
    () => events.filter((event) => matchesActivityFilter(event, filter)),
    [events, filter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityFeedEvent[]>();
    for (const event of filtered) {
      const day = event.occurredAt.slice(0, 10);
      const bucket = map.get(day) ?? [];
      bucket.push(event);
      map.set(day, bucket);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const empty = emptyFilterCopy({
    filter,
    clientFirstName: clientFilter
      ? firstName(clientFilter.displayName)
      : null,
  });

  async function saveNote(input: { body: string; visibility: "private" | "client" }) {
    if (!noteFor) return;
    setNoteActing(true);
    setNoteError(null);
    try {
      await api.createTrainerNote(
        noteFor.relationshipId,
        {
          body: input.body,
          visibility: input.visibility,
        },
        createIdempotencyKey(),
      );
      setNoteFor(null);
    } catch (err) {
      if (!(err instanceof ApiClientError)) reportError("activity.note", err);
      setNoteError(
        userFacingMessage(err, {
          fallback: "Couldn't save the note. Try again.",
        }),
      );
    } finally {
      setNoteActing(false);
    }
  }

  function openEvent(event: ActivityFeedEvent) {
    const type = event.type.toLowerCase();
    const name = event.traineeDisplayName ?? "Client";
    if (type.includes("meal")) {
      setMealEvent(event);
      return;
    }
    if (type.includes("workout") && onOpenSession) {
      const executionId = event.id.startsWith("workout:")
        ? event.id.slice("workout:".length)
        : null;
      if (executionId) {
        onOpenSession(executionId, event.relationshipId, name);
        return;
      }
    }
    if (
      (type.includes("ask") || type.includes("coach_ask")) &&
      onOpenAsk
    ) {
      const askId = event.id.startsWith("ask:")
        ? event.id.slice("ask:".length)
        : null;
      if (askId) {
        onOpenAsk(askId, event.relationshipId, name);
        return;
      }
    }
    onOpenClient?.(event.relationshipId, name);
  }

  return (
    <View style={styles.wrap}>
      {error ? <ErrorBanner message={error} /> : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {ACTIVITY_FILTERS.map((item) => {
          const selected = filter === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setFilter(item.id)}
              style={[styles.chip, selected ? styles.chipOn : null]}
            >
              <Text
                style={[styles.chipText, selected ? styles.chipTextOn : null]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
        {lockedRid ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filter by client"
            onPress={() => setPickerOpen(true)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>Client</Text>
          </Pressable>
        )}
      </ScrollView>

      <UpdatingLine visible={updating} />

      {clientFilter && !lockedRid ? (
        <View style={styles.clientChipRow}>
          <View style={styles.clientChip}>
            <Text style={styles.clientChipText}>
              {formatPersonName(clientFilter.displayName).split(" ")[0]}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear client filter"
              onPress={() => setClientFilter(null)}
              hitSlop={8}
            >
              <Text style={styles.clientChipX}>×</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {loading && events.length === 0 ? (
        <View style={styles.card}>
          <View style={styles.skel} />
          <View style={styles.skel} />
          <View style={styles.skel} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <ClipboardCheck color={theme.colors.ink} size={26} strokeWidth={2} />
          </View>
          <Text style={styles.emptyTitle}>{empty.title}</Text>
          {empty.body ? <Text style={styles.emptyBody}>{empty.body}</Text> : null}
          {filter !== "all" || clientFilter ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFilter("all");
                setClientFilter(null);
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearText}>Clear filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.feed}>
          {grouped.map(([day, dayEvents]) => (
            <View key={day} style={styles.group}>
              <Text style={styles.day}>
                {activityDayLabel(day, today).toUpperCase()}
              </Text>
              <View style={styles.card}>
                {dayEvents.map((event, index) => (
                  <View key={event.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <EventRow
                      event={event}
                      onPress={() => openEvent(event)}
                      onOpenProfile={
                        onOpenProfile
                          ? () => onOpenProfile(event.relationshipId)
                          : undefined
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
          {cursor ? (
            <Pressable
              accessibilityRole="button"
              disabled={loadingMore}
              onPress={() => void loadMore()}
              style={styles.moreBtn}
            >
              <Text style={styles.moreText}>
                {loadingMore ? "Loading…" : "Load more"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <ClientPickerSheet
        visible={pickerOpen}
        clients={clients}
        selectedId={clientFilter?.relationshipId ?? null}
        onSelect={setClientFilter}
        onDismiss={() => setPickerOpen(false)}
      />

      <ActivityMealSheet
        visible={mealEvent != null}
        event={mealEvent}
        api={api}
        zone={zone}
        onDismiss={() => setMealEvent(null)}
        onOpenClient={() => {
          if (!mealEvent) return;
          const rid = mealEvent.relationshipId;
          const name = mealEvent.traineeDisplayName ?? "Client";
          setMealEvent(null);
          onOpenClient?.(rid, name);
        }}
        onAddNote={() => {
          if (!mealEvent) return;
          setNoteFor({
            relationshipId: mealEvent.relationshipId,
            displayName: mealEvent.traineeDisplayName ?? "Client",
          });
          setMealEvent(null);
        }}
      />

      <NoteSheet
        visible={noteFor != null}
        traineeDisplayName={noteFor?.displayName ?? "Client"}
        acting={noteActing}
        errorMessage={noteError}
        onDismiss={() => {
          setNoteFor(null);
          setNoteError(null);
        }}
        onSave={(input) => void saveNote(input)}
      />
    </View>
  );
}

function EventRow({
  event,
  onPress,
  onOpenProfile,
}: {
  event: ActivityFeedEvent;
  onPress: () => void;
  onOpenProfile?: (() => void) | undefined;
}) {

  const theme = useTheme();
  const styles = useStyles();
  const name = formatPersonName(event.traineeDisplayName ?? "Client");
  const tone = avatarTone(name, theme.colors);
  const tag = activityTag(event);
  return (
    <View style={styles.row}>
      <ClientAvatar
        name={name}
        size={40}
        fontSize={13}
        tone={tone}
        onPress={onOpenProfile}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.body}
      >
        <Text style={styles.summary}>
          <Text style={styles.who}>{firstName(name)}</Text>
          {` · ${event.summary}`}
          {event.kcal != null ? ` · ${event.kcal.toLocaleString("en-IN")} kcal` : ""}
        </Text>
        <View style={styles.foot}>
          <TagPill kind={tag.kind} label={tag.label} />
          <Text style={styles.time}>{activityTimeLine(event)}</Text>
        </View>
      </Pressable>
    </View>
  );
}

function TagPill({ kind, label }: { kind: ActivityTagKind; label: string }) {

  const theme = useTheme();
  const styles = useStyles();
  const tone = tagTone(kind, theme.colors);
  const Icon = tone.Icon;
  return (
    <View style={[styles.tag, { backgroundColor: tone.bg }]}>
      <Icon color={tone.fg} size={12} strokeWidth={2.2} />
      <Text style={[styles.tagText, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

function tagTone(
  kind: ActivityTagKind,
  c: ColorTokens,
): {
  bg: string;
  fg: string;
  Icon: typeof Trophy;
} {
  switch (kind) {
    case "new_best":
      return { bg: c.prTint, fg: c.pr, Icon: Trophy };
    case "ate_out":
      return { bg: c.warnTint, fg: c.warn, Icon: UtensilsCrossed };
    case "as_planned":
      return { bg: c.doneTint, fg: c.done, Icon: UtensilsCrossed };
    case "changed":
      return { bg: c.fill, fg: c.ink2, Icon: RefreshCw };
    case "checkin":
      return { bg: c.infoTint, fg: c.info, Icon: ClipboardCheck };
    case "note_seen":
      return { bg: c.fill, fg: c.ink2, Icon: Eye };
    case "change":
      return { bg: c.fill, fg: c.ink2, Icon: RefreshCw };
    case "ask":
      return { bg: c.brandTint, fg: c.brand, Icon: Check };
    default:
      return { bg: c.fill, fg: c.ink2, Icon: Check };
  }
}

const useStyles = createThemedStyles((t) => ({
  wrap: { gap: 10, marginTop: 4 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: t.colors.ink },
  chipText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  chipTextOn: { color: t.colors.card },
  clientChipRow: { flexDirection: "row" },
  clientChip: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
  },
  clientChipText: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  clientChipX: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    lineHeight: 20,
  },
  feed: { gap: 16 },
  group: { gap: 8 },
  day: {
    color: t.colors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: {
    backgroundColor: t.colors.line,
    height: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarText: { fontFamily: fontFamilySemiBold, fontSize: 13 },
  body: { flex: 1, minWidth: 0 },
  summary: { color: t.colors.ink, fontSize: 15, lineHeight: 21 },
  who: { fontFamily: fontFamilySemiBold },
  foot: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  tag: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { fontFamily: fontFamilySemiBold, fontSize: 12 },
  time: { color: t.colors.ink3, flex: 1, fontSize: 13 },
  empty: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    marginBottom: 4,
    width: 56,
  },
  emptyTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    textAlign: "center",
  },
  emptyBody: {
    color: t.colors.ink3,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  clearBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    marginTop: 8,
    minWidth: 160,
    paddingHorizontal: 20,
  },
  clearText: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  moreBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
  },
  moreText: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  skel: {
    backgroundColor: t.colors.skel1,
    height: 64,
    marginBottom: 1,
  },
}));
