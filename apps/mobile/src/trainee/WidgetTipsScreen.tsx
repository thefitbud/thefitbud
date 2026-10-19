import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MealAssignment } from "@fitbud/contracts";
import { formatHhMmTime } from "@fitbud/core";
import { brand, ink } from "@fitbud/tokens";
import { fontFamilySemiBold, radii } from "@fitbud/ui-mobile";
import { Text } from "../components/Text";
import { useAuth } from "../auth/AuthProvider";
import { localDateInTimezone } from "../lib/dates";
import {
  quietWindow,
  readHideLockDetails,
  writeHideLockDetails,
  type QuietHoursInput,
} from "../notifications/actions";
import {
  checkinPushCopy,
  notePushCopy,
  inAppMealBannerCopy,
  noteBannerCopy,
} from "../notifications/copy";
import { confirmMealAssignment } from "./mealActions";
import { useSyncEngine } from "../sync/SyncProvider";
import { M2Button, M2Note, M2Page, M2SwitchRow } from "./settings/m2";
import {
  DevBuildNote,
  InAppBanner,
  LockMessageCard,
  MealNotificationCard,
  WorkoutNotificationPreviews,
} from "./notifications/Surfaces";

type Props = {
  onBack: () => void;
  coachName?: string | null;
  onOpenMeal?: (assignmentId: string) => void;
  onOpenDiet?: () => void;
  onGoToday?: () => void;
};

export function WidgetTipsScreen({
  onBack,
  coachName,
  onOpenMeal,
  onOpenDiet,
  onGoToday,
}: Props) {
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const [meal, setMeal] = useState<MealAssignment | null>(null);
  const [relationshipId, setRelationshipId] = useState<string | null>(null);
  const [loggedCount, setLoggedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hideDetails, setHideDetails] = useState(readHideLockDetails);
  const [stale, setStale] = useState(false);
  const [showMealBanner, setShowMealBanner] = useState(true);
  const [showNoteBanner, setShowNoteBanner] = useState(true);
  const [quiet, setQuiet] = useState<QuietHoursInput>(() =>
    quietWindow(me?.timezone ?? "Asia/Kolkata"),
  );

  const load = useCallback(async () => {
    setError(null);
    const browserOffline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    if (browserOffline) {
      setOffline(true);
      setStale(true);
      setLoading(false);
      setError("You're offline. Pull to try again.");
      return;
    }
    try {
      const rels = await api.listRelationships({ limit: 10 });
      const relationship =
        rels.items.find((row) => row.status !== "ended") ?? rels.items[0];
      if (!relationship) {
        setMeal(null);
        setRelationshipId(null);
        return;
      }
      setRelationshipId(relationship.id);
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
      setMeal(open ?? null);
      setLoggedCount(done);
      setTotal(listed.items.length);
      setOffline(false);
      setStale(false);
      try {
        const prefs = await api.getNotificationPreferences();
        setQuiet(
          quietWindow(
            me?.timezone ?? "Asia/Kolkata",
            prefs.quietHoursStart,
            prefs.quietHoursEnd,
          ),
        );
      } catch {
        setQuiet(quietWindow(me?.timezone ?? "Asia/Kolkata"));
      }
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

  const mealLabel = meal?.mealName?.trim() || "Meal";
  const clock = meal
    ? formatHhMmTime(meal.prescription.localTime ?? "13:00")
    : "";
  const title = !me
    ? "Open FitBud to get started."
    : !meal
      ? "Nothing left today"
      : hideDetails
        ? "Next item"
        : `Next: ${mealLabel} · ${clock}`;
  const checkin = checkinPushCopy(coachName);
  const note = notePushCopy(coachName);
  const mealBanner = inAppMealBannerCopy(mealLabel);
  const coachNote = noteBannerCopy(coachName);

  function openMeal() {
    if (meal && onOpenMeal) onOpenMeal(meal.id);
    else onOpenDiet?.();
  }

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
      {offline ? (
        <Text style={styles.muted}>You're offline. Pull to try again.</Text>
      ) : null}
      {stale ? <Text style={styles.muted}>Updated 1 h ago</Text> : null}

      <View style={styles.preview} accessibilityLabel="Widget preview">
        <Text style={styles.previewKicker}>FitBud</Text>
        <Text style={styles.previewTitle}>{title}</Text>
        {total > 0 && !hideDetails ? (
          <Text style={styles.previewSub}>
            {loggedCount} of {total} meals today
          </Text>
        ) : null}
        {meal ? (
          <M2Button
            label="Eaten as planned"
            onPress={() => {
              void (async () => {
                if (!relationshipId) return;
                try {
                  await confirmMealAssignment(
                    api,
                    sync,
                    relationshipId,
                    meal,
                    coachName ?? undefined,
                  );
                  setToast("Saved on this phone.");
                  await load();
                } catch {
                  setToast(
                    "Saved on this phone. We'll send it when you're online.",
                  );
                }
              })();
            }}
          />
        ) : null}
      </View>

      <M2SwitchRow
        label="Hide details on lock screen"
        hint="Off by default. Food names stay off the lock screen when this is on."
        value={hideDetails}
        onValueChange={(value) => {
          setHideDetails(value);
          writeHideLockDetails(value);
        }}
      />

      <Text style={styles.section}>Meal notification</Text>
      {meal ? (
        <>
          <MealNotificationCard
            mealId={meal.id}
            mealLabel={mealLabel}
            hideDetails={hideDetails}
            quiet={quiet}
            onOpen={openMeal}
            onSnoozed={setToast}
          />
          <MealNotificationCard
            expanded
            mealId={meal.id}
            mealLabel={mealLabel}
            mealTime={clock}
            hideDetails={hideDetails}
            quiet={quiet}
            onOpen={openMeal}
            onSnoozed={setToast}
          />
        </>
      ) : (
        <Text style={styles.muted}>Nothing left to log.</Text>
      )}

      <Text style={styles.section}>While the app is open</Text>
      {meal && showMealBanner ? (
        <InAppBanner
          title={mealBanner.title}
          openLabel={`Open ${mealLabel}`}
          onOpen={() => {
            setShowMealBanner(false);
            openMeal();
          }}
        />
      ) : null}
      {showNoteBanner ? (
        <InAppBanner
          title={coachNote.title}
          openLabel="Open"
          onOpen={() => {
            setShowNoteBanner(false);
            onGoToday?.();
          }}
        />
      ) : null}

      <Text style={styles.section}>Check-in and coach note</Text>
      <LockMessageCard
        title={checkin.title}
        body={checkin.body}
        whenLabel="now"
      />
      <LockMessageCard title={note.title} body={note.body} whenLabel="12 min ago" />

      <Text style={styles.section}>Workout on the lock screen</Text>
      <WorkoutNotificationPreviews onNotice={setToast} />
      <DevBuildNote />

      {toast ? (
        <Text accessibilityLiveRegion="polite" style={styles.toast}>
          {toast}
        </Text>
      ) : null}
      <M2Note>
        Confirm from this page saves through the same outbox as the app. The
        phone widget itself is added from the home screen.
      </M2Note>
    </M2Page>
  );
}

const styles = StyleSheet.create({
  muted: { color: ink[500], fontSize: 15 },
  warn: { color: "#9A3412", fontSize: 14 },
  section: {
    color: ink[500],
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
    marginTop: 8,
  },
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
  toast: { color: brand.indigo, fontFamily: fontFamilySemiBold, fontSize: 14 },
});
