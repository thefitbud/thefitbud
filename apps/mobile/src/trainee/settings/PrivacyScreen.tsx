import { ThemeScope, createThemedStyles } from "../../providers/ThemeProvider";
import { View } from "react-native";
import { Text } from "../../components/Text";
import { spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
};

function PrivacyScreenBody({ onBack }: Props) {
  const styles = useStyles();
  return (
    <Screen v3 title="Privacy" subtitle="How FitBud handles your data.">
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

const useStyles = createThemedStyles((t) => ({
  stack: {
    gap: spacing.lg,
  },
  body: {
    color: t.colors.ink2,
    fontSize: 15,
    lineHeight: 22,
  },
}));

/** PrivacyScreen in the system theme (Z12-49): its own styles read the scope. */
export function PrivacyScreen(props: Parameters<typeof PrivacyScreenBody>[0]) {
  return (
    <ThemeScope scheme="system">
      <PrivacyScreenBody {...props} />
    </ThemeScope>
  );
}
