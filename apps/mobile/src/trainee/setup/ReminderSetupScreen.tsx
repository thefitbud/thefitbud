import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useConfig } from "../../providers/ConfigProvider";
import { isWhatsAppAutomationEnabled } from "../../lib/config";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onDone: () => void;
  onOpenQuietHours: () => void;
};

const WORKOUT_CHIPS = [
  "Morning (6–9)",
  "Midday (12–2)",
  "Evening (5–8)",
  "Night (8–10)",
  "Varies",
];

export function ReminderSetupScreen({ onDone, onOpenQuietHours }: Props) {
  const { config } = useConfig();
  const waOn = isWhatsAppAutomationEnabled(config);
  const [workoutChip, setWorkoutChip] = useState<string | null>(null);

  return (
    <Screen
      title="Reminder setup"
      subtitle="Choose when and how FitBud nudges you to log."
    >
      <View style={styles.stack}>
        <Text style={styles.sectionTitle}>When do you usually work out?</Text>
        <View style={styles.chips}>
          {WORKOUT_CHIPS.map((chip) => (
            <PrimaryButton
              key={chip}
              label={chip}
              variant={workoutChip === chip ? "primary" : "secondary"}
              onPress={() => setWorkoutChip(chip)}
            />
          ))}
        </View>
        <Text style={styles.helper}>
          We remind you about an hour after this time only if the workout is
          still unlogged.
        </Text>

        <Text style={styles.sectionTitle}>How should we remind you?</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>App notifications (recommended)</Text>
          <Text style={styles.body}>Selected by default.</Text>
        </View>
        <View style={[styles.card, !waOn ? styles.cardDisabled : null]}>
          <Text style={styles.cardTitle}>
            App + WhatsApp backup{" "}
            {!waOn ? (
              <Text style={styles.comingSoon}>· Coming soon</Text>
            ) : null}
          </Text>
          <Text style={styles.body}>
            {waOn
              ? "If app notifications miss you, WhatsApp can send one utility reminder a day."
              : "WhatsApp reminders are coming soon. For now we'll remind you in the app. Your coach can still message you on WhatsApp anytime."}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Quiet hours</Text>
        <Text style={styles.body}>
          Default 22:00–07:00.{" "}
          <Text style={styles.link} onPress={onOpenQuietHours}>
            Change
          </Text>
        </Text>

        <PrimaryButton label="Done" onPress={onDone} />
        <PrimaryButton label="Skip for now" variant="ghost" onPress={onDone} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  chips: {
    gap: spacing.sm,
  },
  helper: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  cardDisabled: {
    opacity: 0.88,
  },
  cardTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  body: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  comingSoon: {
    color: colors.indigo,
    fontWeight: "600",
  },
  link: {
    color: colors.indigo,
    fontWeight: "600",
  },
});
