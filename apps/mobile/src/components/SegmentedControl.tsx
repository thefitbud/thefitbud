import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { createThemedStyles } from "../providers/ThemeProvider";

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
  const styles = useStyles();
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

/** Kit `.seg`: fill track, the selected segment raised on card with ink text. */
const useStyles = createThemedStyles((t) => ({
  wrap: {
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.segment,
    flexDirection: "row",
    gap: 2,
    padding: 2,
  },
  segment: {
    alignItems: "center",
    borderRadius: t.radii.segment - 2,
    flex: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: t.spacing.sm,
  },
  segmentSelected: {
    backgroundColor: t.colors.card,
    shadowColor: `rgb(${t.colors.sh})`,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.12,
    shadowRadius: 3,
    elevation: t.scheme === "dark" ? 0 : 1,
  },
  label: {
    color: t.colors.ink2,
    fontSize: 14,
    fontWeight: "600",
  },
  labelSelected: {
    color: t.colors.ink,
  },
}));
