import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Dumbbell, Footprints, Utensils } from "lucide-react-native";
import { rings } from "@fitbud/tokens";
import { formatNumber } from "@fitbud/core";
import type { RingDatum } from "@fitbud/ui-mobile";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";

/**
 * Steps chip content (D-W9-3): read from `GET /me/steps/today`, so Today does
 * not wait for native sync (Z9-10). `not_synced` is a server answer of
 * `steps: null`; `unavailable` is a request that failed, which must not claim
 * the trainee has not set steps up.
 */
export type StepsChipState =
  | { readonly status: "loading" }
  | { readonly status: "not_synced"; readonly target: number | null }
  | {
      readonly status: "synced";
      readonly steps: number;
      readonly target: number;
    }
  | { readonly status: "unavailable" };

export type TodaySummaryProps = {
  rings: readonly RingDatum[];
  workoutDone: number;
  workoutTotal: number;
  mealsDone: number;
  mealsTotal: number;
  steps: StepsChipState;
};

const NUM = { fontVariant: ["tabular-nums" as const] };
const RING_SIZE = 102;
const RING_STROKE = 9;

function find(data: readonly RingDatum[], key: RingDatum["key"]) {
  return data.find((row) => row.key === key);
}

function fillFraction(logged: number, assigned: number): number {
  if (assigned <= 0 || logged <= 0) return 0;
  return Math.min(logged / assigned, 1);
}

function KcalRing({ datum }: { datum: RingDatum | undefined }) {
  const logged = Math.round(datum?.logged ?? 0);
  const assigned = Math.round(datum?.assigned ?? 0);
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * fillFraction(logged, assigned);
  const prefix = datum?.unknown ? "≥ " : "";
  const label =
    assigned > 0
      ? `${prefix}${formatNumber(logged)} of ${formatNumber(assigned)} kcal`
      : `${prefix}${formatNumber(logged)} kcal`;
  return (
    <View
      style={styles.ringWrap}
      accessible
      accessibilityLabel={label}
      testID="today-kcal-ring"
    >
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={rings.track}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {dash > 0 ? (
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            stroke={rings.kcal}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[styles.ringCenter, { pointerEvents: "none" }]}>
        <Text style={[styles.ringValue, NUM]}>
          {prefix}
          {formatNumber(logged)}
        </Text>
        {assigned > 0 ? (
          <Text style={[styles.ringSub, NUM]}>
            of {formatNumber(assigned)} kcal
          </Text>
        ) : (
          <Text style={styles.ringSub}>kcal</Text>
        )}
      </View>
    </View>
  );
}

function MacroBar({
  datum,
  label,
  color,
}: {
  datum: RingDatum | undefined;
  label: string;
  color: string;
}) {
  const logged = Math.round(datum?.logged ?? 0);
  const assigned = Math.round(datum?.assigned ?? 0);
  const prefix = datum?.unknown ? "≥ " : "";
  const fraction = fillFraction(logged, assigned);
  const value =
    assigned > 0
      ? `${prefix}${formatNumber(logged)} of ${formatNumber(assigned)} g`
      : `${prefix}${formatNumber(logged)} g`;
  return (
    <View style={styles.macro} accessible accessibilityLabel={`${label} ${value}`}>
      <View style={styles.macroHead}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={[styles.macroValue, NUM]}>{value}</Text>
      </View>
      <View style={styles.track}>
        {fraction > 0 ? (
          <View
            style={[
              styles.fill,
              { backgroundColor: color, width: `${fraction * 100}%` },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

function Chip({
  icon,
  label,
  value,
  accessibilityLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accessibilityLabel: string;
}) {
  return (
    <View
      style={styles.chip}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      {icon}
      <View style={styles.chipText}>
        <Text style={styles.chipLabel}>{label}</Text>
        <Text style={[styles.chipValue, NUM]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export function stepsChipText(steps: StepsChipState): {
  value: string;
  a11y: string;
} {
  switch (steps.status) {
    case "synced":
      return {
        value: formatNumber(steps.steps),
        a11y: `Steps ${formatNumber(steps.steps)} of ${formatNumber(steps.target)}`,
      };
    case "not_synced":
      return { value: "Set up steps", a11y: "Steps: set up steps" };
    case "unavailable":
      return { value: "—", a11y: "Steps unavailable" };
    default:
      return { value: "…", a11y: "Steps loading" };
  }
}

export function TodaySummaryCard(props: TodaySummaryProps) {
  const kcal = find(props.rings, "kcal");
  const stepsText = stepsChipText(props.steps);
  const icon = { size: 20, color: colors.indigo, strokeWidth: 2 };
  return (
    <View style={styles.card} testID="today-summary">
      <View style={styles.top}>
        <KcalRing datum={kcal} />
        <View style={styles.macros}>
          <MacroBar
            datum={find(props.rings, "protein")}
            label="Protein"
            color={rings.protein}
          />
          <MacroBar
            datum={find(props.rings, "carbs")}
            label="Carbs"
            color={rings.carbs}
          />
          <MacroBar
            datum={find(props.rings, "fat")}
            label="Fat"
            color={rings.fat}
          />
        </View>
      </View>
      <View style={styles.chips}>
        <Chip
          icon={<Dumbbell {...icon} />}
          label="Workout"
          value={`${props.workoutDone} of ${props.workoutTotal}`}
          accessibilityLabel={`Workout ${props.workoutDone} of ${props.workoutTotal}`}
        />
        <Chip
          icon={<Utensils {...icon} />}
          label="Meals"
          value={`${props.mealsDone} of ${props.mealsTotal}`}
          accessibilityLabel={`Meals ${props.mealsDone} of ${props.mealsTotal}`}
        />
        <Chip
          icon={<Footprints {...icon} />}
          label="Steps"
          value={stepsText.value}
          accessibilityLabel={stepsText.a11y}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  top: { alignItems: "center", flexDirection: "row", gap: spacing.lg },
  ringWrap: { height: RING_SIZE, width: RING_SIZE },
  ringCenter: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 14,
    position: "absolute",
    right: 0,
    top: 0,
  },
  ringValue: { color: colors.deepNavy, fontSize: 26, fontWeight: "600" },
  ringSub: { color: colors.darkGrey, fontSize: 11, textAlign: "center" },
  macros: { flex: 1, gap: spacing.sm },
  macro: { gap: 4, minHeight: 32 },
  macroHead: { flexDirection: "row", justifyContent: "space-between" },
  macroLabel: { color: colors.darkGrey, fontSize: 14 },
  macroValue: { color: colors.deepNavy, fontSize: 14 },
  track: {
    backgroundColor: rings.track,
    borderRadius: 3,
    height: 6,
    overflow: "hidden",
  },
  fill: { borderRadius: 3, height: 6 },
  chips: { flexDirection: "row", gap: spacing.sm },
  chip: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderColor: "#E3E0F7",
    borderRadius: radii.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  chipText: { flex: 1 },
  chipLabel: { color: colors.darkGrey, fontSize: 12 },
  chipValue: { color: colors.deepNavy, fontSize: 14, fontWeight: "600" },
});
