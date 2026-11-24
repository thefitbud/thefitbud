import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
const setNotificationChannelAsync = vi.fn<(id: string, config: unknown) => Promise<null>>(async () => null);
const deleteNotificationChannelAsync = vi.fn<(id: string) => Promise<void>>(async () => undefined);
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync,
  deleteNotificationChannelAsync,
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));

const { ANDROID_CHANNEL_IDS, ensureAndroidNotificationChannels } = await import(
  "./androidChannels"
);
const { PUSH_GROUPS } = await import("./copy");

// The server's table (apps/api/src/lib/expo-push.ts EXPO_ANDROID_CHANNEL_IDS, Z14-4).
// Apps never import another app's source, so the list is repeated here.
const SERVER_CHANNEL_IDS = [
  "workout_v2",
  "meal_v2",
  "checkin_v2",
  "coach_v2",
  "plan_v2",
  "account_v2",
  "clients_v2",
  "summary",
];

describe("Android channels (Z12-47, Z14-6)", () => {
  it("has exactly the channels the server sends to, one per push group", () => {
    expect([...ANDROID_CHANNEL_IDS].sort()).toEqual([...SERVER_CHANNEL_IDS].sort());
    expect(ANDROID_CHANNEL_IDS).toHaveLength(PUSH_GROUPS.length);
  });

  it("creates every channel once, high importance except the summary", async () => {
    await ensureAndroidNotificationChannels();
    await ensureAndroidNotificationChannels();
    expect(setNotificationChannelAsync).toHaveBeenCalledTimes(ANDROID_CHANNEL_IDS.length);
    for (const [id, config] of setNotificationChannelAsync.mock.calls as Array<
      [string, { importance: number }]
    >) {
      expect(config.importance, id).toBe(id === "summary" ? 3 : 4);
    }
  });

  it("deletes the old ids once and never workout_live", () => {
    const deleted = deleteNotificationChannelAsync.mock.calls.map((c) => c[0]);
    expect([...deleted].sort()).toEqual(
      ["account", "checkin", "clients", "coach", "meal", "plan", "workout"].sort(),
    );
    expect(deleted).not.toContain("workout_live");
    expect(deleted).not.toContain("summary");
  });
});
