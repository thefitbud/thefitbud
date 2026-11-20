import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { BellOff, PauseCircle } from "lucide-react-native";
import { userFacingMessage } from "@fitbud/api-client";
import type { NotificationPreferences, ReminderStatus } from "@fitbud/contracts";
import { formatCivilDate, formatHhMmTime, formatLocalDate } from "@fitbud/core";
import { Text } from "../../components/Text";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useAuth } from "../../auth/AuthProvider";
import { reportError } from "../../lib/reportError";
import { stage1Api } from "../../lib/stage1Api";
import { ensureAndroidNotificationChannels } from "../../notifications/androidChannels";
import { ThemeScope, createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { clockLabel, shiftQuarterHour } from "./clock";
import { zoneName } from "./AccountScreen";
import { M2Group, M2Page, M2Section, M2Stepper, M2SwitchRow } from "./m2";

type CategoryKey = "workoutReminder" | "mealReminder" | "checkinReminder" | "dailySummaryReminder";

type Props = {
  onBack: () => void;
  onOpenQuietHours: () => void;
  onOpenMealTimes?: () => void;
  onOpenBatteryHelp?: () => void;
  /** The coach's name for "Updates from …". */
  coachName?: string;
};

const PENDING_KEY = "fitbud.reminder-prefs.pending";

function browserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function rememberLocal(body: unknown) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PENDING_KEY, JSON.stringify(body));
  } catch (err) {
    reportError("ReminderSettings.rememberLocal", err);
  }
}

/** "10 pm – 7 am" (TR-16a): whole hours drop ":00". */
export function quietRangeLabel(start: string, end: string): string {
  const short = (value: string) => clockLabel(value).replace(":00", "");
  return `${short(start)} – ${short(end)}`;
}

/**
 * TR-16a reminders, TR-16b with notifications off in the phone's settings.
 * One switch per kind of reminder; the label of a row opens its detail
 * (workout time, meal times). The quiet hours card opens quiet hours. The old
 * master switch, "Learn from my workouts" row, the coach-nudge note and the
 * WhatsApp card are gone (Z12-25 → Z12-49).
 */
function ReminderSettingsScreenBody({
  onBack,
  onOpenQuietHours,
  onOpenMealTimes,
  onOpenBatteryHelp,
  coachName,
}: Props) {
  const { api, me } = useAuth();
  const theme = useTheme();
  const styles = useStyles();
  const s1 = stage1Api(api);
  const zone = me?.timezone || "Asia/Kolkata";
  const coachFirst = coachName?.trim().split(/\s+/)[0] || "your coach";
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [osDenied, setOsDenied] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [draftTime, setDraftTime] = useState("18:00");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextPrefs, nextStatus] = await Promise.all([
        api.getNotificationPreferences(),
        s1.getReminderStatus().catch((err: unknown) => {
          // The status only adds the paused notice and coach-off hints.
          reportError("ReminderSettings.status", err);
          return null;
        }),
      ]);
      setPrefs(nextPrefs);
      setStatus(nextStatus);
    } catch (err) {
      reportError("ReminderSettings.load", err);
      setError(
        browserOffline()
          ? "You're offline. Pull to try again."
          : userFacingMessage(err, {
              fallback: "Couldn't load reminder settings. Pull to try again.",
            }),
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
    void import("expo-notifications")
      .then(async (Notifications) => {
        const settings = await Notifications.getPermissionsAsync();
        setOsDenied(settings.status === "denied");
      })
      .catch((err: unknown) => reportError("ReminderSettings.permission", err));
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
        setToast("Saved on this phone. We'll sync it when you're back online.");
        return;
      }
      reportError("ReminderSettings.save", err);
      setPrefs(previous);
      setError(
        userFacingMessage(err, { fallback: "Couldn't save that. Try again." }),
      );
    }
  }

  const permissionOff = osDenied || (status != null && status.pushDeliverable === false);
  const appOff = prefs != null && !prefs.pushEnabled;
  const paused =
    status?.mode === "paused"
      ? status.pausedUntil
        ? `Meal reminders are paused until ${formatCivilDate(formatLocalDate(new Date(status.pausedUntil), zone))} because they weren't helping.`
        : "Meal reminders are paused because they weren't helping."
      : null;
  const workoutTime = prefs?.preferredWorkoutTime ?? null;
  const switchesDisabled = permissionOff || appOff || !prefs;

  function categoryOff(key: CategoryKey): boolean {
    if (!status) return false;
    if (key === "workoutReminder") return status.trainerDisabled.workoutReminder;
    if (key === "mealReminder") return status.trainerDisabled.mealReminder;
    if (key === "checkinReminder") return status.trainerDisabled.checkinReminder;
    return false;
  }

  function on(key: CategoryKey): boolean {
    if (permissionOff || appOff) return false;
    return Boolean(prefs?.categories[key]) && !categoryOff(key);
  }

  function setCategory(key: CategoryKey, enabled: boolean) {
    void save({ categories: { [key]: enabled } }, (current) => ({
      ...current,
      categories: { ...current.categories, [key]: enabled },
    }));
  }

  return (
    <M2Page
      title="Reminders"
      onBack={onBack}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      testID="reminders"
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <Text accessibilityLabel="Loading reminders" tone="ink3">
          Loading…
        </Text>
      ) : null}
      {toast ? (
        <Text accessibilityLiveRegion="polite" tone="done" style={styles.toast}>
          {toast}
        </Text>
      ) : null}

      {permissionOff ? (
        <View style={styles.warn} accessibilityRole="alert" testID="reminders-permission-off">
          <BellOff color={theme.colors.warnInk} size={22} strokeWidth={1.9} />
          <Text style={styles.warnText}>
            Notifications are off for FitBud, so reminders can&apos;t reach you.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
            onPress={() => {
              void Linking.openSettings().catch((err: unknown) =>
                reportError("ReminderSettings.openSettings", err),
              );
            }}
            style={styles.warnAction}
          >
            <Text style={styles.warnActionText}>Open Settings</Text>
          </Pressable>
        </View>
      ) : appOff ? (
        <View style={styles.warn} accessibilityRole="alert">
          <BellOff color={theme.colors.warnInk} size={22} strokeWidth={1.9} />
          <Text style={styles.warnText}>Reminders are off in FitBud.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Turn on"
            onPress={() => {
              void save({ pushEnabled: true }, (current) => ({ ...current, pushEnabled: true }));
            }}
            style={styles.warnAction}
          >
            <Text style={styles.warnActionText}>Turn on</Text>
          </Pressable>
        </View>
      ) : null}

      {paused ? (
        <View style={styles.warn}>
          <PauseCircle color={theme.colors.warnInk} size={22} strokeWidth={1.9} />
          <Text style={styles.warnText}>{paused}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Turn back on"
            onPress={() => {
              void s1
                .resumeReminders()
                .then((next) => {
                  setStatus(next);
                  setToast("Saved");
                })
                .catch((err: unknown) => {
                  reportError("ReminderSettings.resume", err);
                  setError(
                    userFacingMessage(err, { fallback: "Couldn't turn them back on. Try again." }),
                  );
                });
            }}
            style={styles.warnAction}
          >
            <Text style={styles.warnActionText}>Turn back on</Text>
          </Pressable>
        </View>
      ) : null}

      <M2Section label="Remind me about" />
      <M2Group>
        <M2SwitchRow
          label="Workout"
          hint={
            categoryOff("workoutReminder")
              ? "Your coach has turned these off."
              : workoutTime
                ? `At ${formatHhMmTime(workoutTime)} on workout days`
                : "At your usual workout time"
          }
          textAccessibilityLabel="Workout reminder time"
          onPressText={() => {
            setDraftTime(workoutTime ?? "18:00");
            setTimeOpen(true);
          }}
          value={on("workoutReminder")}
          disabled={switchesDisabled || categoryOff("workoutReminder")}
          onValueChange={(enabled) => setCategory("workoutReminder", enabled)}
        />
        <M2SwitchRow
          label="Meals"
          hint={
            categoryOff("mealReminder")
              ? "Your coach has turned these off."
              : "When each meal is due"
          }
          textAccessibilityLabel="Meal times"
          onPressText={onOpenMealTimes}
          value={on("mealReminder")}
          disabled={switchesDisabled || categoryOff("mealReminder")}
          onValueChange={(enabled) => setCategory("mealReminder", enabled)}
        />
        <M2SwitchRow
          label="Check-in"
          hint={
            categoryOff("checkinReminder")
              ? "Your coach has turned these off."
              : "The day your check-in is due"
          }
          value={on("checkinReminder")}
          disabled={switchesDisabled || categoryOff("checkinReminder")}
          onValueChange={(enabled) => setCategory("checkinReminder", enabled)}
        />
        <M2SwitchRow
          label="Evening summary"
          hint="One note by 9:30 pm if anything's left"
          value={on("dailySummaryReminder")}
          disabled={switchesDisabled}
          onValueChange={(enabled) => setCategory("dailySummaryReminder", enabled)}
        />
        <M2SwitchRow
          label={`Updates from ${coachFirst}`}
          hint={`When ${coachFirst} logs or edits something for you`}
          value={!permissionOff && !appOff && (prefs?.coachLogUpdates ?? true)}
          disabled={switchesDisabled}
          onValueChange={(enabled) => {
            void save({ coachLogUpdates: enabled }, (current) => ({
              ...current,
              coachLogUpdates: enabled,
            }));
          }}
        />
      </M2Group>

      {permissionOff ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quiet hours"
          onPress={onOpenQuietHours}
          style={styles.quiet}
          testID="reminders-quiet-hours"
        >
          <View style={styles.quietTop}>
            <Text style={styles.quietLabel}>Quiet hours</Text>
            <Text style={styles.quietValue}>
              {prefs?.quietHoursStart && prefs.quietHoursEnd
                ? quietRangeLabel(prefs.quietHoursStart, prefs.quietHoursEnd)
                : "10 pm – 7 am"}
            </Text>
          </View>
          <Text tone="ink2" style={styles.quietHint}>
            No reminders at night. Times use {zoneName(prefs?.traineeTimezone ?? zone)}.
          </Text>
        </Pressable>
      )}

      {onOpenBatteryHelp && Platform.OS === "android" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reminders not arriving?"
          onPress={onOpenBatteryHelp}
          style={styles.linkHit}
        >
          <Text tone="brand" style={styles.link}>
            Reminders not arriving?
          </Text>
        </Pressable>
      ) : null}

      <BottomSheet
        visible={timeOpen}
        title="Workout time"
        subtitle="We'll remind you about an hour after this if it isn't logged."
        onDismiss={() => setTimeOpen(false)}
      >
        <M2Stepper
          value={clockLabel(draftTime)}
          lessLabel="Earlier"
          moreLabel="Later"
          onDecrement={() => setDraftTime((value) => shiftQuarterHour(value, -15))}
          onIncrement={() => setDraftTime((value) => shiftQuarterHour(value, 15))}
        />
        <View style={styles.sheetActions}>
          <Button
            label="Save this time"
            onPress={() => {
              setTimeOpen(false);
              void save({ preferredWorkoutTime: draftTime }, (current) => ({
                ...current,
                preferredWorkoutTime: draftTime,
              }));
            }}
          />
          <Button
            label="Learn from my workouts"
            variant="text"
            onPress={() => {
              setTimeOpen(false);
              void save({ preferredWorkoutTime: null }, (current) => ({
                ...current,
                preferredWorkoutTime: null,
              }));
            }}
          />
        </View>
      </BottomSheet>
    </M2Page>
  );
}

const useStyles = createThemedStyles((t) => ({
  toast: { fontSize: 14, fontWeight: "600" },
  warn: {
    alignItems: "center",
    backgroundColor: t.colors.warnTint,
    borderRadius: 20,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  warnText: { color: t.colors.warnInk, flex: 1, fontSize: 16, lineHeight: 22 },
  warnAction: { justifyContent: "center", minHeight: 44 },
  warnActionText: { color: t.colors.ink, fontSize: 16, fontWeight: "600" },
  quiet: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 20,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  quietTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  quietLabel: { color: t.colors.ink, fontSize: 17 },
  quietValue: { color: t.colors.ink, fontSize: 18, fontWeight: "700" },
  quietHint: { fontSize: 14, lineHeight: 19 },
  linkHit: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
  link: { fontSize: 16, fontWeight: "600" },
  sheetActions: { gap: 8, marginTop: 16 },
}));

/** ReminderSettingsScreen in the system theme (Z12-49): its own styles read the scope. */
export function ReminderSettingsScreen(props: Parameters<typeof ReminderSettingsScreenBody>[0]) {
  return (
    <ThemeScope scheme="system">
      <ReminderSettingsScreenBody {...props} />
    </ThemeScope>
  );
}
