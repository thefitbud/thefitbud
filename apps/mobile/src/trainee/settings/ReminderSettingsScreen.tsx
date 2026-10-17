import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { NotificationPreferences } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useConfig } from "../../providers/ConfigProvider";
import { isWhatsAppAutomationEnabled } from "../../lib/config";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type CategoryKey = keyof NotificationPreferences["categories"];

const CATEGORY_ROWS: Array<{
  key: CategoryKey;
  label: string;
  description: string;
}> = [
  {
    key: "workoutReminder",
    label: "Workout reminders",
    description:
      "About an hour after your usual workout time if it isn't logged.",
  },
  {
    key: "mealReminder",
    label: "Meal reminders",
    description: "About 40 min after each meal time if it isn't logged.",
  },
  {
    key: "checkinReminder",
    label: "Check-in reminders",
    description: "The day your check-in is due.",
  },
  {
    key: "dailySummaryReminder",
    label: "Daily summary",
    description: "One evening note if anything's left, by 9:30 pm.",
  },
  {
    key: "subscriptionRenewalReminder",
    label: "Plan renewal",
    description: "When your coaching plan renewal window opens.",
  },
];

type Props = {
  onBack: () => void;
  onOpenQuietHours: () => void;
  onOpenMealTimes?: () => void;
  onOpenBatteryHelp?: () => void;
};

export function ReminderSettingsScreen({
  onBack,
  onOpenQuietHours,
  onOpenMealTimes,
  onOpenBatteryHelp,
}: Props) {
  const { api } = useAuth();
  const { config } = useConfig();
  const waOn = isWhatsAppAutomationEnabled(config);
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

  const quietLabel =
    prefs?.quietHoursStart && prefs?.quietHoursEnd
      ? `${prefs.quietHoursStart} – ${prefs.quietHoursEnd}`
      : "22:00 – 07:00";

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
            <View key={String(row.key)} style={styles.categoryBlock}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Switch
                  value={prefs.categories[row.key]}
                  disabled={saving || !prefs.pushEnabled}
                  onValueChange={(value) => {
                    void toggleCategory(row.key, value);
                  }}
                />
              </View>
              <Text style={styles.hint}>{row.description}</Text>
            </View>
          ))}
          <Text style={styles.coachCopy}>
            Coach nudges: your coach can send a reminder about a specific item.
            It follows your quiet hours and can't be turned off separately.
          </Text>
          <PressableRow
            label="Quiet hours"
            value={quietLabel}
            onPress={onOpenQuietHours}
          />
          {onOpenMealTimes ? (
            <PressableRow
              label="Meal times"
              value="Using your plan's meal times"
              onPress={onOpenMealTimes}
            />
          ) : null}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Reminder channel</Text>
            <Switch
              value={prefs.channelPreference === "app_and_whatsapp"}
              disabled={saving || !prefs.pushEnabled || !waOn}
              onValueChange={(value) => {
                void (async () => {
                  setSaving(true);
                  try {
                    const updated = await api.updateNotificationPreferences({
                      channelPreference: value ? "app_and_whatsapp" : "app",
                    });
                    setPrefs(updated);
                  } catch (err) {
                    setError(
                      err instanceof ApiClientError
                        ? err.message
                        : "Could not save channel.",
                    );
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
            />
          </View>
          <Text style={styles.hint}>
            {waOn
              ? "WhatsApp is a backup when app notifications don't reach you."
              : "WhatsApp channel is off in this build — app notifications only."}
          </Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>WhatsApp opt-in</Text>
            <Switch
              value={prefs.whatsappOptIn.granted}
              disabled={saving || !waOn}
              onValueChange={(value) => {
                void (async () => {
                  setSaving(true);
                  try {
                    const updated = await api.updateNotificationPreferences({
                      whatsappOptIn: {
                        granted: value,
                        source: "mobile_reminder_settings",
                        textVersion: "2026.10",
                      },
                    });
                    setPrefs(updated);
                  } catch (err) {
                    setError(
                      err instanceof ApiClientError
                        ? err.message
                        : "Could not save WhatsApp opt-in.",
                    );
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
            />
          </View>
          {onOpenBatteryHelp ? (
            <PrimaryButton
              label="Reminders not arriving?"
              variant="secondary"
              onPress={onOpenBatteryHelp}
            />
          ) : (
            <PrimaryButton
              label="Open phone notification settings"
              variant="secondary"
              onPress={() => {
                void Linking.openSettings();
              }}
            />
          )}
          <PrimaryButton label="Done" variant="ghost" onPress={onBack} />
        </View>
      )}
    </Screen>
  );
}

function PressableRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <PrimaryButton label={`${label}: ${value}`} variant="secondary" onPress={onPress} />
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
  coachCopy: {
    color: colors.darkGrey,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },
  waRow: {
    alignItems: "flex-start",
  },
  waDisabled: {
    opacity: 0.9,
  },
  waText: {
    flex: 1,
    gap: spacing.xs,
  },
  comingSoon: {
    color: colors.indigo,
    fontWeight: "600",
  },
});
