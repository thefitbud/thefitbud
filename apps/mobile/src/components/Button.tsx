import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from "react-native";
import { Text } from "./Text";
import {
  colors,
  fontFamilySemiBold,
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
  | "tinted"
  | "whatsapp"
  /** @deprecated Alias of tertiary — kept for existing call sites. */
  | "ghost";

type Props = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: ButtonVariant;
  /** Optional leading icon (e.g. WhatsApp glyph). */
  icon?: ReactNode;
};

/**
 * Mobile button hierarchy. Replaces PrimaryButton variants and adds
 * tertiary / destructive / tinted / whatsapp (green outline + icon).
 */
export function Button({
  label,
  loading = false,
  variant = "primary",
  disabled,
  icon,
  style,
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
      style={(state) => [
        styles.base,
        resolved === "primary" && styles.primary,
        resolved === "secondary" && styles.secondary,
        resolved === "whatsapp" && styles.whatsapp,
        resolved === "tinted" && styles.tinted,
        resolved === "tertiary" && styles.tertiary,
        resolved === "destructive" && styles.destructive,
        state.pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text
            style={[
              styles.label,
              (resolved === "primary" || resolved === "destructive") &&
                styles.labelOnFill,
              (resolved === "secondary" || resolved === "whatsapp") &&
                styles.labelSecondary,
              resolved === "tinted" && styles.labelTinted,
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

const WA_GREEN = "#25D366";

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
    borderWidth: 1.5,
    borderColor: WA_GREEN,
  },
  tinted: {
    backgroundColor: colors.paleLavender,
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
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    fontWeight: "600",
  },
  labelOnFill: {
    color: colors.white,
  },
  labelSecondary: {
    color: colors.deepNavy,
  },
  labelTinted: {
    color: colors.indigo,
  },
  labelTertiary: {
    color: colors.indigo,
  },
});
