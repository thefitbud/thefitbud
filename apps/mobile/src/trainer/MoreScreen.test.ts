import { afterEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";

// Render the screen as a plain function: hooks are stubbed, no renderer needed.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [initial, () => undefined],
  useEffect: () => undefined,
}));

// MoreScreen imports native modules; the link logic needs none of them.
vi.mock("react-native", () => ({
  Linking: { openURL: vi.fn(), openSettings: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
}));
vi.mock("expo-notifications", () => ({ getPermissionsAsync: vi.fn() }));
vi.mock("@fitbud/ui-mobile", () => ({ colors: {}, spacing: {} }));
vi.mock("../components/Text", () => ({ Text: "Text" }));
vi.mock("../components/PrimaryButton", () => ({ PrimaryButton: "PrimaryButton" }));
vi.mock("../components/Screen", () => ({ Screen: "Screen" }));
vi.mock("../providers/ConfigProvider", () => ({ useConfig: () => ({ config: null }) }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: null, signOut: vi.fn(), selectRole: vi.fn() }),
}));
vi.mock("../lib/support", () => ({ openSupportEmail: vi.fn(), DEFAULT_SUPPORT_EMAIL: "" }));

import { DEFAULT_TRAINER_WEB_URL, TrainerMoreScreen, trainerWebUrl } from "./MoreScreen";

type Element = { type: unknown; props: Record<string, unknown> & { children?: unknown } };

function findByLabel(node: unknown, label: string): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByLabel(child, label);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as Element;
  if (element.props.label === label) return element;
  return findByLabel(element.props.children, label);
}

function tapOpenOnWeb() {
  const tree = TrainerMoreScreen({ onOpenNotifications: vi.fn(), onOpenProfile: vi.fn() });
  const button = findByLabel(tree, "Open FitBud on web");
  expect(button).not.toBeNull();
  (button!.props.onPress as () => void)();
}

describe("trainer web link (X7)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens https://app.thefitbud.com when no env var is set", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    expect(DEFAULT_TRAINER_WEB_URL).toBe("https://app.thefitbud.com");
    expect(trainerWebUrl()).toBe("https://app.thefitbud.com");
  });

  it("opens the env var value when it is set (staging builds)", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "https://app-staging.thefitbud.com");
    expect(trainerWebUrl()).toBe("https://app-staging.thefitbud.com");
  });

  it("falls back to the default for a blank env var", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "  ");
    expect(trainerWebUrl()).toBe("https://app.thefitbud.com");
  });

  it("tapping Open FitBud on web opens https://app.thefitbud.com by default", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    vi.mocked(Linking.openURL).mockClear();
    tapOpenOnWeb();
    expect(Linking.openURL).toHaveBeenCalledWith("https://app.thefitbud.com");
  });

  it("tapping Open FitBud on web opens the env var value when set", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "https://app-staging.thefitbud.com");
    vi.mocked(Linking.openURL).mockClear();
    tapOpenOnWeb();
    expect(Linking.openURL).toHaveBeenCalledWith("https://app-staging.thefitbud.com");
  });
});
