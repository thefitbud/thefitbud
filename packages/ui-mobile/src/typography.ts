import { Platform } from "react-native";
import { fontFamily as brandFontStack } from "@fitbud/tokens";

/**
 * Use the expo-font registered family names on native and Expo web.
 * Keep the CSS stack as a fallback for plain web CSS contexts.
 */
const registered = {
  regular: "Satoshi-Regular",
  medium: "Satoshi-Medium",
  semiBold: "Satoshi-SemiBold",
  bold: "Satoshi-Bold",
  devanagari: "NotoSansDevanagari_400Regular",
} as const;

export const fontFamily = registered.regular;
export const fontFamilyMedium = registered.medium;
export const fontFamilySemiBold = registered.semiBold;
export const fontFamilyBold = registered.bold;

/** Hindi-ready body stack (Noto Sans Devanagari). */
export const fontFamilyDevanagari = Platform.select({
  web: `${registered.devanagari}, ${brandFontStack}`,
  default: registered.devanagari,
});

export const typeScale = {
  caption: 12,
  body: 16,
  bodyLarge: 16,
  title: 18,
  headline: 24,
  display: 28,
} as const;
