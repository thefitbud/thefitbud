import { beforeEach, describe, expect, it, vi } from "vitest";

const haptics = vi.hoisted(() => ({
  notificationAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

const rn = vi.hoisted(() => ({
  vibrate: vi.fn(),
  check: vi.fn(async () => true),
  platform: "ios" as string,
}));

vi.mock("expo-haptics", () => haptics);

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return rn.platform;
    },
  },
  Vibration: { vibrate: rn.vibrate },
  PermissionsAndroid: { check: rn.check },
}));

const {
  restEndHaptic,
  setLoggedHaptic,
  prMomentHaptic,
  REST_END_PATTERN,
} = await import("./haptics");

beforeEach(() => {
  rn.platform = "ios";
  rn.vibrate.mockClear();
  rn.check.mockClear();
  rn.check.mockResolvedValue(true);
  haptics.notificationAsync.mockClear();
  haptics.impactAsync.mockClear();
  haptics.notificationAsync.mockResolvedValue(undefined);
  haptics.impactAsync.mockResolvedValue(undefined);
});

describe("workout haptics (Z12-57)", () => {
  it("restEndHaptic uses expo-haptics notification + impact", async () => {
    restEndHaptic();
    await Promise.resolve();
    await Promise.resolve();
    expect(haptics.notificationAsync).toHaveBeenCalledWith("warning");
    expect(haptics.impactAsync).toHaveBeenCalledWith("medium");
    expect(rn.vibrate).not.toHaveBeenCalled();
  });

  it("setLoggedHaptic uses a light impact", async () => {
    setLoggedHaptic();
    await Promise.resolve();
    expect(haptics.impactAsync).toHaveBeenCalledWith("light");
  });

  it("prMomentHaptic uses a success notification", async () => {
    prMomentHaptic();
    await Promise.resolve();
    expect(haptics.notificationAsync).toHaveBeenCalledWith("success");
  });

  it("falls back to Vibration when expo-haptics rejects", async () => {
    haptics.notificationAsync.mockRejectedValueOnce(new Error("no haptic"));
    restEndHaptic();
    await Promise.resolve();
    await Promise.resolve();
    expect(rn.vibrate).toHaveBeenCalledWith(REST_END_PATTERN);
  });

  it("Android Vibration fallback checks VIBRATE before buzzing", async () => {
    rn.platform = "android";
    haptics.impactAsync.mockRejectedValueOnce(new Error("no haptic"));
    setLoggedHaptic();
    await Promise.resolve();
    await Promise.resolve();
    expect(rn.check).toHaveBeenCalled();
    expect(rn.vibrate).toHaveBeenCalledWith([0, 40]);
  });

  it("Android Vibration fallback stays silent without VIBRATE", async () => {
    rn.platform = "android";
    rn.check.mockResolvedValueOnce(false);
    haptics.notificationAsync.mockRejectedValueOnce(new Error("no haptic"));
    prMomentHaptic();
    await Promise.resolve();
    await Promise.resolve();
    expect(rn.vibrate).not.toHaveBeenCalled();
  });
});
