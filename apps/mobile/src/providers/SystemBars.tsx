import { StatusBar } from "expo-status-bar";
import { useTheme } from "./ThemeProvider";

/**
 * Status bar follows the theme (Z12-36): dark content on the light theme,
 * light content on the dark theme. JS only (`expo-status-bar`).
 *
 * Android navigation bar: there is no JS API for its colour or button style
 * without a native module (`expo-navigation-bar` is not installed, and
 * D-W12-13 keeps native changes in Z12-57). Until then it keeps whatever the
 * native Android theme gives it; the device gate records what that looks like.
 * Z12-57 adds `expo-navigation-bar` and sets it here from `theme.colors.bg`
 * with the matching button style.
 */
export function SystemBars() {
  const theme = useTheme();
  return (
    <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} animated />
  );
}
