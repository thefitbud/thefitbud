/**
 * The compact set keypad of the active log (W-04): digits, the ±2.5 kg or ±1
 * rep steps, delete, Next and Log. The kg / Bodyweight switch of Z9-7 stays,
 * in the keypad's head, because a set's load can be either.
 */
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Check, Delete } from "lucide-react-native";
import { Text } from "../../../components/Text";
import { createThemedStyles, useTheme } from "../../../providers/ThemeProvider";
import type { KeypadField } from "../../../workout/shared";

type Props = {
  field: KeypadField;
  setNumber: number;
  /** "40 kg" or "10": the coach's target for this field, or null. */
  targetText: string | null;
  coachFirst: string;
  bodyweight: boolean;
  onBodyweightChange: (bodyweight: boolean) => void;
  onKey: (key: string) => void;
  onBackspace: () => void;
  onStep: (direction: 1 | -1) => void;
  /** Next: from kg to reps, and from reps back to kg. */
  onNext: () => void;
  onLog: () => void;
  onDone: () => void;
  /** Label of the primary key: "Log", or "Save" when a logged set is edited. */
  primaryLabel?: string;
};

export function LogKeypad({
  field,
  setNumber,
  targetText,
  coachFirst,
  bodyweight,
  onBodyweightChange,
  onKey,
  onBackspace,
  onStep,
  onNext,
  onLog,
  onDone,
  primaryLabel = "Log",
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const isLoad = field === "load";
  const step = isLoad ? "2.5" : "1";
  const owner = coachFirst === "your coach" ? "Coach’s" : `${coachFirst}’s`;
  const digit = (label: string) => (
    <Key key={label} label={label} onPress={() => onKey(label)} />
  );
  return (
    <View style={styles.kpad}>
      <View style={styles.head}>
        <Text variant="caption" style={styles.headText} numberOfLines={2}>
          Set {setNumber} · {isLoad ? "Weight (kg)" : "Reps"}
          {targetText ? (
            <>
              {` · ${owner} target `}
              <Text variant="caption" tone="brand" style={styles.strong}>
                {targetText}
              </Text>
            </>
          ) : null}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={bodyweight ? "Use a weight in kg" : "Use bodyweight"}
          onPress={() => onBodyweightChange(!bodyweight)}
          hitSlop={12}
          style={styles.headLink}
        >
          <Text style={styles.link}>{bodyweight ? "Use kg" : "Bodyweight"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close keypad"
          onPress={onDone}
          hitSlop={12}
          style={styles.headLink}
        >
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {["1", "2", "3"].map(digit)}
        <Key
          label={`−${step}`}
          accessibilityLabel={`Minus ${step}`}
          tone="fn"
          onPress={() => onStep(-1)}
        />
      </View>
      <View style={styles.row}>
        {["4", "5", "6"].map(digit)}
        <Key
          label={`+${step}`}
          accessibilityLabel={`Plus ${step}`}
          tone="fn"
          onPress={() => onStep(1)}
        />
      </View>
      <View style={styles.row}>
        {["7", "8", "9"].map(digit)}
        <Key
          label=""
          accessibilityLabel="Delete"
          tone="fn"
          onPress={onBackspace}
          icon={<Delete color={theme.colors.ink} size={22} strokeWidth={2} />}
        />
      </View>
      <View style={styles.row}>
        <Key
          label="."
          accessibilityLabel="Decimal point"
          disabled={!isLoad}
          onPress={() => onKey(".")}
        />
        {digit("0")}
        <Key
          label="Next"
          accessibilityLabel={isLoad ? "Next: reps" : "Next: weight"}
          tone="fn"
          disabled={bodyweight}
          onPress={onNext}
        />
        <Key
          label={primaryLabel}
          accessibilityLabel={`${primaryLabel} set ${setNumber}`}
          tone="pri"
          onPress={onLog}
          icon={<Check color={theme.colors.onBrand} size={18} strokeWidth={2.8} />}
        />
      </View>
    </View>
  );
}

function Key({
  label,
  accessibilityLabel,
  tone = "digit",
  disabled = false,
  icon,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  tone?: "digit" | "fn" | "pri";
  disabled?: boolean;
  icon?: ReactNode;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        tone === "fn" ? styles.keyFn : null,
        tone === "pri" ? styles.keyPri : null,
        disabled ? styles.keyOff : null,
        pressed ? styles.keyPressed : null,
      ]}
    >
      {icon}
      {label ? (
        <Text
          style={[
            styles.keyText,
            tone !== "digit" ? styles.keyTextFn : null,
            tone === "pri" ? styles.keyTextPri : null,
          ]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  kpad: {
    backgroundColor: t.colors.kbd,
    gap: 6,
    paddingBottom: 12,
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  head: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    paddingBottom: 2,
    paddingHorizontal: 6,
  },
  headText: { flex: 1 },
  headLink: { justifyContent: "center", minHeight: 24 },
  strong: { fontWeight: "700" },
  link: { color: t.colors.brand, fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", gap: 6 },
  key: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderRadius: 9,
    flex: 1,
    flexDirection: "row",
    gap: 4,
    height: 46,
    justifyContent: "center",
  },
  keyFn: { backgroundColor: t.colors.kbdFn },
  keyPri: { backgroundColor: t.colors.brand },
  keyOff: { opacity: 0.4 },
  keyPressed: { opacity: 0.7 },
  keyText: {
    color: t.colors.ink,
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
  },
  keyTextFn: { fontSize: 15, fontWeight: "600" },
  keyTextPri: { color: t.colors.onBrand },
}));
