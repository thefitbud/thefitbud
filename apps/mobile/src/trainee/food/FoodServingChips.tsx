import { Pressable, View } from "react-native";
import { Text } from "../../components/Text";
import { createThemedStyles } from "../../providers/ThemeProvider";

export type ServingChipOption = { id: string; label: string };

type Props = {
  options: readonly ServingChipOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Read by screen readers before each chip ("Unit", "Amount"). */
  groupLabel: string;
  testIDPrefix?: string;
};

/**
 * One-of chips (TR-26c unit and quick amounts). Labels wrap instead of
 * truncating (Z12-22: "1.5 1 ka…"), and every chip is a 44 pt target. The
 * selected chip is filled and also announced as selected, never colour alone.
 */
export function FoodServingChips({
  options,
  selectedId,
  onSelect,
  groupLabel,
  testIDPrefix = "serving-chip",
}: Props) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={groupLabel}>
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onSelect(option.id)}
            style={[styles.chip, selected ? styles.chipOn : null]}
            testID={`${testIDPrefix}-${option.id}`}
          >
            <Text
              variant="bodyStrong"
              tone={selected ? "onBrand" : "ink"}
              style={styles.label}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: t.touchTarget,
    minWidth: t.touchTarget,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: t.colors.brand, borderColor: t.colors.brand },
  label: { textAlign: "center" },
}));
