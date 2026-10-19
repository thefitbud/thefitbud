import { StyleSheet, View } from "react-native";
import { ink } from "@fitbud/tokens";
import { Text } from "../../components/Text";
import { M2Note, M2Page } from "./m2";

type Props = {
  onBack: () => void;
};

/** Steps stay behind the product flag. The screen never prints the flag name. */
export function StepsSettingsScreen({ onBack }: Props) {
  return (
    <M2Page
      title="Steps"
      subtitle="See your steps on Today"
      onBack={onBack}
    >
      <View style={styles.chipWrap}>
        <Text style={styles.chip}>Coming soon</Text>
      </View>
      <M2Note>
        FitBud will read your step count from Health Connect or Apple Health.
        Steps stay on your phone and aren't shared with your coach.
      </M2Note>
      <Text style={styles.body}>
        Step counting isn't available in this version yet. Today's card stays
        hidden until it is.
      </Text>
    </M2Page>
  );
}

const styles = StyleSheet.create({
  chipWrap: { alignItems: "flex-start" },
  chip: {
    backgroundColor: "#EEF0FF",
    borderRadius: 999,
    color: "#3D4BD8",
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  body: {
    color: ink[700],
    fontSize: 15,
    lineHeight: 22,
  },
});
