import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

type Props = {
  reason?: string;
  onBack: () => void;
};

export function DeepLinkUnavailableScreen({ reason, onBack }: Props) {
  return (
    <Screen title="Link unavailable" subtitle="This item can't be opened anymore.">
      <View style={styles.stack}>
        <Text style={styles.body}>
          {reason ??
            "It may have ended, expired, or belongs to another account."}
        </Text>
        <PrimaryButton label="Go back" onPress={onBack} />
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
