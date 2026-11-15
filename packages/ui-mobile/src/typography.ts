import { Platform, type TextStyle } from "react-native";
import { v3FontFamily, v3TypeScale, type ColorToken } from "@fitbud/tokens";

/**
 * Font family names registered by the app's `FontsProvider` through expo-font
 * (`@expo-google-fonts/inter` and `@expo-google-fonts/noto-sans-devanagari`).
 * Use these on native and Expo web; the CSS stack is only for plain web CSS.
 */
export const registeredFonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  devanagari: "NotoSansDevanagari_400Regular",
} as const;

export const fontFamily = registeredFonts.regular;
export const fontFamilyMedium = registeredFonts.medium;
export const fontFamilySemiBold = registeredFonts.semiBold;
export const fontFamilyBold = registeredFonts.bold;

/**
 * Hindi-ready body stack (Noto Sans Devanagari). On native, glyphs Inter does
 * not have fall back to the system Devanagari face; this family is for copy
 * that is wholly Devanagari.
 */
export const fontFamilyDevanagari = Platform.select({
  web: `${registeredFonts.devanagari}, ${v3FontFamily}`,
  default: registeredFonts.devanagari,
});

/** The registered Inter face for a weight (expo-font registers one face per weight). */
export function interFamilyForWeight(weight: TextStyle["fontWeight"]): string {
  const numeric =
    typeof weight === "number"
      ? weight
      : weight === "bold"
        ? 700
        : weight === "normal" || weight === undefined
          ? 400
          : Number.parseInt(String(weight), 10);
  if (!Number.isFinite(numeric) || numeric <= 400) return registeredFonts.regular;
  if (numeric <= 500) return registeredFonts.medium;
  if (numeric <= 600) return registeredFonts.semiBold;
  return registeredFonts.bold;
}

/**
 * v3 text variants (DESIGN-SYSTEM-v3 §4), named for use in code and mapped to
 * the generated kit classes (`.t-*`, `.n-*`).
 */
const VARIANT_SOURCE = {
  largeTitle: "tLarge",
  title: "tTitle",
  headline: "tHead",
  body: "tBody",
  bodyStrong: "tBodym",
  subhead: "tSub",
  caption: "tCap",
  label: "tLabel",
  tab: "tTab",
  numberXl: "nXl",
  numberHero: "nHero",
  numberLg: "nLg",
  numberMd: "nMd",
  numberSm: "nSm",
} as const satisfies Record<string, keyof typeof v3TypeScale>;

export type TextVariant = keyof typeof VARIANT_SOURCE;

export type VariantStyle = {
  /** Size, line height, weight, tracking; no colour and no family (Text maps weight → Inter face). */
  style: TextStyle;
  /** Default colour token for the variant (ink unless the kit says otherwise). */
  color: ColorToken;
};

function buildVariant(source: keyof typeof v3TypeScale): VariantStyle {
  const spec = v3TypeScale[source] as (typeof v3TypeScale)[keyof typeof v3TypeScale] & {
    textTransform?: "uppercase";
    color?: string;
  };
  const style: TextStyle = {
    fontSize: spec.fontSize,
    lineHeight: spec.lineHeight,
    fontWeight: String(spec.fontWeight) as TextStyle["fontWeight"],
    letterSpacing: spec.letterSpacing,
  };
  if (spec.textTransform) style.textTransform = spec.textTransform;
  // "Every number tabular" (kit-v3.css header): number classes get tnum.
  if (source.startsWith("n")) style.fontVariant = ["tabular-nums"];
  return { style, color: (spec.color ?? "ink") as ColorToken };
}

export const textVariants: Readonly<Record<TextVariant, VariantStyle>> = Object.fromEntries(
  Object.entries(VARIANT_SOURCE).map(([name, source]) => [name, buildVariant(source)]),
) as Record<TextVariant, VariantStyle>;

/**
 * @deprecated v2 sizes, kept so unmigrated screens keep their layout. New code
 * uses `textVariants` through the app's themed `Text variant=…`.
 */
export const typeScale = {
  caption: 12,
  body: 16,
  bodyLarge: 16,
  title: 18,
  headline: 24,
  display: 28,
} as const;

/** @deprecated v2 text styles (now in Inter), kept for unmigrated screens. */
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
