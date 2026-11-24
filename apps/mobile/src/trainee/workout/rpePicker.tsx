import { Pressable, View } from "react-native";
import { Text } from "../../components/Text";
import { createThemedStyles } from "../../providers/ThemeProvider";

/**
 * The "How hard was it?" picker (W-17a2, W-17a3, W-17c2): a 1 to 10 grid, the
 * three anchors and the chosen value. Optional unless the plan asks for it
 * (D-W14-10). Choosing the chosen number again clears it when it is optional.
 */
const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function RpePicker({
  value,
  onChange,
  required,
  coachFirst,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  required: boolean;
  coachFirst: string;
}) {
  const styles = useStyles();
  return (
    <View>
      <View style={styles.head}>
        <Text variant="label" tone="ink2">
          HOW HARD WAS IT?
        </Text>
        {required ? (
          <Text variant="subhead" tone="crit" style={styles.strong}>
            {`${coachFirst === "your coach" ? "Your coach" : coachFirst} asks for this`}
          </Text>
        ) : (
          <Text variant="subhead" tone="ink3">
            Optional
          </Text>
        )}
      </View>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {RPE_VALUES.map((n) => {
          const on = value === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={`${n} of 10`}
              onPress={() => onChange(on && !required ? null : n)}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              <Text variant="headline" style={on ? styles.chipTextOn : styles.chipText}>
                {String(n)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.foot}>
        <Text variant="caption" tone="ink2" style={styles.anchors}>
          1 Very easy · 5 Hard · 10 Max effort
        </Text>
        {value != null ? (
          <Text variant="subhead" tone="ink2">
            <Text variant="bodyStrong">{String(value)}</Text>
            {" of 10"}
          </Text>
        ) : required ? (
          <Text variant="subhead" tone="ink2">
            Tap a number
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  head: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: t.spacing.sm,
    paddingHorizontal: t.spacing.xs,
  },
  strong: { fontWeight: "600" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.spacing.sm,
  },
  chip: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 52,
    width: "17%",
  },
  chipOn: { backgroundColor: t.colors.brand },
  chipText: { color: t.colors.ink },
  chipTextOn: { color: t.colors.onBrand },
  foot: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: t.spacing.sm,
  },
  anchors: { flexShrink: 1 },
}));
