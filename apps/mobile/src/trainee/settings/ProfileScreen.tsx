import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
  onChangePassword: () => void;
};

export function ProfileScreen({ onBack, onChangePassword }: Props) {
  const { me, api } = useAuth();
  const [timezone, setTimezone] = useState("");
  const [locale, setLocale] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prefs = await api.getNotificationPreferences();
      setTimezone(prefs.traineeTimezone ?? me?.timezone ?? "");
      setLocale(prefs.locale ?? "en-IN");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load profile preferences.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, me?.timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveLocalePrefs() {
    setSaving(true);
    setError(null);
    try {
      await api.updateNotificationPreferences({
        traineeTimezone: timezone.trim() || null,
        locale: locale.trim() || null,
      });
      onBack();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Profile" subtitle="Your account details.">
      {error ? <ErrorBanner message={error} /> : null}
      <View style={styles.stack}>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{me?.email ?? "Not set"}</Text>
        </View>
        {loading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : (
          <>
            <Field
              label="Timezone"
              value={timezone}
              onChangeText={setTimezone}
              placeholder="Asia/Kolkata"
              autoCapitalize="none"
            />
            <Field
              label="Locale"
              value={locale}
              onChangeText={setLocale}
              placeholder="en-IN"
              autoCapitalize="none"
            />
            <PrimaryButton
              label="Save timezone & locale"
              loading={saving}
              onPress={() => {
                void saveLocalePrefs();
              }}
            />
          </>
        )}
        <PrimaryButton label="Change password" onPress={onChangePassword} />
        <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  label: {
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  value: {
    color: colors.deepNavy,
    fontSize: 16,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
  },
});
