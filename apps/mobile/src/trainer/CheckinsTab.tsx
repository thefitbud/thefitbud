import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { TrainerCheckinInboxItem } from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  deviceTimeZone,
  formatCivilDate,
  formatLocalDate,
} from "@fitbud/core";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import { createIdempotencyKey } from "../lib/idempotency";
import { localDateInTimezone } from "../lib/dates";
import { reportError } from "../lib/reportError";
import { scheduleUndoable, type UndoableAction } from "./attentionCards";
import { CheckinsList } from "./checkinsList/List";
import {
  buildCheckinListModel,
  coachingWeekAt,
  inboxItemFromCheckin,
  type CheckinListRow,
  type CheckinListSegment,
  type WeekLookup,
} from "./checkinsList/model";
import { openContextualWhatsApp } from "./whatsapp";

type Props = {
  onReviewCheckin: (item: TrainerCheckinInboxItem) => void;
};

export function CheckinsTab({ onReviewCheckin }: Props) {
  const { api, refreshSession } = useAuth();
  const trainerZone = deviceTimeZone();
  const [inboxItems, setInboxItems] = useState<TrainerCheckinInboxItem[]>([]);
  const [reviewedItems, setReviewedItems] = useState<TrainerCheckinInboxItem[]>(
    [],
  );
  const [weeksByRelationship, setWeeksByRelationship] = useState<WeekLookup>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<CheckinListSegment>("to_review");
  const [toast, setToast] = useState<string | null>(null);
  const [heldIds, setHeldIds] = useState<ReadonlySet<string>>(new Set());
  const undoRef = useRef<UndoableAction | null>(null);
  const heldRowRef = useRef<CheckinListRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [inbox, clients] = await Promise.all([
        api.listTrainerCheckinInbox(),
        api.listClients({ limit: 100 }),
      ]);
      setInboxItems(inbox.items);

      const weeks = new Map<string, number>();
      const now = Date.now();
      for (const client of clients.items) {
        if (!client.relationshipId || client.status === "ended") continue;
        // Directory items do not carry startedAt; week labels stay optional.
        const week = coachingWeekAt(
          (client as { startedAt?: string | null }).startedAt,
          now,
        );
        if (week != null) weeks.set(client.relationshipId, week);
      }
      setWeeksByRelationship(weeks);

      if (segment === "reviewed") {
        const since = addDaysToLocalDate(
          formatLocalDate(new Date(), "UTC"),
          -30,
        );
        const active = clients.items.filter(
          (row) => row.relationshipId && row.status !== "ended",
        );
        const lists = await Promise.all(
          active.slice(0, 24).map(async (client) => {
            if (!client.relationshipId) return [] as TrainerCheckinInboxItem[];
            try {
              const list = await api.listCheckins(client.relationshipId, {
                fromDate: since,
                limit: 20,
              });
              return list.items
                .filter((checkin) => checkin.status === "reviewed")
                .map((checkin) =>
                  inboxItemFromCheckin(checkin, {
                    relationshipId: client.relationshipId!,
                    traineeDisplayName: client.traineeDisplayName ?? "Client",
                  }),
                );
            } catch (err) {
              reportError("trainer.checkins.reviewed", err);
              return [];
            }
          }),
        );
        setReviewedItems(lists.flat());
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load check-ins.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, segment]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = localDateInTimezone(trainerZone);
  const visibleInbox = useMemo(
    () => inboxItems.filter((item) => !heldIds.has(item.checkin.id)),
    [inboxItems, heldIds],
  );
  const model = useMemo(
    () =>
      buildCheckinListModel([...visibleInbox, ...reviewedItems], {
        trainerZone,
        today,
        weeksByRelationship,
      }),
    [visibleInbox, reviewedItems, trainerZone, today, weeksByRelationship],
  );

  async function nudge(row: CheckinListRow) {
    let phone: string | null = null;
    try {
      const workspace = await api.getClientWorkspace(row.relationshipId);
      phone = workspace.header.clientWhatsappE164 ?? null;
    } catch (err) {
      reportError("trainer.checkins.whatsappLookup", err);
      phone = null;
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
        setInboxItems((prev) => prev.filter((item) => item.checkin.id !== row.id));
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

  return (
    <Screen
      v3
      title="Check-ins"
      chrome="app"
      showHeader={false}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void refreshSession?.();
        void load().finally(() => setRefreshing(false));
      }}
    >
      {Platform.OS === "android" ? null : (
        <Text style={styles.eyebrow}>{formatCivilDate(today)}</Text>
      )}
      <Text style={styles.title} accessibilityRole="header">
        Check-ins
      </Text>
      {error ? <ErrorBanner message={error} /> : null}
      <CheckinsList
        loading={loading}
        model={model}
        segment={segment}
        onSegmentChange={(next) => {
          setSegment(next);
          if (next === "reviewed") setLoading(true);
        }}
        onReview={(row) => onReviewCheckin(row.item)}
        onNudge={(row) => void nudge(row)}
        footerHint={overdueHint}
        onMarkReviewed={markReviewedFromList}
      />
      {toast ? (
        <Snackbar
          leadingCheck
          message={toast}
          actionLabel={heldRowRef.current ? "Undo" : undefined}
          onAction={heldRowRef.current ? undoMarkReviewed : undefined}
          onDismiss={() => {
            if (!heldRowRef.current) setToast(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.midGrey, fontSize: 15, lineHeight: 20 },
  title: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 30,
    letterSpacing: -0.4,
    marginTop: 2,
  },
});
