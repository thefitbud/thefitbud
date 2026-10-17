import { Platform } from "react-native";
import { fontFamily as tokenFontFamily } from "@fitbud/tokens";

export const fontFamily = Platform.select({
  web: tokenFontFamily,
  default: "Inter_400Regular",
});

export const fontFamilyMedium = Platform.select({
  web: tokenFontFamily,
  default: "Inter_500Medium",
});

export const fontFamilyBold = Platform.select({
  web: tokenFontFamily,
  default: "Inter_700Bold",
});

/** Hindi-ready body stack (Noto Sans Devanagari). */
export const fontFamilyDevanagari = Platform.select({
  web: tokenFontFamily,
  default: "NotoSansDevanagari_400Regular",
});

export const typeScale = {
  caption: 12,
  body: 15,
  bodyLarge: 16,
  title: 18,
  headline: 24,
  display: 30,
} as const;
