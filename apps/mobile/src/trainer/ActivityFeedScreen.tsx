import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  Pencil,
  RefreshCw,
  Trash2,
  Trophy,
  UtensilsCrossed,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import { isEndedClient } from "./clients";
import { deviceTimeZone, formatLocalDate, formatPersonName } from "@fitbud/core";
import type { ColorTokens } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { stage1Api } from "../lib/stage1Api";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { CardRow, ListScreen, PagedListFooter } from "../components/ListScreen";
import { ClientAvatar, ClientNameLink } from "./ClientAvatar";
import { createIdempotencyKey } from "../lib/idempotency";
import { reportError } from "../lib/reportError";
import { readTrainerCache, trainerCacheEpoch, writeTrainerCache } from "./cache";
import { UpdatingLine } from "./keptTab";
import { usePagedList } from "./usePagedList";
import { NoteSheet } from "./sheets/NoteSheet";
import { ActivityMealSheet } from "./activity/ActivityMealSheet";
import {
  ClientPickerSheet,
  type ActivityClientOption,
  type ClientSearchResult,
} from "./activity/ClientPickerSheet";
import {
  ACTIVITY_FILTERS,
  activityDayLabel,
  activitySentence,
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
>["events"][number] &
  // The hand-written `stage1Api` type predates these (it is not this task's file);
  // the contract carries them (Z14-11, Z14-33).
  Pick<
    ActivityEventLike,
    "entryId" | "mealDate" | "previousKcal" | "previousAteOut" | "unread" | "notificationId"
  >;

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
  /** Title row and segment bar of the Clients tab, scrolling with the feed. */
  header?: ReactNode;
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
};

/** D-W14-26: 30 per page, the next one at half a screen from the end. */
const PAGE_SIZE = 30;
/** With a filter on, keep paging until this many rows match (or the end). */
const MIN_FILTERED_ROWS = 8;

function isOfflineError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiClientError) return err.status === 0;
  return false;
}

type DaySection = { day: string; data: ActivityFeedEvent[] };

export function ActivityFeedScreen({
  relationshipId: lockedRid,
  clients = [],
  header,
  onOpenClient,
  onOpenProfile,
  onOpenAsk,
  onOpenSession,
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
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [clientFilter, setClientFilter] = useState<ActivityClientOption | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mealEvent, setMealEvent] = useState<ActivityEventLike | null>(null);
  const [noteFor, setNoteFor] = useState<{
    relationshipId: string;
    displayName: string;
  } | null>(null);
  // Z14-33: entries whose dot the trainer has cleared by opening them.
  const [seenEntries, setSeenEntries] = useState<ReadonlySet<string>>(new Set());
  const [noteActing, setNoteActing] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const activeRid = lockedRid ?? clientFilter?.relationshipId;

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const cacheEpoch = trainerCacheEpoch();
      const page = await s1.getActivityFeed({
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
        rid: activeRid,
        since: lastSevenDaysSince(),
      });
      if (cursor === null) {
        writeTrainerCache(
          activityCacheKey(activeRid),
          {
            events: page.events,
            nextCursor: page.nextCursor,
            savedAt: new Date().toISOString(),
          } satisfies ActivitySnapshot,
          cacheEpoch,
        );
      }
      return { items: page.events, nextCursor: page.nextCursor };
    },
    [activeRid, s1],
  );

  const paged = usePagedList<ActivityFeedEvent>({
    queryKey: activeRid ?? "all",
    fetchPage,
    getKey: (event) => event.id,
    initial: initialSnapshot
      ? {
          items: initialSnapshot.events,
          nextCursor: initialSnapshot.nextCursor,
        }
      : null,
    isOffline: isOfflineError,
    onError: (err, phase) => {
      if (phase === "first") {
        setLoadError(
          userFacingMessage(err, { fallback: "Could not load activity." }),
        );
      }
      if (!isOfflineError(err)) reportError("activity.load", err);
    },
  });
  const { items: events, loading, refreshing } = paged;
  const shownError = paged.error ? loadError : null;

  const filtered = useMemo(
    () => events.filter((event) => matchesActivityFilter(event, filter)),
    [events, filter],
  );

  // A filter narrows what is loaded; keep paging so a quiet filter still
  // fills the screen (each cursor is asked for once).
  const { hasMore, loadingMore, moreError, loadMore } = paged;
  useEffect(() => {
    if (filter === "all" || loading) return;
    if (filtered.length >= MIN_FILTERED_ROWS || !hasMore) return;
    if (loadingMore || moreError) return;
    loadMore();
  }, [filter, loading, filtered.length, hasMore, loadingMore, moreError, loadMore]);

  const sections = useMemo<DaySection[]>(() => {
    const map = new Map<string, ActivityFeedEvent[]>();
    for (const event of filtered) {
      const day = event.occurredAt.slice(0, 10);
      const bucket = map.get(day) ?? [];
      bucket.push(event);
      map.set(day, bucket);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, data]) => ({ day, data }));
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

  // Z14-33: the picker searches every client on the server, first page only.
  const searchClients = useCallback(
    async (q: string): Promise<ClientSearchResult> => {
      try {
        const page = await api.listClients({ q, limit: 20 });
        return {
          kind: "ok",
          clients: page.items
            .filter((item) => item.relationshipId && !isEndedClient(item))
            .map((item) => ({
              relationshipId: item.relationshipId!,
              displayName: item.traineeDisplayName ?? "Client",
            })),
        };
      } catch (err) {
        if (isOfflineError(err)) return { kind: "offline" };
        reportError("activity.clientSearch", err);
        return { kind: "error" };
      }
    },
    [api],
  );

  function openEvent(event: ActivityFeedEvent) {
    const type = event.type.toLowerCase();
    const name = event.traineeDisplayName ?? "Client";
    if (event.unread && event.entryId) {
      const entryId = event.entryId;
      setSeenEntries((prev) => new Set(prev).add(entryId));
      if (event.notificationId) {
        // The dot is already cleared; a failure only leaves the inbox row unread.
        void s1.markNotificationRead(event.notificationId).catch((err: unknown) => {
          if (!isOfflineError(err)) reportError("activity.markRead", err);
        });
      }
    }
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

  const listHeader = (
    <>
      {header}
      <View style={styles.wrap}>
      {shownError ? <ErrorBanner message={shownError} /> : null}

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

      <UpdatingLine visible={paged.updating && !refreshing} />

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
      </View>
    </>
  );

  const emptyState =
    loading && events.length === 0 ? (
      <View style={styles.card}>
        <View style={styles.skel} />
        <View style={styles.skel} />
        <View style={styles.skel} />
      </View>
    ) : filtered.length === 0 && !hasMore ? (
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
    ) : null;

  return (
    <>
      <ListScreen<ActivityFeedEvent, { day: string }>
        v3
        title="Activity"
        sections={sections}
        keyExtractor={(event) => event.id}
        header={listHeader}
        empty={emptyState}
        listFooter={
          <PagedListFooter
            loadingMore={loadingMore}
            failure={moreError}
            onRetry={paged.retryMore}
          />
        }
        refreshing={refreshing}
        onRefresh={paged.refresh}
        onEndReached={loadMore}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.day}>
              {activityDayLabel(section.day, today).toUpperCase()}
            </Text>
          </View>
        )}
        renderItem={({ item: event, index, section }) => (
          <CardRow
            first={index === 0}
            last={index === section.data.length - 1}
          >
            {index > 0 ? <View style={styles.divider} /> : null}
            <EventRow
              event={event}
              unread={
                event.unread === true &&
                !(event.entryId && seenEntries.has(event.entryId))
              }
              onPress={() => openEvent(event)}
              onOpenProfile={
                onOpenProfile
                  ? () => onOpenProfile(event.relationshipId)
                  : undefined
              }
            />
          </CardRow>
        )}
      />

      <ClientPickerSheet
        visible={pickerOpen}
        clients={clients}
        onSearch={lockedRid ? undefined : searchClients}
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
    </>
  );
}

function EventRow({
  event,
  unread,
  onPress,
  onOpenProfile,
}: {
  event: ActivityFeedEvent;
  unread: boolean;
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
      <View style={styles.body}>
        {onOpenProfile ? (
          // Z14-33: the name is its own link above the sentence, a sibling of
          // the event button (no button inside a button on web).
          <ClientNameLink
            name={name}
            onPress={onOpenProfile}
            style={styles.who}
          >
            {firstName(name)}
          </ClientNameLink>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
        >
          <Text style={styles.summary}>
            {onOpenProfile ? null : <Text style={styles.who}>{`${firstName(name)} · `}</Text>}
            {activitySentence(event)}
          </Text>
          <View style={styles.foot}>
            <TagPill kind={tag.kind} label={tag.label} />
            <Text style={styles.time}>{activityTimeLine(event)}</Text>
          </View>
        </Pressable>
      </View>
      {unread ? (
        <View
          testID="activity-unread-dot"
          accessibilityLabel="Unread"
          style={styles.unreadDot}
        />
      ) : null}
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
    case "edited":
      return { bg: c.fill, fg: c.ink2, Icon: Pencil };
    case "removed":
      return { bg: c.fill, fg: c.ink2, Icon: Trash2 };
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
  dayHeader: { backgroundColor: t.colors.bg, paddingBottom: 8, paddingTop: 16 },
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
  who: { color: t.colors.ink, fontFamily: fontFamilySemiBold, fontSize: 15, lineHeight: 21 },
  unreadDot: {
    backgroundColor: t.colors.ink,
    borderRadius: 4,
    height: 8,
    marginTop: 8,
    width: 8,
  },
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
