import { Platform } from "react-native";
const webStack =
  'Satoshi, "Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif';

export const fontFamily = Platform.select({
  web: webStack,
  default: "Satoshi-Regular",
});

export const fontFamilyMedium = Platform.select({
  web: webStack,
  default: "Satoshi-Medium",
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
  body: 15,
  bodyLarge: 16,
  title: 18,
  headline: 24,
  display: 30,
} as const;
