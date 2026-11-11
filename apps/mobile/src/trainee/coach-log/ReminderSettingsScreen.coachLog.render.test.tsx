import { describe, expect, it, vi } from "vitest";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const prefs = {
  userId: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
  pushEnabled: true,
  categories: {
    workoutReminder: true,
    mealReminder: true,
    checkinReminder: true,
    subscriptionRenewalReminder: true,
    dailySummaryReminder: true,
  },
  coachLogUpdates: true,
  preferredWorkoutTime: null,
  quietHoursStart: null,
  quietHoursEnd: null,
};

const api = {
  getNotificationPreferences: vi.fn(async () => prefs),
  updateNotificationPreferences: vi.fn(async (patch: Record<string, unknown>) => ({
    ...prefs,
    ...patch,
  })),
  getReminderStatus: vi.fn(async () => null),
  getMealTimes: vi.fn(async () => null),
};
const auth = mockAuth({ api, me: { id: prefs.userId, timezone: "Asia/Kolkata" } });

vi.mock("../../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
vi.mock("../../providers/ConfigProvider", () => ({ useConfig: () => ({ config: { flags: {} } }) }));
vi.mock("../../lib/stage1Api", () => ({
  stage1Api: () => ({
    getReminderStatus: async () => null,
    getMealTimes: async () => null,
    resumeReminders: async () => null,
  }),
}));
vi.mock("../../notifications/androidChannels", () => ({
  ensureAndroidNotificationChannels: async () => undefined,
}));

const { ReminderSettingsScreen } = await import("../settings/ReminderSettingsScreen");

describe("Coach updates to my logs row", () => {
  it("shows on by default and writes coachLogUpdates when turned off", async () => {
    render(<ReminderSettingsScreen onBack={() => undefined} onOpenQuietHours={() => undefined} />);
    const toggle = (await screen.findByLabelText("Coach updates to my logs")) as HTMLInputElement;
    await waitFor(() => expect(toggle.disabled).toBe(false));
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ coachLogUpdates: false }),
    );
  });
});
