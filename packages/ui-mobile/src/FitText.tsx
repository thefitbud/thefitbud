import {
  StyleSheet,
  Text as RNText,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from "react-native";
import { defaultTextStyle } from "./theme.js";
import {
  fontFamily,
  fontFamilyBold,
  fontFamilyMedium,
  fontFamilySemiBold,
} from "./typography.js";

function satoshiFamilyForWeight(weight: TextStyle["fontWeight"]): string {
  const numeric =
    typeof weight === "number"
      ? weight
      : weight === "bold"
        ? 700
        : weight === "normal"
          ? 400
          : Number.parseInt(String(weight ?? "400"), 10);
  if (!Number.isFinite(numeric) || numeric <= 400) return fontFamily;
  if (numeric <= 500) return fontFamilyMedium;
  if (numeric <= 600) return fontFamilySemiBold;
  return fontFamilyBold;
}

/**
 * Flatten caller styles, map fontWeight → Satoshi-* face, and drop fontWeight
 * so RN-web does not fall back to -apple-system when synthesizing bold.
 */
function resolveFitTextStyle(style: StyleProp<TextStyle>): TextStyle[] {
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, fontFamily: explicitFamily, ...rest } = flat;
  const family =
    typeof explicitFamily === "string" && explicitFamily.length > 0
      ? explicitFamily
      : satoshiFamilyForWeight(fontWeight);
  return [{ ...defaultTextStyle, ...rest, fontFamily: family }];
}

/**
 * Body Text that always applies Satoshi. Prefer this over raw RN `Text` so
 * style objects that set color/size without fontFamily cannot fall back to
 * -apple-system / system UI fonts.
 */
export function FitText({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={resolveFitTextStyle(style)} />;
}
