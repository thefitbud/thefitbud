import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  AttentionGroupsResponse,
  CoachAsk,
  ExceptionDetail,
  TrainerCheckinInboxItem,
} from "@fitbud/contracts";
import {
  deviceTimeZone,
  formatCivilDate,
  formatClockTime,
} from "@fitbud/core";
import { stage1Api } from "../lib/stage1Api";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { isNetworkFailure } from "./attention/offline";
import {
  AttentionEmptyState,
  AttentionErrorState,
  AttentionOfflineBanner,
} from "./attention/states";
import {
  NeedsYouHeader,
  NeedsYouListSkeleton,
  NeedsYouSections,
  NeedsYouSummaryGrid,
} from "./attention/NeedsYouView";
import {
  buildNeedsYouScreenModel,
  type NeedsYouCardModel,
} from "./attention/needsYouModel";
import { Screen } from "../components/Screen";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import { reportError } from "../lib/reportError";
import { createIdempotencyKey } from "../lib/idempotency";
import { Snackbar } from "../components/Snackbar";
import { isAlreadyResolved, isResolveConflict } from "./sheets/resolveRecovery";
import {
  acknowledgeAttentionItem,
  acknowledgeAttentionItems,
  ANSWERED_TOAST_MESSAGE,
  restoreAttentionItem,
  ownsPendingAnswer,
  restoreAskAt,
  scheduleUndoable,
  type UndoableAction,
  ATTENTION_SCREEN_TITLE,
  buildClientAttentionCards,
  markReviewedToastMessage,
  partitionAttentionGroups,
  restoreAttentionItems,
  unreviewedItemsForRelationship,
  type AttentionLists,
  type ClientAttentionCard,
  type ReviewedUndoItem,
} from "./attentionCards";
import { ReviewSheet } from "./ReviewSheet";
import {
  clampReviewSheetIndex,
  nextReviewClient,
  nextReviewClientName,
  reviewSheetIndexForItem,
  reviewSheetItemsForRelationship,
  withSessionResolved,
} from "./reviewSheetNav";
import { localDateInTimezone } from "../lib/dates";
import { openContextualWhatsApp } from "./whatsapp";
import { readTrainerCache, trainerCacheEpoch, writeTrainerCache } from "./cache";
import { clientStatusApi } from "./clientStatus/api";
import { MoreSheet } from "./sheets/MoreSheet";
import { NoteSheet, type NoteSaveInput } from "./sheets/NoteSheet";
import { NudgeSheet } from "./sheets/NudgeSheet";
import { ResolveSheet, type ResolveOutcome } from "./sheets/ResolveSheet";
import { firstNameOf } from "./sheets/exceptionSheetContent";
import { offlineBannerText } from "./sheets/exceptionStateContent";
import { nudgeTargetFromException } from "./sheets/nudgeContent";

type ReviewSheetState = {
  relationshipId: string;
  traineeDisplayName: string;
  clientWhatsappE164: string | null;
};

type AttentionGroup = AttentionGroupsResponse["groups"][number];
type AttentionGroupItem = AttentionGroup["items"][number];

/** A sheet opened over the review sheet (Z12-51). One at a time. */
type ReviewSubSheet =
  | { kind: "nudge"; detail: ExceptionDetail; clientTimeZone: string | null }
  | { kind: "resolve"; item: AttentionGroupItem }
  | { kind: "more" }
  | { kind: "note" };
type Props = {
  onReviewException: (exceptionId: string) => void;
  onReviewCheckin: (item: TrainerCheckinInboxItem) => void;
  onOpenClients: () => void;
  /** The client's profile (status screen), from the review sheet's ⋯ menu. */
  onOpenClient?: (relationshipId: string) => void;
  /** TM-10 ask detail (Needs you Reply / card). */
  onOpenAsk?: (ask: CoachAsk, displayName: string) => void;
};

type Snapshot = {
  groups: AttentionGroup[];
  needsYou?: AttentionGroup[];
  reviewed?: AttentionGroup[];
  asks: CoachAsk[];
  checkins: TrainerCheckinInboxItem[];
  /** Client names by relationship id, for the Asked cards. */
  clientNames?: Record<string, string>;
  savedAt: string;
};

const EMPTY_LISTS: AttentionLists = { groups: [], needsYou: [], reviewed: [] };

function listsFromSnapshot(snapshot: Snapshot): AttentionLists {
  if (snapshot.needsYou && snapshot.reviewed) {
    return {
      groups: snapshot.groups,
      needsYou: snapshot.needsYou,
      reviewed: snapshot.reviewed,
    };
  }
  return partitionAttentionGroups(snapshot.groups);
}

const CACHE_KEY = "trainer:attention";

export function AttentionTab({
  onReviewException,
  onReviewCheckin,
  onOpenClients,
  onOpenClient,
  onOpenAsk,
}: Props) {
  const { api, me, relationships, refreshSession } = useAuth();
  // The trainer's device zone, falling back to Asia/Kolkata when it cannot be
  // read at all — never UTC (D-W3b-11 (b)). A zone that is present but
  // unresolvable still surfaces a named error from the resolver.
  const trainerZone = deviceTimeZone();
  const s1 = stage1Api(api);
  const [lists, setLists] = useState<AttentionLists>(EMPTY_LISTS);
  const [asks, setAsks] = useState<CoachAsk[]>([]);
  const [checkins, setCheckins] = useState<TrainerCheckinInboxItem[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const pendingAnswer = useRef<{
    ask: CoachAsk;
    index: number;
    action: UndoableAction;
  } | null>(null);
  const [answerUndo, setAnswerUndo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  // No data on screen and the load failed: the frame 45 state with Retry.
  const [loadFailed, setLoadFailed] = useState(false);
  const hasData = useRef(false);
  const [toast, setToastText] = useState<string | null>(null);
  // Each toast request gets its own Snackbar instance. The shared notice queue
  // can drop a toast early (a tap outside it, a cap), and a second request
  // with the same words ("Marked answered" for client B after A's left) would
  // otherwise change no prop and never show, taking its Undo with it (Z12-51).
  const [toastSeq, setToastSeq] = useState(0);
  const setToast = useCallback((next: string | null) => {
    setToastText(next);
    if (next != null) setToastSeq((seq) => seq + 1);
  }, []);
  const [undoTarget, setUndoTarget] = useState<ReviewedUndoItem[] | null>(null);
  const [reviewSheet, setReviewSheet] = useState<ReviewSheetState | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewActing, setReviewActing] = useState(false);
  const [reviewBrowsing, setReviewBrowsing] = useState(false);
  const [justResolvedIds, setJustResolvedIds] = useState<string[]>([]);
  const [reviewUndoStatus, setReviewUndoStatus] = useState<
    Record<string, "detected" | "active">
  >({});
  // Items resolved from the sheet this session: the API drops them from
  // Attention, the sheet keeps them read only (resolved, all-resolved).
  const [sheetResolved, setSheetResolved] = useState<AttentionGroupItem[]>([]);
  const [subSheet, setSubSheet] = useState<ReviewSubSheet | null>(null);
  const [subSheetError, setSubSheetError] = useState<string | null>(null);
  // A toast raised while the review sheet is up draws inside the sheet: the
  // screen's footer is under the sheet's modal there.
  const [sheetToast, setSheetToastText] = useState<string | null>(null);
  // Same per-request key as the main toast, so a repeated line shows again.
  const [sheetToastSeq, setSheetToastSeq] = useState(0);
  const setSheetToast = useCallback((next: string | null) => {
    setSheetToastText(next);
    if (next != null) setSheetToastSeq((seq) => seq + 1);
  }, []);
  // One idempotency key per resolve or note composer session, reused on retry.
  const resolveKeys = useRef<{ ack: string; resolve: string } | null>(null);
  const noteKey = useRef<string | null>(null);

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setLists(listsFromSnapshot(snapshot));
    setAsks(snapshot.asks);
    setCheckins(snapshot.checkins);
    setClientNames(snapshot.clientNames ?? {});
  }, []);

  const load = useCallback(async () => {
    setError(null);
    // Captured before the fetch: if the trainer changes while it is in
    // flight, the late write is dropped (Z12-33).
    const cacheEpoch = trainerCacheEpoch();
    try {
      const [attentionGroups, coachAsks, inbox, directory] = await Promise.all([
        s1.getAttentionGroups(),
        s1.listCoachAsks({ status: "open" }),
        api.listTrainerCheckinInbox(),
        // Names only; the screen still works if the directory cannot load.
        api.listClients({ limit: 50 }).catch((err) => {
          reportError("attention.clientNames", err);
          return null;
        }),
      ]);
      const names: Record<string, string> = {};
      for (const group of attentionGroups.groups) {
        names[group.relationshipId] = group.traineeDisplayName;
      }
      for (const client of directory?.items ?? []) {
        if (client.relationshipId) {
          names[client.relationshipId] = client.traineeDisplayName;
        }
      }
      const nextCheckins = inbox.items.filter(
        (item: TrainerCheckinInboxItem) => item.checkin.status === "submitted",
      );
      const snapshot: Snapshot = {
        groups: attentionGroups.groups,
        needsYou: attentionGroups.needsYou,
        reviewed: attentionGroups.reviewed,
        // A reload while Undo is open must not bring the held ask back.
        asks: coachAsks.items.filter(
          (ask) => ask.id !== pendingAnswer.current?.ask.id,
        ),
        checkins: nextCheckins,
        clientNames: names,
        savedAt: new Date().toISOString(),
      };
      applySnapshot(snapshot);
      hasData.current = true;
      writeTrainerCache(CACHE_KEY, snapshot, cacheEpoch);
      setOfflineAt(null);
      setLoadFailed(false);
    } catch (err) {
      const cached = readTrainerCache<Snapshot>(CACHE_KEY);
      if (isNetworkFailure(err) && cached) {
        // Proven network failure with a cached list: frame 44.
        applySnapshot(cached);
        hasData.current = true;
        setOfflineAt(cached.savedAt);
        setLoadFailed(false);
        setError(null);
      } else {
        // Offline with nothing cached, or any other error, is a failed load:
        // never an empty list and never called "offline" without proof.
        if (!isNetworkFailure(err)) reportError("attention.load", err);
        // The offline line and an error never show together.
        setOfflineAt(null);
        if (hasData.current) {
          setError("Couldn't load. Pull to try again.");
        } else {
          setLoadFailed(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [api, s1, applySnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeHints(
    api,
    relationships.map((item) => item.id),
    () => {
      void load();
    },
  );

  const needsYouCards = useMemo(
    () => buildClientAttentionCards(lists.needsYou),
    [lists.needsYou],
  );

  const offline = offlineAt != null;
  const todayLabel = formatCivilDate(localDateInTimezone(trainerZone));
  const screenModel = useMemo(
    () =>
      buildNeedsYouScreenModel({
        needsYou: lists.needsYou,
        reviewed: lists.reviewed,
        asks,
        checkins,
        clientNames,
        dateLabel: todayLabel,
        offlineClock: offlineAt
          ? formatClockTime(offlineAt, trainerZone)
          : null,
      }),
    [
      lists.needsYou,
      lists.reviewed,
      asks,
      checkins,
      clientNames,
      todayLabel,
      offlineAt,
      trainerZone,
    ],
  );
  const showEmpty =
    !loading && !loadFailed && screenModel.allCaughtUp;

  const reviewItems = useMemo(() => {
    if (!reviewSheet) return [];
    return withSessionResolved(
      reviewSheetItemsForRelationship(lists.groups, reviewSheet.relationshipId),
      sheetResolved,
    );
  }, [lists.groups, reviewSheet, sheetResolved]);

  const safeReviewIndex = clampReviewSheetIndex(reviewIndex, reviewItems.length);

  async function acknowledgeCard(card: ClientAttentionCard) {
    if (offline) return;
    const targets = unreviewedItemsForRelationship(
      lists.groups,
      card.relationshipId,
    );
    if (targets.length === 0) return;
    const prior = lists;
    const next = partitionAttentionGroups(
      acknowledgeAttentionItems(
        lists.groups,
        targets.map((item) => item.id),
      ),
    );
    setLists(next);
    setUndoTarget(targets);
    setToast(
      markReviewedToastMessage(card.traineeDisplayName, next.needsYou.length),
    );
    try {
      for (const target of targets) {
        await api.acknowledgeException(target.id, {}, createIdempotencyKey());
      }
    } catch (err) {
      setLists(prior);
      setUndoTarget(null);
      setToast(null);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load. Pull to try again.",
      );
    }
  }

  async function undoAcknowledge() {
    if (!undoTarget || offline) return;
    const prior = lists;
    const targets = undoTarget;
    const next = partitionAttentionGroups(
      restoreAttentionItems(lists.groups, targets),
    );
    setLists(next);
    setUndoTarget(null);
    setToast(null);
    try {
      for (const target of targets) {
        await api.undoExceptionAcknowledge(target.id, createIdempotencyKey());
      }
    } catch (err) {
      setLists(prior);
      setUndoTarget(targets);
      const name =
        prior.groups.find((group) =>
          group.items.some((item) => item.id === targets[0]?.id),
        )?.traineeDisplayName ?? "Client";
      setToast(markReviewedToastMessage(name, prior.needsYou.length));
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load. Pull to try again.",
      );
    }
  }

  function openReviewSheet(card: ClientAttentionCard) {
    const items = reviewSheetItemsForRelationship(
      lists.groups,
      card.relationshipId,
    );
    if (items.length === 0) {
      onReviewException(card.primary.id);
      return;
    }
    setReviewBrowsing(false);
    setJustResolvedIds([]);
    setReviewUndoStatus({});
    setSheetResolved([]);
    setSubSheet(null);
    setReviewSheet({
      relationshipId: card.relationshipId,
      traineeDisplayName: card.traineeDisplayName,
      clientWhatsappE164: card.clientWhatsappE164,
    });
    setReviewIndex(reviewSheetIndexForItem(items, card.primary.id));
  }

  async function markReviewedInSheet(exceptionId: string) {
    if (!reviewSheet || offline) return;
    const status = lists.groups
      .flatMap((group) => group.items)
      .find((item) => item.id === exceptionId)?.status;
    if (status !== "detected" && status !== "active") return;
    const prior = lists;
    const priorUndo = reviewUndoStatus;
    const priorJust = justResolvedIds;
    const priorBrowsing = reviewBrowsing;
    const next = partitionAttentionGroups(
      acknowledgeAttentionItem(lists.groups, exceptionId),
    );
    setLists(next);
    setReviewUndoStatus((current) => ({ ...current, [exceptionId]: status }));
    setJustResolvedIds((current) =>
      current.includes(exceptionId) ? current : [...current, exceptionId],
    );
    setReviewBrowsing(false);
    setReviewActing(true);
    try {
      await api.acknowledgeException(exceptionId, {}, createIdempotencyKey());
      const items = reviewSheetItemsForRelationship(
        next.groups,
        reviewSheet.relationshipId,
      );
      if (items.length === 0) {
        setReviewSheet(null);
        return;
      }
      setReviewIndex((current) => clampReviewSheetIndex(current, items.length));
    } catch (err) {
      setLists(prior);
      setReviewUndoStatus(priorUndo);
      setJustResolvedIds(priorJust);
      setReviewBrowsing(priorBrowsing);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load. Pull to try again.",
      );
    } finally {
      setReviewActing(false);
    }
  }

  async function undoReviewedInSheet(exceptionId: string) {
    if (!reviewSheet || offline || reviewActing) return;
    const known = reviewUndoStatus[exceptionId] ?? "active";
    const prior = lists;
    const priorJust = justResolvedIds;
    const wasJust = priorJust.includes(exceptionId);
    const next = partitionAttentionGroups(
      restoreAttentionItem(lists.groups, exceptionId, known),
    );
    setLists(next);
    setReviewBrowsing(true);
    setJustResolvedIds((ids) => ids.filter((id) => id !== exceptionId));
    setReviewActing(true);
    try {
      const restored = await api.undoExceptionAcknowledge(
        exceptionId,
        createIdempotencyKey(),
      );
      if (
        (restored.status === "detected" || restored.status === "active") &&
        restored.status !== known
      ) {
        setLists(
          partitionAttentionGroups(
            restoreAttentionItem(next.groups, exceptionId, restored.status),
          ),
        );
      }
    } catch (err) {
      setLists(prior);
      if (wasJust) {
        setJustResolvedIds((ids) =>
          ids.includes(exceptionId) ? ids : [...ids, exceptionId],
        );
      } else {
        setJustResolvedIds(priorJust);
      }
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load. Pull to try again.",
      );
    } finally {
      setReviewActing(false);
    }
  }

  function leaveReviewSheet() {
    setReviewSheet(null);
    setReviewBrowsing(false);
    setJustResolvedIds([]);
    setReviewUndoStatus({});
    setSheetResolved([]);
    setSubSheet(null);
    setSheetToast(null);
  }

  function openNextClient() {
    if (!reviewSheet) return;
    const next = nextReviewClient(needsYouCards, reviewSheet.relationshipId);
    if (!next) {
      leaveReviewSheet();
      return;
    }
    openReviewSheet(next);
  }

  function openSubSheet(next: ReviewSubSheet) {
    setSubSheetError(null);
    if (next.kind === "resolve") resolveKeys.current = null;
    if (next.kind === "note") noteKey.current = null;
    setSubSheet(next);
  }

  function finishResolved(item: AttentionGroupItem, outcome: ResolveOutcome | null) {
    resolveKeys.current = null;
    const resolved: AttentionGroupItem = {
      ...item,
      status: "resolved",
      details: { ...(item.details ?? {}), outcome: outcome ?? undefined },
    };
    setLists((current) =>
      partitionAttentionGroups(
        current.groups.map((group) => ({
          ...group,
          items: group.items.map((entry) =>
            entry.id === item.id ? { ...entry, status: "resolved" as const } : entry,
          ),
        })),
      ),
    );
    setSheetResolved((current) => [
      ...current.filter((entry) => entry.id !== item.id),
      resolved,
    ]);
    setJustResolvedIds((current) =>
      current.includes(item.id) ? current : [...current, item.id],
    );
    setReviewBrowsing(false);
    setSubSheet(null);
  }

  /**
   * Resolve from the sheet (TM-04d). Only the trainer resolves, by this
   * press. The API resolves an acknowledged item only, so an item that is
   * still open is marked reviewed first, as the trainer would on the web.
   * Both calls carry keys reused on a retry.
   */
  async function resolveInSheet(
    item: AttentionGroupItem,
    input: { outcome: ResolveOutcome | null; note: string | null },
  ) {
    if (!reviewSheet || offline) return;
    setReviewActing(true);
    setSubSheetError(null);
    resolveKeys.current ??= {
      ack: createIdempotencyKey(),
      resolve: createIdempotencyKey(),
    };
    const keys = resolveKeys.current;
    try {
      const status = lists.groups
        .flatMap((group) => group.items)
        .find((entry) => entry.id === item.id)?.status;
      if (status === "detected" || status === "active") {
        await api.acknowledgeException(item.id, {}, keys.ack);
        setLists((current) =>
          partitionAttentionGroups(acknowledgeAttentionItem(current.groups, item.id)),
        );
      }
      await api.resolveException(
        item.id,
        {
          note: input.note,
          interventionKind: "resolve",
          ...(input.outcome ? { outcome: input.outcome } : {}),
        },
        keys.resolve,
      );
      finishResolved(item, input.outcome);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setSubSheetError(offlineBannerText(true));
      } else if (
        isResolveConflict(err) &&
        (await isAlreadyResolved((id) => api.getException(id), item.id))
      ) {
        // A lost success: the item is resolved, so this is success, not an error.
        finishResolved(item, input.outcome);
      } else {
        if (!(err instanceof ApiClientError)) reportError("attention.resolve", err);
        setSubSheetError(
          err instanceof ApiClientError
            ? err.message
            : "Could not resolve. (RES-ERR)",
        );
      }
    } finally {
      setReviewActing(false);
    }
  }

  async function saveNoteFromSheet(input: NoteSaveInput) {
    if (!reviewSheet || offline) return;
    setReviewActing(true);
    setSubSheetError(null);
    noteKey.current ??= createIdempotencyKey();
    try {
      await api.createTrainerNote(reviewSheet.relationshipId, input, noteKey.current);
      noteKey.current = null;
      setSubSheet(null);
      setSheetToast(
        input.visibility === "client"
          ? `Shown on ${firstNameOf(reviewSheet.traineeDisplayName) || "your client"}'s Today`
          : "Saved privately",
      );
    } catch (err) {
      if (isNetworkFailure(err)) {
        setSubSheetError(offlineBannerText(true));
      } else {
        if (!(err instanceof ApiClientError)) reportError("attention.note", err);
        setSubSheetError(
          err instanceof ApiClientError
            ? err.message
            : "Could not save note. (NOTE-ERR)",
        );
      }
    } finally {
      setReviewActing(false);
    }
  }

  async function sendAnswer(ask: CoachAsk) {
    await (
      s1.answerCoachAsk as unknown as (
        id: string,
        body: { note?: string | null },
        idempotencyKey: string,
      ) => Promise<CoachAsk>
    )(ask.id, { note: null }, createIdempotencyKey());
  }

  function failAnswer(ask: CoachAsk, index: number, err: unknown) {
    reportError("attention.markAnswered", err);
    if (ownsPendingAnswer(pendingAnswer.current?.ask.id, ask.id)) {
      pendingAnswer.current = null;
      setAnswerUndo(false);
      setToast(null);
    }
    setAsks((current) => restoreAskAt(current, ask, index));
    setError(
      err instanceof ApiClientError
        ? err.message
        : "Couldn't mark answered. Try again.",
    );
  }

  // Mark answered is held for 5 s so Undo needs no server call. A second
  // Mark answered sends the first one now.
  async function answerAsk(ask: CoachAsk) {
    if (offline) return;
    const previous = pendingAnswer.current;
    if (previous) {
      pendingAnswer.current = null;
      void previous.action
        .flush()
        .catch((err) => failAnswer(previous.ask, previous.index, err));
    }
    const index = Math.max(
      0,
      asks.findIndex((item) => item.id === ask.id),
    );
    setAsks((current) => current.filter((item) => item.id !== ask.id));
    const action = scheduleUndoable(async () => {
      try {
        await sendAnswer(ask);
        if (ownsPendingAnswer(pendingAnswer.current?.ask.id, ask.id)) {
          pendingAnswer.current = null;
          setAnswerUndo(false);
          setToast(null);
        }
      } catch (err) {
        failAnswer(ask, index, err);
      }
    });
    pendingAnswer.current = { ask, index, action };
    setAnswerUndo(true);
    setToast(ANSWERED_TOAST_MESSAGE);
  }

  function undoAnswer() {
    const pending = pendingAnswer.current;
    if (!pending || !pending.action.undo()) return;
    pendingAnswer.current = null;
    setAnswerUndo(false);
    setToast(null);
    setAsks((current) => restoreAskAt(current, pending.ask, pending.index));
  }

  // Leaving the screen, or backgrounding the app, sends what is still waiting.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        const pending = pendingAnswer.current;
        if (pending) void pending.action.flush().catch(() => undefined);
      }
    });
    return () => {
      sub.remove();
      const pending = pendingAnswer.current;
      if (pending) void pending.action.flush().catch(() => undefined);
    };
  }, []);

  const markReviewedToast = undoTarget != null && toast != null;

  function handleCardAction(card: NeedsYouCardModel) {
    if (card.source.kind === "exception") {
      openReviewSheet(card.source.card);
      return;
    }
    if (card.source.kind === "ask") {
      const ask = card.source.ask;
      if (onOpenAsk) {
        onOpenAsk(ask, card.name);
        return;
      }
      // Fallback when the shell has not wired TM-10 yet.
      void answerAsk(ask);
      return;
    }
    onReviewCheckin(card.source.item);
  }

  function handleMarkReviewed(card: NeedsYouCardModel) {
    if (card.source.kind === "exception") {
      void acknowledgeCard(card.source.card);
    }
  }

  return (
    <Screen
      v3
      title={ATTENTION_SCREEN_TITLE}
      showHeader={false}
      chrome="app"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void refreshSession?.();
        void load().finally(() => setRefreshing(false));
      }}
      footerVariant={toast ? "toast" : "bar"}
      footer={
        toast ? (
          <Snackbar
            key={toastSeq}
            message={toast}
            leadingCheck={markReviewedToast || answerUndo}
            actionLabel={undoTarget || answerUndo ? "Undo" : undefined}
            onAction={
              undoTarget
                ? () => {
                    void undoAcknowledge();
                  }
                : answerUndo
                  ? undoAnswer
                  : undefined
            }
            onDismiss={
              markReviewedToast || answerUndo ? undefined : () => setToast(null)
            }
          />
        ) : undefined
      }
    >
      {offline ? (
        <AttentionOfflineBanner
          updatedAt={formatClockTime(offlineAt!, trainerZone)}
        />
      ) : null}
      <NeedsYouHeader eyebrow={screenModel.eyebrow} onSearch={onOpenClients} />

      {error ? <ErrorBanner message={error} /> : null}

      {loadFailed && !loading ? (
        <AttentionErrorState
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : null}

      {!loadFailed ? (
        <>
          <NeedsYouSummaryGrid
            tiles={screenModel.tiles}
            loading={loading && lists.groups.length === 0}
          />
          {loading && lists.groups.length === 0 ? (
            <NeedsYouListSkeleton />
          ) : null}
          {!loading ? (
            <NeedsYouSections
              model={screenModel}
              offline={offline}
              emptySlot={showEmpty ? <AttentionEmptyState /> : null}
              onCardAction={handleCardAction}
              onMarkReviewed={handleMarkReviewed}
            />
          ) : null}
        </>
      ) : null}

      <ReviewSheet
        visible={reviewSheet != null && reviewItems.length > 0}
        relationshipId={reviewSheet?.relationshipId ?? null}
        traineeDisplayName={reviewSheet?.traineeDisplayName ?? ""}
        items={reviewItems}
        index={safeReviewIndex}
        offline={offline}
        acting={reviewActing}
        browsingItem={reviewBrowsing}
        justResolvedIds={justResolvedIds}
        nextClientName={
          reviewSheet
            ? nextReviewClientName(needsYouCards, reviewSheet.relationshipId)
            : null
        }
        onChangeIndex={setReviewIndex}
        onBrowseItem={(next) => {
          setReviewBrowsing(true);
          setReviewIndex(next);
        }}
        onShowSummary={() => setReviewBrowsing(false)}
        onDismiss={leaveReviewSheet}
        onMarkReviewed={(exceptionId) => {
          void markReviewedInSheet(exceptionId);
        }}
        onUndo={(exceptionId) => {
          void undoReviewedInSheet(exceptionId);
        }}
        onNextClient={openNextClient}
        onNudge={(detail, clientTimeZone) =>
          openSubSheet({ kind: "nudge", detail, clientTimeZone })
        }
        onResolve={(item) => openSubSheet({ kind: "resolve", item })}
        onMore={() => openSubSheet({ kind: "more" })}
      >
        {reviewSheet ? (
          <>
            <ResolveSheet
              visible={subSheet?.kind === "resolve"}
              detail={
                subSheet?.kind === "resolve"
                  ? { type: subSheet.item.type, details: subSheet.item.details ?? null }
                  : { type: "missed_workout", details: null }
              }
              traineeDisplayName={reviewSheet.traineeDisplayName}
              acting={reviewActing}
              errorMessage={subSheet?.kind === "resolve" ? subSheetError : null}
              onDismiss={() => setSubSheet(null)}
              onConfirm={(input) => {
                if (subSheet?.kind === "resolve") {
                  void resolveInSheet(subSheet.item, input);
                }
              }}
            />
            {subSheet?.kind === "nudge" ? (
              <NudgeSheet
                visible
                target={nudgeTargetFromException(subSheet.detail)}
                traineeDisplayName={reviewSheet.traineeDisplayName}
                clientTimeZone={subSheet.clientTimeZone}
                trainerDisplayName={me?.trainerProfile?.displayName ?? null}
                api={clientStatusApi(api)}
                onDismiss={() => setSubSheet(null)}
                onSent={(line) => {
                  setSubSheet(null);
                  setSheetToast(line);
                }}
              />
            ) : null}
            <MoreSheet
              visible={subSheet?.kind === "more"}
              traineeDisplayName={reviewSheet.traineeDisplayName}
              onDismiss={() => setSubSheet(null)}
              onAddNote={() => openSubSheet({ kind: "note" })}
              onMessageOnWhatsApp={() => {
                // A wa.me chat with no template (TM-04j); the trainer sends it.
                void openContextualWhatsApp({
                  phoneE164: reviewSheet.clientWhatsappE164,
                });
              }}
              onOpenProfile={() => {
                const relationshipId = reviewSheet.relationshipId;
                leaveReviewSheet();
                onOpenClient?.(relationshipId);
              }}
            />
            <NoteSheet
              visible={subSheet?.kind === "note"}
              traineeDisplayName={reviewSheet.traineeDisplayName}
              acting={reviewActing}
              errorMessage={subSheet?.kind === "note" ? subSheetError : null}
              onDismiss={() => setSubSheet(null)}
              onSave={(input) => {
                void saveNoteFromSheet(input);
              }}
            />
            {sheetToast ? (
              <Snackbar
                key={sheetToastSeq}
                message={sheetToast}
                leadingCheck
                onDismiss={() => setSheetToast(null)}
              />
            ) : null}
          </>
        ) : null}
      </ReviewSheet>
    </Screen>
  );
}
