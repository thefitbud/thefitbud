import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const platform = vi.hoisted(() => ({ OS: "ios" }));

vi.mock("react-native", () => ({
  Platform: platform,
  StyleSheet: { create: (styles: unknown) => styles, absoluteFillObject: {} },
  View: "View",
  Pressable: "Pressable",
  Modal: "Modal",
  ScrollView: "ScrollView",
  KeyboardAvoidingView: "KeyboardAvoidingView",
}));
vi.mock("./Text", () => ({ Text: "Text" }));
vi.mock("@fitbud/tokens", () => ({
  brand: { deepNavy: "#000" },
  surface: { card: "#fff" },
}));
vi.mock("@fitbud/ui-mobile", () => ({
  colors: { lightGrey: "#ddd", midGrey: "#888" },
  radii: { card: 16 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
}));

import { BottomSheet } from "./BottomSheet";

function modalProps(): Record<string, unknown> {
  const el = BottomSheet({
    visible: true,
    title: "Time zone",
    onDismiss: () => {},
    children: null,
  }) as ReactElement<Record<string, unknown>>;
  expect(el.type).toBe("Modal");
  return el.props;
}

describe("BottomSheet Modal presentation", () => {
  beforeEach(() => {
    platform.OS = "ios";
  });

  it("is transparent with no pageSheet on iOS, so the live screen shows behind the scrim", () => {
    const props = modalProps();
    expect(props.transparent).toBe(true);
    expect(props.presentationStyle).toBeUndefined();
  });

  it("keeps the same transparent presentation on Android and web", () => {
    for (const os of ["android", "web"]) {
      platform.OS = os;
      const props = modalProps();
      expect(props.transparent).toBe(true);
      expect(props.presentationStyle).toBeUndefined();
    }
  });

  it("pads for the keyboard on iOS only", () => {
    const behaviour = (os: string) => {
      platform.OS = os;
      const modal = BottomSheet({
        visible: true,
        onDismiss: () => {},
        children: null,
      }) as ReactElement<{ children: ReactElement<{ behavior?: string }> }>;
      return modal.props.children.props.behavior;
    };
    expect(behaviour("ios")).toBe("padding");
    expect(behaviour("android")).toBeUndefined();
  });
});
