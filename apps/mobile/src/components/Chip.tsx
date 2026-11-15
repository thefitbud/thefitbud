import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import type { Theme } from "@fitbud/ui-mobile";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/**
 * Kit `.chip` (DESIGN-SYSTEM-v3 §5 Chips and pills):
 * - `default`: card with a line2 edge, ink label.
 * - selected (`selected`): ink fill, on-brand label.
 * - `tint`: brand tint, brand-ink label.
 * - `coach`: coach tint, coach-ink label (a target that came from the coach).
 * - disabled: ink4 label.
 */
export type ChipTone = "default" | "tint" | "coach";

type Props = {
  label: string;
  tone?: ChipTone;
  selected?: boolean;
  disabled?: boolean;
  /** Leading icon; receives the label colour. */
  icon?: (color: string) => ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function colorsFor(
  theme: Theme,
  tone: ChipTone,
  selected: boolean,
  disabled: boolean,
) {
  const c = theme.colors;
  if (selected) return { bg: c.ink, fg: c.onBrand, edge: c.ink };
  const fgDisabled = disabled ? c.ink4 : undefined;
  if (tone === "tint")
    return { bg: c.brandTint, fg: fgDisabled ?? c.brandInk, edge: c.brandTint };
  if (tone === "coach")
    return { bg: c.coachTint, fg: fgDisabled ?? c.coachInk, edge: c.coachTint };
  return { bg: c.card, fg: fgDisabled ?? c.ink, edge: c.line2 };
}

export function Chip({
  label,
  tone = "default",
  selected = false,
  disabled = false,
  icon,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const { bg, fg, edge } = colorsFor(theme, tone, selected, disabled);
  const body = (
    <>
      {icon ? icon(fg) : null}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </>
  );
  const chipStyle = [
    styles.chip,
    { backgroundColor: bg, borderColor: edge },
    style,
  ];

  if (!onPress) {
    return (
      <View testID={testID} style={chipStyle}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      // 34 pt chip, 44 pt tap target.
      hitSlop={5}
      style={({ pressed }) => [
        chipStyle,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  chip: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: t.radii.chip,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    flexDirection: "row",
    gap: 6,
    height: 34,
    paddingHorizontal: 13,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.85,
  },
}));
