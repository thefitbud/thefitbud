/**
 * Mobile component-render harness (CU6).
 *
 * This file is both the `render` project's `setupFiles` entry (see
 * `apps/mobile/vitest.config.ts`) and the module that `*.test.tsx` files
 * import `render` / `screen` from. Keeping the two in one file is deliberate:
 * `vi.mock` is hoisted per file, so the native-module mocks below have to be
 * registered by the setup module itself, and a test that imports `render` from
 * anywhere else could load a screen before those mocks exist.
 *
 * ## Why not `@testing-library/react-native`
 *
 * `@testing-library/react-native` is the obvious choice and it was tried
 * first (12.9.0 with `react-test-renderer` 18.3.1, matching this repo's React
 * 18.3.1). It cannot run under vitest here: its published build is CommonJS
 * only (`main: build/index.js`, no `module`/`exports` field), so its
 * `require("react-native")` is executed by Node and never reaches vite's
 * transform pipeline. Node then parses react-native's Flow-typed `index.js`
 * and throws `SyntaxError: Unexpected token 'typeof'`. Adding a babel pass
 * over `node_modules/react-native` does not help, because the failing require
 * happens inside already-CommonJS code. The fix would be a jest migration or
 * a Metro-based runner, both of which CU6 is explicitly not allowed to do.
 *
 * So the harness renders the same component tree through
 * `react-native-web` — already a runtime dependency of this app, because the
 * Expo web target uses it — with `@testing-library/react` on top. Both
 * `@testing-library/react@16.3.3` and `happy-dom@20.14.6` are the versions
 * `apps/trainer-web` already pins, so no new package version enters the tree.
 *
 * What that buys and costs:
 * - Accessibility assertions work the way the product cares about them:
 *   react-native-web maps `accessibilityRole` to the ARIA `role` and
 *   `accessibilityLabel` to `aria-label`, so `getByRole` / `getByLabelText`
 *   assert the attributes a screen reader actually sees.
 * - Layout, native gestures and platform-specific `Platform.OS === "ios"`
 *   branches are NOT covered. This harness tests text, roles, labels and
 *   state transitions — not pixels. The visual check (AGENTS.md) stays the
 *   authority on layout.
 *
 * ## Rendering a screen with the auth context mocked
 *
 * `AuthProvider` does not export its context, and CU6 may not change it, so a
 * screen test mocks the module instead and feeds `useAuth` a value built by
 * `mockAuth` below. `vi.mock` must be written in the test file itself:
 *
 * ```tsx
 * import { mockAuth, render, screen } from "../test/render";
 *
 * const auth = mockAuth({ errorMessage: "Could not reach FitBud." });
 * vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
 *
 * it("shows the error the provider reports", () => {
 *   render(<SomeScreen />);
 *   expect(screen.getByRole("alert").textContent).toBe("Could not reach FitBud.");
 * });
 * ```
 *
 * Reach for `mockAuth` only for the fields the screen under test reads; it is
 * a stub for a context value, not a second implementation of the real
 * provider's behaviour. Anything that depends on how the provider *derives*
 * state (route resolution, session restore) belongs in that module's own
 * `.test.ts`, against the real logic.
 */
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/*
 * Native modules. These have no JS implementation off-device: their
 * JS entry points call into `expo-modules-core`, which throws (or silently
 * answers with nothing) outside a native runtime. Each mock below is the
 * smallest shape the app's own call sites use. A screen that needs more
 * should widen the mock here rather than mock the module again locally, so
 * every render test agrees on what the device does.
 */

/** Sentinel the native-module mock test asserts on, so "the mock is wired" is observable. */
export const MOCK_SECURE_STORE_VALUE = "mock-secure-store-value";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => MOCK_SECURE_STORE_VALUE),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
  isAvailableAsync: vi.fn(async () => true),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "whenUnlockedThisDeviceOnly",
}));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(async () => ({ status: "undetermined", granted: false })),
  requestPermissionsAsync: vi.fn(async () => ({ status: "granted", granted: true })),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: "ExponentPushToken[mock]" })),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  setNotificationHandler: vi.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: {} }, easConfig: null },
}));

vi.mock("expo-linking", () => ({
  createURL: vi.fn((path: string) => `fitbud://${path}`),
  openURL: vi.fn(async () => true),
  useURL: vi.fn(() => null),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  getInitialURL: vi.fn(async () => null),
}));

vi.mock("expo-font", () => ({
  useFonts: vi.fn(() => [true, null]),
  loadAsync: vi.fn(async () => undefined),
  isLoaded: vi.fn(() => true),
}));

/*
 * react-native-svg and lucide-react-native ship CommonJS that `require`s
 * react-native directly, which Node executes outside vite's pipeline — so the
 * alias never applies and Node chokes on react-native's Flow syntax. Both are
 * drawing-only, so a component name per export is enough for text, role and
 * label assertions. Same shape as the mocks in `src/lib/legalLinks.test.ts`.
 */
const svgComponentProxy = new Proxy(
  {},
  {
    get: (_target, key) =>
      key === "default" ? "Svg" : key === "__esModule" ? true : String(key),
    has: () => true,
  },
);

vi.mock("react-native-svg", () => svgComponentProxy);
vi.mock("lucide-react-native", () => svgComponentProxy);

afterEach(() => {
  cleanup();
});

/**
 * A stub of `useAuth`'s value. Only the fields a screen reads need to be
 * passed; everything else is an inert default so a render does not crash on an
 * unexpected read. The return type is deliberately loose — `AuthProvider` does
 * not export its context type, and CU6 may not change that file.
 */
export function mockAuth(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    accessToken: null,
    selectedRole: null,
    me: null,
    relationships: [],
    route: "signin",
    errorMessage: null,
    api: {},
    pendingNotificationLink: null,
    pendingDeepLink: null,
    signInWithToken: vi.fn(async () => undefined),
    signOut: vi.fn(),
    clearError: vi.fn(),
    refreshSession: vi.fn(async () => undefined),
    selectRole: vi.fn(async () => undefined),
    setActiveRelationship: vi.fn(),
    handleNotificationOpen: vi.fn(() => null),
    clearPendingNotificationLink: vi.fn(),
    clearPendingDeepLink: vi.fn(),
    ...overrides,
  };
}

export { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
