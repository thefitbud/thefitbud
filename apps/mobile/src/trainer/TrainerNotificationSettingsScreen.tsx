import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, View } from "react-native";
import { Text } from "../components/Text";
import { CircleAlert, WifiOff } from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { NotificationPreferences } from "@fitbud/contracts";
import { semantic } from "@fitbud/tokens";
import { colors, spacing } from "@fitbud/ui-mobile";
import * as Notifications from "expo-notifications";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Snackbar } from "../components/Snackbar";
import { requestPushPermission } from "../notifications/register";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { QuietHoursScreen } from "../trainee/settings/QuietHoursScreen";

type CategoryKey = keyof NotificationPreferences["trainerCategories"];

const TRAINER_CATEGORY_ROWS: Array<{
  key: CategoryKey;
  label: string;
  description: string;
}> = [
  {
    key: "askCoach",
    label: "Clients asked you on WhatsApp",
    description: "Merged when several ask within 15 min",
  },
  {
    key: "checkinSubmitted",
    label: "Check-ins submitted",
    description: "One push per check-in, merged within 15 min",
  },
  {
    key: "criticalDigest",
    label: "Critical items",
    description: "At most one summary an hour",
  },
  {
    key: "intakeSubmitted",
    label: "Intake submitted",
    description: "When a new client finishes their intake",
  },
  {
    key: "renewalsDue",
    label: "Renewals due",
    description: "When coaching renews today or has lapsed",
  },
  {
    key: "mealTimesChanged",
    label: "Client changed meal times",
    description: "Added to the 15-minute batch",
  },
  {
    key: "morningSummary",
    label: "Morning summary at 8:00 am",
    description: "Who needs you and check-ins to review",
  },
];

/** "22:00" -> "10:00 pm" (frame 52). Anything unparseable shows as stored. */
function clock12(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "pm" : "am";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${suffix}`;
}

/** A failed fetch with no HTTP answer: the phone could not reach the API. */
function isOfflineError(err: unknown): boolean {
  return !(err instanceof ApiClientError);
}

type Props = {
  onBack: () => void;
};

export function TrainerNotificationSettingsScreen({ onBack }: Props) {
  const { api } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [osPermission, setOsPermission] = useState<
    "granted" | "denied" | "undetermined"
  >("undetermined");
  const [quietOpen, setQuietOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPrefs(await api.getNotificationPreferences());
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load notification settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
    void Notifications.getPermissionsAsync().then((settings) => {
      setOsPermission(settings.status);
    });
  }, [load]);

  // Optimistic: the switch flips at once and goes back if the save fails
  // (frame 58). Nothing is claimed as saved until the API answers.
  useEffect(() => {
    if (!snack) return undefined;
    const timer = setTimeout(() => setSnack(null), 4000);
    return () => clearTimeout(timer);
  }, [snack]);

  async function toggleTrainerCategory(key: CategoryKey, enabled: boolean) {
    if (!prefs || saving) return;
    if (enabled && osPermission !== "granted") {
      // Android 13+ asks here (frame 54); a refusal leaves the switch off.
      const result = await requestPushPermission();
      if (result === "granted") setOsPermission("granted");
      else {
        if (result === "blocked") void Linking.openSettings();
        return;
      }
    }
    const before = prefs;
    setSaving(true);
    setSnack(null);
    setPrefs({
      ...before,
      trainerCategories: { ...before.trainerCategories, [key]: enabled },
    });
    try {
      const updated = await api.updateNotificationPreferences({
        trainerCategories: { [key]: enabled },
      });
      setPrefs(updated);
      setOffline(false);
    } catch (err) {
      setPrefs(before);
      setOffline(isOfflineError(err));
      setSnack("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (quietOpen) {
    return <QuietHoursScreen onBack={() => setQuietOpen(false)} />;
  }

  const quietLabel =
    prefs?.quietHoursStart && prefs?.quietHoursEnd
      ? `${clock12(prefs.quietHoursStart)} — ${clock12(prefs.quietHoursEnd)}`
      : "10:00 pm — 7:00 am";

  return (
    <Screen
      title="Notifications"
      footerVariant="toast"
      footer={
        snack ? (
          <Snackbar
            message={snack}
            leading={<CircleAlert color={colors.white} size={18} strokeWidth={2} />}
          />
        ) : undefined
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to More"
        onPress={onBack}
        style={styles.back}
      >
        <Text style={styles.backText}>‹ More</Text>
      </Pressable>
      {offline ? (
        <View style={styles.offline} accessibilityRole="alert">
          <WifiOff color={semantic.attention.text} size={20} strokeWidth={1.75} />
          <Text style={styles.offlineText}>
            You're offline. Changes can't be saved right now.
          </Text>
        </View>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {loading || !prefs ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        <View style={styles.stack}>
          {osPermission !== "granted" ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>
                Notifications: Off in phone settings
              </Text>
              <PrimaryButton
                label="Open phone settings"
                variant="secondary"
                onPress={() => {
                  void Linking.openSettings();
                }}
              />
            </View>
          ) : null}
          <Text style={styles.section} accessibilityRole="header">
            Send me a push when
          </Text>
          <View style={styles.group}>
            {TRAINER_CATEGORY_ROWS.map((row, index) => (
              <View
                key={String(row.key)}
                style={[styles.row, index > 0 ? styles.sep : null]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.hint}>{row.description}</Text>
                </View>
                <Switch
                  accessibilityLabel={row.label}
                  trackColor={{ true: colors.indigo, false: "#E5E7EB" }}
                  thumbColor={colors.white}
                  value={prefs.trainerCategories[row.key]}
                  disabled={saving}
                  onValueChange={(value) => {
                    void toggleTrainerCategory(row.key, value);
                  }}
                />
              </View>
            ))}
          </View>
          <Text style={styles.section} accessibilityRole="header">
            Quiet hours
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Quiet hours, no pushes ${quietLabel}`}
            onPress={() => setQuietOpen(true)}
            style={[styles.group, styles.quietRow]}
          >
            <Text style={styles.rowLabel}>No pushes</Text>
            <Text style={styles.hint}>{quietLabel} ›</Text>
          </Pressable>
          <Text style={styles.hint}>
            The web bell always shows everything. At most one push every 15 min.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 15,
  },
  statusCard: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  statusTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  back: {
    justifyContent: "center",
    minHeight: 44,
  },
  backText: {
    color: colors.indigo,
    fontSize: 17,
    fontWeight: "600",
  },
  offline: {
    alignItems: "center",
    backgroundColor: semantic.attention.fill,
    borderColor: "#FDE68A",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  offlineText: {
    color: semantic.attention.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
  },
  section: {
    color: colors.deepNavy,
    fontSize: 17,
    marginTop: spacing.sm,
  },
  group: {
    backgroundColor: colors.white,
    borderRadius: 16,
    overflow: "hidden",
  },
  sep: {
    borderTopColor: "#E5E7EB",
    borderTopWidth: 1,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
    paddingRight: spacing.md,
  },
  rowLabel: {
    color: colors.deepNavy,
    fontSize: 17,
    fontWeight: "600",
  },
  hint: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 19,
  },
  quietRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
});
