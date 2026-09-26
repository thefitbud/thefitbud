import type { FitBudApiClient } from "@fitbud/api-client";
import { localInstallationId } from "./routing";

/**
 * Register a device token for push. Uses a local synthetic FCM token in
 * AUTH_MODE=test — never requires production Firebase credentials.
 */
export async function registerLocalDeviceToken(
  api: FitBudApiClient,
  options: { platform?: "ios" | "android" | "web" } = {},
): Promise<string> {
  const result = await api.registerDeviceToken({
    provider: "fcm",
    platform: options.platform ?? "ios",
    token: `local-test-fcm-${localInstallationId()}`,
    installationId: localInstallationId(),
  });
  return result.deviceToken.id;
}

/**
 * Handle a notification open: return a deep link for navigation.
 * Callers must refetch domain state after routing — payload is not authoritative.
 */
export { deepLinkFromNotificationPayload } from "./routing";
