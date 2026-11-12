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
  Check: "Check",
  ClipboardList: "ClipboardList",
  Copy: "Copy",
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
