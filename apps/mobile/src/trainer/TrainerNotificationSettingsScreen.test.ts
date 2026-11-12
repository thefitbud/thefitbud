import { beforeEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";

// Minimal hook store: useState cells by call order, so the screen renders as a
// plain function and a test can read the state after each action.
const hooks = vi.hoisted(() => ({
  cells: [] as unknown[],
  index: 0,
  seed: {} as Record<number, unknown>,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const i = hooks.index++;
    if (!(i in hooks.cells)) hooks.cells[i] = i in hooks.seed ? hooks.seed[i] : initial;
    return [
      hooks.cells[i],
      (value: unknown) => {
        hooks.cells[i] = value;
      },
    ];
  },
  useEffect: () => undefined,
  useCallback: (fn: unknown) => fn,
}));
vi.mock("react-native", () => ({
  Linking: { openSettings: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
  Pressable: "Pressable",
  Switch: "Switch",
}));
vi.mock("lucide-react-native", () => ({ CircleAlert: "CircleAlert", WifiOff: "WifiOff" }));
vi.mock("@fitbud/tokens", () => ({
  semantic: { attention: { fill: "", text: "" } },
}));
vi.mock("@fitbud/ui-mobile", () => ({
  colors: {},
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
}));
vi.mock("expo-notifications", () => ({ getPermissionsAsync: vi.fn() }));
vi.mock("../components/Text", () => ({ Text: "Text" }));
vi.mock("../components/ErrorBanner", () => ({ ErrorBanner: "ErrorBanner" }));
vi.mock("../components/PrimaryButton", () => ({ PrimaryButton: "PrimaryButton" }));
vi.mock("../components/Screen", () => ({ Screen: "Screen" }));
vi.mock("../components/Snackbar", () => ({ Snackbar: "Snackbar" }));
vi.mock("../trainee/settings/QuietHoursScreen", () => ({ QuietHoursScreen: "QuietHoursScreen" }));
vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("../notifications/register", () => ({ requestPushPermission: vi.fn() }));
const api = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ api }) }));

import { ApiClientError } from "@fitbud/api-client";
/** A client/server shape disagreement: what a zod parse failure throws. */
class ZodError extends Error {
  constructor() {
    super("response did not match schema");
    this.name = "ZodError";
  }
}
import { reportError } from "../lib/reportError";
import { requestPushPermission } from "../notifications/register";
import { TrainerNotificationSettingsScreen } from "./TrainerNotificationSettingsScreen";

// useState call order in the screen.
const PREFS = 0;
const SAVING = 2;
const OFFLINE = 3;
const SNACK = 4;
const OS_PERMISSION = 6;

type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
function flatten(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((c) => flatten(c, out));
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as El;
    out.push(el);
    flatten(el.props.children, out);
    if (el.props.footer) flatten(el.props.footer, out);
  }
  return out;
}
function render() {
  hooks.index = 0;
  return TrainerNotificationSettingsScreen({ onBack: vi.fn() });
}
function firstSwitch(): El {
  return flatten(render()).find((el) => el.type === "Switch")!;
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const before = {
  quietHoursStart: null,
  quietHoursEnd: null,
  trainerCategories: { askCoach: false, checkinSubmitted: true },
} as never;

beforeEach(() => {
  hooks.cells = [];
  hooks.seed = { [PREFS]: before, 1: false, [OS_PERMISSION]: "granted" };
  api.updateNotificationPreferences.mockReset();
  vi.mocked(reportError).mockClear();
  vi.mocked(requestPushPermission).mockReset();
  vi.mocked(Linking.openSettings).mockClear();
});

function askCoach() {
  return (hooks.cells[PREFS] as { trainerCategories: Record<string, boolean> })
    .trainerCategories.askCoach;
}

describe("trainer notification settings save (Z10-12, frames 52 and 58)", () => {
  it("flips the switch before the API answers", async () => {
    let resolve!: (v: unknown) => void;
    api.updateNotificationPreferences.mockReturnValue(new Promise((r) => (resolve = r)));
    (firstSwitch().props.onValueChange as (v: boolean) => void)(true);
    expect(askCoach()).toBe(true);
    expect(hooks.cells[SAVING]).toBe(true);
    resolve({ ...(before as object), trainerCategories: { askCoach: true, checkinSubmitted: true } });
    await flush();
    expect(askCoach()).toBe(true);
    expect(hooks.cells[SAVING]).toBe(false);
    expect(hooks.cells[SNACK]).toBeFalsy();
  });

  it("rolls back to the previous preferences and shows the snackbar on failure", async () => {
    api.updateNotificationPreferences.mockRejectedValue(new ApiClientError({ code: "X", message: "Server error.", requestId: "r", status: 500 }));
    (firstSwitch().props.onValueChange as (v: boolean) => void)(true);
    await flush();
    expect(hooks.cells[PREFS]).toBe(before);
    expect(hooks.cells[SNACK]).toBe("Couldn't save. Try again.");
    expect(hooks.cells[OFFLINE]).toBe(false);
  });

  it("shows the offline banner only for a proven network failure", async () => {
    api.updateNotificationPreferences.mockRejectedValue(new TypeError("Network request failed"));
    (firstSwitch().props.onValueChange as (v: boolean) => void)(true);
    await flush();
    expect(hooks.cells[OFFLINE]).toBe(true);
    expect(hooks.cells[SNACK]).toBe("Couldn't save. Try again.");
    expect(hooks.cells[PREFS]).toBe(before);
    expect(reportError).toHaveBeenCalledWith("trainer-notification-settings", expect.any(TypeError));
  });

  it("does not blame the network for a ZodError", async () => {
    api.updateNotificationPreferences.mockRejectedValue(new ZodError());
    (firstSwitch().props.onValueChange as (v: boolean) => void)(true);
    await flush();
    expect(hooks.cells[OFFLINE]).toBe(false);
    expect(hooks.cells[SNACK]).toBe("Couldn't save. Try again.");
    expect(hooks.cells[PREFS]).toBe(before);
    expect(reportError).toHaveBeenCalledWith("trainer-notification-settings", expect.any(ZodError));
  });
});

describe("enabling a category needs phone permission (frame 54)", () => {
  beforeEach(() => {
    hooks.seed[OS_PERMISSION] = "denied";
  });

  it("makes no API call and leaves the switch off when the person says no", async () => {
    vi.mocked(requestPushPermission).mockResolvedValue("denied");
    (firstSwitch().props.onValueChange as (v: boolean) => void)(true);
    await flush();
    expect(api.updateNotificationPreferences).not.toHaveBeenCalled();
    expect(hooks.cells[PREFS]).toBe(before);
    expect(hooks.cells[SAVING]).toBe(false);
  });

  it("sends the person to phone settings when the system will not ask again", async () => {
    vi.mocked(requestPushPermission).mockResolvedValue("blocked");
    (firstSwitch().props.onValueChange as (v: boolean) => void)(true);
    await flush();
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(api.updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("saves after the person allows, and ignores a second tap while the prompt is open", async () => {
    let allow!: (v: string) => void;
    vi.mocked(requestPushPermission).mockReturnValue(new Promise((r) => (allow = r)) as never);
    api.updateNotificationPreferences.mockResolvedValue(before);
    (firstSwitch().props.onValueChange as (v: boolean) => void)(true);
    // The screen re-renders busy; a second tap reaches the fresh handler.
    const again = firstSwitch();
    expect(again.props.disabled).toBe(true);
    (again.props.onValueChange as (v: boolean) => void)(true);
    expect(requestPushPermission).toHaveBeenCalledTimes(1);
    allow("granted");
    await flush();
    expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1);
  });
});
