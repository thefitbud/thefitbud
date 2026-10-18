import { StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

type Props = {
  onOpenHistory: () => void;
  onSignOut: () => void;
};

export function EndedCoachingScreen({ onOpenHistory, onSignOut }: Props) {
  return (
    <Screen
      title="Coaching ended"
      subtitle="Your history stays in FitBud. A new coach always starts fresh."
    >
      <View style={styles.stack}>
        <Text style={styles.body}>
          This coaching relationship has ended. You can still browse past logs
          and check-ins here. If the same coach restarts with you, your workspace
          can be restored.
        </Text>
        <PrimaryButton label="Past coaching" onPress={onOpenHistory} />
        <PrimaryButton label="Sign out" variant="ghost" onPress={onSignOut} />
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
