import { afterEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";

// Render the screen as a plain function: hooks are stubbed, no renderer needed.
const hooks = vi.hoisted(() => ({
  state: undefined as unknown,
  set: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [
    hooks.state !== undefined ? hooks.state : initial,
    hooks.set,
  ],
  useEffect: () => undefined,
}));

// MoreScreen imports native modules; the link logic needs none of them.
vi.mock("react-native", () => ({
  Linking: { openURL: vi.fn(), openSettings: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
  Pressable: "Pressable",
}));
vi.mock("../notifications/register", () => ({ requestPushPermission: vi.fn() }));
vi.mock("lucide-react-native", () => {
  const icon = (name: string) => name;
  return {
    ArrowLeftRight: icon("ArrowLeftRight"), BellOff: icon("BellOff"), BellRing: icon("BellRing"), CircleCheck: icon("CircleCheck"), Bell: icon("Bell"), ChevronRight: icon("ChevronRight"),
    Copyright: icon("Copyright"), ExternalLink: icon("ExternalLink"), FileText: icon("FileText"),
    LogOut: icon("LogOut"), Mail: icon("Mail"), Monitor: icon("Monitor"), Shield: icon("Shield"),
    User: icon("User"),
  };
});
vi.mock("@fitbud/tokens", () => ({
  brand: {}, ink: {}, semantic: { critical: { text: "red" }, positive: {}, attention: {} },
}));
vi.mock("../trainee/settings/m2", () => ({ M2Card: "M2Card", M2Group: "M2Group", M2Row: "M2Row" }));
vi.mock("expo-notifications", () => ({ getPermissionsAsync: vi.fn() }));
// Real spacing scale: the CU7 inset assertions below must measure the values
// the screen actually ships, not numbers restated in this file.
vi.mock("@fitbud/ui-mobile", async () => ({
  colors: {},
  spacing: (await vi.importActual<typeof import("@fitbud/tokens")>("@fitbud/tokens")).spacing,
  fontFamilyBold: "", fontFamilySemiBold: "",
}));
vi.mock("../components/Text", () => ({ Text: "Text" }));
vi.mock("../components/PrimaryButton", () => ({ PrimaryButton: "PrimaryButton" }));
vi.mock("../components/Screen", () => ({ Screen: "Screen" }));
vi.mock("../providers/ConfigProvider", () => ({ useConfig: () => ({ config: null }) }));
const auth = vi.hoisted(() => ({
  me: null as null | { permittedRoles: string[]; email?: string },
  signOut: vi.fn(),
  selectRole: vi.fn(),
}));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../lib/support", () => ({ openSupportEmail: vi.fn(), DEFAULT_SUPPORT_EMAIL: "" }));

import { spacing } from "@fitbud/ui-mobile";
import { requestPushPermission } from "../notifications/register";
import { openSupportEmail } from "../lib/support";
import {
  DEFAULT_TRAINER_WEB_URL,
  TrainerMoreScreen,
  moreGutter,
  moreHeadingNudge,
  trainerWebUrl,
} from "./MoreScreen";

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

function render() {
  return TrainerMoreScreen({ onOpenNotifications: vi.fn(), onOpenProfile: vi.fn() });
}

/** Every element in tree order, so the section order can be asserted. */
function flatten(node: unknown, out: Element[] = []): Element[] {
  if (Array.isArray(node)) node.forEach((child) => flatten(child, out));
  else if (node && typeof node === "object" && "props" in node) {
    const element = node as Element;
    out.push(element);
    flatten(element.props.children, out);
  }
  return out;
}

describe("trainer More grouped layout (BT3d, D-W3-14)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    auth.me = null;
  });

  it("opens each LEGAL row's page in the browser with its accessible name", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", undefined);
    const tree = render();
    const rows = [
      ["Privacy policy", "https://app.thefitbud.com/privacy", "Opens app.thefitbud.com/privacy"],
      ["Terms of use", "https://app.thefitbud.com/terms", "Opens app.thefitbud.com/terms"],
      ["Credits and licences", "https://app.thefitbud.com/credits", "Exercise drawings and food data"],
    ] as const;
    for (const [label, url, hint] of rows) {
      const row = findByLabel(tree, label)!;
      expect(row.props.accessibilityLabel).toBe(`${label}, opens in your browser`);
      expect(row.props.hint).toBe(hint);
      expect(row.props.showChevron).toBe(false);
      expect(row.props.trailing).toBeTruthy();
      vi.mocked(Linking.openURL).mockClear();
      (row.props.onPress as () => void)();
      expect(Linking.openURL).toHaveBeenCalledWith(url);
    }
  });

  it("shows the staging host in the LEGAL subtitles", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "https://app-staging.thefitbud.com");
    const row = findByLabel(render(), "Privacy policy")!;
    expect(row.props.hint).toBe("Opens app-staging.thefitbud.com/privacy");
  });

  it("hides Switch to client view without the trainee role, shows it with", () => {
    auth.me = { permittedRoles: ["trainer"] };
    expect(findByLabel(render(), "Switch to client view")).toBeNull();
    auth.me = { permittedRoles: ["trainer", "trainee"] };
    const row = findByLabel(render(), "Switch to client view")!;
    (row.props.onPress as () => void)();
    expect(auth.selectRole).toHaveBeenCalledWith("trainee");
  });

  it("orders Settings, Switch to client view, Legal, then support and Sign out", () => {
    auth.me = { permittedRoles: ["trainer", "trainee"] };
    const labels = flatten(render())
      .map((el) => el.props.label ?? el.props.children)
      .filter((v): v is string => typeof v === "string");
    const order = [
      "Settings", "Notifications", "Profile", "Open FitBud on web",
      "Switch to client view", "Legal", "Privacy policy", "Terms of use",
      "Credits and licences", "Email FitBud support", "Sign out",
    ];
    const positions = order.map((l) => labels.indexOf(l));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("keeps the support email on screen id TM-07 and Sign out wired", () => {
    const tree = render();
    (findByLabel(tree, "Email FitBud support")!.props.onPress as () => void)();
    expect(openSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({ screenId: "TM-07", role: "trainer" }),
    );
    expect(findByLabel(tree, "Sign out")!.props.onPress).toBe(auth.signOut);
  });
});

/**
 * CU7: the heading and the card column share one gutter.
 *
 * `Screen` pads `spacing.xl` and exposes no inset prop, so both the heading and
 * the stack carry a negative margin off that padding. Every number below is read
 * back off the rendered tree and compared against the other, never restated: if
 * someone changes the gutter, both insets move and the suite stays green; if
 * someone moves one of them alone, it goes red.
 */
describe("trainer More heading alignment (CU7, frame 51)", () => {
  afterEach(() => {
    auth.me = null;
  });

  /** Horizontal inset a style contributes, relative to Screen's own padding. */
  function offsetOf(style: unknown): number {
    const s = style as { marginLeft?: number; marginHorizontal?: number };
    const value = s.marginLeft ?? s.marginHorizontal;
    expect(typeof value).toBe("number");
    return value as number;
  }

  function parts() {
    const elements = flatten(render());
    const heading = elements.find((el) => el.props.accessibilityRole === "header");
    const stack = elements.find(
      (el) =>
        (el.props.style as { marginHorizontal?: number } | undefined)
          ?.marginHorizontal !== undefined,
    );
    expect(heading).toBeDefined();
    expect(stack).toBeDefined();
    return { heading: heading!, stack: stack! };
  }

  it("renders its own 'More' heading, because Screen's title block is off", () => {
    const { heading } = parts();
    // Screen.tsx is not CU7's to change: its 24pt title inset is shared with
    // every other trainer tab.
    const screen = flatten(render()).find((el) => el.props.showHeader === false);
    expect(screen).toBeDefined();
    expect(heading.props.children).toBe("More");
    expect(heading.props.accessibilityLabel).toBe("More");
  });

  it("insets the card stack to the gutter the frames use", () => {
    const { stack } = parts();
    // stack inset = Screen padding + offset = moreGutter, whatever the tokens are.
    expect(spacing.xl + offsetOf(stack.props.style)).toBe(moreGutter);
  });

  it("keeps the heading exactly one optical nudge in from the cards", () => {
    const { heading, stack } = parts();
    const headingInset = spacing.xl + offsetOf(heading.props.style);
    const stackInset = spacing.xl + offsetOf(stack.props.style);
    // Screen's padding cancels, so this holds whatever Screen pads.
    expect(headingInset - stackInset).toBe(moreHeadingNudge);
    // Frame 51 at 393x852: card box 16.0pt, heading text box 20pt (ink 22.3pt).
    expect(stackInset).toBe(16);
    expect(headingInset).toBe(20);
  });
});

function findByA11y(node: unknown, label: string): Element | null {
  return (
    flatten(node).find((el) => el.props.accessibilityLabel === label) ?? null
  );
}

describe("trainer More notifications card (Z10-12, frames 51, 53, 54)", () => {
  afterEach(() => {
    hooks.state = undefined;
    hooks.set.mockClear();
    vi.mocked(requestPushPermission).mockReset();
    vi.mocked(Linking.openSettings).mockClear();
  });

  it("shows nothing until the phone has answered", () => {
    const tree = render();
    expect(findByA11y(tree, "Open settings")).toBeNull();
    expect(findByA11y(tree, "Notifications are on")).toBeNull();
  });

  it("shows the On chip, with no Open settings button, when allowed", () => {
    hooks.state = true;
    const tree = render();
    expect(findByA11y(tree, "Notifications are on")).not.toBeNull();
    expect(findByA11y(tree, "Open settings")).toBeNull();
  });

  it("shows Open settings when off, and asks the system before leaving the app", async () => {
    hooks.state = false;
    vi.mocked(requestPushPermission).mockResolvedValue("denied");
    const button = findByA11y(render(), "Open settings")!;
    (button.props.onPress as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestPushPermission).toHaveBeenCalledTimes(1);
    expect(Linking.openSettings).not.toHaveBeenCalled();
  });

  it("opens phone settings only when the system will not ask again", async () => {
    hooks.state = false;
    vi.mocked(requestPushPermission).mockResolvedValue("blocked");
    const button = findByA11y(render(), "Open settings")!;
    (button.props.onPress as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it("turns the card to On after the person allows", async () => {
    hooks.state = false;
    vi.mocked(requestPushPermission).mockResolvedValue("granted");
    const button = findByA11y(render(), "Open settings")!;
    (button.props.onPress as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hooks.set).toHaveBeenCalledWith(true);
  });
});
