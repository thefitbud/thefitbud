/**
 * Theme for the mobile app (Z12-36, D-W12-12).
 *
 * The system scheme is tracked live (`ThemeProvider` reads `Appearance` and
 * re-renders when the system flips while the app is open); there is no in-app
 * switch. Primitives read colours, radii and text variants through
 * `useTheme()` and build their styles with `createThemedStyles`, so no
 * primitive holds a fixed colour (`fitbud-theme/no-hard-coded-colour` lint
 * rule in `src/components/**` and `src/providers/**`).
 *
 * **Dark is opt-in per screen (orchestrator, PR #440 review).** Screens that
 * have not been migrated to v3 still use the v2 light colours, so the
 * *effective* scheme of a subtree is light unless it opts in:
 *
 * - `<Screen v3>` (the usual way), or
 * - `<ThemeScope scheme="system">…</ThemeScope>` around any other subtree.
 *
 * Each screen's own W12 task opts it in once it is migrated; Z12-58 checks
 * that nothing is left un-opted. Inside an opted-in subtree the theme follows
 * the system live. The status bar follows the effective scheme of the most
 * recently mounted opted-in scope (`useBarScheme`, read by `SystemBars`),
 * else light.
 *
 * iOS note: `app.json` still sets `userInterfaceStyle: "light"`, which pins
 * `Appearance` to light on iOS until Z12-57 changes it to "automatic" (native
 * config, D-W12-13). Android follows the system already.
 */
import {
  createContext,
  useContext,
  useEffect,
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

/** Reads Appearance directly, live. Anything but "dark" (including null) is light. */
function useAppearanceScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, readScheme, readScheme);
}

/** The live system scheme, from the root provider (light outside one). */
const SystemSchemeContext = createContext<ColorScheme>("light");

/**
 * The effective theme. Light by default, outside a provider too, so an
 * un-opted screen and a component rendered on its own are both light.
 */
const ThemeContext = createContext<Theme>(themes.light);

/** Root provider: tracks the system scheme. It does not turn dark on by itself. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useAppearanceScheme();
  return (
    <SystemSchemeContext.Provider value={system}>
      <ThemeContext.Provider value={themes.light}>
        {children}
      </ThemeContext.Provider>
    </SystemSchemeContext.Provider>
  );
}

/** The system colour scheme, live (whatever the effective scheme of this subtree is). */
export function useSystemColorScheme(): ColorScheme {
  return useContext(SystemSchemeContext);
}

/* Status bar: a stack of the effective schemes of mounted opted-in scopes. */
type BarEntry = { id: number; scheme: ColorScheme };
let barStack: BarEntry[] = [];
let nextBarId = 1;
const barListeners = new Set<() => void>();

function emitBars() {
  for (const listener of barListeners) listener();
}

function subscribeBars(listener: () => void): () => void {
  barListeners.add(listener);
  return () => barListeners.delete(listener);
}

function readBarScheme(): ColorScheme {
  return barStack[barStack.length - 1]?.scheme ?? "light";
}

/** The scheme the status (and, after Z12-57, navigation) bar should follow. */
export function useBarScheme(): ColorScheme {
  return useSyncExternalStore(subscribeBars, readBarScheme, readBarScheme);
}

type ScopeProps = {
  /** "system" follows the system live; "light" / "dark" force (previews and tests). */
  scheme: ColorScheme | "system";
  children: ReactNode;
  /** Whether the status bar follows this scope while it is mounted (default true). */
  drivesSystemBars?: boolean;
};

/**
 * Sets the effective scheme for a subtree. A migrated screen uses
 * `scheme="system"` (via `<Screen v3>`); nothing else should need to.
 */
export function ThemeScope({
  scheme,
  children,
  drivesSystemBars = true,
}: ScopeProps) {
  const system = useSystemColorScheme();
  const effective: ColorScheme = scheme === "system" ? system : scheme;

  useEffect(() => {
    if (!drivesSystemBars) return undefined;
    const entry: BarEntry = { id: nextBarId++, scheme: effective };
    barStack = [...barStack, entry];
    emitBars();
    return () => {
      barStack = barStack.filter((item) => item.id !== entry.id);
      emitBars();
    };
  }, [effective, drivesSystemBars]);

  return (
    <ThemeContext.Provider value={themes[effective]}>
      {children}
    </ThemeContext.Provider>
  );
}

/** The effective theme for this subtree (light unless an ancestor opted in). */
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
