import { StyleSheet, View } from "react-native";
import { Footprints } from "lucide-react-native";
import { brand, ink } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { M2Page, M2SwitchRow } from "./m2";

type Props = {
  onBack: () => void;
};

/** Steps stay behind the product flag. The screen never prints the flag name. */
export function StepsSettingsScreen({ onBack }: Props) {
  return (
    <M2Page title="Steps" subtitle="See your steps on Today" onBack={onBack}>
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.tile}>
            <Footprints color={brand.indigo} size={22} strokeWidth={1.75} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>Coming soon</Text>
            <Text style={styles.body}>
              FitBud will read your step count from Health Connect or Apple
              Health. Steps stay on your phone and aren't shared with your coach.
            </Text>
          </View>
        </View>
        <M2SwitchRow
          label="See steps on Today"
          hint="Today's card stays hidden until this is available."
          value={false}
          disabled
          onValueChange={() => {}}
        />
      </View>
    </M2Page>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  tile: {
    alignItems: "center",
    backgroundColor: brand.paleLavender,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  copy: { flex: 1, gap: 4 },
  title: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
  },
  body: {
    color: ink[700],
    fontSize: 14,
    lineHeight: 20,
  },
});
