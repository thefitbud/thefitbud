import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { NotificationPreferences } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import * as Notifications from "expo-notifications";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
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
    label: "Asked you on WhatsApp",
    description: "When a client asks about a meal, workout, or check-in.",
  },
  {
    key: "checkinSubmitted",
    label: "Check-ins submitted",
    description: "When a client sends their weekly check-in.",
  },
  {
    key: "intakeSubmitted",
    label: "Intake submitted",
    description: "When onboarding answers are ready to review.",
  },
  {
    key: "criticalDigest",
    label: "Needs attention digest",
    description: "A short list of clients who need a look.",
  },
  {
    key: "renewalsDue",
    label: "Renewals due",
    description: "When a coaching renewal window opens.",
  },
  {
    key: "mealTimesChanged",
    label: "Meal times changed",
    description: "When a client updates their meal times.",
  },
  {
    key: "morningSummary",
    label: "Morning summary",
    description: "A once-a-day overview of your roster.",
  },
];

type Props = {
  onBack: () => void;
};

export function TrainerNotificationSettingsScreen({ onBack }: Props) {
  const { api } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  async function toggleTrainerCategory(key: CategoryKey, enabled: boolean) {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateNotificationPreferences({
        trainerCategories: { [key]: enabled },
      });
      setPrefs(updated);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save setting.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (quietOpen) {
    return <QuietHoursScreen onBack={() => setQuietOpen(false)} />;
  }

  const quietLabel =
    prefs?.quietHoursStart && prefs?.quietHoursEnd
      ? `${prefs.quietHoursStart} – ${prefs.quietHoursEnd}`
      : "22:00 – 07:00";

  return (
    <Screen title="Notifications" subtitle="Trainer push categories and quiet hours.">
      {error ? <ErrorBanner message={error} /> : null}
      {loading || !prefs ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        <View style={styles.stack}>
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>
              {osPermission === "granted"
                ? "Notifications: On"
                : "Notifications: Off in phone settings"}
            </Text>
            {osPermission !== "granted" ? (
              <PrimaryButton
                label="Open phone settings"
                variant="secondary"
                onPress={() => {
                  void Linking.openSettings();
                }}
              />
            ) : null}
          </View>
          {TRAINER_CATEGORY_ROWS.map((row) => (
            <View key={String(row.key)} style={styles.categoryBlock}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Switch
                  value={prefs.trainerCategories[row.key]}
                  disabled={saving || osPermission !== "granted"}
                  onValueChange={(value) => {
                    void toggleTrainerCategory(row.key, value);
                  }}
                />
              </View>
              <Text style={styles.hint}>{row.description}</Text>
            </View>
          ))}
          <PrimaryButton
            label={`Quiet hours: ${quietLabel}`}
            variant="secondary"
            onPress={() => setQuietOpen(true)}
          />
          <PrimaryButton label="Done" variant="ghost" onPress={onBack} />
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
  categoryBlock: {
    gap: spacing.xs,
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLabel: {
    color: colors.deepNavy,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    paddingRight: spacing.md,
  },
  hint: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
});
