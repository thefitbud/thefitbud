import { afterEach, describe, expect, it, vi } from "vitest";

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
vi.mock("../providers/ConfigProvider", () => ({ useConfig: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/support", () => ({ openSupportEmail: vi.fn(), DEFAULT_SUPPORT_EMAIL: "" }));

import { DEFAULT_TRAINER_WEB_URL, trainerWebUrl } from "./MoreScreen";

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
});
