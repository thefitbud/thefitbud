import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@fitbud/ui-mobile";

type Props<T extends string> = {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  return (
    <View accessibilityRole="tablist" style={styles.wrap}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <Text
              style={[styles.label, selected ? styles.labelSelected : null]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.control,
    flexDirection: "row",
    gap: 2,
    padding: 2,
  },
  segment: {
    alignItems: "center",
    borderRadius: radii.control - 2,
    flex: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  segmentSelected: {
    backgroundColor: colors.white,
  },
  label: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "500",
  },
  labelSelected: {
    color: colors.indigo,
    fontWeight: "600",
  },
});
