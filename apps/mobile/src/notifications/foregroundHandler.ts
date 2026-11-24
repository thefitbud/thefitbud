import * as Notifications from "expo-notifications";

/**
 * A push that arrives while the app is open (Z14-6, diagnosis #10): shown as
 * the system banner and added to the list, never dropped. Reminders and coach
 * reminders play a sound; the daily summary is silent.
 */
export function foregroundPresentation(data: unknown): {
  shouldShowAlert: boolean;
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
} {
  const type =
    data && typeof data === "object" && "type" in data
      ? (data as { type?: unknown }).type
      : undefined;
  return {
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: type !== "daily_summary",
    shouldSetBadge: false,
  };
}

let installed = false;

/** Set once at startup (App.tsx). Safe to call again. */
export function installForegroundNotificationHandler(): void {
  if (installed) return;
  installed = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) =>
      foregroundPresentation(notification.request.content.data),
  });
}
