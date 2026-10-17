import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { QuietHoursPreviewBar } from "../../components/QuietHoursPreviewBar";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
};

const PRESETS: Array<{ label: string; start: string; end: string }> = [
  { label: "Night 10 pm–7 am", start: "22:00", end: "07:00" },
  { label: "Late night 11 pm–6 am", start: "23:00", end: "06:00" },
];

export function QuietHoursScreen({ onBack }: Props) {
  const { api } = useAuth();
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const prefs = await api.getNotificationPreferences();
      setStart(prefs.quietHoursStart ?? "22:00");
      setEnd(prefs.quietHoursEnd ?? "07:00");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load quiet hours.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateNotificationPreferences({
        quietHoursStart: start,
        quietHoursEnd: end,
      });
      onBack();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save times.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Quiet hours"
      subtitle="We won't send push reminders during these hours (your local time)."
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        <View style={styles.stack}>
          <Text style={styles.explain}>
            No notifications during these hours. Reminders that would fall here
            are skipped, not saved for later. Your coach can&apos;t override
            this. FitBud never sends reminders after 10 pm even if your quiet
            hours start later.
          </Text>
          <QuietHoursPreviewBar quietStart={start} quietEnd={end} />
          {PRESETS.map((preset) => (
            <PrimaryButton
              key={preset.label}
              label={preset.label}
              variant="secondary"
              onPress={() => {
                setStart(preset.start);
                setEnd(preset.end);
              }}
            />
          ))}
          <Text style={styles.label}>From</Text>
          <TextInput
            accessibilityLabel="Quiet hours start"
            value={start}
            onChangeText={setStart}
            placeholder="22:00"
            placeholderTextColor={colors.midGrey}
            style={styles.input}
          />
          <Text style={styles.label}>To</Text>
          <TextInput
            accessibilityLabel="Quiet hours end"
            value={end}
            onChangeText={setEnd}
            placeholder="07:00"
            placeholderTextColor={colors.midGrey}
            style={styles.input}
          />
          <PrimaryButton label="Save" loading={saving} onPress={() => void save()} />
          <PrimaryButton label="Cancel" variant="ghost" onPress={onBack} />
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
  explain: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    color: colors.deepNavy,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.nearBlack,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
});
