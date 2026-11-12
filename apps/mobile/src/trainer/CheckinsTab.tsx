import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { TrainerCheckinInboxItem } from "@fitbud/contracts";
import { deviceTimeZone, formatCivilDate } from "@fitbud/core";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { localDateInTimezone } from "../lib/dates";
import { reportError } from "../lib/reportError";
import { CheckinsList } from "./checkinsList/List";
import {
  buildCheckinListModel,
  type CheckinListRow,
  type CheckinListSegment,
} from "./checkinsList/model";
import { openContextualWhatsApp } from "./whatsapp";

type Props = {
  onReviewCheckin: (item: TrainerCheckinInboxItem) => void;
};

export function CheckinsTab({ onReviewCheckin }: Props) {
  const { api, refreshSession } = useAuth();
  const trainerZone = deviceTimeZone();
  const [items, setItems] = useState<TrainerCheckinInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<CheckinListSegment>("to_review");

  const load = useCallback(async () => {
    setError(null);
    try {
      const inbox = await api.listTrainerCheckinInbox();
      setItems(inbox.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load check-ins.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = localDateInTimezone(trainerZone);
  const model = useMemo(
    () => buildCheckinListModel(items, { trainerZone, today }),
    [items, trainerZone, today],
  );

  async function nudge(row: CheckinListRow) {
    // The phone number lives on the client workspace; a lookup failure still
    // opens WhatsApp with the draft so the trainer can pick the contact.
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
      draftText: `Hi ${row.firstName}, `,
    });
  }

  return (
    <Screen
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
      {/* Frame 50 (Android) has no date line above the title. */}
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
        onSegmentChange={setSegment}
        onReview={(row) => onReviewCheckin(row.item)}
        onWhatsApp={(row) => void nudge(row)}
      />
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
