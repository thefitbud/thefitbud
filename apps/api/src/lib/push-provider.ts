import type { PushPayload } from "@fitbud/contracts";
import { buildSafePushPayload } from "@fitbud/core";
import { createId } from "./crypto.js";
import { sendExpoPushMessages, type PushDisplayText } from "./expo-push.js";

export type PushProviderMode = "test" | "fcm" | "expo";

/** The one place a configured mode is read. Unknown or unset → `test`. */
export function resolvePushProviderMode(value: string | undefined | null): PushProviderMode {
  return value === "fcm" || value === "expo" ? value : "test";
}

/**
 * Whether the provider's answer to one send is known (D-W3-8, X4i #124).
 *
 * - `answered`: nothing is in flight for that token. Either the provider parsed
 *   the message and refused it, or no request ever left the Worker.
 * - `unknown`: the request's fate is open — timeout, abort, connection reset,
 *   non-2xx or an unparseable body. The push may already be on its way, so a
 *   retry must not send it again.
 *
 * The sender sets this; callers must never re-derive it from `failureCategory`,
 * which cannot carry the distinction (one `provider_error` covers several).
 */
export type PushSendOutcome = "answered" | "unknown";

export type PushSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; outcome: PushSendOutcome; failureCategory: string };

/**
 * `expo`: Expo Push Service (ticket id = provider message id).
 * `test`: local double that records acceptance without calling any provider.
 * `fcm`: kept for compatibility; not configured.
 */
export async function sendPushToDevice(input: {
  mode: PushProviderMode;
  deviceToken: string;
  payload: PushPayload;
  /** Stored display text that replaces the generic lock-screen text (a nudge, Z12-50). */
  display?: PushDisplayText;
  /** Optional Expo access token (Worker secret). Never logged. */
  expoAccessToken?: string;
}): Promise<PushSendResult> {
  if (input.mode === "expo") {
    const message = input.display
      ? { to: input.deviceToken, payload: input.payload, display: input.display }
      : { to: input.deviceToken, payload: input.payload };
    const [result] = await sendExpoPushMessages([message], {
      accessToken: input.expoAccessToken,
    });
    if (result?.ok) return { ok: true, providerMessageId: result.ticketId };
    // A missing result means the request never produced one: fate unknown.
    return result
      ? { ok: false, outcome: result.outcome, failureCategory: result.failureCategory }
      : { ok: false, outcome: "unknown", failureCategory: "provider_error" };
  }
  if (input.mode === "fcm") {
    // No request left the Worker, so nothing is in flight.
    return {
      ok: false,
      outcome: "answered",
      failureCategory: "fcm_not_configured",
    };
  }

  // Test double: accept any non-empty token and return a synthetic provider id.
  if (!input.deviceToken || input.deviceToken.length < 8) {
    // Rejected before any call: nothing is in flight.
    return { ok: false, outcome: "answered", failureCategory: "invalid_token" };
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
