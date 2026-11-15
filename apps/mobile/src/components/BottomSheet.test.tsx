import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

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
vi.mock("@fitbud/ui-mobile", () => ({
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
}));
// The sheet is called as a plain function below (no React render), so the
// themed-styles hook is replaced by one that builds the light styles directly.
vi.mock("../providers/ThemeProvider", () => {
  const theme = {
    scheme: "light",
    colors: new Proxy({}, { get: (_t, key) => `token:${String(key)}` }),
    radii: { sheet: 22 },
  };
  return {
    createThemedStyles: (factory: (t: unknown) => unknown) => () => factory(theme),
  };
});

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

function avoidingView(): ReactElement<Record<string, unknown>> {
  const modal = BottomSheet({
    visible: true,
    onDismiss: () => {},
    children: null,
  }) as ReactElement<{ children: ReactNode }>;
  const found = Children.toArray(modal.props.children).find(
    (c) => isValidElement(c) && c.type === "KeyboardAvoidingView",
  );
  expect(found).toBeDefined();
  return found as ReactElement<Record<string, unknown>>;
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

  it("sets statusBarTranslucent on Android only", () => {
    const values: Record<string, unknown> = {};
    for (const os of ["ios", "android", "web"]) {
      platform.OS = os;
      values[os] = modalProps().statusBarTranslucent;
    }
    expect(values).toEqual({ ios: false, android: true, web: false });
  });

  it("pads for the keyboard on iOS only", () => {
    const behaviour = (os: string) => {
      platform.OS = os;
      return avoidingView().props.behavior;
    };
    expect(behaviour("ios")).toBe("padding");
    expect(behaviour("android")).toBeUndefined();
    expect(behaviour("web")).toBeUndefined();
  });

  it("marks the sheet as modal so VoiceOver cannot reach the screen behind it", () => {
    expect(avoidingView().props.accessibilityViewIsModal).toBe(true);
  });
});
