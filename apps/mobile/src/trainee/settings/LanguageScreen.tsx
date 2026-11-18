import { ThemeScope, createThemedStyles } from "../../providers/ThemeProvider";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { M2Group, M2Page, M2Row } from "./m2";

type Props = {
  onBack: () => void;
};

function LanguageScreenBody({ onBack }: Props) {
  const styles = useStyles();
  return (
    <M2Page
      title="Language"
      subtitle="FitBud is in English for now."
      onBack={onBack}
    >
      <M2Group>
        <M2Row label="English" value="In use" showChevron={false} />
      </M2Group>
      <Text style={styles.soon}>More languages are coming soon.</Text>
    </M2Page>
  );
}

const useStyles = createThemedStyles((t) => ({
  soon: {
    color: t.colors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
}));

/** LanguageScreen in the system theme (Z12-49): its own styles read the scope. */
export function LanguageScreen(props: Parameters<typeof LanguageScreenBody>[0]) {
  return (
    <ThemeScope scheme="system">
      <LanguageScreenBody {...props} />
    </ThemeScope>
  );
}
