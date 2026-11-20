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
import { ApiClientError } from "@fitbud/api-client";
import { deviceTimeZone, formatLocalDate, formatPersonName } from "@fitbud/core";
import { v3LightColors } from "@fitbud/tokens";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { stage1Api } from "../lib/stage1Api";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { initialsFromName } from "../components/m2";
import { createIdempotencyKey } from "../lib/idempotency";
import { reportError } from "../lib/reportError";
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

type ActivityFeedEvent = Awaited<
  ReturnType<ReturnType<typeof stage1Api>["getActivityFeed"]>
>["events"][number];

const AVATARS = [
  { backgroundColor: v3LightColors.av1Bg, color: v3LightColors.av1Fg },
  { backgroundColor: v3LightColors.av2Bg, color: v3LightColors.av2Fg },
  { backgroundColor: v3LightColors.av3Bg, color: v3LightColors.av3Fg },
  { backgroundColor: v3LightColors.av4Bg, color: v3LightColors.av4Fg },
  { backgroundColor: v3LightColors.av5Bg, color: v3LightColors.av5Fg },
  { backgroundColor: v3LightColors.av6Bg, color: v3LightColors.av6Fg },
] as const;

function avatarTone(name: string) {
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATARS[code % AVATARS.length] ?? AVATARS[0]!;
}

type Props = {
  /** Optional fixed relationship (client workspace activity). */
  relationshipId?: string;
  clients?: ActivityClientOption[];
  onOpenClient?: (relationshipId: string, displayName: string) => void;
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
  onOpenAsk,
  onOpenSession,
  refreshToken = 0,
}: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const zone = deviceTimeZone();
  const today = formatLocalDate(new Date(), zone);
  const [events, setEvents] = useState<ActivityFeedEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [clientFilter, setClientFilter] = useState<ActivityClientOption | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    setError(null);
    try {
      const page = await s1.getActivityFeed({
        limit: 30,
        rid: activeRid,
        since: lastSevenDaysSince(),
      });
      setEvents(page.events);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load activity.",
      );
    } finally {
      setLoading(false);
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
        err instanceof ApiClientError
          ? err.message
          : "Could not load activity.",
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
        err instanceof ApiClientError
          ? err.message
          : "Couldn't save the note. Try again.",
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
            <ClipboardCheck color={v3LightColors.ink} size={26} strokeWidth={2} />
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
                    <EventRow event={event} onPress={() => openEvent(event)} />
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
}: {
  event: ActivityFeedEvent;
  onPress: () => void;
}) {
  const name = formatPersonName(event.traineeDisplayName ?? "Client");
  const tone = avatarTone(name);
  const tag = activityTag(event);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.avatar, { backgroundColor: tone.backgroundColor }]}>
        <Text style={[styles.avatarText, { color: tone.color }]}>
          {initialsFromName(name)}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.summary}>
          <Text style={styles.who}>{firstName(name)}</Text>
          {` · ${event.summary}`}
          {event.kcal != null ? ` · ${event.kcal.toLocaleString("en-IN")} kcal` : ""}
        </Text>
        <View style={styles.foot}>
          <TagPill kind={tag.kind} label={tag.label} />
          <Text style={styles.time}>{activityTimeLine(event)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function TagPill({ kind, label }: { kind: ActivityTagKind; label: string }) {
  const tone = tagTone(kind);
  const Icon = tone.Icon;
  return (
    <View style={[styles.tag, { backgroundColor: tone.bg }]}>
      <Icon color={tone.fg} size={12} strokeWidth={2.2} />
      <Text style={[styles.tagText, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

function tagTone(kind: ActivityTagKind): {
  bg: string;
  fg: string;
  Icon: typeof Trophy;
} {
  switch (kind) {
    case "new_best":
      return { bg: "#FFF1DB", fg: "#8A4B06", Icon: Trophy };
    case "ate_out":
      return { bg: v3LightColors.warnTint, fg: v3LightColors.warn, Icon: UtensilsCrossed };
    case "as_planned":
      return { bg: v3LightColors.doneTint, fg: v3LightColors.done, Icon: UtensilsCrossed };
    case "changed":
      return { bg: v3LightColors.fill, fg: v3LightColors.ink2, Icon: RefreshCw };
    case "checkin":
      return { bg: v3LightColors.infoTint, fg: v3LightColors.info, Icon: ClipboardCheck };
    case "note_seen":
      return { bg: v3LightColors.fill, fg: v3LightColors.ink2, Icon: Eye };
    case "change":
      return { bg: v3LightColors.fill, fg: v3LightColors.ink2, Icon: RefreshCw };
    case "ask":
      return { bg: v3LightColors.brandTint, fg: v3LightColors.brand, Icon: Check };
    default:
      return { bg: v3LightColors.fill, fg: v3LightColors.ink2, Icon: Check };
  }
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: {
    alignItems: "center",
    backgroundColor: v3LightColors.fill,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: v3LightColors.ink },
  chipText: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  chipTextOn: { color: colors.white },
  clientChipRow: { flexDirection: "row" },
  clientChip: {
    alignItems: "center",
    backgroundColor: v3LightColors.brandTint,
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
  },
  clientChipText: {
    color: v3LightColors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  clientChipX: {
    color: v3LightColors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    lineHeight: 20,
  },
  feed: { gap: 16 },
  group: { gap: 8 },
  day: {
    color: colors.midGrey,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: v3LightColors.line,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: {
    backgroundColor: v3LightColors.line,
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
  summary: { color: colors.deepNavy, fontSize: 15, lineHeight: 21 },
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
  time: { color: colors.midGrey, flex: 1, fontSize: 13 },
  empty: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: v3LightColors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: v3LightColors.fill,
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    marginBottom: 4,
    width: 56,
  },
  emptyTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    textAlign: "center",
  },
  emptyBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  clearBtn: {
    alignItems: "center",
    backgroundColor: v3LightColors.brandTint,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    marginTop: 8,
    minWidth: 160,
    paddingHorizontal: 20,
  },
  clearText: {
    color: v3LightColors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  moreBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
  },
  moreText: {
    color: v3LightColors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  skel: {
    backgroundColor: v3LightColors.skel1,
    height: 64,
    marginBottom: 1,
  },
});
