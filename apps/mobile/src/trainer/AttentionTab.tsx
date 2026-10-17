import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  AttentionGroupsResponse,
  CoachAsk,
  TrainerCheckinInboxItem,
} from "@fitbud/contracts";

type AttentionGroup = AttentionGroupsResponse["groups"][number];
import { colors, spacing } from "@fitbud/ui-mobile";
import { stage1Api } from "../lib/stage1Api";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SegmentedControl } from "../components/SegmentedControl";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import { createIdempotencyKey } from "../lib/idempotency";
import { StatusChip } from "../components/StatusChip";
import {
  buildClientAttentionCards,
  formatAttentionAge,
} from "./attentionCards";
import { statusLabel, typeLabel } from "./labels";
import { openContextualWhatsApp } from "./whatsapp";

type Segment = "needs_you" | "asked" | "checkins";

type Props = {
  onReviewException: (exceptionId: string) => void;
  onReviewCheckin: (item: TrainerCheckinInboxItem) => void;
  onOpenClients: () => void;
};

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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [attentionGroups, coachAsks, inbox] = await Promise.all([
        s1.getAttentionGroups(),
        s1.listCoachAsks({ status: "open" }),
        api.listTrainerCheckinInbox(),
      ]);
      setGroups(attentionGroups.groups);
      setAsks(coachAsks.items);
      setCheckins(
        inbox.items.filter(
          (item: TrainerCheckinInboxItem) =>
            item.checkin.status === "submitted",
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load attention.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, s1]);

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

  const needsYouCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.items.length, 0),
    [groups],
  );

  async function acknowledgeItem(exceptionId: string) {
    try {
      await api.acknowledgeException(
        exceptionId,
        { note: null },
        createIdempotencyKey(),
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not mark as reviewed.",
      );
    }
  }

  const clientCards = useMemo(
    () => buildClientAttentionCards(groups),
    [groups],
  );

  return (
    <Screen title="Today" subtitle="Who needs you, and why.">
      {error ? <ErrorBanner message={error} /> : null}

      <SegmentedControl
        options={[
          { id: "needs_you", label: "Needs you" },
          { id: "asked", label: "Asked" },
          { id: "checkins", label: "Check-ins" },
        ]}
        value={segment}
        onChange={setSegment}
      />

      <PrimaryButton
        label="Refresh"
        variant="secondary"
        onPress={() => {
          void refreshSession();
          void load();
        }}
      />

      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : segment === "needs_you" ? (
        needsYouCount === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.muted}>
              When a client needs a look, you'll see one card per person here.
            </Text>
            <PrimaryButton label="Open clients" onPress={onOpenClients} />
          </View>
        ) : (
          <View style={styles.list}>
            {clientCards.map((card) => (
              <View key={card.relationshipId} style={styles.clientCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.who}>{card.traineeDisplayName}</Text>
                  <StatusChip
                    label={card.primary.severity}
                    tone={
                      card.primary.severity === "critical"
                        ? "warning"
                        : "attention"
                    }
                  />
                </View>
                <Text style={styles.summary}>{card.primary.summary}</Text>
                <Text style={styles.meta}>
                  {typeLabel(card.primary.type)} ·{" "}
                  {formatAttentionAge(card.primary.ageMinutes)}
                  {card.itemCount > 1 ? ` · +${card.itemCount - 1} more` : ""}
                </Text>
                <PrimaryButton
                  label="Review"
                  onPress={() => onReviewException(card.primary.id)}
                />
                <View style={styles.swipeRow}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.swipeAction}
                    onPress={() => {
                      void acknowledgeItem(card.primary.id);
                    }}
                  >
                    <Text style={styles.swipeActionText}>Mark reviewed</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.swipeActionAlt}
                    onPress={() => {
                      void openContextualWhatsApp({
                        draftText: `Hi — gentle nudge from FitBud: ${card.primary.summary}`,
                      });
                    }}
                  >
                    <Text style={styles.swipeActionTextAlt}>Nudge</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )
      ) : segment === "asked" ? (
        asks.length === 0 ? (
          <Text style={styles.muted}>No open asks from clients.</Text>
        ) : (
          <View style={styles.list}>
            {asks.map((ask) => (
              <View key={ask.id} style={styles.card}>
                <Text style={styles.who}>{ask.topic}</Text>
                <Text style={styles.meta}>
                  {ask.itemType.replace(/_/g, " ")} · asked{" "}
                  {new Date(ask.lastAskedAt).toLocaleDateString("en-IN")}
                </Text>
              </View>
            ))}
          </View>
        )
      ) : checkins.length === 0 ? (
        <Text style={styles.muted}>No check-ins waiting for review.</Text>
      ) : (
        <View style={styles.list}>
          {checkins.map((item) => (
            <Pressable
              key={item.checkin.id}
              style={styles.card}
              onPress={() => onReviewCheckin(item)}
            >
              <Text style={styles.who}>Client check-in</Text>
              <Text style={styles.summary}>
                {item.checkin.localDate} · {item.checkin.status}
              </Text>
              <Text style={styles.action}>Review check-in</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  empty: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    color: colors.deepNavy,
    fontSize: 18,
    fontWeight: "600",
  },
  list: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  clientCard: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  swipeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  swipeAction: {
    backgroundColor: colors.paleLavender,
    borderRadius: 8,
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  swipeActionAlt: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  swipeActionText: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  swipeActionTextAlt: {
    color: colors.deepNavy,
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 48,
    padding: spacing.lg,
  },
  itemRow: {
    borderTopColor: colors.lightGrey,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  who: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  meta: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  summary: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  action: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
});
