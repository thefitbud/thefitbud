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

/** Shared text styles — product screens must use these so Satoshi actually renders. */
export const textStyles = {
  display: {
    fontFamily: fontFamilyBold,
    fontSize: typeScale.display,
    fontWeight: "700" as const,
  },
  headline: {
    fontFamily: fontFamilyBold,
    fontSize: typeScale.headline,
    fontWeight: "700" as const,
  },
  title: {
    fontFamily: fontFamilySemiBold,
    fontSize: typeScale.title,
    fontWeight: "600" as const,
  },
  body: {
    fontFamily,
    fontSize: typeScale.body,
    fontWeight: "400" as const,
  },
  bodyMedium: {
    fontFamily: fontFamilyMedium,
    fontSize: typeScale.body,
    fontWeight: "500" as const,
  },
  label: {
    fontFamily: fontFamilyMedium,
    fontSize: 14,
    fontWeight: "500" as const,
  },
  caption: {
    fontFamily: fontFamilyMedium,
    fontSize: typeScale.caption,
    fontWeight: "500" as const,
  },
} as const;
