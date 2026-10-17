import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useConfig } from "../../providers/ConfigProvider";
import { isStepsEnabled } from "../../lib/config";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
};

export function StepsSettingsScreen({ onBack }: Props) {
  const { config } = useConfig();
  const stepsOn = isStepsEnabled(config);

  if (!stepsOn) {
    return (
      <Screen title="Steps" subtitle="Optional on-device step count.">
        <View style={styles.stack}>
          <Text style={styles.body}>
            Step counting isn't enabled for this app build yet. When it is, steps
            stay on your phone only — they're never sent to FitBud or shared
            with your coach.
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
        <Text style={styles.body}>
          Steps are for your eyes only. FitBud does not upload them or show them
          to your trainer.
        </Text>
        <Text style={styles.muted}>
          Health integration wiring is behind the steps_enabled flag (TR-25
          spike).
        </Text>
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
});
