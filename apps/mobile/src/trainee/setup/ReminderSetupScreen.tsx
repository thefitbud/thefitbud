import { useMemo, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import * as Notifications from "expo-notifications";
import { ChevronRight, Clock, Info } from "lucide-react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { useConfig } from "../../providers/ConfigProvider";
import { isWhatsAppAutomationEnabled } from "../../lib/config";
import { Button } from "../../components/Button";
import {
  Dots4,
  M2Screen,
  M2TopNav,
  NoteCallout,
  RadioCard,
} from "../../components/m2";
import { OemBatterySheet } from "./OemBatterySheet";

type Props = {
  onDone: () => void;
  onOpenQuietHours: () => void;
};

const WORKOUT_SLOTS = [
  { id: "morning", title: "Morning", subtitle: "6:00 am – 9:00 am" },
  { id: "midday", title: "Midday", subtitle: "12:00 pm – 2:00 pm" },
  { id: "evening", title: "Evening", subtitle: "5:00 pm – 8:00 pm" },
  { id: "night", title: "Night", subtitle: "8:00 pm – 10:00 pm" },
  { id: "varies", title: "It varies" },
] as const;

export function ReminderSetupScreen({ onDone, onOpenQuietHours }: Props) {
  const { config } = useConfig();
  const { me } = useAuth();
  const waOn = isWhatsAppAutomationEnabled(config);
  const [step, setStep] = useState(0);
  const [workoutSlot, setWorkoutSlot] = useState<string>("evening");
  const [exactTimeLabel] = useState("6:30 pm");
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

  const footer =
    step < 3 ? (
      <Button
        label="Continue"
        onPress={() => setStep((value) => Math.min(3, value + 1))}
      />
    ) : (
      <Button label="Done" onPress={onDone} />
    );

  return (
    <M2Screen footer={footer}>
      <M2TopNav
        onBack={step > 0 ? () => setStep((s) => Math.max(0, s - 1)) : onDone}
        titleNode={<Dots4 step={step} />}
        right={
          step < 3 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep(3)}
              style={styles.skipHit}
            >
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          ) : null
        }
      />

      {step === 0 ? (
        <>
          <View style={styles.lt2}>
            <Text style={styles.eb}>Reminders · step 1 of 4</Text>
            <Text style={styles.h1}>When do you usually work out?</Text>
          </View>
          {WORKOUT_SLOTS.map((slot) => (
            <RadioCard
              key={slot.id}
              title={slot.title}
              subtitle={"subtitle" in slot ? slot.subtitle : undefined}
              selected={workoutSlot === slot.id}
              onPress={() => setWorkoutSlot(slot.id)}
            />
          ))}
          <Pressable accessibilityRole="button" style={styles.exactRow}>
            <View style={styles.tile}>
              <Clock size={19} color={colors.indigo} strokeWidth={1.75} />
            </View>
            <View style={styles.exactText}>
              <Text style={styles.exactTitle}>Set exact time</Text>
              <Text style={styles.exactSub}>Optional</Text>
            </View>
            <Text style={styles.exactVal}>{exactTimeLabel}</Text>
            <ChevronRight size={18} color={colors.midGrey} />
          </Pressable>
          <NoteCallout icon={<Info size={18} color={colors.indigo} />}>
            We&apos;ll only remind you if your workout isn&apos;t logged about an
            hour after this. You can change it anytime.
          </NoteCallout>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <View style={styles.lt2}>
            <Text style={styles.eb}>Reminders · step 2 of 4</Text>
            <Text style={styles.h1}>How should we remind you?</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>App notifications (recommended)</Text>
            <Text style={styles.body}>Selected by default.</Text>
          </View>
          <View style={[styles.infoCard, !waOn ? styles.cardDisabled : null]}>
            <Text style={styles.cardTitle}>
              App + WhatsApp backup{" "}
              {!waOn ? (
                <Text style={styles.comingSoon}>· Coming soon</Text>
              ) : null}
            </Text>
            <Text style={styles.body}>
              {waOn
                ? "If app notifications miss you, WhatsApp can send one utility reminder a day."
                : "WhatsApp reminders are coming soon. For now we'll remind you in the app."}
            </Text>
          </View>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <View style={styles.lt2}>
            <Text style={styles.eb}>Reminders · step 3 of 4</Text>
            <Text style={styles.h1}>Allow notifications</Text>
          </View>
          <View style={styles.sample}>
            <Text style={styles.sampleTitle}>Lunch isn&apos;t logged yet</Text>
            <Text style={styles.sampleBody}>
              Eaten as planned · Something different
            </Text>
          </View>
          <Button
            label="Allow notifications"
            onPress={() => {
              void requestPushPermission();
            }}
          />
          <Button label="Not now" variant="tertiary" onPress={() => setStep(3)} />
          {permissionNote ? (
            <Text style={styles.helper}>{permissionNote}</Text>
          ) : null}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <View style={styles.lt2}>
            <Text style={styles.eb}>Reminders · step 4 of 4</Text>
            <Text style={styles.h1}>Almost done</Text>
          </View>
          <Text style={styles.body}>
            Quiet hours default to 10:00 pm – 7:00 am.{" "}
            <Text style={styles.link} onPress={onOpenQuietHours}>
              Change
            </Text>
          </Text>
          <Text style={styles.body}>
            Times shown in {timeZoneLabel} · from your phone.
          </Text>
          {Platform.OS === "android" ? (
            <Button
              label="Battery & background tips"
              variant="secondary"
              onPress={() => setShowOem(true)}
            />
          ) : null}
          <Button
            label="Open phone settings"
            variant="tertiary"
            onPress={() => {
              void Linking.openSettings();
            }}
          />
        </>
      ) : null}
    </M2Screen>
  );
}

const styles = StyleSheet.create({
  skipHit: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  skip: {
    color: colors.indigo,
    fontSize: 16,
    fontWeight: "600",
  },
  lt2: {
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  eb: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  h1: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 36,
    marginTop: 2,
  },
  exactRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  exactText: {
    flex: 1,
  },
  exactTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  exactSub: {
    color: colors.midGrey,
    fontSize: 14,
  },
  exactVal: {
    color: colors.midGrey,
    fontSize: 15,
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    gap: spacing.xs,
    marginTop: spacing.sm,
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
    marginTop: spacing.sm,
  },
  comingSoon: {
    color: colors.indigo,
    fontWeight: "600",
  },
  link: {
    color: colors.indigo,
    fontWeight: "600",
  },
  helper: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  sample: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    gap: spacing.xs,
    marginBottom: spacing.md,
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
