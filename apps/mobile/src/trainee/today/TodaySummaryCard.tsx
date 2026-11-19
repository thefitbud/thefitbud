import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Check, Dumbbell, Footprints, Utensils } from "lucide-react-native";
import { formatNumber } from "@fitbud/core";
import type { RingDatum } from "@fitbud/ui-mobile";
import { spacing } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

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
  /** Opens the steps setup screen from the Steps chip. */
  onOpenSteps?: () => void;
  /** The day failed to load: the Workout chip must not claim a rest day. */
  workoutUnknown?: boolean;
};

const RING_SIZE = 108;
const RING_STROKE = 10;

function find(data: readonly RingDatum[], key: RingDatum["key"]) {
  return data.find((row) => row.key === key);
}

function fillFraction(logged: number, assigned: number): number {
  if (assigned <= 0 || logged <= 0) return 0;
  return Math.min(logged / assigned, 1);
}

/** Fits the number inside the ring: 32 for up to 3 characters, smaller after. */
function ringValueSize(text: string): number {
  if (text.length <= 3) return 32;
  if (text.length <= 5) return 26;
  return 20;
}

/**
 * The ring shows what was eaten; "kcal left" and the goal sit beside it
 * (TR-06a). Over the goal the line reads "kcal over" with the excess.
 */
export function kcalLeftText(
  logged: number,
  assigned: number,
  unknown = false,
): { value: string; unit: string; goal: string | null } | null {
  // Some of what was eaten has no kcal figure: "left" would be a made-up
  // number (the ring says "≥" for the same reason), so show none.
  if (assigned <= 0 || unknown) return null;
  const over = logged > assigned;
  return {
    value: formatNumber(Math.abs(assigned - logged)),
    unit: over ? "kcal over" : "kcal left",
    goal: `Goal ${formatNumber(assigned)}`,
  };
}

function KcalRing({ datum }: { datum: RingDatum | undefined }) {
  const theme = useTheme();
  const styles = useStyles();
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
          stroke={theme.colors.fill2}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {dash > 0 ? (
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            stroke={theme.colors.brand}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[styles.ringCenter, { pointerEvents: "none" }]}>
        <Text
          variant="numberMd"
          style={{
            fontSize: ringValueSize(`${prefix}${formatNumber(logged)}`),
            lineHeight: ringValueSize(`${prefix}${formatNumber(logged)}`) + 6,
            maxWidth: RING_SIZE - 2 * RING_STROKE - 8,
            textAlign: "center",
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.2}
        >
          {prefix}
          {formatNumber(logged)}
        </Text>
        <Text variant="caption" tone="ink3" style={styles.ringSub}>
          kcal eaten
        </Text>
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
  const styles = useStyles();
  const logged = Math.round(datum?.logged ?? 0);
  const assigned = Math.round(datum?.assigned ?? 0);
  const prefix = datum?.unknown ? "≥ " : "";
  const fraction = fillFraction(logged, assigned);
  const value =
    assigned > 0
      ? `${prefix}${formatNumber(logged)} / ${formatNumber(assigned)} g`
      : `${prefix}${formatNumber(logged)} g`;
  return (
    <View
      style={styles.macro}
      accessible
      accessibilityLabel={`${label} ${prefix}${formatNumber(logged)}${assigned > 0 ? ` of ${formatNumber(assigned)}` : ""} g`}
    >
      <View style={styles.macroHead}>
        <Text variant="subhead" tone="ink2">
          {label}
        </Text>
        <Text variant="subhead" style={styles.macroValue} numberOfLines={1}>
          {value}
        </Text>
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

type ChipVariant = "default" | "done" | "rest";

function Chip({
  icon,
  label,
  value,
  accessibilityLabel,
  variant = "default",
  fraction = null,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accessibilityLabel: string;
  variant?: ChipVariant;
  /** 0 to 1: the thin bar under the value (TR-06a); null draws none. */
  fraction?: number | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const variantStyle =
    variant === "done"
      ? styles.chipDone
      : variant === "rest"
        ? styles.chipRest
        : null;
  const body = (
    <>
      <View style={styles.chipHead}>
        {variant === "done" ? (
          <Check size={16} color={theme.colors.done} strokeWidth={2.25} />
        ) : (
          icon
        )}
        <Text variant="caption" tone="ink2" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="bodyStrong" style={styles.chipValue} numberOfLines={1}>
        {value}
      </Text>
      {fraction != null ? (
        <View style={styles.chipTrack}>
          {fraction > 0 ? (
            <View
              style={[styles.chipFill, { width: `${fraction * 100}%` }]}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.chip,
          variantStyle,
          pressed && styles.chipPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View
      style={[styles.chip, variantStyle]}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      {body}
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
      // Short copy so the chip fits at 360 dp (Z12-46fu; was "Set up st…").
      return { value: "Set up", a11y: "Steps: set up steps" };
    case "unavailable":
      return { value: "—", a11y: "Steps unavailable" };
    default:
      return { value: "…", a11y: "Steps loading" };
  }
}

export function TodaySummaryCard(props: TodaySummaryProps) {
  const theme = useTheme();
  const styles = useStyles();
  const kcal = find(props.rings, "kcal");
  const stepsText = stepsChipText(props.steps);
  const icon = { size: 16, color: theme.colors.ink2, strokeWidth: 1.75 };
  const workoutUnknown = props.workoutUnknown === true;
  const workoutRest = props.workoutTotal === 0 && !workoutUnknown;
  const workoutDone = !workoutRest && !workoutUnknown && props.workoutDone >= props.workoutTotal;
  const mealsDone = props.mealsTotal > 0 && props.mealsDone >= props.mealsTotal;
  const stepsDone =
    props.steps.status === "synced" && props.steps.steps >= props.steps.target;
  const left = kcalLeftText(
    Math.round(kcal?.logged ?? 0),
    Math.round(kcal?.assigned ?? 0),
    kcal?.unknown === true,
  );
  return (
    <View style={styles.card} testID="today-summary">
      <View style={styles.top}>
        <KcalRing datum={kcal} />
        <View style={styles.macros}>
          {left ? (
            <View style={styles.leftRow}>
              <Text
                variant="numberMd"
                numberOfLines={1}
                style={styles.leftLine}
                accessibilityLabel={`${left.value} ${left.unit}, ${left.goal}`}
              >
                {left.value}
                <Text variant="subhead" tone="ink2">{` ${left.unit}`}</Text>
              </Text>
              <Text variant="caption" tone="ink3" numberOfLines={1}>
                {left.goal}
              </Text>
            </View>
          ) : null}
          <MacroBar
            datum={find(props.rings, "protein")}
            label="Protein"
            color={theme.colors.protein}
          />
          <MacroBar
            datum={find(props.rings, "carbs")}
            label="Carbs"
            color={theme.colors.carbs}
          />
          <MacroBar
            datum={find(props.rings, "fat")}
            label="Fat"
            color={theme.colors.fat}
          />
        </View>
      </View>
      <View style={styles.chips}>
        <Chip
          icon={
            <Dumbbell
              {...icon}
              color={workoutRest ? theme.colors.ink3 : theme.colors.ink2}
            />
          }
          label="Workout"
          value={
            workoutUnknown
              ? "—"
              : workoutRest
              ? "Rest day"
              : `${props.workoutDone} of ${props.workoutTotal}`
          }
          accessibilityLabel={
            workoutUnknown
              ? "Workout unavailable"
              : workoutRest
              ? "Workout: rest day"
              : `Workout ${props.workoutDone} of ${props.workoutTotal}${workoutDone ? ", done" : ""}`
          }
          variant={workoutRest ? "rest" : workoutDone ? "done" : "default"}
          fraction={
            workoutUnknown || workoutRest
              ? null
              : fillFraction(props.workoutDone, props.workoutTotal)
          }
        />
        <Chip
          icon={<Utensils {...icon} />}
          label="Meals"
          value={`${props.mealsDone} of ${props.mealsTotal}`}
          accessibilityLabel={`Meals ${props.mealsDone} of ${props.mealsTotal}${mealsDone ? ", done" : ""}`}
          variant={mealsDone ? "done" : "default"}
          fraction={fillFraction(props.mealsDone, props.mealsTotal)}
        />
        <Chip
          icon={<Footprints {...icon} />}
          label="Steps"
          value={stepsText.value}
          accessibilityLabel={
            stepsDone ? `${stepsText.a11y}, done` : stepsText.a11y
          }
          variant={stepsDone ? "done" : "default"}
          fraction={
            props.steps.status === "synced"
              ? fillFraction(props.steps.steps, props.steps.target)
              : null
          }
          onPress={props.onOpenSteps}
        />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: t.radii.card,
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
  ringSub: { textAlign: "center" },
  macros: { flex: 1, gap: spacing.sm },
  leftRow: {
    alignItems: "baseline",
    borderBottomColor: t.colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.xs,
  },
  leftLine: { flexShrink: 1 },
  macro: { gap: 4, minHeight: 32 },
  macroHead: { flexDirection: "row", justifyContent: "space-between" },
  macroValue: { fontVariant: ["tabular-nums" as const] },
  track: {
    backgroundColor: t.colors.fill2,
    borderRadius: 3,
    height: 6,
    overflow: "hidden",
  },
  fill: { borderRadius: 3, height: 6 },
  chips: { flexDirection: "row", gap: spacing.sm },
  chip: {
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.button,
    flex: 1,
    gap: 2,
    minHeight: 64,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  chipPressed: { opacity: 0.6 },
  chipDone: { backgroundColor: t.colors.doneTint },
  chipRest: { backgroundColor: t.colors.fill },
  chipHead: { alignItems: "center", flexDirection: "row", gap: 6 },
  chipValue: { fontVariant: ["tabular-nums" as const] },
  chipTrack: {
    backgroundColor: t.colors.fill2,
    borderRadius: 2,
    height: 4,
    marginTop: 2,
    overflow: "hidden",
  },
  chipFill: {
    backgroundColor: t.colors.brand,
    borderRadius: 2,
    height: 4,
  },
}));
