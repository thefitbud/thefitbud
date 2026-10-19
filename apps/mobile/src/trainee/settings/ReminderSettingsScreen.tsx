import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { NotificationPreferences, ReminderStatus } from "@fitbud/contracts";
import { formatCivilDate, formatHhMmTime, formatLocalDate } from "@fitbud/core";
import { brand, ink } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { BottomSheet } from "../../components/BottomSheet";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useAuth } from "../../auth/AuthProvider";
import { useConfig } from "../../providers/ConfigProvider";
import { isWhatsAppAutomationEnabled } from "../../lib/config";
import { stage1Api } from "../../lib/stage1Api";
import { ensureAndroidNotificationChannels } from "../../notifications/androidChannels";
import { clockLabel, shiftQuarterHour } from "./clock";
import { M2Button, M2Group, M2Note, M2Page, M2Row, M2SwitchRow } from "./m2";

type CategoryKey = "workoutReminder" | "mealReminder" | "checkinReminder" | "dailySummaryReminder";

type Props = {
  onBack: () => void;
  onOpenQuietHours: () => void;
  onOpenMealTimes?: () => void;
  onOpenBatteryHelp?: () => void;
};

const PENDING_KEY = "fitbud.reminder-prefs.pending";

function browserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function rememberLocal(body: unknown) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PENDING_KEY, JSON.stringify(body));
}

export function ReminderSettingsScreen({
  onBack,
  onOpenQuietHours,
  onOpenMealTimes,
  onOpenBatteryHelp,
}: Props) {
  const { api, me } = useAuth();
  const { config } = useConfig();
  const s1 = stage1Api(api);
  const waOn = isWhatsAppAutomationEnabled(config);
  const zone = me?.timezone || "Asia/Kolkata";
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [changedMeals, setChangedMeals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [osDenied, setOsDenied] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [draftTime, setDraftTime] = useState("18:00");

  const load = useCallback(async () => {
    setError(null);
    setOffline(browserOffline());
    try {
      const [nextPrefs, nextStatus, meals] = await Promise.all([
        api.getNotificationPreferences(),
        s1.getReminderStatus().catch(() => null),
        s1.getMealTimes().catch(() => null),
      ]);
      setPrefs(nextPrefs);
      setStatus(nextStatus);
      setChangedMeals(
        meals?.slots.filter((slot) => slot.overrideTime).length ?? 0,
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : browserOffline()
            ? "You're offline. Pull to try again."
            : "Could not load reminder settings.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, s1]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void ensureAndroidNotificationChannels();
    if (Platform.OS === "web") {
      setOsDenied(false);
      return;
    }
    void import("expo-notifications").then(async (Notifications) => {
      const settings = await Notifications.getPermissionsAsync();
      setOsDenied(settings.status === "denied");
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function save(
    patch: Parameters<typeof api.updateNotificationPreferences>[0],
    optimistic: (current: NotificationPreferences) => NotificationPreferences,
  ) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs(optimistic(prefs));
    setError(null);
    try {
      const updated = await api.updateNotificationPreferences(patch);
      setPrefs(updated);
      setToast("Saved");
    } catch (err) {
      if (browserOffline()) {
        rememberLocal(patch);
        setOffline(true);
        setToast("Saved on this phone. We'll sync it when you're back online.");
        return;
      }
      setPrefs(previous);
      setError(
        err instanceof ApiClientError ? err.message : "Could not save setting.",
      );
    }
  }

  const permissionOff =
    osDenied || (status != null && status.pushDeliverable === false);
  const paused =
    status?.mode === "paused"
      ? status.pausedUntil
        ? `Meal reminders are paused until ${formatCivilDate(formatLocalDate(new Date(status.pausedUntil), zone))} because they weren't helping.`
        : "Meal reminders are paused because they weren't helping."
      : null;
  const workoutTime = prefs?.preferredWorkoutTime ?? "18:00";
  const learned = !prefs?.preferredWorkoutTime;
  const switchesDisabled = permissionOff || !prefs?.pushEnabled;
  const mealLine =
    changedMeals > 0
      ? `Using your meal times (${changedMeals} changed)`
      : "Using your plan's meal times";

  function categoryOff(key: CategoryKey): boolean {
    if (!status) return false;
    if (key === "workoutReminder") return status.trainerDisabled.workoutReminder;
    if (key === "mealReminder") return status.trainerDisabled.mealReminder;
    if (key === "checkinReminder") return status.trainerDisabled.checkinReminder;
    return false;
  }

  const statusLine = permissionOff
    ? "Off in phone settings"
    : prefs?.pushEnabled
      ? "Notifications: On"
      : "Notifications: Off";

  return (
    <M2Page
      title="Reminders"
      subtitle="You choose when FitBud reminds you."
      onBack={onBack}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {offline && !error ? (
        <Text style={styles.muted}>You're offline. Showing what we have.</Text>
      ) : null}
      {loading ? (
        <Text accessibilityLabel="Loading reminders" style={styles.muted}>
          Loading…
        </Text>
      ) : null}
      {toast ? (
        <Text accessibilityLiveRegion="polite" style={styles.toast}>
          {toast}
        </Text>
      ) : null}

      <View style={styles.statusCard}>
        <Text style={styles.status}>{statusLine}</Text>
        {permissionOff ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Turn on in Settings"
            onPress={() => {
              void Linking.openSettings();
            }}
            style={styles.linkHit}
          >
            <Text style={styles.link}>Turn on in Settings</Text>
          </Pressable>
        ) : (
          <M2SwitchRow
            label="Notifications"
            value={prefs?.pushEnabled ?? false}
            disabled={!prefs}
            onValueChange={(enabled) => {
              void save({ pushEnabled: enabled }, (current) => ({
                ...current,
                pushEnabled: enabled,
              }));
            }}
          />
        )}
      </View>

      {paused ? (
        <View style={styles.pause}>
          <Text style={styles.pauseText}>{paused}</Text>
          <M2Button
            label="Turn back on"
            onPress={() => {
              void s1.resumeReminders().then((next) => {
                setStatus(next);
                setToast("Saved");
              });
            }}
          />
        </View>
      ) : null}

      <M2Group>
        <M2SwitchRow
          label="Workout reminder"
          hint={
            categoryOff("workoutReminder")
              ? "Your coach has turned off workout reminders."
              : learned
                ? `If your workout isn't logged about an hour after ${formatHhMmTime("18:00")}. We'll learn a better time from your workouts.`
                : `If your workout isn't logged about an hour after ${formatHhMmTime(workoutTime)}.`
          }
          value={Boolean(prefs?.categories.workoutReminder) && !categoryOff("workoutReminder")}
          disabled={switchesDisabled || categoryOff("workoutReminder") || !prefs}
          onValueChange={(enabled) => {
            void save(
              { categories: { workoutReminder: enabled } },
              (current) => ({
                ...current,
                categories: { ...current.categories, workoutReminder: enabled },
              }),
            );
          }}
        />
        <M2Row
          label={learned ? "Learn from my workouts" : "Change workout time"}
          value={learned ? undefined : clockLabel(workoutTime)}
          onPress={() => {
            setDraftTime(workoutTime);
            setTimeOpen(true);
          }}
        />
        <M2SwitchRow
          label="Meal reminders"
          hint="About 40 min after each meal time, if it isn't logged."
          value={Boolean(prefs?.categories.mealReminder) && !categoryOff("mealReminder")}
          disabled={switchesDisabled || categoryOff("mealReminder") || !prefs}
          onValueChange={(enabled) => {
            void save({ categories: { mealReminder: enabled } }, (current) => ({
              ...current,
              categories: { ...current.categories, mealReminder: enabled },
            }));
          }}
        />
        <M2Row
          label={mealLine}
          value="Change"
          onPress={onOpenMealTimes}
        />
        <M2SwitchRow
          label="Check-in reminders"
          hint={
            categoryOff("checkinReminder")
              ? "Your coach has turned off check-in reminders."
              : "The day your check-in is due."
          }
          value={Boolean(prefs?.categories.checkinReminder) && !categoryOff("checkinReminder")}
          disabled={switchesDisabled || categoryOff("checkinReminder") || !prefs}
          onValueChange={(enabled) => {
            void save(
              { categories: { checkinReminder: enabled } },
              (current) => ({
                ...current,
                categories: { ...current.categories, checkinReminder: enabled },
              }),
            );
          }}
        />
        <M2SwitchRow
          label="Daily summary"
          hint="One evening note if anything's left, by 9:30 pm."
          value={Boolean(prefs?.categories.dailySummaryReminder)}
          disabled={switchesDisabled || !prefs}
          onValueChange={(enabled) => {
            void save(
              { categories: { dailySummaryReminder: enabled } },
              (current) => ({
                ...current,
                categories: {
                  ...current.categories,
                  dailySummaryReminder: enabled,
                },
              }),
            );
          }}
        />
      </M2Group>

      <M2Note>
        Your coach can send a reminder about a specific item. It follows your
        quiet hours.
      </M2Note>

      <M2Group>
        <M2Row
          label="Quiet hours"
          value={
            prefs?.quietHoursStart && prefs.quietHoursEnd
              ? `${clockLabel(prefs.quietHoursStart)} – ${clockLabel(prefs.quietHoursEnd)}`
              : "10:00 pm – 7:00 am"
          }
          onPress={onOpenQuietHours}
        />
      </M2Group>

      <View style={[styles.wa, styles.dim]}>
        <View style={styles.waTop}>
          <Text style={styles.waTitle}>WhatsApp reminders</Text>
          <Text style={styles.chip}>Coming soon</Text>
        </View>
        <Text style={styles.hint}>
          {waOn
            ? "Used only when app notifications don't reach you, or when a few logs slip. At most one a day. Reply STOP to stop."
            : "WhatsApp reminders are coming soon. For now we'll remind you in the app."}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reminders not arriving?"
        onPress={onOpenBatteryHelp}
        style={styles.linkHit}
      >
        <Text style={styles.link}>Reminders not arriving?</Text>
      </Pressable>

      <BottomSheet
        visible={timeOpen}
        title="Workout time"
        subtitle="We'll remind you about an hour after this if it isn't logged."
        onDismiss={() => setTimeOpen(false)}
      >
        <Text style={styles.clock}>{clockLabel(draftTime)}</Text>
        <View style={styles.stepRow}>
          <M2Button
            label="Earlier"
            variant="secondary"
            onPress={() => setDraftTime((value) => shiftQuarterHour(value, -15))}
          />
          <M2Button
            label="Later"
            variant="secondary"
            onPress={() => setDraftTime((value) => shiftQuarterHour(value, 15))}
          />
        </View>
        <M2Button
          label="Save this time"
          onPress={() => {
            setTimeOpen(false);
            void save({ preferredWorkoutTime: draftTime }, (current) => ({
              ...current,
              preferredWorkoutTime: draftTime,
            }));
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Learn from my workouts"
          onPress={() => {
            setTimeOpen(false);
            void save({ preferredWorkoutTime: null }, (current) => ({
              ...current,
              preferredWorkoutTime: null,
            }));
          }}
          style={styles.linkHit}
        >
          <Text style={styles.link}>Learn from my workouts</Text>
        </Pressable>
      </BottomSheet>
    </M2Page>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: ink[500],
    fontSize: 15,
  },
  toast: {
    color: brand.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  statusCard: {
    backgroundColor: "#fff",
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  status: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    paddingHorizontal: 2,
    paddingTop: 8,
  },
  pause: {
    gap: 10,
  },
  pauseText: {
    color: ink[700],
    fontSize: 15,
    lineHeight: 21,
  },
  wa: {
    backgroundColor: "#fff",
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  waTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  waTitle: {
    color: ink[900],
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  chip: {
    backgroundColor: brand.paleLavender,
    borderRadius: 999,
    color: brand.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  hint: {
    color: ink[500],
    fontSize: 13,
    lineHeight: 18,
  },
  dim: {
    opacity: 0.55,
  },
  linkHit: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 44,
  },
  link: {
    color: brand.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  clock: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 28,
    marginBottom: 12,
    textAlign: "center",
  },
  stepRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
});
