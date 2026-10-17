import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { NotoSansDevanagari_400Regular } from "@expo-google-fonts/noto-sans-devanagari";
import { ActivityIndicator, Platform, View } from "react-native";
import type { ReactNode } from "react";
import { colors } from "@fitbud/ui-mobile";

export function FontsProvider({ children }: { children: ReactNode }) {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    NotoSansDevanagari_400Regular,
  });

  if (Platform.OS === "web") {
    return children;
  }

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
        <ActivityIndicator color={colors.indigo} />
      </View>
    );
  }

  return children;
}
