import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fontFamilyBold, type Theme } from "@fitbud/ui-mobile";
import { useTheme } from "../providers/ThemeProvider";

/** Design-system minimum mark width (DESIGN-SYSTEM-v3.md §3). */
export const BRAND_MARK_MIN_SIZE = 40;

type Props = {
  /** Mark width/height in pt. Clamped to {@link BRAND_MARK_MIN_SIZE}. */
  size?: number;
  /** When true, render the four-dot mark plus the Inter-bold "FitBud" wordmark. */
  wordmark?: boolean;
};

/**
 * Honest Week four-dot mark (DESIGN-SYSTEM-v3.md §3): three filled dots then
 * an open coral ring. Theme-aware: navy dots + navy word on light, white dots +
 * white word on dark; ring is always logo coral (`colors.coral` / `#FF587D`).
 */
export function brandMarkColors(theme: Theme): {
  dot: string;
  ring: string;
  word: string;
} {
  return {
    dot: theme.scheme === "dark" ? theme.colors.white : theme.colors.fixedNavy,
    ring: theme.colors.coral,
    word: theme.scheme === "dark" ? theme.colors.white : theme.colors.fixedNavy,
  };
}

export function BrandMark({ size = BRAND_MARK_MIN_SIZE, wordmark = false }: Props) {
  const theme = useTheme();
  const markSize = Math.max(BRAND_MARK_MIN_SIZE, size);
  const { dot, ring, word } = brandMarkColors(theme);

  const mark = (
    <Svg
      width={markSize}
      height={markSize}
      viewBox="0 0 100 100"
      accessibilityElementsHidden={wordmark}
    >
      <Circle cx="14" cy="50" r="9" fill={dot} stroke={dot} strokeWidth={3.6} />
      <Circle cx="38" cy="50" r="9" fill={dot} stroke={dot} strokeWidth={3.6} />
      <Circle cx="62" cy="50" r="9" fill={dot} stroke={dot} strokeWidth={3.6} />
      <Circle
        cx="86"
        cy="50"
        r="9"
        fill="none"
        stroke={ring}
        strokeWidth={3.6}
      />
    </Svg>
  );

  if (!wordmark) {
    return (
      <View
        accessibilityLabel="FitBud"
        accessibilityRole="image"
        style={{ width: markSize, height: markSize }}
      >
        {mark}
      </View>
    );
  }

  return (
    <View style={styles.row} accessibilityLabel="FitBud" accessibilityRole="header">
      {mark}
      <Text
        style={[
          styles.word,
          {
            color: word,
            fontSize: Math.max(17, Math.round(markSize * 0.55)),
          },
        ]}
      >
        FitBud
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  word: {
    fontFamily: fontFamilyBold,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
});
