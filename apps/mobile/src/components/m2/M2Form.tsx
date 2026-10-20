import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Minus, Plus } from "lucide-react-native";
import {
  colors,
  defaultTextStyle,
  fontFamilyMedium,
  fontFamilySemiBold,
  spacing,
} from "@fitbud/ui-mobile";
import { Text } from "../Text";

export function M2Field({
  label,
  children,
  help,
}: {
  label: string;
  children: ReactNode;
  help?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {help ? <Text style={styles.fieldHelp}>{help}</Text> : null}
    </View>
  );
}

type InputProps = {
  value: string;
  onChangeText?: (text: string) => void;
  prefix?: ReactNode;
  suffix?: ReactNode;
  readOnly?: boolean;
  focused?: boolean;
  inputProps?: TextInputProps;
};

export function M2InputRow({
  value,
  onChangeText,
  prefix,
  suffix,
  readOnly,
  focused,
  inputProps,
}: InputProps) {
  return (
    <View
      style={[
        styles.inputRow,
        readOnly && styles.inputRowRo,
        focused && styles.inputRowFocus,
      ]}
    >
      {prefix}
      {readOnly ? (
        <Text style={styles.inputText}>{value}</Text>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={colors.midGrey}
          style={styles.inputText}
          {...inputProps}
        />
      )}
      {suffix}
    </View>
  );
}

type RadioProps = {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export function RadioCard({
  title,
  subtitle,
  selected,
  onPress,
  disabled,
}: RadioProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.radc, selected && styles.radcOn]}
    >
      <View style={[styles.radioDot, selected && styles.radioDotOn]} />
      <View style={styles.radcText}>
        <Text style={[styles.radcTitle, selected && styles.radcTitleOn]}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.radcSub}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function DayPills({
  selected,
  onToggle,
  disabled,
}: {
  selected: string[];
  onToggle: (day: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.dayRow}>
      {DAY_LABELS.map((day) => {
        const on = selected.includes(day);
        return (
          <Pressable
            key={day}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled }}
            disabled={disabled}
            onPress={() => onToggle(day)}
            style={[styles.dayPill, on && styles.dayPillOn]}
          >
            <Text style={[styles.dayPillText, on && styles.dayPillTextOn]}>
              {day}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function NumberStepper({
  value,
  unit,
  step = 0.5,
  min = 4,
  max = 12,
  onChange,
  disabled,
}: {
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.stepperCard}>
      <Text style={styles.stepperValue}>
        {value}{" "}
        {unit ? <Text style={styles.stepperUnit}>{unit}</Text> : null}
      </Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease"
          disabled={disabled || value <= min}
          onPress={() => onChange(Math.max(min, value - step))}
          style={styles.stepperBtn}
        >
          <Minus size={18} color={colors.indigo} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase"
          disabled={disabled || value >= max}
          onPress={() => onChange(Math.min(max, value + step))}
          style={styles.stepperBtn}
        >
          <Plus size={18} color={colors.indigo} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

export function YesNoToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean | undefined;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.ynRow}>
      {(["Yes", "No"] as const).map((label) => {
        const selected = value === (label === "Yes");
        return (
          <Pressable
            key={label}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(label === "Yes")}
            style={[styles.ynBtn, selected && styles.ynBtnOn]}
          >
            <Text style={[styles.ynText, selected && styles.ynTextOn]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function QuestionHeading({
  children,
  hint,
}: {
  children: string;
  hint?: string;
}) {
  return (
    <Text style={styles.qh}>
      {children}
      {hint ? <Text style={styles.qhHint}> {hint}</Text> : null}
    </Text>
  );
}

export function NoteCallout({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <View style={styles.note}>
      {icon}
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

export function Card2({
  children,
  style,
}: {
  children: ReactNode;
  style?: object;
}) {
  return <View style={[styles.c2, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  field: {
    marginTop: spacing.md,
  },
  fieldLabel: {
    color: colors.nearBlack,
    fontFamily: fontFamilyMedium,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    marginHorizontal: 2,
  },
  fieldHelp: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: 2,
    marginTop: 6,
  },
  inputRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#D5D6DE",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  inputRowRo: {
    backgroundColor: colors.background,
    color: colors.midGrey,
  },
  inputRowFocus: {
    borderColor: colors.indigo,
    borderWidth: 1.5,
  },
  inputText: {
    ...defaultTextStyle,
    color: colors.nearBlack,
    flex: 1,
    fontSize: 16,
    paddingVertical: spacing.sm,
  },
  radc: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#D5D6DE",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  radcOn: {
    backgroundColor: "#F7F5FF",
    borderColor: colors.indigo,
    borderWidth: 2,
  },
  radioDot: {
    borderColor: "#D5D6DE",
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    width: 22,
  },
  radioDotOn: {
    borderColor: colors.indigo,
    borderWidth: 6,
  },
  radcText: {
    flex: 1,
  },
  radcTitle: {
    color: colors.nearBlack,
    fontSize: 16,
    fontWeight: "600",
  },
  radcTitleOn: {
    color: colors.deepNavy,
  },
  radcSub: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 1,
  },
  dayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dayPill: {
    alignItems: "center",
    borderColor: "#D5D6DE",
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  dayPillOn: {
    backgroundColor: "#EDE9FF",
    borderColor: "#C9BEFF",
    borderWidth: 2,
  },
  dayPillText: {
    color: colors.nearBlack,
    fontSize: 15,
    fontWeight: "600",
  },
  dayPillTextOn: {
    color: colors.indigo,
  },
  stepperCard: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  stepperValue: {
    color: colors.deepNavy,
    fontSize: 22,
    fontWeight: "700",
  },
  stepperUnit: {
    color: colors.midGrey,
    fontSize: 14,
    fontWeight: "600",
  },
  stepper: {
    borderColor: "#E7E9F2",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  stepperBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  ynRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  ynBtn: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#D5D6DE",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    height: 52,
    justifyContent: "center",
  },
  ynBtnOn: {
    backgroundColor: "#EDE9FF",
    borderColor: "#C9BEFF",
  },
  ynText: {
    color: colors.nearBlack,
    fontSize: 16,
    fontWeight: "700",
  },
  ynTextOn: {
    color: colors.indigo,
  },
  qh: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  qhHint: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "500",
  },
  note: {
    backgroundColor: "#F7F5FF",
    borderColor: "#E4DEFF",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noteText: {
    color: colors.nearBlack,
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  c2: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: "#1A1248",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
});
