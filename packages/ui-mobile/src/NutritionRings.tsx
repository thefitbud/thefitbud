import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { rings } from "@fitbud/tokens";
import { colors, spacing } from "./theme.js";
import { fontFamilyBold, typeScale } from "./typography.js";

export type RingDatum = {
  key: "kcal" | "protein" | "carbs" | "fat";
  label: string;
  logged: number;
  assigned: number;
  unit: string;
  unknown?: boolean;
};

const RING_COLORS: Record<RingDatum["key"], string> = {
  kcal: rings.kcal,
  protein: rings.protein,
  carbs: rings.carbs,
  fat: rings.fat,
};

function Ring({
  datum,
  size = 64,
}: {
  datum: RingDatum;
  size?: number;
}) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const assigned = Math.max(datum.assigned, 1);
  const progress = Math.min(datum.logged / assigned, 1);
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * progress;
  const color = RING_COLORS[datum.key];

  return (
    <View style={styles.ringWrap} accessibilityLabel={`${datum.label} ${datum.logged} of ${datum.assigned} ${datum.unit}`}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={rings.track}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringValue}>
          {datum.unknown ? "≥ " : ""}
          {datum.logged}
        </Text>
        <Text style={styles.ringSub}>
          {datum.assigned > 0 ? `of ${datum.assigned}` : datum.unit}
        </Text>
      </View>
    </View>
  );
}

export function NutritionRings({
  data,
  compact = false,
}: {
  data: RingDatum[];
  compact?: boolean;
}) {
  const size = compact ? 52 : 64;
  return (
    <View style={styles.row}>
      {data.map((datum) => (
        <View key={datum.key} style={styles.item}>
          <Ring datum={datum} size={size} />
          <Text style={styles.label}>{datum.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  item: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xs,
  },
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringValue: {
    color: colors.deepNavy,
    fontFamily: fontFamilyBold,
    fontSize: typeScale.caption,
    fontWeight: "700",
  },
  ringSub: {
    color: colors.midGrey,
    fontSize: 10,
  },
  label: {
    color: colors.midGrey,
    fontSize: typeScale.caption,
    textAlign: "center",
  },
});
