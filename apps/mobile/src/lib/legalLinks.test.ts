import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";

// Z14-27: the footer links open documents inside the app, so the hook that does
// that is replaced by spies here. Its own behaviour is covered by
// screens/LegalDocumentScreen.render.test.tsx.
const legal = vi.hoisted(() => ({ open: vi.fn(), openIndex: vi.fn(), modal: null }));
vi.mock("../screens/LegalDocumentScreen", () => ({
  useLegalDocument: () => legal,
  LegalEntryLinks: "LegalEntryLinks",
  LegalDocumentList: "LegalDocumentList",
}));

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
  Modal: "Modal",
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
// Real m2 imports authParts → Button → createThemedStyles; stub like MoreScreen.test.
vi.mock("../trainee/settings/m2", () => ({
  M2Card: "M2Card",
  M2Group: "M2Group",
  M2Row: "M2Row",
}));
vi.mock("../providers/ConfigProvider", () => ({ useConfig: () => ({ config: null }) }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: null, signOut: vi.fn(), selectRole: vi.fn(), requestRoleSelect: vi.fn() }),
}));
// Z12-53 dark polish: TrainerMoreScreen calls useTheme / createThemedStyles.
// Same stub as MoreScreen.test.ts so this plain-function call stays hook-free.
vi.mock("../providers/ThemeProvider", () => {
  const token = new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "style" ? {} : typeof prop === "string" ? prop : "token",
    },
  );
  const nest = new Proxy(
    {},
    {
      get: (_t, prop) => (prop === "style" ? {} : token),
    },
  );
  const theme = {
    scheme: "light" as const,
    colors: token as Record<string, string>,
    radii: nest,
    spacing: nest,
    text: nest,
    touchTarget: 44,
  };
  return {
    ThemeScope: ({ children }: { children: unknown }) => children,
    useTheme: () => theme,
    createThemedStyles: (factory: (t: typeof theme) => unknown) => {
      const styles = factory(theme);
      return () => styles;
    },
  };
});

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
  LEGAL_DOC_LIST,
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
  legal.open.mockClear();
  legal.openIndex.mockClear();
});

describe("legalLinks URLs", () => {
  it("falls back to https://app.thefitbud.com when the env var is unset", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    expect(DEFAULT_TRAINER_WEB_URL).toBe("https://app.thefitbud.com");
    expect(trainerWebUrl()).toBe("https://app.thefitbud.com");
    expect(legalUrl("/privacy")).toBe("https://app.thefitbud.com/privacy");
    expect(legalUrl("/terms")).toBe("https://app.thefitbud.com/terms");
    expect(legalUrl("/credits")).toBe("https://app.thefitbud.com/credits");
    expect(legalUrl("/terms/trainer")).toBe("https://app.thefitbud.com/terms/trainer");
    expect(legalUrl("/terms/trainee")).toBe("https://app.thefitbud.com/terms/trainee");
    expect(legalUrl("/health")).toBe("https://app.thefitbud.com/health");
    expect(legalUrl("/acceptable-use")).toBe("https://app.thefitbud.com/acceptable-use");
    expect(legalUrl("/beta")).toBe("https://app.thefitbud.com/beta");
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
    expect(legalUrl("/terms/trainee")).toBe("https://app-staging.thefitbud.com/terms/trainee");
    expect(legalUrl("/health")).toBe("https://app-staging.thefitbud.com/health");
  });

  it("does not double the slash when the base URL has a trailing one", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "https://app-staging.thefitbud.com/");
    expect(legalUrl("/terms")).toBe("https://app-staging.thefitbud.com/terms");
  });

  it("matches every public web route the trainer web app serves", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    const routes = readFileSync(
      new URL("../../../trainer-web/src/App.tsx", import.meta.url),
      "utf8",
    );
    expect(LEGAL_DOC_LIST).toHaveLength(8);
    for (const { path } of LEGAL_DOC_LIST) {
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

  // Z14-27: Terms and Privacy in the footer open the in-app documents; "Legal"
  // opens the list of all of them. Nothing leaves the app.
  it.each([
    ["Terms of Service, opens in the app", "/terms"],
    ["Privacy Policy, opens in the app", "/privacy"],
  ])("%s opens the in-app document %s", (a11y, path) => {
    press(trainerMore(), byA11y(a11y));
    expect(legal.open).toHaveBeenCalledWith(path);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("the footer Legal link opens the list of every document", () => {
    press(trainerMore(), byA11y("All legal documents, opens in the app"));
    expect(legal.openIndex).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("still opens the plain trainer web URL for Open FitBud on web", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    press(trainerMore(), byLabelProp("Open FitBud on web"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://app.thefitbud.com");
  });

  it("announces Open FitBud on web as leaving the app", () => {
    expect(find(trainerMore(), byA11y("Open FitBud on web, opens in your browser"))).toBeTruthy();
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
    "Terms of Service, opens in the app",
    "Privacy Policy, opens in the app",
    "All legal documents, opens in the app",
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
