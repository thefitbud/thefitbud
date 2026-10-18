import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Switch, View } from "react-native";
import { Text } from "../../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { NotificationPreferences } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import * as Notifications from "expo-notifications";
import { useConfig } from "../../providers/ConfigProvider";
import { isWhatsAppAutomationEnabled } from "../../lib/config";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";
import { ensureAndroidNotificationChannels } from "../../notifications/androidChannels";

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
  const [osPermission, setOsPermission] = useState<
    "granted" | "denied" | "undetermined"
  >("undetermined");

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

  useEffect(() => {
    void (async () => {
      await ensureAndroidNotificationChannels();
      const settings = await Notifications.getPermissionsAsync();
      setOsPermission(settings.status);
    })();
  }, []);

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
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>
              {osPermission === "granted" && prefs.pushEnabled
                ? "Notifications: On"
                : osPermission !== "granted"
                  ? "Notifications: Off in phone settings"
                  : "Notifications: Off in FitBud"}
            </Text>
            <Text style={styles.hint}>
              {osPermission !== "granted"
                ? "Turn on notifications in your phone settings so reminders can reach you."
                : "Category toggles below control workout, meal, check-in, and summary reminders."}
            </Text>
            {osPermission !== "granted" ? (
              <PrimaryButton
                label="Turn on in Settings"
                variant="secondary"
                onPress={() => {
                  void Linking.openSettings();
                }}
              />
            ) : null}
          </View>
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
          <View style={[styles.row, styles.waRow, !waOn ? styles.waDisabled : null]}>
            <View style={styles.waText}>
              <Text style={styles.rowLabel}>WhatsApp reminders</Text>
              {!waOn ? (
                <Text style={styles.comingSoon}>Coming soon</Text>
              ) : null}
              <Text style={styles.hint}>
                {waOn
                  ? "Used only when app notifications don't reach you."
                  : "WhatsApp reminders are coming soon. For now we'll remind you in the app."}
              </Text>
            </View>
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
