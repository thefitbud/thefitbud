import { describe, expect, it, vi } from "vitest";

const setNotificationHandler = vi.fn();
vi.mock("expo-notifications", () => ({ setNotificationHandler }));

const { foregroundPresentation, installForegroundNotificationHandler } = await import(
  "./foregroundHandler"
);

describe("foreground notification handler (Z14-6)", () => {
  it("shows a banner and a sound for a reminder pushed while the app is open", () => {
    expect(foregroundPresentation({ type: "meal_reminder" })).toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
    });
    expect(foregroundPresentation({ type: "activity_nudge" }).shouldPlaySound).toBe(true);
  });

  it("shows the daily summary silently, and still shows a push with no data", () => {
    expect(foregroundPresentation({ type: "daily_summary" })).toMatchObject({
      shouldShowBanner: true,
      shouldPlaySound: false,
    });
    expect(foregroundPresentation(undefined).shouldShowBanner).toBe(true);
  });

  it("installs once and answers through the same rule", async () => {
    installForegroundNotificationHandler();
    installForegroundNotificationHandler();
    expect(setNotificationHandler).toHaveBeenCalledTimes(1);
    const { handleNotification } = setNotificationHandler.mock.calls[0]![0] as {
      handleNotification: (n: unknown) => Promise<{ shouldPlaySound: boolean }>;
    };
    const result = await handleNotification({
      request: { content: { data: { type: "daily_summary" } } },
    });
    expect(result.shouldPlaySound).toBe(false);
  });
});
