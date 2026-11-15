import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
} from "react-native";
import type { Theme } from "@fitbud/ui-mobile";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/**
 * v3 button variants (DESIGN-SYSTEM-v3 §5, kit `.btn.*`):
 * - `primary`: brand fill, on-brand label (the text colour inverted; no shadow).
 * - `secondary`: fill, ink label.
 * - `tint`: brand tint, brand-ink label.
 * - `outline`: card with a line2 edge, ink label.
 * - `danger`: crit fill, on-brand label. `dangerQuiet`: crit tint, crit label.
 * - `text`: no fill, brand label.
 * - `whatsapp`: outline with the WhatsApp green edge (a wa.me redirect, never a send).
 * Legacy names stay for existing call sites: `tinted` → tint, `tertiary` and
 * `ghost` → text, `destructive` → danger.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tint"
  | "outline"
  | "danger"
  | "dangerQuiet"
  | "text"
  | "whatsapp"
  /** @deprecated Use tint. */
  | "tinted"
  /** @deprecated Use text. */
  | "tertiary"
  /** @deprecated Use text. */
  | "ghost"
  /** @deprecated Use danger. */
  | "destructive";

type Resolved = Exclude<ButtonVariant, "tinted" | "tertiary" | "ghost" | "destructive">;

const ALIASES: Partial<Record<ButtonVariant, Resolved>> = {
  tinted: "tint",
  tertiary: "text",
  ghost: "text",
  destructive: "danger",
};

type Props = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: ButtonVariant;
  /** `sm` is the kit's 38 pt button; it keeps a 44 pt tap target. */
  size?: "md" | "sm";
  /** Optional leading icon (e.g. WhatsApp glyph). */
  icon?: ReactNode;
};

/** Label colour token per variant. */
function labelColor(theme: Theme, variant: Resolved, disabled: boolean): string {
  const c = theme.colors;
  if (disabled) return c.ink4;
  switch (variant) {
    case "primary":
    case "danger":
      return c.onBrand;
    case "tint":
      return c.brandInk;
    case "dangerQuiet":
      return c.crit;
    case "text":
      return c.brand;
    default:
      return c.ink;
  }
}

export function Button({
  label,
  loading = false,
  variant = "primary",
  size = "md",
  disabled,
  icon,
  style,
  ...rest
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const isDisabled = Boolean(disabled || loading);
  const resolved: Resolved = ALIASES[variant] ?? (variant as Resolved);
  // Loading keeps the variant's colours; only a real disable greys out.
  const greyed = Boolean(disabled) && !loading;
  const color = labelColor(theme, resolved, greyed);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        size === "sm" && styles.small,
        styles[resolved],
        greyed && resolved !== "text" && styles.disabled,
        state.pressed && !isDisabled && styles.pressed,
        typeof style === "function" ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.label, size === "sm" && styles.labelSmall, { color }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** @deprecated Prefer Button — kept for existing call sites during Batch 0. */
export { Button as PrimaryButton };

const useStyles = createThemedStyles((t) => ({
  base: {
    minHeight: 50,
    borderRadius: t.radii.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: t.spacing.sm,
  },
  small: {
    minHeight: t.touchTarget,
    borderRadius: t.radii.buttonSm,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.sm,
  },
  primary: {
    backgroundColor: t.colors.brand,
  },
  secondary: {
    backgroundColor: t.colors.fill,
  },
  tint: {
    backgroundColor: t.colors.brandTint,
  },
  outline: {
    backgroundColor: t.colors.card,
    borderWidth: 1,
    borderColor: t.colors.line2,
  },
  danger: {
    backgroundColor: t.colors.crit,
  },
  dangerQuiet: {
    backgroundColor: t.colors.critTint,
  },
  text: {
    backgroundColor: "transparent",
  },
  whatsapp: {
    backgroundColor: t.colors.card,
    borderWidth: 1.5,
    // WhatsApp's own brand green: a third-party mark, the same in both themes.
    // eslint-disable-next-line fitbud-theme/no-hard-coded-colour
    borderColor: "#25D366",
  },
  disabled: {
    backgroundColor: t.colors.fill2,
    borderColor: t.colors.fill2,
  },
  pressed: {
    opacity: 0.88,
  },
  label: {
    ...t.text.bodyStrong.style,
  },
  labelSmall: {
    fontSize: 14.5,
  },
}));
