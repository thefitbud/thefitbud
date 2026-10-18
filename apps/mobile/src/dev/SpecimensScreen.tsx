import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typeScale, fontFamily, fontFamilySemiBold, fontFamilyBold } from "@fitbud/ui-mobile";
import { Button } from "../components/Button";
import { OverflowMenu } from "../components/OverflowMenu";
import { StatusChip } from "../components/StatusChip";
import { BrandMark } from "../components/BrandMark";

/** Dev-only specimens for Batch 0 evidence (real components). */
export function SpecimensScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page} testID="screen-B0-specimens">
      <View style={styles.block} nativeID="type">
        <Text style={styles.display}>FitBud display 28</Text>
        <Text style={styles.semi}>Satoshi 600 · actions</Text>
        <Text style={styles.body}>Body 16 — Progress, guided.</Text>
      </View>

      <View style={styles.block} nativeID="buttons">
        <Text style={styles.heading}>Buttons</Text>
        <View style={styles.row}>
          <Button label="Primary" variant="primary" onPress={() => undefined} />
          <Button label="Secondary" variant="secondary" onPress={() => undefined} />
          <Button label="Tertiary" variant="tertiary" onPress={() => undefined} />
          <Button label="Destructive" variant="destructive" onPress={() => undefined} />
          <OverflowMenu
            items={[
              { id: "one", label: "Mark reviewed", onSelect: () => undefined },
              { id: "two", label: "Open client", onSelect: () => undefined },
            ]}
          />
        </View>
      </View>

      <View style={styles.block} nativeID="chips">
        <Text style={styles.heading}>StatusChip</Text>
        <View style={styles.row}>
          <StatusChip kind="severity" value="critical" />
          <StatusChip kind="severity" value="attention" />
          <StatusChip kind="adherence" value="on_track" />
          <StatusChip kind="checkin" value="submitted" />
        </View>
      </View>

      <View style={styles.block} nativeID="logo">
        <Text style={styles.heading}>Honest Week mark</Text>
        <BrandMark size={40} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  block: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  display: {
    fontFamily: fontFamilyBold,
    fontSize: typeScale.display,
    color: colors.deepNavy,
  },
  semi: {
    fontFamily: fontFamilySemiBold,
    fontSize: typeScale.body,
    color: colors.deepNavy,
  },
  body: {
    fontFamily,
    fontSize: typeScale.body,
    color: colors.darkGrey,
  },
  heading: {
    fontFamily: fontFamilySemiBold,
    fontSize: typeScale.title,
    color: colors.deepNavy,
  },
  row: {
    gap: spacing.sm,
  },
});
