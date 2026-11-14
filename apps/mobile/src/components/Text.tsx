import { createContext, useContext } from "react";
import { StyleSheet, type TextProps, type TextStyle } from "react-native";
import { FitText, type TextVariant } from "@fitbud/ui-mobile";
import type { ColorToken } from "@fitbud/tokens";
import { useTheme } from "../providers/ThemeProvider";

export type { TextVariant };

type Props = TextProps & {
  /**
   * v3 type scale (DESIGN-SYSTEM-v3 §4): largeTitle, title, headline, body,
   * bodyStrong, subhead, caption, label, tab, numberXl … numberSm. Number
   * variants use tabular digits. Without a variant the caller's style decides
   * size, as before (screens that have not migrated).
   */
  variant?: TextVariant;
  /** Colour token; defaults to the variant's own (ink, or ink2/ink3 for subhead/caption/label). */
  tone?: ColorToken;
};

/** True inside another Text: nested runs inherit their parent's colour, as in React Native. */
const NestedText = createContext(false);

/**
 * Shared mobile Text (Z12-36). Always Inter: `FitText` maps the weight to the
 * registered Inter face, so a style without `fontFamily` never falls back to
 * the platform font. The outermost Text takes its colour from the theme, so
 * copy follows light and dark; a nested Text inherits unless it sets `tone`,
 * and a caller's explicit `color` always wins.
 */
export function Text({ variant, tone, style, children, ...rest }: Props) {
  const theme = useTheme();
  const nested = useContext(NestedText);
  const spec = variant ? theme.text[variant] : undefined;
  const colorToken = tone ?? (nested ? undefined : (spec?.color ?? "ink"));
  const base: TextStyle = {
    ...spec?.style,
    ...(colorToken ? { color: theme.colors[colorToken] } : null),
  };
  return (
    <FitText {...rest} style={StyleSheet.compose(base, style)}>
      {nested ? children : <NestedText.Provider value>{children}</NestedText.Provider>}
    </FitText>
  );
}
