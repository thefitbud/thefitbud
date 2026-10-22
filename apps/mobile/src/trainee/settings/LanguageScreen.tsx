import { StyleSheet } from "react-native";
import { ink } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { M2Group, M2Page, M2Row } from "./m2";

type Props = {
  onBack: () => void;
};

export function LanguageScreen({ onBack }: Props) {
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

const styles = StyleSheet.create({
  soon: {
    color: ink[500],
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
});
