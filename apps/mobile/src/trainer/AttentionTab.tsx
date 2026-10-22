import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ellipsis, CircleCheck } from "lucide-react-native";
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
  attentionIssueLine,
  buildClientAttentionCards,
  formatAttentionAge,
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
  asks: CoachAsk[];
  checkins: TrainerCheckinInboxItem[];
  savedAt: string;
};

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
  const [groups, setGroups] = useState<AttentionGroup[]>([]);
  const [asks, setAsks] = useState<CoachAsk[]>([]);
  const [checkins, setCheckins] = useState<TrainerCheckinInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setGroups(snapshot.groups);
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

  const cards = useMemo(
    () =>
      buildClientAttentionCards(groups).filter(
        (card) => !hidden.has(card.relationshipId),
      ),
    [groups, hidden],
  );

  const offline = offlineAt != null;

  async function acknowledgeCard(card: ClientAttentionCard) {
    if (offline) return;
    const id = card.primary.id;
    setHidden((current) => new Set(current).add(card.relationshipId));
    setUndoId(id);
    setToast("Marked reviewed");
    try {
      await api.acknowledgeException(id, {}, createIdempotencyKey());
    } catch (err) {
      setHidden((current) => {
        const next = new Set(current);
        next.delete(card.relationshipId);
        return next;
      });
      setToast(null);
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
          label={`Needs you ${cards.length || groups.length}`}
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

      {loading && groups.length === 0 ? (
        <View>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}

      {segment === "needs_you" && !loading && cards.length === 0 ? (
        <View style={styles.empty}>
          <CircleCheck color={colors.indigo} size={28} />
          <Text style={styles.emptyTitle}>All caught up.</Text>
        </View>
      ) : null}

      {segment === "needs_you"
        ? cards.map((card) => (
            <SwipeActionRow
              key={card.relationshipId}
              onMarkReviewed={() => {
                if (!offline) void acknowledgeCard(card);
              }}
              onNudge={() => {
                if (!offline) void nudge(card);
              }}
            >
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
                  <StatusChip kind="severity" value={card.primary.severity} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="More"
                    style={styles.more}
                    onPress={() =>
                      setMenuFor((current) =>
                        current === card.relationshipId
                          ? null
                          : card.relationshipId,
                      )
                    }
                  >
                    <Ellipsis color={colors.deepNavy} size={18} />
                  </Pressable>
                </View>
                {menuFor === card.relationshipId ? (
                  <View style={styles.menu}>
                    <MenuItem
                      label="Mark reviewed"
                      onPress={() => {
                        setMenuFor(null);
                        void acknowledgeCard(card);
                      }}
                    />
                    <MenuItem
                      label="Nudge…"
                      onPress={() => {
                        setMenuFor(null);
                        void nudge(card);
                      }}
                    />
                    <MenuItem
                      label="Open client"
                      onPress={() => {
                        setMenuFor(null);
                        onOpenClients();
                      }}
                    />
                  </View>
                ) : null}
                <Text style={styles.issue}>
                  {attentionIssueLine(
                    groups.find(
                      (group) => group.relationshipId === card.relationshipId,
                    )?.items ?? [card.primary],
                  )}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={offline}
                  onPress={() => onReviewException(card.primary.id)}
                  style={[styles.review, offline ? styles.disabled : null]}
                >
                  <Text style={styles.reviewText}>Review</Text>
                </Pressable>
              </View>
            </SwipeActionRow>
          ))
        : null}

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
          actionLabel={undoId ? "Undo" : undefined}
          onAction={
            undoId
              ? () => {
                  setHidden(new Set());
                  setUndoId(null);
                  setToast(null);
                  void load();
                }
              : undefined
          }
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </Screen>
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
