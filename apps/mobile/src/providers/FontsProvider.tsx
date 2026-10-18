import { useFonts } from "expo-font";
import { NotoSansDevanagari_400Regular } from "@expo-google-fonts/noto-sans-devanagari";
import { ActivityIndicator, Platform, View } from "react-native";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { colors } from "@fitbud/ui-mobile";

const FONTSHARE_SATOSHI_CSS =
  "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap";
const NOTO_DEVANAGARI_CSS =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400&display=swap";

function useWebFontStylesheets() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    for (const href of [FONTSHARE_SATOSHI_CSS, NOTO_DEVANAGARI_CSS]) {
      if (document.querySelector(`link[href="${href}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }, []);
}

function NativeFontsProvider({ children }: { children: ReactNode }) {
  /* eslint-disable @typescript-eslint/no-require-imports -- expo-font expects require() for .ttf assets */
  const [loaded] = useFonts({
    "Satoshi-Regular": require("../../assets/fonts/satoshi/Satoshi-400.ttf"),
    "Satoshi-Medium": require("../../assets/fonts/satoshi/Satoshi-500.ttf"),
    "Satoshi-SemiBold": require("../../assets/fonts/satoshi/Satoshi-600.ttf"),
    "Satoshi-Bold": require("../../assets/fonts/satoshi/Satoshi-700.ttf"),
    NotoSansDevanagari_400Regular,
  });
  /* eslint-enable @typescript-eslint/no-require-imports */

  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.indigo} accessibilityLabel="Loading fonts" />
      </View>
    );
  }

  return children;
}

/**
 * Load Satoshi TTFs on every platform (including Expo web). CSS @font-face alone
 * leaves RN-web Text faces "unloaded"; expo-font registers usable families.
 */
export function FontsProvider({ children }: { children: ReactNode }) {
  useWebFontStylesheets();
  return <NativeFontsProvider>{children}</NativeFontsProvider>;
}
