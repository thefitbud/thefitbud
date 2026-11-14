import { StatusBar } from "expo-status-bar";
import { useBarScheme } from "./ThemeProvider";

/**
 * Status bar follows the effective scheme of the visible screen (Z12-36):
 * dark content on light, light content on dark. Screens are light until they
 * opt in to dark (`<Screen v3>`), so this reads the most recently mounted
 * opted-in scope via `useBarScheme`. JS only (`expo-status-bar`).
 *
 * Android navigation bar: there is no JS API for its colour or button style
 * without a native module (`expo-navigation-bar` is not installed, and
 * D-W12-13 keeps native changes in Z12-57). Until then it keeps whatever the
 * native Android theme gives it; the device gate records what that looks like.
 * Z12-57 adds `expo-navigation-bar` and sets it here from `themes[scheme].colors.bg`
 * with the matching button style.
 */
export function SystemBars() {
  const scheme = useBarScheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} animated />;
}
