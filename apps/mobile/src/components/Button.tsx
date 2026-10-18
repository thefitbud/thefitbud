import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";
import {
  colors,
  radii,
  semanticColors,
  spacing,
  touchTargetMin,
} from "@fitbud/ui-mobile";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "destructive"
  | "whatsapp"
  /** @deprecated Alias of tertiary — kept for existing call sites. */
  | "ghost";

type Props = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: ButtonVariant;
};

/**
 * Mobile button hierarchy. Replaces PrimaryButton variants and adds
 * tertiary / destructive / whatsapp (neutral secondary).
 */
export function Button({
  label,
  loading = false,
  variant = "primary",
  disabled,
  ...rest
}: Props) {
  const isDisabled = Boolean(disabled || loading);
  const resolved =
    variant === "ghost" ? "tertiary" : variant;
  const spinnerColor =
    resolved === "primary" || resolved === "destructive"
      ? colors.white
      : colors.indigo;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        resolved === "primary" && styles.primary,
        resolved === "secondary" && styles.secondary,
        resolved === "whatsapp" && styles.whatsapp,
        resolved === "tertiary" && styles.tertiary,
        resolved === "destructive" && styles.destructive,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View style={styles.row}>
          <Text
            style={[
              styles.label,
              (resolved === "primary" || resolved === "destructive") &&
                styles.labelOnFill,
              (resolved === "secondary" || resolved === "whatsapp") &&
                styles.labelSecondary,
              resolved === "tertiary" && styles.labelTertiary,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** @deprecated Prefer Button — kept for existing call sites during Batch 0. */
export { Button as PrimaryButton };

const styles = StyleSheet.create({
  base: {
    minHeight: touchTargetMin,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.indigo,
  },
  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lightGrey,
  },
  whatsapp: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lightGrey,
  },
  tertiary: {
    backgroundColor: "transparent",
  },
  destructive: {
    backgroundColor: semanticColors.destructive,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
  },
  labelOnFill: {
    color: colors.white,
  },
  labelSecondary: {
    color: colors.deepNavy,
  },
  labelTertiary: {
    color: colors.indigo,
  },
});
