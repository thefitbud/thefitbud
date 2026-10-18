import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

type Props = {
  onBack: () => void;
};

export function WidgetTipsScreen({ onBack }: Props) {
  return (
    <Screen title="Home screen widget" subtitle="TR-21 placeholder">
      <View style={styles.stack}>
        <Text style={styles.body}>
          A FitBud widget can open Today with your next meal or workout. Platform
          widgets are planned after the core logging loop ships.
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
