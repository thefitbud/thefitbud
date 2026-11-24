/**
 * Z14-6: the phone's notification permission is read live. Denied, then
 * granted in phone Settings, then back to the app: the state flips and the
 * device registers once, with no restart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { act, render } from "../test/render";

const registerDeviceTokenForPush = vi.fn<(api: unknown) => Promise<{ status: string }>>(async () => ({
  status: "registered",
}));
const grantListeners = new Set<() => void>();

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ api: {}, me: { id: "u1" } }),
}));
vi.mock("./register", () => ({
  registerDeviceTokenForPush: () => registerDeviceTokenForPush({}),
  onPushPermissionGranted: (listener: () => void) => {
    grantListeners.add(listener);
    return () => grantListeners.delete(listener);
  },
}));

const { PushPermissionRegistrar, usePushPermission } = await import("./usePushPermission");

let appStateListener: ((state: string) => void) | null = null;
const originalOs = Platform.OS;

function permission(status: "denied" | "granted") {
  vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    status,
    granted: status === "granted",
  } as never);
}

beforeEach(() => {
  Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
  appStateListener = null;
  vi.spyOn(AppState, "addEventListener").mockImplementation(((
    _type: string,
    listener: (state: string) => void,
  ) => {
    appStateListener = listener;
    return { remove: vi.fn() };
  }) as never);
  registerDeviceTokenForPush.mockClear();
  grantListeners.clear();
});

afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: originalOs, configurable: true });
  vi.restoreAllMocks();
});

describe("usePushPermission (Z14-6)", () => {
  it("registers once when permission turns on after returning from phone Settings", async () => {
    permission("denied");
    await act(async () => {
      render(<PushPermissionRegistrar />);
    });
    expect(registerDeviceTokenForPush).not.toHaveBeenCalled();

    permission("granted");
    await act(async () => {
      appStateListener?.("active");
    });
    expect(registerDeviceTokenForPush).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateListener?.("active");
    });
    expect(registerDeviceTokenForPush).toHaveBeenCalledTimes(1);
  });

  it("registers when a screen's own prompt is allowed", async () => {
    permission("denied");
    await act(async () => {
      render(<PushPermissionRegistrar />);
    });
    permission("granted");
    await act(async () => {
      for (const listener of grantListeners) listener();
    });
    expect(registerDeviceTokenForPush).toHaveBeenCalledTimes(1);
  });

  it("does not register on the first read when already granted", async () => {
    permission("granted");
    await act(async () => {
      render(<PushPermissionRegistrar />);
    });
    expect(registerDeviceTokenForPush).not.toHaveBeenCalled();
  });

  it("reports the live state to a screen", async () => {
    permission("denied");
    let seen = "";
    function Probe() {
      seen = usePushPermission().state;
      return null;
    }
    await act(async () => {
      render(<Probe />);
    });
    expect(seen).toBe("denied");
    permission("granted");
    await act(async () => {
      appStateListener?.("active");
    });
    expect(seen).toBe("granted");
  });
});
