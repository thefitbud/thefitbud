import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import type { MealAssignment } from "@fitbud/contracts";
import { formatHhMmTime, formatPersonName, greetingFor } from "@fitbud/core";
import { brand, ink } from "@fitbud/tokens";
import { fontFamilyBold, fontFamilySemiBold, radii } from "@fitbud/ui-mobile";
import { Text } from "../components/Text";
import { useAuth } from "../auth/AuthProvider";
import { addDays, localDateInTimezone } from "../lib/dates";
import {
  readHideLockDetails,
  writeHideLockDetails,
} from "../notifications/actions";
import {
  checkinPushCopy,
  notePushCopy,
  inAppMealBannerCopy,
  noteBannerCopy,
} from "../notifications/copy";
import {
  nextOpenPlanDay,
  nextWorkoutAssignment,
  planFromAssignment,
  planFromWorkoutDay,
  type WorkoutPreviewPlan,
} from "../notifications/workoutPlan";
import { confirmMealAssignment } from "./mealActions";
import { useSyncEngine } from "../sync/SyncProvider";
import { M2Button, M2Page, M2SwitchRow } from "./settings/m2";
import { DevBuildNote, InAppBanner } from "./notifications/Surfaces";
import {
  CoachLockCard,
  LiveActivityCard,
  LockFrame,
  MealLockCard,
} from "./notifications/LockFrames";

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
  const [, setPlan] = useState<WorkoutPreviewPlan | null>(null);
  const [, setPlanReady] = useState(false);
  const planSet = useRef(false);

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
        setPlanReady(true);
        return;
      }
      setRelationshipId(relationship.id);
      const zone = me?.timezone ?? "Asia/Kolkata";
      const today = localDateInTimezone(zone);
      const [listed, workouts] = await Promise.all([
        api.listMealAssignments(relationship.id, {
          fromDate: today,
          toDate: today,
        }),
        api
          .listWorkoutAssignments(relationship.id, {
            fromDate: today,
            toDate: addDays(today, 7),
          })
          .catch(() => ({ items: [] })),
      ]);
      if (!planSet.current) {
        const next = nextWorkoutAssignment(workouts.items);
        let built = next ? planFromAssignment(next) : null;
        if (!built) {
          const effective = await api
            .getEffectivePlan(relationship.id)
            .catch(() => null);
          const days = effective?.version?.content.workoutDays ?? [];
          const finished = new Set(
            workouts.items
              .filter((item) =>
                ["completed", "skipped", "missed"].includes(item.status),
              )
              .map((item) => item.localDate),
          );
          const day = nextOpenPlanDay(days, today, finished);
          built = day ? planFromWorkoutDay(day) : null;
        }
        planSet.current = true;
        setPlan(built);
        setPlanReady(true);
      }
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
    } catch {
      setError("Could not load the next item.");
      setStale(true);
    } finally {
      setPlanReady(true);
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

  const zone = me?.timezone ?? "Asia/Kolkata";
  const firstName =
    formatPersonName(me?.email?.split("@")[0]?.split(".")[0] ?? "") || "there";

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

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Lock screen previews"
      >
        <View style={styles.page}>
          <LockFrame dateLabel="Monday 19 October" clock="7:24">
            <LiveActivityCard logged={false} />
          </LockFrame>
        </View>
        <View style={styles.page}>
          <LockFrame dateLabel="Monday 19 October" clock="7:26">
            <LiveActivityCard logged />
          </LockFrame>
        </View>
        <View style={styles.page}>
          <LockFrame dateLabel="Monday 19 October" clock="2:15" banner="Snooze 30 min">
            <MealLockCard
              onOpen={openMeal}
              onSnooze={() => setToast("Snoozed 30 min")}
            />
          </LockFrame>
        </View>
        <View style={styles.page}>
          <LockFrame dateLabel="Monday 19 October" clock="6:05">
            <CoachLockCard title={checkin.title} when="now" />
            <CoachLockCard title={note.title} when="12m ago" />
          </LockFrame>
        </View>
      </ScrollView>
      <View style={styles.dots} accessibilityLabel="Preview pages">
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>

      <View style={styles.today} accessibilityLabel="Today">
        <Text style={styles.snapGreeting}>
          {greetingFor(firstName, zone)}
        </Text>
        <Text style={styles.snapSub}>Here's your day.</Text>
        <Text style={styles.snapLine}>{title}</Text>
        {total > 0 ? (
          <Text style={styles.snapLine}>
            {loggedCount} of {total} meals logged
          </Text>
        ) : null}
        {meal && showMealBanner ? (
          <InAppBanner
            floating
            top={12}
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
            floating
            top={meal && showMealBanner ? 86 : 12}
            title={coachNote.title}
            openLabel="Open"
            onOpen={() => {
              setShowNoteBanner(false);
              onGoToday?.();
            }}
          />
        ) : null}
      </View>

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

      <DevBuildNote />

      {toast ? (
        <Text accessibilityLiveRegion="polite" style={styles.toast}>
          {toast}
        </Text>
      ) : null}
    </M2Page>
  );
}

const styles = StyleSheet.create({
  page: { width: 361 },
  dots: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 8,
  },
  dot: {
    backgroundColor: "#C4C0D8",
    borderRadius: 4,
    height: 6,
    width: 6,
  },
  lock: {
    backgroundColor: "#1A1248",
    borderRadius: 28,
    overflow: "hidden",
    paddingBottom: 20,
    paddingTop: 28,
  },
  lockDate: {
    color: "#fff",
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    textAlign: "center",
  },
  lockClock: {
    color: "#fff",
    fontFamily: fontFamilyBold,
    fontSize: 72,
    letterSpacing: -1,
    lineHeight: 76,
    textAlign: "center",
  },
  lockStack: {
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 16,
  },
  lockCaption: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
  },
  onLock: { color: "#fff", fontSize: 15 },
  today: {
    backgroundColor: "#F4F2FB",
    borderRadius: 24,
    minHeight: 220,
    overflow: "hidden",
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 168,
    position: "relative",
  },
  snapGreeting: {
    color: brand.deepNavy,
    fontFamily: fontFamilyBold,
    fontSize: 28,
  },
  snapSub: { color: ink[500], fontSize: 15, marginBottom: 8 },
  snapLine: { color: ink[700], fontSize: 15, lineHeight: 21 },
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
  toast: { color: brand.indigo, fontFamily: fontFamilySemiBold, fontSize: 14 },
});
