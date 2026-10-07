import type { PushPayload } from "@fitbud/contracts";
import { buildSafePushPayload } from "@fitbud/core";
import { createId } from "./crypto.js";

export type PushProviderMode = "test" | "fcm";

export type PushSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; failureCategory: string };

/**
 * Local/test FCM double. Records acceptance without calling production Firebase.
 * Production FCM credentials must never be committed; wire AUTH_MODE=firebase later.
 */
export async function sendPushToDevice(input: {
  mode: PushProviderMode;
  deviceToken: string;
  payload: PushPayload;
}): Promise<PushSendResult> {
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
