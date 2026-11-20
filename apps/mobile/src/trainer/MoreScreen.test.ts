import { afterEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";

// Render the screen as a plain function: hooks are stubbed, no renderer needed.
const hooks = vi.hoisted(() => ({
  state: undefined as unknown,
  set: vi.fn(),
  states: [] as unknown[],
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const idx = hooks.states.length;
    if (hooks.states[idx] === undefined) hooks.states.push(initial);
    return [
      hooks.state !== undefined && idx === 0 ? hooks.state : hooks.states[idx],
      (next: unknown) => {
        hooks.states[idx] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.states[idx]) : next;
        hooks.set(next);
      },
    ];
  },
  useEffect: () => undefined,
  useCallback: (fn: unknown) => fn,
}));

vi.mock("react-native", () => ({
  Linking: { openURL: vi.fn(), openSettings: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
  Pressable: "Pressable",
  Modal: "Modal",
}));
vi.mock("./HelpSheet", () => ({ HelpSheet: "HelpSheet", openSupportMailOrFallback: vi.fn() }));
vi.mock("lucide-react-native", () => {
  const icon = (name: string) => name;
  return {
    ArrowLeftRight: icon("ArrowLeftRight"),
    Bell: icon("Bell"),
    ChevronRight: icon("ChevronRight"),
    CircleHelp: icon("CircleHelp"),
    CloudOff: icon("CloudOff"),
    ExternalLink: icon("ExternalLink"),
    Monitor: icon("Monitor"),
  };
});
vi.mock("@fitbud/tokens", () => ({
  brand: {},
  ink: {},
  semantic: { critical: { text: "red" }, positive: {}, attention: {} },
}));
vi.mock("../trainee/settings/m2", () => ({
  M2Card: "M2Card",
  M2Group: "M2Group",
  M2Row: "M2Row",
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      version: "1.0.0",
      ios: { buildNumber: "214" },
    },
  },
}));
vi.mock("@fitbud/ui-mobile", async () => ({
  colors: {},
  spacing: (await vi.importActual<typeof import("@fitbud/tokens")>("@fitbud/tokens"))
    .spacing,
  fontFamilyBold: "",
  fontFamilySemiBold: "",
}));
vi.mock("../components/Text", () => ({ Text: "Text" }));
vi.mock("../components/Screen", () => ({ Screen: "Screen" }));
vi.mock("../providers/ConfigProvider", () => ({
  useConfig: () => ({ config: null }),
}));
const auth = vi.hoisted(() => ({
  me: null as null | {
    permittedRoles: string[];
    email?: string;
    trainerProfile?: { displayName?: string };
  },
  signOut: vi.fn(),
  requestRoleSelect: vi.fn(),
  api: { listClients: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) },
}));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../lib/support", () => ({
  buildSupportMailto: vi.fn(() => "mailto:x"),
  DEFAULT_SUPPORT_EMAIL: "support@fitbud.app",
}));
vi.mock("./clients", () => ({
  isEndedClient: (item: { status: string }) => item.status === "ended",
}));

import { spacing } from "@fitbud/ui-mobile";
import {
  DEFAULT_TRAINER_WEB_URL,
  TrainerMoreScreen,
  moreGutter,
  moreHeadingNudge,
  trainerWebUrl,
  versionLabel,
} from "./MoreScreen";

type Element = {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
};

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

function findByProp(node: unknown, prop: string): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByProp(child, prop);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as Element;
  if (prop in element.props) return element;
  return findByProp(element.props.children, prop);
}

function tapOpenOnWeb() {
  const tree = TrainerMoreScreen({
    onOpenNotifications: vi.fn(),
    onOpenProfile: vi.fn(),
  });
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
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://app-staging.thefitbud.com",
    );
  });
});

function render() {
  hooks.states = [];
  hooks.state = undefined;
  hooks.set.mockClear();
  return TrainerMoreScreen({
    onOpenNotifications: vi.fn(),
    onOpenProfile: vi.fn(),
  });
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

describe("trainer More v3 layout (TM-07a)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    auth.me = null;
  });

  it("opts the screen into v3 / system theme", () => {
    const screen = flatten(render()).find((el) => el.type === "Screen");
    expect(screen?.props.v3).toBe(true);
    expect(screen?.props.showHeader).toBe(false);
  });

  it("shows Switch to client view only for dual-role accounts", () => {
    auth.me = { permittedRoles: ["trainer"] };
    expect(findByLabel(render(), "Switch to client view")).toBeNull();
    auth.me = { permittedRoles: ["trainer", "admin"] };
    expect(findByLabel(render(), "Switch to client view")).toBeNull();
    auth.me = { permittedRoles: ["trainer", "trainee"] };
    expect(findByLabel(render(), "Switch to client view")).not.toBeNull();
    expect(findByLabel(render(), "Switch role")).toBeNull();
  });

  it("Switch to client view opens role select", () => {
    auth.me = { permittedRoles: ["trainer", "trainee"] };
    auth.requestRoleSelect.mockClear();
    const row = findByLabel(render(), "Switch to client view")!;
    expect(row.props.onPress).toBe(auth.requestRoleSelect);
    (row.props.onPress as () => void)();
    expect(auth.requestRoleSelect).toHaveBeenCalledTimes(1);
  });

  it("orders Settings rows per TM-07a", () => {
    auth.me = { permittedRoles: ["trainer", "trainee"] };
    const settingsGroup = flatten(render()).find(
      (el) =>
        el.type === "M2Group" &&
        findByLabel(el.props.children, "Notifications") !== null,
    )!;
    const rows = flatten(settingsGroup.props.children).filter(
      (el) => el.type === "M2Row",
    );
    expect(rows.map((el) => el.props.label)).toEqual([
      "Notifications",
      "Open FitBud on web",
      "Switch to client view",
      "Help",
    ]);
    expect(rows[0]?.props.hint).toBe("Needs you, check-ins, asks");
    expect(rows[1]?.props.hint).toBe("Plans, templates, invites");
    expect(rows[2]?.props.hint).toBe("Follow your own plan");
    expect(rows[3]?.props.hint).toBe("Email the FitBud team");
  });

  it("keeps Profile out of Settings (the card opens it)", () => {
    expect(findByLabel(render(), "Profile")).toBeNull();
  });

  it("drops the Legal group in favour of the footer links", () => {
    const tree = render();
    expect(findByLabel(tree, "Privacy policy")).toBeNull();
    expect(findByLabel(tree, "Terms of use")).toBeNull();
    expect(findByLabel(tree, "Credits and licences")).toBeNull();
    expect(findByLabel(tree, "Email FitBud support")).toBeNull();
  });

  it("opens Help as a sheet (TM-07e)", () => {
    const tree = render();
    (findByLabel(tree, "Help")!.props.onPress as () => void)();
    expect(hooks.set).toHaveBeenCalledWith(true);
    const sheet = flatten(tree).find((el) => el.type === "HelpSheet");
    expect(sheet).toBeDefined();
  });

  it("asks before signing out (TM-07f) and signs out only on confirm", () => {
    const tree = render();
    const signOut = flatten(tree).find(
      (el) =>
        el.props.accessibilityLabel === "Sign out" &&
        typeof el.props.onPress === "function",
    );
    expect(signOut).toBeDefined();
    (signOut!.props.onPress as () => void)();
    expect(auth.signOut).not.toHaveBeenCalled();
    const confirm = findByProp(tree, "onConfirm");
    expect(confirm).not.toBeNull();
    (confirm!.props.onConfirm as () => void)();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("renders FitBud version for the footer (TM-07a)", () => {
    expect(versionLabel()).toBe("FitBud 1.0.0 (214)");
  });
});

describe("trainer More heading alignment (CU7 / TM-07a)", () => {
  afterEach(() => {
    auth.me = null;
  });

  function offsetOf(style: unknown): number {
    const s = style as { marginLeft?: number; marginHorizontal?: number };
    const value = s.marginLeft ?? s.marginHorizontal;
    expect(typeof value).toBe("number");
    return value as number;
  }

  function parts() {
    const elements = flatten(render());
    const heading = elements.find(
      (el) => el.props.accessibilityRole === "header" && el.props.children === "More",
    );
    const stack = elements.find(
      (el) =>
        (el.props.style as { marginHorizontal?: number } | undefined)
          ?.marginHorizontal !== undefined,
    );
    expect(heading).toBeDefined();
    expect(stack).toBeDefined();
    return { heading: heading!, stack: stack! };
  }

  it("renders its own More heading with Screen title off", () => {
    const { heading } = parts();
    const screen = flatten(render()).find((el) => el.props.showHeader === false);
    expect(screen).toBeDefined();
    expect(heading.props.accessibilityLabel).toBe("More");
  });

  it("insets the card stack to the gutter the frames use", () => {
    const { stack } = parts();
    expect(spacing.xl + offsetOf(stack.props.style)).toBe(moreGutter);
  });

  it("keeps the heading exactly one optical nudge in from the cards", () => {
    const { heading, stack } = parts();
    const headingInset = spacing.xl + offsetOf(heading.props.style);
    const stackInset = spacing.xl + offsetOf(stack.props.style);
    expect(headingInset - stackInset).toBe(moreHeadingNudge);
    expect(stackInset).toBe(16);
    expect(headingInset).toBe(20);
  });
});
