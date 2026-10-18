import { useMemo, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import * as Notifications from "expo-notifications";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { useConfig } from "../../providers/ConfigProvider";
import { isWhatsAppAutomationEnabled } from "../../lib/config";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";
import { OemBatterySheet } from "./OemBatterySheet";

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
  const { me } = useAuth();
  const waOn = isWhatsAppAutomationEnabled(config);
  const [step, setStep] = useState(0);
  const [workoutChip, setWorkoutChip] = useState<string | null>(null);
  const [permissionNote, setPermissionNote] = useState<string | null>(null);
  const [showOem, setShowOem] = useState(false);

  const timeZoneLabel = useMemo(() => {
    const tz = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: tz,
        timeZoneName: "longGeneric",
      }).formatToParts(new Date());
      const name = parts.find((p) => p.type === "timeZoneName")?.value;
      return name ? `${name} (${tz})` : tz;
    } catch {
      return tz;
    }
  }, [me?.timezone]);

  async function requestPushPermission() {
    setPermissionNote(null);
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      setPermissionNote("Notifications are already allowed.");
      setStep(3);
      return;
    }
    const result = await Notifications.requestPermissionsAsync();
    if (result.granted) {
      setStep(3);
      return;
    }
    setPermissionNote(
      "No problem. You can turn notifications on later in Settings.",
    );
    setStep(3);
  }

  if (showOem) {
    return (
      <OemBatterySheet
        onDone={() => {
          setShowOem(false);
          onDone();
        }}
      />
    );
  }

  return (
    <Screen
      title="Reminder setup"
      subtitle={`Step ${step + 1} of 4 · Choose when and how FitBud nudges you.`}
    >
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[styles.dot, index === step ? styles.dotActive : null]}
          />
        ))}
      </View>

      <View style={styles.stack}>
        {step === 0 ? (
          <>
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
              still unlogged. You can change it anytime in Settings.
            </Text>
          </>
        ) : null}

        {step === 1 ? (
          <>
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
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.sectionTitle}>Allow notifications</Text>
            <View style={styles.sample}>
              <Text style={styles.sampleTitle}>Lunch isn't logged yet</Text>
              <Text style={styles.sampleBody}>Eaten as planned · Something different</Text>
            </View>
            <PrimaryButton
              label="Allow notifications"
              onPress={() => {
                void requestPushPermission();
              }}
            />
            <PrimaryButton
              label="Not now"
              variant="ghost"
              onPress={() => setStep(3)}
            />
            {permissionNote ? (
              <Text style={styles.helper}>{permissionNote}</Text>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.sectionTitle}>Almost done</Text>
            <Text style={styles.body}>
              Quiet hours default to 22:00–07:00.{" "}
              <Text style={styles.link} onPress={onOpenQuietHours}>
                Change
              </Text>
            </Text>
            <Text style={styles.body}>
              Times shown in {timeZoneLabel} · from your phone.
            </Text>
            <Text style={styles.body}>
              Meal reminders follow your plan's times. Adjust anytime under Settings
              › Meal times.
            </Text>
            {Platform.OS === "android" ? (
              <PrimaryButton
                label="Battery & background tips"
                variant="secondary"
                onPress={() => setShowOem(true)}
              />
            ) : null}
          </>
        ) : null}

        <View style={styles.nav}>
          {step < 3 ? (
            <>
              <PrimaryButton
                label="Continue"
                onPress={() => setStep((value) => Math.min(3, value + 1))}
              />
              <PrimaryButton
                label="Skip step"
                variant="ghost"
                onPress={() => setStep((value) => Math.min(3, value + 1))}
              />
            </>
          ) : (
            <>
              <PrimaryButton label="Done" onPress={onDone} />
              <PrimaryButton
                label="Open phone settings"
                variant="ghost"
                onPress={() => {
                  void Linking.openSettings();
                }}
              />
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot: {
    backgroundColor: colors.lightGrey,
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: colors.indigo,
    width: 18,
  },
  stack: {
    gap: spacing.md,
  },
  nav: {
    gap: spacing.sm,
    marginTop: spacing.lg,
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
  sample: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  sampleTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  sampleBody: {
    color: colors.midGrey,
    fontSize: 13,
  },
});
