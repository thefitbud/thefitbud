import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";

// Render the screens as plain functions: hooks are stubbed, no React renderer needed.
// apps/mobile's vitest environment is `node` and the repo adds no renderer dependency,
// so this is the same pattern trainer/MoreScreen.test.ts already uses.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [initial, () => undefined],
  useEffect: () => undefined,
  useCallback: (fn: unknown) => fn,
}));

vi.mock("react-native", () => ({
  Linking: { openURL: vi.fn(), openSettings: vi.fn() },
  Platform: { OS: "ios", select: (options: Record<string, unknown>) => options.ios ?? options.default },
  Appearance: { getColorScheme: () => "light", addChangeListener: () => ({ remove: () => undefined }) },
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Pressable: "Pressable",
  RefreshControl: "RefreshControl",
  SafeAreaView: "SafeAreaView",
  ScrollView: "ScrollView",
  Switch: "Switch",
  View: "View",
}));
vi.mock("expo-notifications", () => ({ getPermissionsAsync: vi.fn() }));
vi.mock("@fitbud/ui-mobile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fitbud/ui-mobile")>()),
  FitText: "Text",
}));
vi.mock("../components/Text", () => ({ Text: "Text" }));
vi.mock("../components/PrimaryButton", () => ({ PrimaryButton: "PrimaryButton" }));
vi.mock("../components/Screen", () => ({ Screen: "Screen" }));
vi.mock("../providers/ConfigProvider", () => ({ useConfig: () => ({ config: null }) }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: null, signOut: vi.fn(), selectRole: vi.fn() }),
}));
// Z12-53 dark polish: TrainerMoreScreen calls useTheme / createThemedStyles.
// Same stub as MoreScreen.test.ts so this plain-function call stays hook-free.
vi.mock("../providers/ThemeProvider", () => ({
  ThemeScope: ({ children }: { children: unknown }) => children,
  useTheme: () => ({
    scheme: "light",
    colors: new Proxy(
      {},
      { get: (_t, prop) => (typeof prop === "string" ? prop : "token") },
    ),
    radii: {},
    spacing: {},
    text: {},
    touchTarget: 44,
  }),
  createThemedStyles: (factory: (t: { colors: Record<string, string> }) => unknown) => {
    const colors = new Proxy(
      {},
      { get: (_t, prop) => (typeof prop === "string" ? prop : "token") },
    );
    const styles = factory({
      colors: colors as Record<string, string>,
      radii: {},
      spacing: {},
      text: {},
      touchTarget: 44,
      scheme: "light",
    } as never);
    return () => styles;
  },
}));

// vi.mock specifiers resolve relative to THIS file, and the module id is what is
// keyed — so these also cover SignInScreen's deeper "../../components/..." imports.
vi.mock("../components/BrandMark", () => ({ BrandMark: "BrandMark" }));
vi.mock("../components/ErrorBanner", () => ({ ErrorBanner: "ErrorBanner" }));
vi.mock("../components/Field", () => ({ Field: "Field" }));
vi.mock("./config", () => ({
  isWhatsAppOtpEnabled: () => true,
  isStepsEnabled: () => false,
}));
vi.mock("../trainer/HelpSheet", () => ({
  HelpSheet: "HelpSheet",
  openSupportMailOrFallback: vi.fn(),
}));
vi.mock("./support", () => ({
  buildSupportMailto: vi.fn(),
  openSupportEmail: vi.fn(),
  DEFAULT_SUPPORT_EMAIL: "",
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      version: "1.0.0",
      ios: { buildNumber: "214" },
    },
  },
}));

import {
  DEFAULT_TRAINER_WEB_URL,
  legalUrl,
  legalUrlHint,
  trainerWebUrl,
} from "./legalLinks";
import { TrainerMoreScreen } from "../trainer/MoreScreen";

type Element = {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
};

/** Depth-first search of a plain React element tree for a matching node. */
function find(
  node: unknown,
  match: (element: Element) => boolean,
): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, match);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  if ("props" in node) {
    const element = node as Element;
    if (match(element)) return element;
    // Expand FooterLink only (no hooks) so its Pressable a11y label is
    // searchable. Calling HelpSheet / SignOutConfirm would trip hooks.
    const typeName =
      typeof element.type === "function"
        ? (element.type as { name?: string }).name
        : undefined;
    if (typeName === "FooterLink") {
      const rendered = (element.type as (props: unknown) => unknown)(
        element.props,
      );
      const hit = find(rendered, match);
      if (hit) return hit;
    }
    return find(element.props.children, match);
  }
  return null;
}

function byLabelProp(label: string) {
  return (element: Element) => element.props.label === label;
}

function byA11y(label: string) {
  return (element: Element) => element.props.accessibilityLabel === label;
}

function press(tree: unknown, match: (element: Element) => boolean): void {
  const element = find(tree, match);
  expect(element).not.toBeNull();
  expect(typeof element!.props.onPress).toBe("function");
  (element!.props.onPress as () => void)();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(Linking.openURL).mockClear();
});

describe("legalLinks URLs", () => {
  it("falls back to https://app.thefitbud.com when the env var is unset", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    expect(DEFAULT_TRAINER_WEB_URL).toBe("https://app.thefitbud.com");
    expect(trainerWebUrl()).toBe("https://app.thefitbud.com");
    expect(legalUrl("/privacy")).toBe("https://app.thefitbud.com/privacy");
    expect(legalUrl("/terms")).toBe("https://app.thefitbud.com/terms");
    expect(legalUrl("/credits")).toBe("https://app.thefitbud.com/credits");
  });

  it("falls back to the default for a blank env var", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "   ");
    expect(legalUrl("/privacy")).toBe("https://app.thefitbud.com/privacy");
  });

  it("uses the env var on staging builds", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "https://app-staging.thefitbud.com");
    expect(legalUrl("/privacy")).toBe("https://app-staging.thefitbud.com/privacy");
    expect(legalUrl("/terms")).toBe("https://app-staging.thefitbud.com/terms");
    expect(legalUrl("/credits")).toBe("https://app-staging.thefitbud.com/credits");
  });

  it("does not double the slash when the base URL has a trailing one", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "https://app-staging.thefitbud.com/");
    expect(legalUrl("/terms")).toBe("https://app-staging.thefitbud.com/terms");
  });

  it("matches the three public web routes BT3 added", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    const routes = readFileSync(
      new URL("../../../trainer-web/src/App.tsx", import.meta.url),
      "utf8",
    );
    for (const path of ["/privacy", "/terms", "/credits"] as const) {
      expect(routes).toContain(`path="${path}"`);
      expect(legalUrl(path).endsWith(path)).toBe(true);
    }
  });

  it("drops the scheme for the hint under a row", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    expect(legalUrlHint("/privacy")).toBe("app.thefitbud.com/privacy");
    expect(legalUrlHint("/terms")).toBe("app.thefitbud.com/terms");
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "https://app-staging.thefitbud.com");
    expect(legalUrlHint("/privacy")).toBe("app-staging.thefitbud.com/privacy");
  });
});

describe("the env var is read so Expo can inline it", () => {
  // Expo's Babel transform only replaces the literal member expression
  // `process.env.EXPO_PUBLIC_TRAINER_WEB_URL`. A destructured or computed read
  // becomes `undefined` in a real build, so pin the source text itself.
  it("reads process.env.EXPO_PUBLIC_TRAINER_WEB_URL as a literal member expression", () => {
    const source = readFileSync(new URL("./legalLinks.ts", import.meta.url), "utf8");
    // Strip comments first: the warning above names the member expression too, and
    // matching it there would pass even if the code destructured process.env.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).toContain("process.env.EXPO_PUBLIC_TRAINER_WEB_URL");
    // And nothing may pull the key off process.env any other way.
    expect(code).not.toMatch(/\{[^}]*EXPO_PUBLIC_TRAINER_WEB_URL[^}]*\}\s*=/);
    expect(code).not.toMatch(/process\.env\s*\[/);
  });
});

// The sign-in footer links (Terms, Privacy) are covered by a render test since
// Z12-49 moved them into a footer component: screens/auth/SignInScreen.render.test.tsx.

describe("trainer More legal rows", () => {
  function trainerMore() {
    return TrainerMoreScreen({
      onOpenNotifications: () => undefined,
      onOpenProfile: () => undefined,
    });
  }

  // Z12-53: Legal group is gone; Terms/Privacy live in the footer as short
  // labels with the full browser a11y name. Credits stays on the web only.
  it.each([
    ["Privacy policy, opens in your browser", "https://app.thefitbud.com/privacy"],
    ["Terms of use, opens in your browser", "https://app.thefitbud.com/terms"],
  ])("%s opens %s", (a11y, url) => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    press(trainerMore(), byA11y(a11y));
    expect(Linking.openURL).toHaveBeenCalledWith(url);
  });

  it("follows the env var on staging builds for footer Privacy", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "https://app-staging.thefitbud.com");
    press(trainerMore(), byA11y("Privacy policy, opens in your browser"));
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://app-staging.thefitbud.com/privacy",
    );
  });

  it("still opens the plain trainer web URL for Open FitBud on web", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    press(trainerMore(), byLabelProp("Open FitBud on web"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://app.thefitbud.com");
  });

  it.each([
    "Privacy policy, opens in your browser",
    "Terms of use, opens in your browser",
    "Open FitBud on web, opens in your browser",
  ])("%s is announced as leaving the app", (a11y) => {
    expect(find(trainerMore(), byA11y(a11y))).toBeTruthy();
  });

  it("leaves the in-app Help row announced as itself", () => {
    // Help opens an in-app sheet and must not claim the browser opens.
    const help = find(trainerMore(), byLabelProp("Help"));
    expect(help).toBeTruthy();
    expect(help!.props.accessibilityLabel).toBeUndefined();
  });
});

describe("new legal copy against docs/spec/banned-strings.json", () => {
  // The trainer-web `banned-strings` e2e suite does not reach the mobile app,
  // so scan the strings this task introduces here.
  const copy = [
    "Legal",
    "Privacy",
    "Terms",
    "Privacy policy",
    "Terms of use",
    "Credits and licences",
    "Opens app.thefitbud.com/privacy",
    "Opens app.thefitbud.com/terms",
    "Opens app-staging.thefitbud.com/privacy",
    "Exercise drawings and food data",
    "Privacy policy, opens in your browser",
    "Terms of use, opens in your browser",
    "Credits and licences, opens in your browser",
  ];

  const banned = JSON.parse(
    readFileSync(
      new URL("../../../../docs/spec/banned-strings.json", import.meta.url),
      "utf8",
    ),
  ) as {
    patterns: Array<{
      id: string;
      regex: string;
      flags: string;
      scope: string;
      severity: string;
    }>;
  };

  const errors = banned.patterns.filter(
    (p) => p.severity === "error" && p.scope !== "web",
  );

  it("has error-severity patterns to check against", () => {
    expect(errors.length).toBeGreaterThan(10);
  });

  it.each(copy)("%s trips no banned pattern", (text) => {
    const hits = errors
      .filter((p) => new RegExp(p.regex, p.flags).test(text))
      .map((p) => p.id);
    expect(hits).toEqual([]);
  });
});

vi.mock("lucide-react-native", () => new Proxy({}, {
  get: (_t, key) => (key === "__esModule" ? true : String(key)),
  has: () => true,
}));
vi.mock("react-native-svg", () => new Proxy({}, {
  get: (_t, key) => (key === "default" ? "Svg" : key === "__esModule" ? true : String(key)),
  has: () => true,
}));
vi.mock("../sync/SyncProvider", () => ({
  useSyncEngine: () => ({ status: "idle", pending: 0, lastSyncedAt: null }),
}));
vi.mock("./stage1Api", () => ({ stage1Api: () => ({}) }));
vi.mock("../components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));

// Trainee More's legal links (Terms, Privacy, Credits in the footer since
// Z12-49, TR-20a) are covered by trainee/MoreScreen.v3.render.test.tsx.
