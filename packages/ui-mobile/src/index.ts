import type { ReactNode } from "react";
export {
  colors,
  defaultTextStyle,
  radii,
  spacing,
  touchTargetMin,
  ringColors,
  semanticColors,
  themes,
  type ColorScheme,
  type ColorTokens,
  type Theme,
} from "./theme.js";
export {
  fontFamily,
  fontFamilyBold,
  fontFamilyDevanagari,
  fontFamilyMedium,
  fontFamilySemiBold,
  interFamilyForWeight,
  registeredFonts,
  textStyles,
  textVariants,
  typeScale,
  type TextVariant,
  type VariantStyle,
} from "./typography.js";
export { FitText } from "./FitText.js";
export { NutritionRings, type RingDatum } from "./NutritionRings.js";
export { DateNavigator, type DateNavigatorDay } from "./DateNavigator.js";
export { WeeklyConsistency } from "./WeeklyConsistency.js";

/** Placeholder primitive shell for later trainee/trainer mobile UI. */
export type ScreenProps = {
  title: string;
  children?: ReactNode;
};

export function screenTitle(title: string): string {
  return title.trim();
}
