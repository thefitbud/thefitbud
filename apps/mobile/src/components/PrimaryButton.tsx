import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from "react-native";
import { colors, spacing, touchTargetMin } from "@fitbud/ui-mobile";

type Props = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

export function PrimaryButton({
  label,
  loading = false,
  variant = "primary",
  disabled,
  ...rest
}: Props) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.white : colors.indigo} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === "primary" && styles.primaryLabel,
            variant === "secondary" && styles.secondaryLabel,
            variant === "ghost" && styles.ghostLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTargetMin,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primary: {
    backgroundColor: colors.indigo,
  },
  secondary: {
    backgroundColor: colors.paleLavender,
    borderWidth: 1,
    borderColor: colors.indigo,
  },
  ghost: {
    backgroundColor: "transparent",
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
  primaryLabel: {
    color: colors.white,
  },
  secondaryLabel: {
    color: colors.indigo,
  },
  ghostLabel: {
    color: colors.midGrey,
  },
});
