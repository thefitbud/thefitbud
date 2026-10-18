import { Text as RNText, type TextProps } from "react-native";
import { defaultTextStyle } from "./theme.js";

/**
 * Body Text that always applies Satoshi. Prefer this over raw RN `Text` so
 * style objects that set color/size without fontFamily cannot fall back to
 * -apple-system / system UI fonts.
 */
export function FitText({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={[defaultTextStyle, style]} />;
}
