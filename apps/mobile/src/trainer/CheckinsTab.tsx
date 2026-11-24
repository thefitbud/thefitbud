import { useCallback, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type {
  TrainerCheckinInboxItem,
  TrainerCheckinInboxSegment,
} from "@fitbud/contracts";
import { deviceTimeZone, formatCivilDate } from "@fitbud/core";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Snackbar } from "../components/Snackbar";
import { createIdempotencyKey } from "../lib/idempotency";
import { localDateInTimezone } from "../lib/dates";
import { reportError } from "../lib/reportError";
import { scheduleUndoable, type UndoableAction } from "./attentionCards";
import { CheckinsList } from "./checkinsList/List";
import {
  buildCheckinListModel,
  type CheckinListRow,
  type CheckinListSegment,
} from "./checkinsList/model";
import {
  clientMetaFromWorkspaceHeader,
  readClientMeta,
  readTrainerCache,
  trainerCacheEpoch,
  writeClientMeta,
  writeTrainerCache,
} from "./cache";
import { UpdatingLine, useRefreshWhenActive } from "./keptTab";
import { usePagedList } from "./usePagedList";
import { openContextualWhatsApp } from "./whatsapp";
import { createThemedStyles } from "../providers/ThemeProvider";

/**
 * The first page of To review and Overdue (Z14-3). `inbox` holds both lists
 * (a row's own status says which); later pages and Reviewed are not cached.
 */
type CheckinsSnapshot = {
  inbox: TrainerCheckinInboxItem[];
  cursors?: { to_review: string | null; overdue: string | null };
  savedAt: string;
};

/** D-W14-26: 30 per page, the next one at half a screen from the end. */
const PAGE_SIZE = 30;

function isOfflineError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiClientError) return err.status === 0;
  return false;
}

function inboxKey(item: TrainerCheckinInboxItem): string {
  return item.checkin.id;
}

const CACHE_KEY = "trainer:checkins";

type Props = {
  /** False while another tab is showing; the tab stays mounted (Z14-3). */
  active?: boolean;
  /** Bumped when a detail screen closes: refresh underneath whatever the age. */
  returnNonce?: number;
  onReviewCheckin: (item: TrainerCheckinInboxItem) => void;
  /** Avatar tap on a row: opens the client's profile (Z14-19). */
  onOpenClient?: (relationshipId: string) => void;
};

export function CheckinsTab({
  active = true,
  returnNonce = 0,
  onReviewCheckin,
  onOpenClient,
}: Props) {

  const styles = useStyles();
  const { api, refreshSession } = useAuth();
  const trainerZone = deviceTimeZone();
  // Z14-3: paint the last inbox at once, refresh underneath.
  const [initialSnapshot] = useState(() =>
    readTrainerCache<CheckinsSnapshot>(CACHE_KEY),
  );
  const lastLoadedAt = useRef(0);
  const [segment, setSegment] = useState<CheckinListSegment>("to_review");
  // Reviewed loads the first time it is opened, not before.
  const [reviewedOpened, setReviewedOpened] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [heldIds, setHeldIds] = useState<ReadonlySet<string>>(new Set());
  const undoRef = useRef<UndoableAction | null>(null);
  const heldRowRef = useRef<CheckinListRow | null>(null);
  // The two snapshot halves are written together once both first pages are in.
  const firstPages = useRef<{
    to_review?: { items: TrainerCheckinInboxItem[]; nextCursor: string | null };
    overdue?: { items: TrainerCheckinInboxItem[]; nextCursor: string | null };
  }>({});

  const fetchSegment = useCallback(
    (which: TrainerCheckinInboxSegment) =>
      async (cursor: string | null) => {
        const cacheEpoch = trainerCacheEpoch();
        const page = await api.listTrainerCheckinInbox({
          segment: which,
          limit: PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        });
        if (cursor === null && which !== "reviewed") {
          lastLoadedAt.current = Date.now();
          firstPages.current[which] = {
            items: page.items,
            nextCursor: page.nextCursor,
          };
          const { to_review, overdue } = firstPages.current;
          if (to_review && overdue) {
            writeTrainerCache(
              CACHE_KEY,
              {
                inbox: [...to_review.items, ...overdue.items],
                cursors: {
                  to_review: to_review.nextCursor,
                  overdue: overdue.nextCursor,
                },
                savedAt: new Date().toISOString(),
              } satisfies CheckinsSnapshot,
              cacheEpoch,
            );
            firstPages.current = {};
          }
        }
        return { items: page.items, nextCursor: page.nextCursor };
      },
    [api],
  );
  const fetchToReview = useMemo(() => fetchSegment("to_review"), [fetchSegment]);
  const fetchOverdue = useMemo(() => fetchSegment("overdue"), [fetchSegment]);
  const fetchReviewed = useMemo(() => fetchSegment("reviewed"), [fetchSegment]);

  const [firstError, setFirstError] = useState<string | null>(null);
  const onPageError = useCallback(
    (which: string) => (err: unknown, phase: "first" | "more") => {
      if (phase === "first") {
        setFirstError(
          userFacingMessage(err, { fallback: "Could not load check-ins." }),
        );
      }
      if (!isOfflineError(err)) reportError(`trainer.checkins.${which}.${phase}`, err);
    },
    [],
  );
  const toReviewList = usePagedList<TrainerCheckinInboxItem>({
    queryKey: "to_review",
    fetchPage: fetchToReview,
    getKey: inboxKey,
    initial: initialSnapshot
      ? {
          items: initialSnapshot.inbox.filter(
            (item) => item.checkin.status === "submitted",
          ),
          nextCursor: initialSnapshot.cursors?.to_review ?? null,
        }
      : null,
    isOffline: isOfflineError,
    onError: onPageError("to_review"),
  });
  const overdueList = usePagedList<TrainerCheckinInboxItem>({
    queryKey: "overdue",
    fetchPage: fetchOverdue,
    getKey: inboxKey,
    initial: initialSnapshot
      ? {
          items: initialSnapshot.inbox.filter(
            (item) => item.checkin.status === "overdue",
          ),
          nextCursor: initialSnapshot.cursors?.overdue ?? null,
        }
      : null,
    isOffline: isOfflineError,
    onError: onPageError("overdue"),
  });
  const reviewedList = usePagedList<TrainerCheckinInboxItem>({
    queryKey: "reviewed",
    fetchPage: fetchReviewed,
    getKey: inboxKey,
    enabled: reviewedOpened,
    isOffline: isOfflineError,
    onError: onPageError("reviewed"),
  });
  const lists = {
    to_review: toReviewList,
    overdue: overdueList,
    reviewed: reviewedList,
  } as const;
  const current = lists[segment];

  const refreshAllQuietly = () => {
    toReviewList.refreshQuietly();
    overdueList.refreshQuietly();
    if (reviewedOpened) reviewedList.refreshQuietly();
  };
  useRefreshWhenActive(active, lastLoadedAt, refreshAllQuietly, returnNonce);

  function selectSegment(next: CheckinListSegment) {
    setSegment(next);
    if (next === "reviewed") {
      if (reviewedOpened) reviewedList.refreshQuietly();
      else setReviewedOpened(true);
    }
  }

  const error = current.error ? firstError : null;

  const today = localDateInTimezone(trainerZone);
  const model = useMemo(() => {
    // Each check-in sits in one segment; a repeat (a row that moved between
    // two reads) counts once.
    const seen = new Set<string>();
    const loaded: TrainerCheckinInboxItem[] = [];
    for (const item of [
      ...toReviewList.items,
      ...overdueList.items,
      ...reviewedList.items,
    ]) {
      if (heldIds.has(item.checkin.id) || seen.has(item.checkin.id)) continue;
      seen.add(item.checkin.id);
      loaded.push(item);
    }
    return buildCheckinListModel(loaded, { trainerZone, today });
  }, [
    toReviewList.items,
    overdueList.items,
    reviewedList.items,
    heldIds,
    trainerZone,
    today,
  ]);

  async function nudge(row: CheckinListRow) {
    // The client header cache has the number once any workspace read stored it.
    let phone: string | null = readClientMeta(row.relationshipId)?.whatsappE164 ?? null;
    if (!phone) {
      try {
        const workspace = await api.getClientWorkspace(row.relationshipId);
        phone = workspace.header.clientWhatsappE164 ?? null;
        writeClientMeta(
          row.relationshipId,
          clientMetaFromWorkspaceHeader(workspace.header),
          trainerCacheEpoch(),
        );
      } catch (err) {
        reportError("trainer.checkins.whatsappLookup", err);
        phone = null;
      }
    }
    await openContextualWhatsApp({
      phoneE164: phone,
      draftText: `Hi ${row.firstName}, your check-in is overdue — can you send it when you can?`,
    });
  }

  function markReviewedFromList(row: CheckinListRow) {
    if (row.item.checkin.status !== "submitted") return;
    undoRef.current?.undo();
    setHeldIds((prev) => new Set([...prev, row.id]));
    heldRowRef.current = row;
    setToast(`${row.firstName}'s check-in reviewed`);
    const action = scheduleUndoable(async () => {
      try {
        await api.recordCheckinReview(
          row.id,
          { outcome: "acknowledged", notes: null },
          createIdempotencyKey(),
        );
        toReviewList.removeWhere((item) => item.checkin.id === row.id);
        // It now belongs under Reviewed: that list reads fresh when opened.
        if (reviewedOpened) reviewedList.refreshQuietly();
        setHeldIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        heldRowRef.current = null;
      } catch (err) {
        reportError("trainer.checkins.markReviewed", err);
        setHeldIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        setToast("Couldn't mark it reviewed. Try again.");
        heldRowRef.current = null;
      } finally {
        undoRef.current = null;
      }
    });
    undoRef.current = action;
  }

  function undoMarkReviewed() {
    if (!undoRef.current?.undo()) return;
    const row = heldRowRef.current;
    if (row) {
      setHeldIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
    heldRowRef.current = null;
    undoRef.current = null;
    setToast(null);
  }

  const overdueHint =
    segment === "overdue" && model.overdue.length === 1
      ? `${model.overdue[0]!.firstName}'s reminders may be paused, so they may not have seen it.`
      : segment === "overdue" && model.overdue.length > 1
        ? "Some clients may have reminders paused."
        : null;

  const loadingFirst = current.loading;
  return (
    <CheckinsList
      testID="checkins-screen"
      loading={loadingFirst}
      model={model}
      segment={segment}
      onSegmentChange={selectSegment}
      onReview={(row) => onReviewCheckin(row.item)}
      onNudge={(row) => void nudge(row)}
      onOpenClient={onOpenClient}
      onMarkReviewed={markReviewedFromList}
      footerHint={overdueHint}
      moreBySegment={{
        to_review: toReviewList.hasMore,
        overdue: overdueList.hasMore,
      }}
      paging={{
        loadingMore: current.loadingMore,
        failure: current.moreError,
        onRetry: current.retryMore,
        onEndReached: current.loadMore,
      }}
      refreshing={current.refreshing}
      onRefresh={() => {
        void refreshSession?.();
        toReviewList.refresh();
        overdueList.refresh();
        if (reviewedOpened) reviewedList.refresh();
      }}
      header={
        <>
          {Platform.OS === "android" ? null : (
            <Text style={styles.eyebrow}>{formatCivilDate(today)}</Text>
          )}
          <Text style={styles.title} accessibilityRole="header">
            Check-ins
          </Text>
          {error ? <ErrorBanner message={error} /> : null}
          <UpdatingLine visible={current.updating && !current.refreshing} />
        </>
      }
      toast={
        toast ? (
          <Snackbar
            leadingCheck
            message={toast}
            actionLabel={heldRowRef.current ? "Undo" : undefined}
            onAction={heldRowRef.current ? undoMarkReviewed : undefined}
            onDismiss={() => {
              if (!heldRowRef.current) setToast(null);
            }}
          />
        ) : null
      }
    />
  );
}

const useStyles = createThemedStyles((t) => ({
  eyebrow: { color: t.colors.ink3, fontSize: 15, lineHeight: 20 },
  title: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 30,
    letterSpacing: -0.4,
    marginTop: 2,
  },
}));
