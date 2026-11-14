import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { NotoSansDevanagari_400Regular } from "@expo-google-fonts/noto-sans-devanagari";
import {
  ActivityIndicator,
  Platform,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { defaultTextStyle, registeredFonts } from "@fitbud/ui-mobile";
import { useTheme } from "./ThemeProvider";

const NOTO_DEVANAGARI_CSS =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400&display=swap";

/**
 * The faces the v3 type scale uses (400, 500, 600, 700), registered under the
 * names in `registeredFonts`. Per-weight imports keep the other 14 Inter files
 * out of the bundle. Inter is JS-loaded through expo-font: no native config.
 */
export const APP_FONTS = {
  [registeredFonts.regular]: Inter_400Regular,
  [registeredFonts.medium]: Inter_500Medium,
  [registeredFonts.semiBold]: Inter_600SemiBold,
  [registeredFonts.bold]: Inter_700Bold,
  [registeredFonts.devanagari]: NotoSansDevanagari_400Regular,
} as const;

function useWebFontStylesheets() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (document.querySelector(`link[href="${NOTO_DEVANAGARI_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = NOTO_DEVANAGARI_CSS;
    document.head.appendChild(link);
  }, []);
}

function applyDefaultTextStyle() {
  const style = defaultTextStyle;
  // React Native still honors defaultProps for Text/TextInput style merge.
  const TextWithDefaults = Text as typeof Text & {
    defaultProps?: { style?: unknown };
  };
  const TextInputWithDefaults = TextInput as typeof TextInput & {
    defaultProps?: { style?: unknown };
  };
  TextWithDefaults.defaultProps = {
    ...TextWithDefaults.defaultProps,
    style: [TextWithDefaults.defaultProps?.style, style],
  };
  TextInputWithDefaults.defaultProps = {
    ...TextInputWithDefaults.defaultProps,
    style: [TextInputWithDefaults.defaultProps?.style, style],
  };
}

function NativeFontsProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [loaded] = useFonts(APP_FONTS);

  useEffect(() => {
    if (!loaded) return;
    applyDefaultTextStyle();
  }, [loaded]);

  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.bg,
        }}
      >
        <ActivityIndicator color={theme.colors.brand} accessibilityLabel="Loading fonts" />
      </View>
    );
  }

  return children;
}

/**
 * Load Inter (and Noto Sans Devanagari for Hindi copy) on every platform,
 * including Expo web: CSS @font-face alone leaves RN-web Text faces
 * "unloaded"; expo-font registers usable families. After load, sets the
 * Text/TextInput default style to Inter so body copy does not fall back to
 * the platform font. Devanagari glyphs Inter lacks fall back to the system
 * Devanagari face on native, and to Noto Sans Devanagari on web.
 */
export function FontsProvider({ children }: { children: ReactNode }) {
  useWebFontStylesheets();
  return <NativeFontsProvider>{children}</NativeFontsProvider>;
}
