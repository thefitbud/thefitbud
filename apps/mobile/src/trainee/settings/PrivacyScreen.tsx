import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
};

export function PrivacyScreen({ onBack }: Props) {
  return (
    <Screen title="Privacy" subtitle="How FitBud handles your data.">
      <View style={styles.stack}>
        <Text style={styles.body}>
          FitBud stores your logs, check-ins and photos to share them with your
          coach. WhatsApp messages you send stay in WhatsApp — FitBud only records
          that you asked, not the message text.
        </Text>
        <Text style={styles.body}>
          Step counts, when enabled, never leave your phone and are not visible to
          your trainer.
        </Text>
        <PrimaryButton label="Back" variant="ghost" onPress={onBack} />
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
});
