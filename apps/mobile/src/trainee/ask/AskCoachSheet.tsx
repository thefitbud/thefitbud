import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import type { CreateCoachAskRequest } from "@fitbud/contracts";

type CoachAskItemType = CreateCoachAskRequest["itemType"];
import { whatsappHref } from "@fitbud/core";
import { colors, spacing } from "@fitbud/ui-mobile";
import { stage1Api } from "../../lib/stage1Api";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  relationshipId: string;
  itemType: CoachAskItemType;
  itemId: string;
  topic: string;
  onDone: () => void;
  onCancel: () => void;
};

export function AskCoachSheet({
  relationshipId,
  itemType,
  itemId,
  topic,
  onDone,
  onCancel,
}: Props) {
  const { api, me } = useAuth();
  const s1 = stage1Api(api);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openWhatsApp() {
    setLoading(true);
    setError(null);
    try {
      await s1.createCoachAsk({
        relationshipId,
        itemType,
        itemId,
        topic,
      });
      const phone = me?.trainerProfile?.whatsappE164 ?? null;
      const draft = `Hi, I have a question about ${topic} in FitBud.`;
      const url = whatsappHref({ phoneE164: phone, draftText: draft });
      const can = await Linking.canOpenURL(url);
      if (!can) {
        setError("WhatsApp isn't available on this device.");
        return;
      }
      await Linking.openURL(url);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record ask.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      title="Ask on WhatsApp"
      subtitle="FitBud records that you asked. Message content stays in WhatsApp."
    >
      {error ? <ErrorBanner message={error} /> : null}
      <View style={styles.stack}>
        <Text style={styles.body}>
          We'll mark this item so your coach knows you reached out. You'll send
          the message yourself in WhatsApp.
        </Text>
        <Text style={styles.topic}>Topic: {topic}</Text>
        <PrimaryButton
          label="Open WhatsApp"
          loading={loading}
          onPress={() => void openWhatsApp()}
        />
        <PrimaryButton label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
  body: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
  topic: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
});
