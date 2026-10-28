import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight, Ellipsis, CircleCheck } from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  AttentionGroupsResponse,
  CoachAsk,
  TrainerCheckinInboxItem,
} from "@fitbud/contracts";
import {
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
import { Screen } from "../components/Screen";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import { createIdempotencyKey } from "../lib/idempotency";
import { StatusChip } from "../components/StatusChip";
import { SwipeActionRow } from "../components/SwipeActionRow";
import { Snackbar } from "../components/Snackbar";
import { initialsFromName } from "../components/m2";
import {
  acknowledgeAttentionItem,
  attentionIssueLine,
  attentionItemStatus,
  buildClientAttentionCards,
  formatAttentionAge,
  partialReviewLine,
  partitionAttentionGroups,
  restoreAttentionItem,
  reviewedStillOpenSummary,
  type AttentionLists,
  type ClientAttentionCard,
} from "./attentionCards";
import { localDateInTimezone } from "../lib/dates";
import { openContextualWhatsApp } from "./whatsapp";
import { readTrainerCache, writeTrainerCache } from "./cache";

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

function isOfflineError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiClientError) {
    return err.status === 0 || err.code === "NETWORK_ERROR";
  }
  return err instanceof Error && /fetch|network|offline/i.test(err.message);
}

export function AttentionTab({
  onReviewException,
  onReviewCheckin,
  onOpenClients,
}: Props) {
  const { api, relationships, refreshSession } = useAuth();
  const s1 = stage1Api(api);
  const [segment, setSegment] = useState<Segment>("needs_you");
  const [lists, setLists] = useState<AttentionLists>(EMPTY_LISTS);
  const [asks, setAsks] = useState<CoachAsk[]>([]);
  const [checkins, setCheckins] = useState<TrainerCheckinInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<{
    id: string;
    status: "detected" | "active";
  } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reviewedOpen, setReviewedOpen] = useState(false);

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setLists(listsFromSnapshot(snapshot));
    setAsks(snapshot.asks);
    setCheckins(snapshot.checkins);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [attentionGroups, coachAsks, inbox] = await Promise.all([
        s1.getAttentionGroups(),
        s1.listCoachAsks({ status: "open" }),
        api.listTrainerCheckinInbox(),
      ]);
      const nextCheckins = inbox.items.filter(
        (item: TrainerCheckinInboxItem) => item.checkin.status === "submitted",
      );
      const snapshot: Snapshot = {
        groups: attentionGroups.groups,
        needsYou: attentionGroups.needsYou,
        reviewed: attentionGroups.reviewed,
        asks: coachAsks.items,
        checkins: nextCheckins,
        savedAt: new Date().toISOString(),
      };
      applySnapshot(snapshot);
      writeTrainerCache(CACHE_KEY, snapshot);
      setOfflineAt(null);
    } catch (err) {
      const cached = readTrainerCache<Snapshot>(CACHE_KEY);
      if (isOfflineError(err) && cached) {
        applySnapshot(cached);
        setOfflineAt(cached.savedAt);
        setError(null);
      } else if (isOfflineError(err)) {
        setOfflineAt(new Date().toISOString());
        setError(null);
      } else {
        setError("Couldn't load. Pull to try again.");
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

  async function acknowledgeCard(card: ClientAttentionCard) {
    if (offline) return;
    const id = card.primary.id;
    const previous = attentionItemStatus(lists.groups, id);
    if (previous !== "detected" && previous !== "active") return;
    const prior = lists;
    setLists(
      partitionAttentionGroups(acknowledgeAttentionItem(lists.groups, id)),
    );
    setUndoTarget({ id, status: previous });
    setToast("Marked reviewed");
    try {
      await api.acknowledgeException(id, {}, createIdempotencyKey());
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
    const target = undoTarget;
    setLists(
      partitionAttentionGroups(
        restoreAttentionItem(lists.groups, target.id, target.status),
      ),
    );
    setUndoTarget(null);
    setToast(null);
    try {
      await api.undoExceptionAcknowledge(target.id, createIdempotencyKey());
    } catch (err) {
      setLists(prior);
      setUndoTarget(target);
      setToast("Marked reviewed");
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load. Pull to try again.",
      );
    }
  }

  async function nudge(card: ClientAttentionCard) {
    if (offline) return;
    const first = formatPersonName(card.traineeDisplayName).split(" ")[0];
    await openContextualWhatsApp({
      phoneE164: card.clientWhatsappE164,
      draftText: `Hi ${first}, `,
    });
    setToast("Opened WhatsApp");
  }

  async function answerAsk(ask: CoachAsk) {
    if (offline) return;
    try {
      await (
        s1.answerCoachAsk as unknown as (
          id: string,
          body: { note?: string | null },
          idempotencyKey: string,
        ) => Promise<CoachAsk>
      )(ask.id, { note: null }, createIdempotencyKey());
      setAsks((current) => current.filter((item) => item.id !== ask.id));
      setToast("Marked answered");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load. Pull to try again.",
      );
    }
  }

  const todayLabel = formatCivilDate(localDateInTimezone("Asia/Kolkata"));

  return (
    <Screen
      title="Attention"
      subtitle={`${todayLabel} · sorted by severity, then age`}
      chrome="app"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void refreshSession?.();
        void load().finally(() => setRefreshing(false));
      }}
    >
      {offline ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>
            You're offline. Showing the last update from{" "}
            {formatClockTime(offlineAt!, "Asia/Kolkata")}.
          </Text>
        </View>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.chips}>
        <FilterChip
          label={`Needs you ${needsYouCards.length}`}
          selected={segment === "needs_you"}
          onPress={() => setSegment("needs_you")}
        />
        <FilterChip
          label={`Asked ${asks.length}`}
          selected={segment === "asked"}
          onPress={() => setSegment("asked")}
        />
        <FilterChip
          label={`Check-ins ${checkins.length}`}
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

      {segment === "needs_you" &&
      !loading &&
      needsYouCards.length === 0 &&
      reviewedCards.length === 0 ? (
        <View style={styles.empty}>
          <CircleCheck color={colors.indigo} size={28} />
          <Text style={styles.emptyTitle}>All caught up.</Text>
        </View>
      ) : null}

      {segment === "needs_you" && needsYouCards.length > 0 ? (
        <View accessibilityLabel="Needs you">
          {reviewedCards.length > 0 ? (
            <View style={styles.sectionLabelRow} accessibilityRole="header">
              <Text style={styles.reviewedTitle}>Needs you</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{needsYouCards.length}</Text>
              </View>
            </View>
          ) : null}
          {needsYouCards.map((card) => {
            const full = lists.groups.find(
              (group) => group.relationshipId === card.relationshipId,
            );
            const projected = lists.needsYou.find(
              (group) => group.relationshipId === card.relationshipId,
            );
            return (
              <SwipeActionRow
                key={card.relationshipId}
                onMarkReviewed={() => {
                  if (!offline) void acknowledgeCard(card);
                }}
                onNudge={() => {
                  if (!offline) void nudge(card);
                }}
              >
                <AttentionClientView
                  card={card}
                  issue={attentionIssueLine(projected?.items ?? [card.primary])}
                  progress={partialReviewLine(full?.items ?? [])}
                  actionLabel="Review"
                  offline={offline}
                  menuOpen={menuFor === card.relationshipId}
                  showMarkReviewed
                  onToggleMenu={() =>
                    setMenuFor((current) =>
                      current === card.relationshipId
                        ? null
                        : card.relationshipId,
                    )
                  }
                  onAction={() => onReviewException(card.primary.id)}
                  onMarkReviewed={() => {
                    setMenuFor(null);
                    void acknowledgeCard(card);
                  }}
                  onNudge={() => {
                    setMenuFor(null);
                    void nudge(card);
                  }}
                  onOpenClient={() => {
                    setMenuFor(null);
                    onOpenClients();
                  }}
                />
              </SwipeActionRow>
            );
          })}
        </View>
      ) : null}

      {segment === "needs_you" && reviewedCards.length > 0 ? (
        <View style={styles.reviewedSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: reviewedOpen }}
            accessibilityLabel={`${labelFor("client_chip", "reviewed_still_open")}, ${reviewedStillOpenSummary(reviewedCards.length)}`}
            onPress={() => setReviewedOpen((open) => !open)}
            style={styles.reviewedHead}
          >
            <ChevronRight
              color={colors.midGrey}
              size={18}
              style={reviewedOpen ? styles.chevronOpen : undefined}
            />
            <Text style={styles.reviewedTitle}>
              {labelFor("client_chip", "reviewed_still_open")}
            </Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{reviewedCards.length}</Text>
            </View>
            <Text style={styles.reviewedSummary}>
              {reviewedStillOpenSummary(reviewedCards.length)}
            </Text>
          </Pressable>
          {reviewedOpen
            ? reviewedCards.map((card) => {
                const projected = lists.reviewed.find(
                  (group) => group.relationshipId === card.relationshipId,
                );
                return (
                  <AttentionClientView
                    key={card.relationshipId}
                    card={card}
                    issue={attentionIssueLine(projected?.items ?? [card.primary])}
                    progress={null}
                    actionLabel="Resolve"
                    offline={offline}
                    menuOpen={menuFor === card.relationshipId}
                    showMarkReviewed={false}
                    onToggleMenu={() =>
                      setMenuFor((current) =>
                        current === card.relationshipId
                          ? null
                          : card.relationshipId,
                      )
                    }
                    onAction={() => onReviewException(card.primary.id)}
                    onNudge={() => {
                      setMenuFor(null);
                      void nudge(card);
                    }}
                    onOpenClient={() => {
                      setMenuFor(null);
                      onOpenClients();
                    }}
                  />
                );
              })
            : null}
        </View>
      ) : null}

      {segment === "asked"
        ? asks.map((ask) => (
            <View key={ask.id} style={styles.card}>
              <Text style={styles.name}>
                {ask.itemLabel?.trim() || labelFor("coach_ask_topic", ask.topic)}
              </Text>
              <Text style={styles.issue}>Asked you on WhatsApp</Text>
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
              style={styles.card}
            >
              <Text style={styles.name}>
                {labelFor("checkin_status", item.checkin.status)}
              </Text>
              <Text style={styles.issue}>
                {formatCivilDate(item.checkin.localDate)}
              </Text>
            </Pressable>
          ))
        : null}

      {toast ? (
        <Snackbar
          message={toast}
          actionLabel={undoTarget ? "Undo" : undefined}
          onAction={
            undoTarget
              ? () => {
                  void undoAcknowledge();
                }
              : undefined
          }
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </Screen>
  );
}

function AttentionClientView({
  card,
  issue,
  progress,
  actionLabel,
  offline,
  menuOpen,
  showMarkReviewed,
  onToggleMenu,
  onAction,
  onMarkReviewed,
  onNudge,
  onOpenClient,
}: {
  card: ClientAttentionCard;
  issue: string;
  progress: string | null;
  actionLabel: string;
  offline: boolean;
  menuOpen: boolean;
  showMarkReviewed: boolean;
  onToggleMenu: () => void;
  onAction: () => void;
  onMarkReviewed?: () => void;
  onNudge: () => void;
  onOpenClient: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {initialsFromName(card.traineeDisplayName)}
          </Text>
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.name}>
            {formatPersonName(card.traineeDisplayName)}
          </Text>
          <Text style={styles.since}>
            {formatAttentionAge(card.primary.ageMinutes)}
          </Text>
        </View>
        {showMarkReviewed ? (
          <StatusChip kind="severity" value={card.primary.severity} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          style={styles.more}
          onPress={onToggleMenu}
        >
          <Ellipsis color={colors.deepNavy} size={18} />
        </Pressable>
      </View>
      {menuOpen ? (
        <View style={styles.menu}>
          {showMarkReviewed && onMarkReviewed ? (
            <MenuItem label="Mark reviewed" onPress={onMarkReviewed} />
          ) : null}
          <MenuItem label="Nudge…" onPress={onNudge} />
          <MenuItem label="Open client" onPress={onOpenClient} />
        </View>
      ) : null}
      <Text style={styles.issue}>{issue}</Text>
      {progress ? <Text style={styles.progress}>{progress}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={offline}
        onPress={onAction}
        style={[styles.review, offline ? styles.disabled : null]}
      >
        <Text style={styles.reviewText}>{actionLabel}</Text>
      </Pressable>
    </View>
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

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuItem}>
      <Text style={styles.menuText}>{label}</Text>
    </Pressable>
  );
}

function SkeletonCard() {
  return <View style={styles.skeleton} accessibilityLabel="Loading" />;
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
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
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  cardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#F3E8E8",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarText: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  nameBlock: { flex: 1 },
  name: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  since: {
    color: colors.midGrey,
    fontSize: 13,
    marginTop: 1,
  },
  more: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  issue: {
    color: colors.nearBlack,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 12,
  },
  progress: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  reviewedSection: {
    marginTop: 4,
    marginBottom: 8,
  },
  sectionLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    minHeight: 32,
  },
  reviewedHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingVertical: 8,
  },
  chevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
  reviewedTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  countBadge: {
    alignItems: "center",
    backgroundColor: "#EDEAFF",
    borderRadius: 999,
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    color: colors.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  reviewedSummary: {
    color: colors.midGrey,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
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
  menu: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  menuItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  menuText: { color: colors.deepNavy, fontSize: 16 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 48 },
  emptyTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
  },
  skeleton: {
    backgroundColor: "#E7E9F2",
    borderRadius: 20,
    height: 148,
    marginBottom: 12,
  },
  offline: {
    backgroundColor: "#F3F1FA",
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
  },
  offlineText: { color: colors.deepNavy, fontSize: 14, lineHeight: 20 },
});
