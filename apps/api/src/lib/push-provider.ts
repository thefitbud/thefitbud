import type { PushPayload } from "@fitbud/contracts";
import { buildSafePushPayload } from "@fitbud/core";
import { createId } from "./crypto.js";
import { sendExpoPushMessages } from "./expo-push.js";

export type PushProviderMode = "test" | "fcm" | "expo";

/** The one place a configured mode is read. Unknown or unset → `test`. */
export function resolvePushProviderMode(value: string | undefined | null): PushProviderMode {
  return value === "fcm" || value === "expo" ? value : "test";
}

export type PushSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; failureCategory: string };

/**
 * `expo`: Expo Push Service (ticket id = provider message id).
 * `test`: local double that records acceptance without calling any provider.
 * `fcm`: kept for compatibility; not configured.
 */
export async function sendPushToDevice(input: {
  mode: PushProviderMode;
  deviceToken: string;
  payload: PushPayload;
  /** Optional Expo access token (Worker secret). Never logged. */
  expoAccessToken?: string;
}): Promise<PushSendResult> {
  if (input.mode === "expo") {
    const [result] = await sendExpoPushMessages([{ to: input.deviceToken, payload: input.payload }], {
      accessToken: input.expoAccessToken,
    });
    return result?.ok
      ? { ok: true, providerMessageId: result.ticketId }
      : { ok: false, failureCategory: result?.failureCategory ?? "provider_error" };
  }
  if (input.mode === "fcm") {
    return {
      ok: false,
      failureCategory: "fcm_not_configured",
    };
  }

  // Test double: accept any non-empty token and return a synthetic provider id.
  if (!input.deviceToken || input.deviceToken.length < 8) {
    return { ok: false, failureCategory: "invalid_token" };
  }

  return {
    ok: true,
    providerMessageId: `test-fcm-${createId()}`,
  };
}

export function routingPayloadForNotification(input: {
  notificationId: string;
  notificationType: PushPayload["notificationType"];
  domainEntityType: PushPayload["domainEntityType"];
  domainEntityId: string;
  createdAt: string;
}): PushPayload {
  return buildSafePushPayload(input);
}
