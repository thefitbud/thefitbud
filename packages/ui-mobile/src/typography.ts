import { Platform } from "react-native";
import { fontFamily as brandFontStack } from "@fitbud/tokens";

const webStack = brandFontStack;

export const fontFamily = Platform.select({
  web: webStack,
  default: "Satoshi-Regular",
});

export const fontFamilyMedium = Platform.select({
  web: webStack,
  default: "Satoshi-Medium",
});

export const fontFamilySemiBold = Platform.select({
  web: webStack,
  default: "Satoshi-SemiBold",
});

export const fontFamilyBold = Platform.select({
  web: webStack,
  default: "Satoshi-Bold",
});

/** Hindi-ready body stack (Noto Sans Devanagari). */
export const fontFamilyDevanagari = Platform.select({
  web: webStack,
  default: "NotoSansDevanagari_400Regular",
});

export const typeScale = {
  caption: 12,
  body: 16,
  bodyLarge: 16,
  title: 18,
  headline: 24,
  display: 28,
} as const;
