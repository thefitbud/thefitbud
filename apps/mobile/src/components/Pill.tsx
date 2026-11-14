import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import type { Theme } from "@fitbud/ui-mobile";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/**
 * Kit `.pill`: a 32 pt rounded action or label.
 * - `brand`: brand fill, on-brand label.
 * - `tint`: brand tint, brand-ink label.
 * - `ghost`: fill, ink label.
 * `size="action"` is the kit's `.acts .pill` (38 pt, 12 pt corners) used for
 * the primary and secondary actions on a due item.
 */
export type PillVariant = "brand" | "tint" | "ghost";

type Props = {
  label: string;
  variant?: PillVariant;
  size?: "md" | "action";
  icon?: (color: string) => ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function colorsFor(theme: Theme, variant: PillVariant, disabled: boolean) {
  const c = theme.colors;
  if (disabled) return { bg: c.fill2, fg: c.ink4 };
  if (variant === "brand") return { bg: c.brand, fg: c.onBrand };
  if (variant === "tint") return { bg: c.brandTint, fg: c.brandInk };
  return { bg: c.fill, fg: c.ink };
}

export function Pill({
  label,
  variant = "ghost",
  size = "md",
  icon,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const { bg, fg } = colorsFor(theme, variant, disabled);
  const pillStyle = [
    styles.pill,
    size === "action" ? styles.action : null,
    { backgroundColor: bg },
    style,
  ];
  const body = (
    <>
      {icon ? icon(fg) : null}
      <Text
        style={[
          styles.label,
          size === "action" ? styles.labelAction : null,
          { color: fg },
        ]}
      >
        {label}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={pillStyle}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      // 32/38 pt pill, 44 pt tap target.
      hitSlop={size === "action" ? 3 : 6}
      style={({ pressed }) => [
        pillStyle,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  pill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: t.radii.pill,
    flexDirection: "row",
    gap: 5,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  action: {
    alignSelf: "auto",
    borderRadius: t.radii.buttonSm,
    height: 38,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  labelAction: {
    fontSize: 14.5,
  },
  pressed: {
    opacity: 0.85,
  },
}));
