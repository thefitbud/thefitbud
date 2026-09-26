import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, spacing, touchTargetMin } from "@fitbud/ui-mobile";

type Props = TextInputProps & {
  label: string;
  hint?: string;
};

export function Field({ label, hint, ...inputProps }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.midGrey}
        style={[
          styles.input,
          inputProps.multiline ? styles.multiline : undefined,
        ]}
        {...inputProps}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: touchTargetMin,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.nearBlack,
  },
  multiline: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  hint: {
    marginTop: spacing.sm,
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
  },
});
