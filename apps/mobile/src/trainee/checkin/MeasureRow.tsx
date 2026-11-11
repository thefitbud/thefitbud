import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { colors, spacing } from "@fitbud/ui-mobile";

/** Z6-6: body measurements are 10 to 250 cm. */
export const MEASURE_MIN_CM = 10;
export const MEASURE_MAX_CM = 250;

/** Keep digits and one decimal point; the trainee types on a decimal keypad. */
export function cleanMeasureInput(raw: string): string {
  const swapped = raw.replace(",", ".");
  let seenDot = false;
  let out = "";
  for (const ch of swapped) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !seenDot) {
      seenDot = true;
      out += ch;
    }
  }
  return out;
}

/** An empty string is "not answered" and is fine; anything else must be in range. */
export function measureProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < MEASURE_MIN_CM || n > MEASURE_MAX_CM) {
    return `Enter ${MEASURE_MIN_CM} to ${MEASURE_MAX_CM} cm`;
  }
  return null;
}

/**
 * Newest stored value per measurement type, as a hint. Only types that name one
 * body part are used; `other` can be arm, thigh or anything else, so it has no
 * unambiguous last value and shows none.
 */
export function lastValuesByType(
  measurements: ReadonlyArray<{ type: string; value: number; observedAt: string }>,
): Record<string, { value: number; observedAt: string }> {
  const out: Record<string, { value: number; observedAt: string }> = {};
  for (const m of measurements) {
    if (m.type === "other") continue;
    const prev = out[m.type];
    if (!prev || m.observedAt > prev.observedAt) {
      out[m.type] = { value: m.value, observedAt: m.observedAt };
    }
  }
  return out;
}

export function MeasureRow({
  label,
  helpText,
  unit,
  value,
  lastLabel,
  first,
  onChange,
  onBlur,
}: {
  label: string;
  helpText?: string;
  unit: string;
  value: string;
  /** e.g. "94 cm · Fri 9 Oct"; absent when nothing is stored. */
  lastLabel?: string | null;
  first?: boolean;
  onChange: (next: string) => void;
  onBlur: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const problem = measureProblem(value);
  return (
    <View style={[styles.row, first ? styles.rowFirst : null]}>
      <View style={styles.text}>
        <Text style={styles.title}>{label}</Text>
        {helpText ? <Text style={styles.help}>{helpText}</Text> : null}
        {lastLabel ? <Text style={styles.help}>Last: {lastLabel}</Text> : null}
        {problem ? (
          <Text style={styles.problem} accessibilityRole="alert">
            {problem}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.box,
          focused ? styles.boxOn : null,
          problem ? styles.boxBad : null,
        ]}
      >
        <TextInput
          accessibilityLabel={`${label}, ${unit}`}
          value={value}
          onChangeText={(t) => onChange(cleanMeasureInput(t))}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur();
          }}
          keyboardType="decimal-pad"
          returnKeyType="done"
          maxLength={6}
          style={styles.input}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowFirst: { marginTop: spacing.sm },
  text: { flex: 1 },
  title: { color: colors.deepNavy, fontSize: 17, fontWeight: "600" },
  help: { color: colors.midGrey, fontSize: 13, marginTop: 2 },
  problem: { color: "#B42318", fontSize: 13, fontWeight: "600", marginTop: 2 },
  box: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: "#E7E9F2",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 48,
    overflow: "hidden",
    paddingHorizontal: 12,
    width: 112,
  },
  boxOn: { borderColor: colors.indigo, borderWidth: 2 },
  boxBad: { borderColor: "#B42318" },
  input: {
    color: colors.deepNavy,
    flex: 1,
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    minHeight: 44,
    minWidth: 0,
    padding: 0,
    textAlign: "right",
    // Web only: the box draws the focus ring, not the bare input.
    ...({ outlineStyle: "none", outlineWidth: 0 } as object),
  },
  unit: { color: colors.midGrey, fontSize: 13, fontWeight: "600", marginLeft: 4 },
});
