import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MealAssignment } from "@fitbud/contracts";
import { formatHhMmTime } from "@fitbud/core";
import { brand, ink } from "@fitbud/tokens";
import { fontFamilySemiBold, radii } from "@fitbud/ui-mobile";
import { Text } from "../components/Text";
import { useAuth } from "../auth/AuthProvider";
import { localDateInTimezone } from "../lib/dates";
import { confirmMealAssignment } from "./mealActions";
import { useSyncEngine } from "../sync/SyncProvider";
import { M2Button, M2Note, M2Page, M2SwitchRow } from "./settings/m2";

type Props = {
  onBack: () => void;
};

export function WidgetTipsScreen({ onBack }: Props) {
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const [meal, setMeal] = useState<MealAssignment | null>(null);
  const [loggedCount, setLoggedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hideDetails, setHideDetails] = useState(false);
  const [stale, setStale] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rels = await api.listRelationships({ limit: 10 });
      const relationship =
        rels.items.find((row) => row.status !== "ended") ?? rels.items[0];
      if (!relationship) {
        setMeal(null);
        return;
      }
      const today = localDateInTimezone(me?.timezone ?? "Asia/Kolkata");
      const listed = await api.listMealAssignments(relationship.id, {
        fromDate: today,
        toDate: today,
      });
      const open = listed.items.find(
        (item) => item.status === "pending" || item.status === "overdue",
      );
      const done = listed.items.filter((item) =>
        ["confirmed", "modified", "logged_later", "skipped"].includes(item.status),
      ).length;
      setMeal(open ?? listed.items[0] ?? null);
      setLoggedCount(done);
      setTotal(listed.items.length);
      setStale(false);
    } catch {
      setError("Could not load the next item.");
      setStale(true);
    } finally {
      setLoading(false);
    }
  }, [api, me?.timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = !me
    ? "Open FitBud to get started."
    : hideDetails
      ? "Next item"
      : meal
        ? `Next: ${meal.mealName} · ${formatHhMmTime(meal.prescription.localTime ?? "13:00")}`
        : "Nothing left today";

  return (
    <M2Page
      title="Lock-screen widget"
      subtitle="A preview of what your phone can show. The real widget is added from the phone's home screen."
      onBack={onBack}
      onRefresh={() => {
        setLoading(true);
        void load();
      }}
      refreshing={loading}
    >
      {loading ? (
        <Text accessibilityLabel="Loading widget" style={styles.muted}>
          Loading…
        </Text>
      ) : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}
      {stale ? <Text style={styles.muted}>Updated 1 h ago</Text> : null}
      <View style={styles.preview} accessibilityLabel="Widget preview">
        <Text style={styles.previewKicker}>FitBud</Text>
        <Text style={styles.previewTitle}>{title}</Text>
        {total > 0 && !hideDetails ? (
          <Text style={styles.previewSub}>
            {loggedCount} of {total} meals today
          </Text>
        ) : null}
        {meal && meal.status !== "confirmed" ? (
          <M2Button
            label="Eaten as planned"
            onPress={() => {
              void (async () => {
                try {
                  const rels = await api.listRelationships({ limit: 10 });
                  const relationship = rels.items[0];
                  if (!relationship) return;
                  await confirmMealAssignment(
                    api,
                    sync,
                    relationship.id,
                    meal,
                    relationship.trainerDisplayName ?? undefined,
                  );
                  setToast("Saved on this phone.");
                  await load();
                } catch {
                  setToast("Saved on this phone. We'll send it when you're online.");
                }
              })();
            }}
          />
        ) : null}
      </View>
      <M2Note>
        The lock screen and notifications are waiting on the updated mockups.
        This page is not the final design.
      </M2Note>
      <M2SwitchRow
        label="Hide details on lock screen"
        hint="Off by default. Food names stay off the lock screen when this is on."
        value={hideDetails}
        onValueChange={setHideDetails}
      />
      {toast ? (
        <Text accessibilityLiveRegion="polite" style={styles.toast}>
          {toast}
        </Text>
      ) : null}
      <M2Note>
        Confirm from this preview saves through the same outbox as the app. The
        phone widget itself is not on this build.
      </M2Note>
    </M2Page>
  );
}

const styles = StyleSheet.create({
  muted: { color: ink[500], fontSize: 15 },
  warn: { color: "#9A3412", fontSize: 14 },
  preview: {
    backgroundColor: "#fff",
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  previewKicker: {
    color: ink[500],
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
  },
  previewTitle: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  previewSub: { color: ink[500], fontSize: 14 },
  clock: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 32,
  },
  toast: { color: brand.indigo, fontFamily: fontFamilySemiBold, fontSize: 14 },
});
