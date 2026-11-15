import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { createThemedStyles, shadowColor } from "../providers/ThemeProvider";

type Props = {
  children: ReactNode;
  /**
   * `card` (kit `.card`): 18 pt corners, 16 pt padding.
   * `group` (kit `.group`): 16 pt corners, no padding, clips its rows (use with ListRow).
   */
  variant?: "card" | "group";
  /** Due item (kit `.due`): 1.5 pt coral-strong outline. Coral means today or due, nothing else. */
  due?: boolean;
  /** Drop the card padding (the `group` variant never pads). */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Card surface on the page. Light: a faint shadow and a 0.5 pt edge. Dark: no
 * shadow, a 1 pt edge; depth comes from the surface step (bg → card), per
 * DESIGN-SYSTEM-v3 §4.
 */
export function Card({
  children,
  variant = "card",
  due = false,
  flush = false,
  style,
  testID,
}: Props) {
  const styles = useStyles();
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        variant === "group" ? styles.group : styles.card,
        variant === "card" && !flush ? styles.padded : null,
        due ? styles.due : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  base: {
    backgroundColor: t.colors.card,
    borderWidth: t.scheme === "dark" ? 1 : 0.5,
    borderColor: t.colors.edge,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.04,
    shadowRadius: 2,
    elevation: t.scheme === "dark" ? 0 : 1,
  },
  card: {
    borderRadius: t.radii.card,
  },
  group: {
    borderRadius: t.radii.group,
    overflow: "hidden",
  },
  padded: {
    padding: t.spacing.lg,
  },
  due: {
    borderWidth: 1.5,
    borderColor: t.colors.coralStrong,
  },
}));
