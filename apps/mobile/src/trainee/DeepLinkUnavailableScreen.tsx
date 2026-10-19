import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

type Props = {
  reason?: string;
  /** Preferred: navigate to Today. */
  onGoToday?: () => void;
  /** @deprecated Prefer onGoToday. */
  onBack?: () => void;
};

export function DeepLinkUnavailableScreen({
  reason,
  onGoToday,
  onBack,
}: Props) {
  const goToday = onGoToday ?? onBack ?? (() => undefined);
  return (
    <Screen
      chrome="app"
      title="This item isn't available anymore"
      subtitle="The link may have ended, been replaced, or belong to another account."
    >
      <View style={styles.stack}>
        <View style={styles.card}>
          <Text style={styles.body} accessibilityRole="text">
            {reason ??
              "It may have been replaced by a plan update, coaching ended, or this isn't your account."}
          </Text>
        </View>
        <PrimaryButton label="Go to Today" onPress={goToday} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: spacing.xl,
  },
  body: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
});
