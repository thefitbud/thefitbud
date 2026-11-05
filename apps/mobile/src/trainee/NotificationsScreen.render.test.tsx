/**
 * Notifications inbox fetch count (BT15, D-W4-16).
 *
 * Same cache-subscriber loop as the progress tab: `load` writes the inbox
 * cache, and refetching from that notification never settles. react-native-web
 * only (D-W4-17); the native branch is not exercised.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuth, render, waitFor } from "../test/render";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

let listCalls = 0;

const api = {
  listNotifications: vi.fn(async () => {
    listCalls += 1;
    return { items: [], nextCursor: null };
  }),
  getNotificationPreferences: vi.fn(async () => ({
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  })),
};

const auth = mockAuth({
  api,
  me: {
    id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
    email: "aarav.ontrack@demo.fitbud.test",
    timezone: "Asia/Kolkata",
  },
});

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});

const { NotificationsScreen } = await import("./NotificationsScreen");

beforeEach(() => {
  listCalls = 0;
});

describe("NotificationsScreen fetch count", () => {
  it("lists notifications once per mount", async () => {
    render(
      <NotificationsScreen
        onBack={() => undefined}
        onOpenSettings={() => undefined}
        onNavigate={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(listCalls).toBe(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(listCalls).toBe(1);
  });
});
