import { Pressable, StyleSheet, View } from "react-native";
import { Delete } from "lucide-react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import type { KeypadField } from "./setEntry";

type Props = {
  field: KeypadField;
  setOrder: number;
  bodyweight: boolean;
  onBodyweightChange: (bodyweight: boolean) => void;
  onKey: (key: string) => void;
  onBackspace: () => void;
  onStep: (direction: 1 | -1) => void;
  /** "Next: reps" on the load keypad, "Log set N" on the reps keypad. */
  onPrimary: () => void;
  onClose: () => void;
  disabled?: boolean;
  /** Label of the primary key; defaults to "Next: reps" (load) or "Log set N" (reps). */
  primaryLabel?: string;
  /** Hint under the title; defaults to the trainee wording. */
  hint?: string;
};

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

/** Number keypad of frames 11 (load, ±2.5) and 11c (reps, Bodyweight on). */
export function SetKeypad({
  field,
  setOrder,
  bodyweight,
  onBodyweightChange,
  onKey,
  onBackspace,
  onStep,
  onPrimary,
  onClose,
  disabled = false,
  primaryLabel,
  hint: hintOverride,
}: Props) {
  const isLoad = field === "load";
  // A bodyweight set has no kg to type.
  const keysOff = disabled || (isLoad && bodyweight);
  const stepLabel = isLoad ? "2.5" : "1";
  const title = isLoad ? `Set ${setOrder} · load` : `Set ${setOrder} · reps`;
  const primaryText = primaryLabel ?? (isLoad ? "Next: reps" : `Log set ${setOrder}`);
  const hint = hintOverride ?? (isLoad
    ? bodyweight
      ? "No weight used"
      : "Weight used, in kg"
    : bodyweight
      ? "Holding weights? Switch to kg"
      : "Reps you did");

  return (
    <View style={styles.sheet}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close keypad"
        onPress={onClose}
        style={styles.handleHit}
      >
        <View style={styles.handle} />
      </Pressable>
      <View style={styles.head}>
        <View style={styles.headTx}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        <View style={styles.seg} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: !bodyweight }}
            accessibilityLabel="kg"
            onPress={() => onBodyweightChange(false)}
            style={[styles.segBtn, !bodyweight ? styles.segOn : null]}
          >
            <Text style={[styles.segText, !bodyweight ? styles.segTextOn : null]}>
              kg
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: bodyweight }}
            accessibilityLabel="Bodyweight"
            onPress={() => onBodyweightChange(true)}
            style={[styles.segBtn, bodyweight ? styles.segOn : null]}
          >
            <Text style={[styles.segText, bodyweight ? styles.segTextOn : null]}>
              Bodyweight
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.grid}>
        <View style={styles.keys}>
          {ROWS.map((row) => (
            <View key={row[0]} style={styles.row}>
              {row.map((k) => (
                <Key key={k} label={k} disabled={keysOff} onPress={() => onKey(k)} />
              ))}
            </View>
          ))}
          <View style={styles.row}>
            <Key
              label="."
              accessibilityLabel="Decimal point"
              disabled={keysOff || !isLoad}
              onPress={() => onKey(".")}
            />
            <Key label="0" disabled={keysOff} onPress={() => onKey("0")} />
            <Key
              label=""
              accessibilityLabel="Delete"
              disabled={keysOff}
              onPress={onBackspace}
              icon={<Delete color={colors.deepNavy} size={22} />}
            />
          </View>
        </View>
        <View style={styles.side}>
          <Key
            label={`−${stepLabel}`}
            accessibilityLabel={`Minus ${stepLabel}`}
            tone="step"
            disabled={keysOff}
            onPress={() => onStep(-1)}
          />
          <Key
            label={`+${stepLabel}`}
            accessibilityLabel={`Plus ${stepLabel}`}
            tone="step"
            disabled={keysOff}
            onPress={() => onStep(1)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryText}
            disabled={disabled}
            onPress={onPrimary}
            style={[styles.primary, disabled ? styles.off : null]}
          >
            <Text style={styles.primaryText}>{primaryText}</Text>
            <Text style={styles.primaryText}>›</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  disabled,
  tone = "digit",
  icon,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "digit" | "step";
  icon?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.key,
        tone === "step" ? styles.keyStep : null,
        disabled ? styles.off : null,
      ]}
    >
      {icon ?? (
        <Text
          style={[styles.keyText, tone === "step" ? styles.keyTextStep : null]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    shadowColor: "#1B1464",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  handleHit: { alignItems: "center", height: 44, justifyContent: "center" },
  handle: {
    backgroundColor: colors.lightGrey,
    borderRadius: 3,
    height: 5,
    width: 40,
  },
  head: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  headTx: { flex: 1, minWidth: 0 },
  title: { color: colors.deepNavy, fontSize: 17, fontWeight: "600" },
  hint: { color: colors.midGrey, fontSize: 13, marginTop: 2 },
  seg: {
    backgroundColor: "#EEEDF6",
    borderRadius: 14,
    flexDirection: "row",
    padding: 3,
  },
  segBtn: {
    alignItems: "center",
    borderRadius: 11,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
  },
  segOn: { backgroundColor: colors.white },
  segText: { color: colors.midGrey, fontSize: 15, fontWeight: "600" },
  segTextOn: { color: colors.deepNavy },
  grid: { flexDirection: "row", gap: 8 },
  keys: { flex: 3, gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  side: { flex: 1, gap: 8 },
  key: {
    alignItems: "center",
    backgroundColor: "#F6F5FB",
    borderRadius: 14,
    flex: 1,
    height: 52,
    justifyContent: "center",
    minHeight: 44,
  },
  keyStep: { backgroundColor: "#ECE9FF" },
  keyText: { color: colors.deepNavy, fontSize: 24, fontWeight: "500" },
  keyTextStep: { color: colors.indigo, fontSize: 19, fontWeight: "600" },
  primary: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    minHeight: 116,
    paddingHorizontal: 6,
  },
  primaryText: { color: colors.white, fontSize: 17, fontWeight: "600", textAlign: "center" },
  off: { opacity: 0.4 },
});
