import type { ReactNode } from "react";
export {
  colors,
  defaultTextStyle,
  radii,
  spacing,
  touchTargetMin,
  ringColors,
  semanticColors,
} from "./theme.js";
export {
  fontFamily,
  fontFamilyBold,
  fontFamilyDevanagari,
  fontFamilyMedium,
  fontFamilySemiBold,
  textStyles,
  typeScale,
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
