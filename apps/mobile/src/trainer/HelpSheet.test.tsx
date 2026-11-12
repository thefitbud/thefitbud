import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Linking: { openURL: vi.fn() },
  Platform: { OS: "ios" },
  Clipboard: { setString: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
  Pressable: "Pressable",
  Modal: "Modal",
  ScrollView: "ScrollView",
}));
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

import { Clipboard, Platform } from "react-native";
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
    expect(
      await openSupportMailOrFallback("mailto:a@b.c", fallback, open),
    ).toBe("opened");
    expect(open).toHaveBeenCalledWith("mailto:a@b.c");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("shows the sheet when there is no mail app", async () => {
    const open = vi.fn().mockRejectedValue(new Error("no handler"));
    const fallback = vi.fn();
    expect(
      await openSupportMailOrFallback("mailto:a@b.c", fallback, open),
    ).toBe("fallback");
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});

describe("copyText", () => {
  it("uses the built-in Clipboard on the phone", async () => {
    expect(await copyText("tech@thefitbud.com")).toBe(true);
    expect(Clipboard.setString).toHaveBeenCalledWith("tech@thefitbud.com");
  });

  it("uses the browser clipboard on web", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    (Platform as { OS: string }).OS = "web";
    expect(await copyText("tech@thefitbud.com")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("tech@thefitbud.com");
    (Platform as { OS: string }).OS = "ios";
    vi.unstubAllGlobals();
  });

  it("reports failure instead of claiming a copy", async () => {
    vi.mocked(Clipboard.setString).mockImplementationOnce(() => {
      throw new Error("no clipboard");
    });
    expect(await copyText("x")).toBe(false);
  });
});
