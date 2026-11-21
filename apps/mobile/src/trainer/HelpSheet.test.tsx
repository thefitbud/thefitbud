import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Linking: { openURL: vi.fn(), canOpenURL: vi.fn() },
  Platform: { OS: "ios" },
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
  Pressable: "Pressable",
  Modal: "Modal",
  ScrollView: "ScrollView",
}));
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("lucide-react-native", () => ({
  Bug: "Bug",
  Check: "Check",
  ClipboardList: "ClipboardList",
  Copy: "Copy",
  Mail: "Mail",
  X: "X",
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.4.0" } },
}));
vi.mock("../components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("../components/Text", () => ({ Text: "Text" }));
vi.mock("@fitbud/ui-mobile", () => ({
  fontFamilyBold: "b",
  fontFamilySemiBold: "s",
  spacing: { md: 12 },
  themes: {
    light: { scheme: "light", colors: {}, radii: {}, spacing: {}, text: {}, touchTarget: 44 },
    dark: { scheme: "dark", colors: {}, radii: {}, spacing: {}, text: {}, touchTarget: 44 },
  },
}));
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
      spacing: { md: 12 },
      text: {},
      touchTarget: 44,
      scheme: "light",
    } as never);
    return () => styles;
  },
}));
vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("@fitbud/tokens", () => ({
  brand: {},
  ink: {},
  surface: {},
}));

import { setStringAsync } from "expo-clipboard";
import { Platform } from "react-native";
import {
  buildHelpDetails,
  copyText,
  deviceLabel,
  openSupportMailOrFallback,
} from "./HelpSheet";

describe("help sheet details", () => {
  it("matches frame 56", () => {
    expect(
      buildHelpDetails({ version: "1.4.0", device: "iPhone", screen: "More" }),
    ).toBe("App version 1.4.0 • iPhone • More");
  });

  it("names the device without raw platform values", () => {
    expect(deviceLabel("ios")).toBe("iPhone");
    expect(deviceLabel("ios", true)).toBe("iPad");
    expect(deviceLabel("android")).toBe("Android");
    expect(deviceLabel("web")).toBe("Web");
  });
});

describe("openSupportMailOrFallback", () => {
  it("opens the mail app and does not show the sheet", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const fallback = vi.fn();
    const canOpen = vi.fn().mockResolvedValue(true);
    expect(
      await openSupportMailOrFallback("mailto:a@b.c", fallback, open, canOpen),
    ).toBe("opened");
    expect(open).toHaveBeenCalledWith("mailto:a@b.c");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("shows the sheet when there is no mail app", async () => {
    const open = vi.fn().mockRejectedValue(new Error("no handler"));
    const fallback = vi.fn();
    const canOpen = vi.fn().mockResolvedValue(true);
    expect(
      await openSupportMailOrFallback("mailto:a@b.c", fallback, open, canOpen),
    ).toBe("fallback");
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});

describe("openSupportMailOrFallback canOpenURL", () => {
  it("shows the sheet on iOS when mailto cannot be opened, without opening", async () => {
    const open = vi.fn();
    const fallback = vi.fn();
    const canOpen = vi.fn().mockResolvedValue(false);
    expect(
      await openSupportMailOrFallback("mailto:a@b.c", fallback, open, canOpen),
    ).toBe("fallback");
    expect(canOpen).toHaveBeenCalledWith("mailto:a@b.c");
    expect(open).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("opens on iOS when mailto can be opened", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const canOpen = vi.fn().mockResolvedValue(true);
    expect(
      await openSupportMailOrFallback("mailto:a@b.c", vi.fn(), open, canOpen),
    ).toBe("opened");
  });

  it("skips canOpenURL on Android and relies on the open result", async () => {
    (Platform as { OS: string }).OS = "android";
    const open = vi.fn().mockResolvedValue(undefined);
    const canOpen = vi.fn().mockResolvedValue(false);
    expect(
      await openSupportMailOrFallback("mailto:a@b.c", vi.fn(), open, canOpen),
    ).toBe("opened");
    expect(canOpen).not.toHaveBeenCalled();
    (Platform as { OS: string }).OS = "ios";
  });
});

describe("copyText", () => {
  it("uses expo-clipboard on the phone", async () => {
    vi.mocked(setStringAsync).mockResolvedValueOnce(true);
    expect(await copyText("tech@thefitbud.com")).toBe(true);
    expect(setStringAsync).toHaveBeenCalledWith("tech@thefitbud.com");
  });

  it("uses expo-clipboard on web too", async () => {
    (Platform as { OS: string }).OS = "web";
    vi.mocked(setStringAsync).mockResolvedValueOnce(true);
    expect(await copyText("tech@thefitbud.com")).toBe(true);
    expect(setStringAsync).toHaveBeenLastCalledWith("tech@thefitbud.com");
    (Platform as { OS: string }).OS = "ios";
  });

  it("returns false when the clipboard reports no copy", async () => {
    vi.mocked(setStringAsync).mockResolvedValueOnce(false);
    expect(await copyText("x")).toBe(false);
  });

  it("reports failure instead of claiming a copy", async () => {
    vi.mocked(setStringAsync).mockRejectedValueOnce(new Error("no clipboard"));
    expect(await copyText("x")).toBe(false);
  });
});
