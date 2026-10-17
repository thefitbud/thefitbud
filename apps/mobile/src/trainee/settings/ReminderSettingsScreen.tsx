import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { NotificationPreferences } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type CategoryKey = keyof NotificationPreferences["categories"];

const CATEGORY_ROWS: Array<{ key: CategoryKey; label: string }> = [
  { key: "workoutReminder", label: "Workout reminders" },
  { key: "mealReminder", label: "Meal reminders" },
  { key: "checkinReminder", label: "Check-in reminders" },
  { key: "subscriptionRenewalReminder", label: "Subscription renewal" },
];

type Props = {
  onBack: () => void;
  onOpenQuietHours: () => void;
};

export function ReminderSettingsScreen({ onBack, onOpenQuietHours }: Props) {
  const { api } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await api.getNotificationPreferences();
      setPrefs(value);
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
  }, [load]);

  async function togglePush(enabled: boolean) {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateNotificationPreferences({
        pushEnabled: enabled,
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

  async function toggleCategory(key: CategoryKey, enabled: boolean) {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateNotificationPreferences({
        categories: { [key]: enabled },
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

  return (
    <Screen
      title="Reminder settings"
      subtitle="Push categories only. Timing follows your plan and quiet hours."
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading || !prefs ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        <View style={styles.stack}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Push notifications</Text>
            <Switch
              value={prefs.pushEnabled}
              disabled={saving}
              onValueChange={(value) => {
                void togglePush(value);
              }}
            />
          </View>
          {CATEGORY_ROWS.map((row) => (
            <View key={String(row.key)} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Switch
                value={prefs.categories[row.key]}
                disabled={saving || !prefs.pushEnabled}
                onValueChange={(value) => {
                  void toggleCategory(row.key, value);
                }}
              />
            </View>
          ))}
          <PrimaryButton
            label="Quiet hours"
            variant="secondary"
            onPress={onOpenQuietHours}
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
});
