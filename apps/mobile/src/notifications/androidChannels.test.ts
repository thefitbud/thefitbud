import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
const setNotificationChannelAsync = vi.fn(async () => null);
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync,
  AndroidImportance: { DEFAULT: 3 },
}));

const { ANDROID_CHANNEL_IDS, ensureAndroidNotificationChannels } = await import(
  "./androidChannels"
);
const { PUSH_GROUPS } = await import("./copy");

describe("Android channels (Z12-47)", () => {
  it("has exactly one channel per push group", () => {
    expect([...ANDROID_CHANNEL_IDS].sort()).toEqual(
      PUSH_GROUPS.map((group) => group.channelId).sort(),
    );
  });

  it("creates every channel once", async () => {
    await ensureAndroidNotificationChannels();
    await ensureAndroidNotificationChannels();
    expect(setNotificationChannelAsync).toHaveBeenCalledTimes(ANDROID_CHANNEL_IDS.length);
  });
});
