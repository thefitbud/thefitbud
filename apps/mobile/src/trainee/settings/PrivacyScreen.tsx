import { View } from "react-native";
import { spacing } from "@fitbud/ui-mobile";
import { accountDeletionCopy } from "@fitbud/core";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { LegalDocumentList, useLegalDocument } from "../../screens/LegalDocumentScreen";
import { M2Group, M2Row, M2Section, M2Page } from "./m2";

type Props = {
  onBack: () => void;
  /** Z12-29: opens Delete account (App Store and Play require it in the app). */
  onDeleteAccount: () => void;
};

/**
 * Privacy (reached from Account). How FitBud handles data, then Delete
 * account (Z12-29). On v3 tokens in the system theme through `M2Page`.
 */
export function PrivacyScreen({ onBack, onDeleteAccount }: Props) {
  return (
    <M2Page title="Privacy" subtitle="How FitBud handles your data." onBack={onBack} testID="privacy">
      <PrivacyContent onDeleteAccount={onDeleteAccount} />
    </M2Page>
  );
}

function PrivacyContent({ onDeleteAccount }: { onDeleteAccount: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const legal = useLegalDocument();
  return (
    <>
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
      </View>
      <M2Section label="Legal" />
      <LegalDocumentList onOpen={legal.open} />
      {legal.modal}
      <M2Section label="Your account" />
      <M2Group>
        <M2Row
          label={accountDeletionCopy.title}
          labelColor={theme.colors.crit}
          onPress={onDeleteAccount}
          showChevron={false}
          testID="privacy-delete-account"
        />
      </M2Group>
    </>
  );
}

const useStyles = createThemedStyles((t) => ({
  stack: {
    gap: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: 4,
  },
  body: {
    color: t.colors.ink2,
    fontSize: 15,
    lineHeight: 22,
  },
}));
