import type { FitBudApiClient } from "@fitbud/api-client";
import type { DeviceTokenPlatform, DeviceTokenProvider } from "@fitbud/contracts";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { localInstallationId } from "./routing";

/**
 * Device-token registration for push (X4e).
 *
 * Real builds send the Expo push token with `provider: "expo"` (D-W3-2);
 * AUTH_MODE=test sessions, Expo web and a build without an EAS project id keep
 * the synthetic local token so local development never needs push credentials.
 *
 * The push token itself is never logged or returned to callers: it lives only
 * in this module and in the request body.
 */

export type PushRegistration = {
  deviceTokenId: string;
  provider: DeviceTokenProvider;
  installationId: string;
  platform: DeviceTokenPlatform;
};

export type PushRegistrationOutcome =
  | { status: "registered"; registration: PushRegistration }
  | { status: "permission_denied" }
  /** Expo web, or a build with no EAS project id: no Expo push token exists. */
  | { status: "unsupported" }
  /** 403 DEVICE_TOKEN_OWNED — this token belongs to another FitBud user. */
  | { status: "rejected" }
  | { status: "failed" };

type RegisterOptions = {
  /** `true` keeps the synthetic token path (AUTH_MODE=test sessions). */
  testMode?: boolean;
  platform?: DeviceTokenPlatform;
};

type ExpoNotificationsModule = {
  getPermissionsAsync: () => Promise<{
    granted: boolean;
    canAskAgain: boolean;
  }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  getExpoPushTokenAsync: (options: {
    projectId: string;
  }) => Promise<{ data: string }>;
  addPushTokenListener: (listener: () => void) => { remove: () => void };
};

/** Loaded lazily: the native module must not be required on Expo web. */
async function loadNotifications(): Promise<ExpoNotificationsModule> {
  return (await import("expo-notifications")) as unknown as ExpoNotificationsModule;
}

/** In-memory only. Never logged, never handed to callers. */
let registeredToken: string | null = null;
let registration: PushRegistration | null = null;
/** Set after a 403 so a refused token is not retried in a loop. */
let refusedToken: string | null = null;
let tokenWatch: { remove: () => void } | null = null;

export function currentPushRegistration(): PushRegistration | null {
  return registration;
}

/** Clears in-memory push state and stops the token watch (sign-out, tests). */
export function resetPushRegistration(): void {
  tokenWatch?.remove();
  tokenWatch = null;
  registeredToken = null;
  registration = null;
  refusedToken = null;
}

function defaultPlatform(): DeviceTokenPlatform {
  return Platform.OS === "android"
    ? "android"
    : Platform.OS === "web"
      ? "web"
      : "ios";
}

/** EAS project id, written into `extra.eas.projectId` by `eas init` (X6/X3). */
export function expoProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: unknown } }
    | undefined;
  const projectId = extra?.eas?.projectId;
  return typeof projectId === "string" && projectId.length > 0
    ? projectId
    : null;
}

/**
 * Stable installation id derived from the push token. Native keeps nothing on
 * disk (D-W2-13), so the Expo token — stable per installation and project — is
 * the only durable installation identity available. Hashed so the token itself
 * never leaves this module in a second field.
 */
export function installationIdForToken(token: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193) >>> 0;
    hashB = Math.imul(hashB + code, 0x85ebca6b) >>> 0;
  }
  const hex = `${hashA.toString(16).padStart(8, "0")}${hashB
    .toString(16)
    .padStart(8, "0")}`;
  return `expo-${hex}`;
}

function syntheticToken(): string {
  return `local-test-fcm-${localInstallationId()}`;
}

async function sendRegistration(
  api: FitBudApiClient,
  input: {
    token: string;
    provider: DeviceTokenProvider;
    platform: DeviceTokenPlatform;
    installationId: string;
  },
): Promise<PushRegistrationOutcome> {
  if (refusedToken === input.token) {
    // Already refused once for this signed-in user — do not retry.
    return { status: "rejected" };
  }
  try {
    const result = await api.registerDeviceToken({
      provider: input.provider,
      platform: input.platform,
      token: input.token,
      installationId: input.installationId,
    });
    registeredToken = input.token;
    registration = {
      deviceTokenId: result.deviceToken.id,
      provider: input.provider,
      installationId: input.installationId,
      platform: input.platform,
    };
    return { status: "registered", registration };
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    if (status === 403) {
      // DEVICE_TOKEN_OWNED: the token is registered to a different user and
      // that row is never released. Stop trying; push stays off for this
      // install until the token changes or the other user signs out of it.
      refusedToken = input.token;
      return { status: "rejected" };
    }
    return { status: "failed" };
  }
}

/**
 * Register the device for push. Safe to call on every `/me`: a token that is
 * already registered is re-sent only to refresh `lastSeenAt` once per token.
 */
export async function registerDeviceTokenForPush(
  api: FitBudApiClient,
  options: RegisterOptions = {},
): Promise<PushRegistrationOutcome> {
  const platform = options.platform ?? defaultPlatform();

  if (options.testMode || platform === "web") {
    return sendRegistration(api, {
      token: syntheticToken(),
      provider: "fcm",
      platform,
      installationId: localInstallationId(),
    });
  }

  const projectId = expoProjectId();
  if (!projectId) {
    // No `eas init` yet (X6/X3): keep the synthetic path instead of failing.
    return sendRegistration(api, {
      token: syntheticToken(),
      provider: "fcm",
      platform,
      installationId: localInstallationId(),
    });
  }

  let token: string;
  try {
    const notifications = await loadNotifications();
    const current = await notifications.getPermissionsAsync();
    if (!current.granted) {
      if (!current.canAskAgain) return { status: "permission_denied" };
      const asked = await notifications.requestPermissionsAsync();
      if (!asked.granted) return { status: "permission_denied" };
    }
    const result = await notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch {
    // Permission or token lookup failed (no dev build, no network, simulator).
    return { status: "failed" };
  }
  if (!token) return { status: "failed" };

  return sendRegistration(api, {
    token,
    provider: "expo",
    platform,
    installationId: installationIdForToken(token),
  });
}

/**
 * Re-register once when the device push token changes. Returns a stop function;
 * calling it twice is safe.
 */
export async function watchPushTokenChanges(
  api: FitBudApiClient,
  options: RegisterOptions = {},
): Promise<() => void> {
  if (options.testMode || defaultPlatform() === "web" || !expoProjectId()) {
    return () => undefined;
  }
  if (tokenWatch) return () => resetTokenWatch();
  let notifications: ExpoNotificationsModule;
  try {
    notifications = await loadNotifications();
  } catch {
    return () => undefined;
  }
  let inFlight = false;
  tokenWatch = notifications.addPushTokenListener(() => {
    if (inFlight) return;
    inFlight = true;
    void (async () => {
      try {
        const projectId = expoProjectId();
        if (!projectId) return;
        const next = await notifications.getExpoPushTokenAsync({ projectId });
        // One re-register per distinct token.
        if (!next.data || next.data === registeredToken) return;
        const previous = registeredToken;
        const outcome = await sendRegistration(api, {
          token: next.data,
          provider: "expo",
          platform: options.platform ?? defaultPlatform(),
          installationId: installationIdForToken(next.data),
        });
        if (outcome.status === "registered" && previous) {
          // Best-effort: the rotated-out token can never be delivered to.
          await api.revokeDeviceToken({ token: previous }).catch(() => undefined);
        }
      } catch {
        // Best-effort: the next token change or sign-in retries.
      } finally {
        inFlight = false;
      }
    })();
  });
  return () => resetTokenWatch();
}

function resetTokenWatch(): void {
  tokenWatch?.remove();
  tokenWatch = null;
}

/**
 * Unregister this installation's device token. Best-effort: never throws, so it
 * can never block sign-out.
 */
export async function unregisterDeviceTokenForPush(
  api: FitBudApiClient,
  installationId?: string,
): Promise<boolean> {
  const id = installationId ?? registration?.installationId;
  resetPushRegistration();
  if (!id) return false;
  try {
    const result = await api.revokeDeviceToken({ installationId: id });
    return result.revoked > 0;
  } catch {
    return false;
  }
}

/**
 * Register a device token for push. Uses a local synthetic FCM token in
 * AUTH_MODE=test — never requires production Firebase credentials.
 */
export async function registerLocalDeviceToken(
  api: FitBudApiClient,
  options: { platform?: DeviceTokenPlatform } = {},
): Promise<string> {
  const result = await api.registerDeviceToken({
    provider: "fcm",
    platform: options.platform ?? "ios",
    token: syntheticToken(),
    installationId: localInstallationId(),
  });
  return result.deviceToken.id;
}

/**
 * Handle a notification open: return a deep link for navigation.
 * Callers must refetch domain state after routing — payload is not authoritative.
 */
export { deepLinkFromNotificationPayload } from "./routing";
