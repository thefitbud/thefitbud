import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import type { StepsSettingsResponse } from "@fitbud/contracts";
import { useConfig } from "../../providers/ConfigProvider";
import { isStepsEnabled } from "../../lib/config";
import { useAuth } from "../../auth/AuthProvider";
import { getMeSteps } from "../../lib/meStepsApi";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
};

export function StepsSettingsScreen({ onBack }: Props) {
  const { config } = useConfig();
  const { accessToken } = useAuth();
  const stepsFlag = isStepsEnabled(config);
  const [settings, setSettings] = useState<StepsSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const value = await getMeSteps(accessToken);
      setSettings(value);
    } catch {
      setSettings({ enabled: false, dailyGoal: null, source: null });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!stepsFlag || (!loading && settings && !settings.enabled)) {
    return (
      <Screen title="Steps" subtitle="Optional on-device step count.">
        <View style={styles.stack}>
          <Text style={styles.body}>
            Step counting isn&apos;t enabled for this app build yet. The server
            returns steps as disabled while <Text style={styles.mono}>steps_enabled</Text> is
            off.
          </Text>
          <Text style={styles.muted}>
            When enabled, steps stay on your phone only — they&apos;re never sent
            to FitBud or shared with your coach.
          </Text>
          <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Steps"
      subtitle="Connect Health Connect or Apple Health to see today's steps on Today."
    >
      <View style={styles.stack}>
        {loading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : (
          <>
            <Text style={styles.body}>
              Steps are for your eyes only. FitBud does not upload them or show
              them to your trainer.
            </Text>
            <Text style={styles.body}>
              Daily goal: {settings?.dailyGoal ?? "Not set"}
            </Text>
            <Text style={styles.muted}>
              Source: {settings?.source ?? "Not connected"}
            </Text>
          </>
        )}
        <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  body: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  mono: {
    fontFamily: "monospace",
  },
});
