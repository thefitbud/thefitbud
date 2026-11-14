/**
 * Theme for the mobile app (Z12-36, D-W12-12).
 *
 * The theme follows the system setting and nothing else: there is no in-app
 * switch. `ThemeProvider` reads `Appearance` and re-renders when the system
 * flips between light and dark while the app is open. Primitives read their
 * colours, radii and text variants through `useTheme()` and build their
 * styles with `createThemedStyles`, so no primitive holds a fixed colour (the
 * `fitbud-theme/no-hex-colour` lint rule enforces that in
 * `src/components/**`).
 *
 * `scheme` on the provider is for previews and tests only (the dev
 * specimens screen renders both themes side by side); the app root never
 * passes it.
 *
 * iOS note: `app.json` still sets `userInterfaceStyle: "light"`, which pins
 * `Appearance` to light on iOS until Z12-57 changes it to "automatic" (native
 * config, D-W12-13). Android follows the system already.
 */
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Appearance, StyleSheet } from "react-native";
import { themes, type ColorScheme, type Theme } from "@fitbud/ui-mobile";

export type { ColorScheme, Theme };

function subscribe(onChange: () => void): () => void {
  const subscription = Appearance.addChangeListener(() => onChange());
  return () => subscription.remove();
}

function readScheme(): ColorScheme {
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

/** The system colour scheme, live. Anything but "dark" (including null) is light. */
export function useSystemColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, readScheme, readScheme);
}

/**
 * Light outside a provider, so a component rendered on its own (unit and
 * render tests) is deterministic. The app root always mounts ThemeProvider.
 */
const ThemeContext = createContext<Theme>(themes.light);

type Props = {
  children: ReactNode;
  /** Previews and tests only. The app follows the system and never sets this. */
  scheme?: ColorScheme;
};

export function ThemeProvider({ children, scheme }: Props) {
  const system = useSystemColorScheme();
  return (
    <ThemeContext.Provider value={themes[scheme ?? system]}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * A `#RRGGBB` token at an opacity, for the kit's translucent overlays that
 * have no token of their own (e.g. the toast action, white at 14%).
 */
export function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** The kit's `rgb(var(--sh))` shadow colour; pair it with a shadowOpacity. */
export function shadowColor(theme: Theme): string {
  return `rgb(${theme.colors.sh})`;
}

type NamedStyles<T> = StyleSheet.NamedStyles<T>;

/**
 * Build a component's StyleSheet from the theme, once per scheme:
 *
 * ```tsx
 * const useStyles = createThemedStyles((t) => ({
 *   card: { backgroundColor: t.colors.card, borderRadius: t.radii.card },
 * }));
 * function Card() { const styles = useStyles(); … }
 * ```
 */
export function createThemedStyles<T extends NamedStyles<T>>(
  factory: (theme: Theme) => T,
): () => T {
  const cache = new Map<ColorScheme, T>();
  return function useThemedStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme.scheme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme.scheme, styles);
    }
    return styles;
  };
}
