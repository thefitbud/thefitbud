import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronRight } from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  AttentionGroupsResponse,
  CoachAsk,
  TrainerCheckinInboxItem,
} from "@fitbud/contracts";
import {
  deviceTimeZone,
  formatCivilDate,
  formatClockTime,
  formatPersonName,
  labelFor,
} from "@fitbud/core";
import {
  colors,
  fontFamilyMedium,
  fontFamilySemiBold,
} from "@fitbud/ui-mobile";
import { stage1Api } from "../lib/stage1Api";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { isNetworkFailure } from "./attention/offline";
import {
  AttentionEmptyState,
  AttentionErrorState,
  AttentionOfflineBanner,
} from "./attention/states";
import { Screen } from "../components/Screen";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import { reportError } from "../lib/reportError";
import { createIdempotencyKey } from "../lib/idempotency";
import { StatusChip } from "../components/StatusChip";
import { SwipeActionRow } from "../components/SwipeActionRow";
import { Snackbar } from "../components/Snackbar";
import { initialsFromName } from "../components/m2";
import {
  acknowledgeAttentionItem,
  acknowledgeAttentionItems,
  ANSWERED_TOAST_MESSAGE,
  clientNameFor,
  restoreAttentionItem,
  ownsPendingAnswer,
  restoreAskAt,
  scheduleUndoable,
  type UndoableAction,
  attentionIssueLine,
  attentionSectionModel,
  ATTENTION_SCREEN_TITLE,
  buildClientAttentionCards,
  markReviewedToastMessage,
  needsYouRowModel,
  partitionAttentionGroups,
  restoreAttentionItems,
  reviewedRowModel,
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
} from "./reviewSheetNav";
import { localDateInTimezone } from "../lib/dates";
import { openContextualWhatsApp } from "./whatsapp";
import { readTrainerCache, writeTrainerCache } from "./cache";

type ReviewSheetState = {
  relationshipId: string;
  traineeDisplayName: string;
  clientWhatsappE164: string | null;
};

type AttentionGroup = AttentionGroupsResponse["groups"][number];
type Segment = "needs_you" | "asked" | "checkins";

type Props = {
  onReviewException: (exceptionId: string) => void;
  onReviewCheckin: (item: TrainerCheckinInboxItem) => void;
  onOpenClients: () => void;
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

const AVATARS = [
  { backgroundColor: "#FDECEF", color: "#A3243F" },
  { backgroundColor: "#E3EEFD", color: "#1E4B9E" },
  { backgroundColor: "#EAF5E4", color: "#2F6B1E" },
  { backgroundColor: "#FFF1DB", color: "#8A4B06" },
  { backgroundColor: "#E9E5FF", color: "#3B23A8" },
  { backgroundColor: "#F1E8FA", color: "#6B2A93" },
] as const;

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

function avatarTone(name: string): (typeof AVATARS)[number] {
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATARS[code % AVATARS.length] ?? AVATARS[0];
}

const CACHE_KEY = "trainer:attention";

export function AttentionTab({
  onReviewException,
  onReviewCheckin,
}: Props) {
  const { api, relationships, refreshSession } = useAuth();
  // The trainer's device zone, falling back to Asia/Kolkata when it cannot be
  // read at all — never UTC (D-W3b-11 (b)). A zone that is present but
  // unresolvable still surfaces a named error from the resolver.
  const trainerZone = deviceTimeZone();
  const s1 = stage1Api(api);
  const [segment, setSegment] = useState<Segment>("needs_you");
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
  const [toast, setToast] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<ReviewedUndoItem[] | null>(null);
  const [reviewSheet, setReviewSheet] = useState<ReviewSheetState | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewActing, setReviewActing] = useState(false);
  const [reviewBrowsing, setReviewBrowsing] = useState(false);
  const [justResolvedIds, setJustResolvedIds] = useState<string[]>([]);
  const [reviewUndoStatus, setReviewUndoStatus] = useState<
    Record<string, "detected" | "active">
  >({});

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setLists(listsFromSnapshot(snapshot));
    setAsks(snapshot.asks);
    setCheckins(snapshot.checkins);
    setClientNames(snapshot.clientNames ?? {});
  }, []);

  const load = useCallback(async () => {
    setError(null);
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
      writeTrainerCache(CACHE_KEY, snapshot);
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
  const reviewedCards = useMemo(
    () => buildClientAttentionCards(lists.reviewed),
    [lists.reviewed],
  );

  const offline = offlineAt != null;
  const todayLabel = formatCivilDate(localDateInTimezone(trainerZone));
  const showEmpty =
    !loading &&
    !loadFailed &&
    segment === "needs_you" &&
    needsYouCards.length === 0 &&
    reviewedCards.length === 0;
  const sections = attentionSectionModel({
    dateLabel: todayLabel,
    needsYouCount: needsYouCards.length,
    reviewedCount: reviewedCards.length,
  });

  const reviewItems = useMemo(() => {
    if (!reviewSheet) return [];
    return reviewSheetItemsForRelationship(
      lists.groups,
      reviewSheet.relationshipId,
    );
  }, [lists.groups, reviewSheet]);

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

  async function nudgeFromSheet() {
    if (!reviewSheet || offline) return;
    const first = formatPersonName(reviewSheet.traineeDisplayName).split(
      " ",
    )[0];
    await openContextualWhatsApp({
      phoneE164: reviewSheet.clientWhatsappE164,
      draftText: `Hi ${first}, `,
    });
    setToast("Opened WhatsApp");
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

  return (
    <Screen
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
      <Text style={styles.eyebrow}>
        {showEmpty ? todayLabel : sections.subtitle}
      </Text>
      <Text style={styles.screenTitle} accessibilityRole="header">
        {sections.title}
      </Text>

      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.chips}>
        <FilterChip
          label={loadFailed ? "Needs you" : `Needs you ${needsYouCards.length}`}
          selected={segment === "needs_you"}
          onPress={() => setSegment("needs_you")}
        />
        <FilterChip
          label={loadFailed ? "Asked" : `Asked ${asks.length}`}
          selected={segment === "asked"}
          onPress={() => setSegment("asked")}
        />
        <FilterChip
          label={loadFailed ? "Check-ins" : `Check-ins ${checkins.length}`}
          selected={segment === "checkins"}
          onPress={() => setSegment("checkins")}
        />
      </View>

      {loading && lists.groups.length === 0 ? (
        <View>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}

      {loadFailed && !loading ? (
        <AttentionErrorState
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : null}

      {showEmpty ? <AttentionEmptyState /> : null}

      {segment === "needs_you" && sections.needsYou ? (
        <View style={styles.section}>
          <View style={styles.sectionHead} accessibilityRole="header">
            <Text style={styles.sectionTitle}>{sections.needsYou.title}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{sections.needsYou.count}</Text>
            </View>
            <Text style={styles.sectionHint}>{sections.needsYou.hint}</Text>
          </View>
          <View style={styles.listCard}>
            {needsYouCards.map((card, index) => {
              const projected = lists.needsYou.find(
                (group) => group.relationshipId === card.relationshipId,
              );
              const items = projected?.items ?? [card.primary];
              const row = needsYouRowModel({
                items,
                issue: attentionIssueLine(items),
              });
              return (
                <SwipeActionRow
                  key={card.relationshipId}
                  onMarkReviewed={() => {
                    if (!offline) void acknowledgeCard(card);
                  }}
                >
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <NeedsYouRow
                    card={card}
                    row={row}
                    offline={offline}
                    onPress={() => openReviewSheet(card)}
                  />
                </SwipeActionRow>
              );
            })}
          </View>
        </View>
      ) : null}

      {segment === "needs_you" && sections.reviewed ? (
        <View style={styles.section}>
          <View style={styles.sectionHead} accessibilityRole="header">
            <Text style={styles.sectionTitle}>{sections.reviewed.title}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{sections.reviewed.count}</Text>
            </View>
            <Text style={styles.sectionHint}>{sections.reviewed.hint}</Text>
          </View>
          <View style={styles.listCard}>
            {reviewedCards.map((card, index) => {
              const full =
                lists.groups.find(
                  (group) => group.relationshipId === card.relationshipId,
                ) ??
                lists.reviewed.find(
                  (group) => group.relationshipId === card.relationshipId,
                );
              const projected = lists.reviewed.find(
                (group) => group.relationshipId === card.relationshipId,
              );
              const items = full?.items ?? [card.primary];
              const row = reviewedRowModel({
                items,
                issue: attentionIssueLine(projected?.items ?? items),
                timeZone: trainerZone,
              });
              return (
                <View key={card.relationshipId}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <ReviewedRow
                    card={card}
                    row={row}
                    offline={offline}
                    onPress={() => openReviewSheet(card)}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {segment === "asked"
        ? asks.map((ask) => (
            <View key={ask.id} style={styles.askedCard}>
              <Text style={styles.name}>
                {clientNameFor(clientNames, ask.relationshipId) ??
                  labelFor("coach_ask_topic", ask.topic)}
              </Text>
              <Text style={styles.issue}>
                {ask.itemLabel?.trim() || labelFor("coach_ask_topic", ask.topic)}
                {" · Asked you on WhatsApp"}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={offline}
                onPress={() => void answerAsk(ask)}
                style={[styles.review, offline ? styles.disabled : null]}
              >
                <Text style={styles.reviewText}>Mark answered</Text>
              </Pressable>
            </View>
          ))
        : null}

      {segment === "checkins"
        ? checkins.map((item) => (
            <Pressable
              key={item.checkin.id}
              accessibilityRole="button"
              onPress={() => onReviewCheckin(item)}
              style={styles.askedCard}
            >
              <Text style={styles.name}>
                {item.traineeDisplayName
                  ? formatPersonName(item.traineeDisplayName)
                  : labelFor("checkin_status", item.checkin.status)}
              </Text>
              <Text style={styles.issue}>
                {`${labelFor("checkin_status", item.checkin.status)} · ${formatCivilDate(item.checkin.localDate)}`}
              </Text>
            </Pressable>
          ))
        : null}

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
        onNudge={() => {
          void nudgeFromSheet();
        }}
      />
    </Screen>
  );
}

function NeedsYouRow({
  card,
  row,
  offline,
  onPress,
}: {
  card: ClientAttentionCard;
  row: ReturnType<typeof needsYouRowModel>;
  offline: boolean;
  onPress: () => void;
}) {
  const tone = avatarTone(card.traineeDisplayName);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatPersonName(card.traineeDisplayName)}, ${row.issue}`}
      disabled={offline}
      onPress={onPress}
      style={[styles.row, offline ? styles.disabled : null]}
    >
      <View style={[styles.avatar, { backgroundColor: tone.backgroundColor }]}>
        <Text style={[styles.avatarText, { color: tone.color }]}>
          {initialsFromName(card.traineeDisplayName)}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.name}>{formatPersonName(card.traineeDisplayName)}</Text>
        <Text style={styles.issue}>{row.issue}</Text>
        <View style={styles.meta}>
          <StatusChip kind="severity" value={card.primary.severity} />
          {row.openLabel ? (
            <View style={styles.openChip}>
              <Text style={styles.openChipText}>{row.openLabel}</Text>
            </View>
          ) : null}
          <Text style={styles.age}>{row.age}</Text>
        </View>
      </View>
      <ChevronRight color={colors.midGrey} size={18} />
    </Pressable>
  );
}

function ReviewedRow({
  card,
  row,
  offline,
  onPress,
}: {
  card: ClientAttentionCard;
  row: ReturnType<typeof reviewedRowModel>;
  offline: boolean;
  onPress: () => void;
}) {
  const tone = avatarTone(card.traineeDisplayName);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatPersonName(card.traineeDisplayName)}, ${row.chip}, ${row.footer}`}
      disabled={offline}
      onPress={onPress}
      style={[styles.row, offline ? styles.disabled : null]}
    >
      <View style={[styles.avatar, { backgroundColor: tone.backgroundColor }]}>
        <Text style={[styles.avatarText, { color: tone.color }]}>
          {initialsFromName(card.traineeDisplayName)}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.name}>{formatPersonName(card.traineeDisplayName)}</Text>
        <Text style={styles.issue}>{row.issue}</Text>
        <View style={styles.reviewedChip}>
          <Check color="#374151" size={14} strokeWidth={2.25} />
          <Text style={styles.reviewedChipText}>{row.chip}</Text>
        </View>
        <Text style={styles.footer}>{row.footer}</Text>
      </View>
      <ChevronRight color={colors.midGrey} size={18} />
    </Pressable>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipOn : null]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextOn : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SkeletonCard() {
  return <View style={styles.skeleton} accessibilityLabel="Loading" />;
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 20,
  },
  screenTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 30,
    letterSpacing: -0.4,
    marginBottom: 12,
    marginTop: 2,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14,
  },
  chipOn: {
    backgroundColor: "#EDEAFF",
    borderColor: "#EDEAFF",
  },
  chipText: {
    color: colors.deepNavy,
    fontFamily: fontFamilyMedium,
    fontSize: 14,
  },
  chipTextOn: {
    color: colors.indigo,
    fontFamily: fontFamilySemiBold,
  },
  section: {
    marginBottom: 18,
  },
  sectionHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    minHeight: 28,
  },
  sectionTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  countBadge: {
    alignItems: "center",
    backgroundColor: "#EDEAFF",
    borderRadius: 999,
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countText: {
    color: colors.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  sectionHint: {
    color: colors.midGrey,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "right",
  },
  listCard: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: {
    backgroundColor: "#E7E9F2",
    height: 1,
    marginLeft: 66,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarText: {
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  issue: {
    color: colors.nearBlack,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 2,
  },
  meta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  openChip: {
    backgroundColor: "#EDEAFF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openChipText: {
    color: colors.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
  },
  age: {
    color: colors.midGrey,
    fontSize: 13,
  },
  reviewedChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reviewedChipText: {
    color: "#374151",
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
  },
  footer: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  askedCard: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  review: {
    alignItems: "center",
    backgroundColor: "#EDEAFF",
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    marginTop: 12,
  },
  reviewText: {
    color: colors.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  disabled: { opacity: 0.45 },
  skeleton: {
    backgroundColor: "#E7E9F2",
    borderRadius: 20,
    height: 148,
    marginBottom: 12,
  },
});
