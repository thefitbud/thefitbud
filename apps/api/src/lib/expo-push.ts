/**
 * Expo Push Service sender (D-W2-9). Expo forwards to APNs / FCM with the
 * credentials uploaded to EAS; the Worker never holds APNs or FCM keys.
 *
 * Never put the access token, a device token or message text into an error or
 * a log line. Acceptance (a ticket id) is not delivery.
 */

import type { PushPayload } from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";

export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
export const EXPO_PUSH_TIMEOUT_MS = 10_000;
export const EXPO_SEND_CHUNK_SIZE = 100;
export const EXPO_RECEIPT_CHUNK_SIZE = 1_000;

export type ExpoFailureCategory =
  | "DeviceNotRegistered"
  | "MessageTooBig"
  | "InvalidCredentials"
  | "provider_error";

export type ExpoTicketResult =
  | { ok: true; ticketId: string }
  | { ok: false; failureCategory: ExpoFailureCategory };

export type ExpoReceiptResult = { ok: true } | { ok: false; failureCategory: ExpoFailureCategory };

export type ExpoPushMessage = {
  to: string;
  payload: PushPayload;
};

export type ExpoClientOptions = {
  accessToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const KNOWN_ERRORS = new Set<ExpoFailureCategory>([
  "DeviceNotRegistered",
  "MessageTooBig",
  "InvalidCredentials",
]);

function categoryFor(value: unknown): ExpoFailureCategory {
  const error =
    value && typeof value === "object"
      ? (value as { details?: { error?: unknown } }).details?.error
      : undefined;
  return typeof error === "string" && KNOWN_ERRORS.has(error as ExpoFailureCategory)
    ? (error as ExpoFailureCategory)
    : "provider_error";
}

/**
 * Lock-screen text: the app name and the notification type label only. It
 * carries no coaching detail (final copy is X4c, W3).
 */
export function expoNotificationText(payload: PushPayload): { title: string; body: string } {
  return { title: "FitBud", body: labelFor("notification_type", payload.notificationType) };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function headers(accessToken: string | undefined): Record<string, string> {
  const result: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const token = accessToken?.trim();
  if (token) {
    result.Authorization = `Bearer ${token}`;
  }
  return result;
}

/** One POST with a timeout. Resolves to parsed JSON, or null on any failure. */
async function postJson(url: string, body: unknown, options: ExpoClientOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? EXPO_PUSH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: headers(options.accessToken),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return (await response.json()) as unknown;
  } catch {
    // Timeout, network error or invalid JSON. Drop the cause: it may echo the request.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends messages in requests of at most 100. Returns one result per message,
 * in input order. A failed request maps every message in it to `provider_error`.
 */
export async function sendExpoPushMessages(
  messages: readonly ExpoPushMessage[],
  options: ExpoClientOptions = {},
): Promise<ExpoTicketResult[]> {
  const results: ExpoTicketResult[] = [];
  for (const part of chunk(messages, EXPO_SEND_CHUNK_SIZE)) {
    const body = part.map((message) => ({
      to: message.to,
      ...expoNotificationText(message.payload),
      data: message.payload,
      sound: "default",
    }));
    const json = await postJson(EXPO_PUSH_SEND_URL, body, options);
    const tickets = (json as { data?: unknown } | null)?.data;
    for (let i = 0; i < part.length; i += 1) {
      const ticket = Array.isArray(tickets) ? (tickets[i] as Record<string, unknown> | undefined) : undefined;
      if (ticket?.status === "ok" && typeof ticket.id === "string" && ticket.id) {
        results.push({ ok: true, ticketId: ticket.id });
      } else if (ticket?.status === "error") {
        results.push({ ok: false, failureCategory: categoryFor(ticket) });
      } else {
        results.push({ ok: false, failureCategory: "provider_error" });
      }
    }
  }
  return results;
}

/**
 * Fetches receipts in requests of at most 1,000 ids. Ids Expo has no receipt
 * for yet (or whose request failed) are absent from the map.
 */
export async function getExpoPushReceipts(
  ticketIds: readonly string[],
  options: ExpoClientOptions = {},
): Promise<Map<string, ExpoReceiptResult>> {
  const results = new Map<string, ExpoReceiptResult>();
  for (const part of chunk(ticketIds, EXPO_RECEIPT_CHUNK_SIZE)) {
    const json = await postJson(EXPO_PUSH_RECEIPTS_URL, { ids: part }, options);
    const data = (json as { data?: unknown } | null)?.data;
    if (!data || typeof data !== "object") continue;
    for (const id of part) {
      const receipt = (data as Record<string, unknown>)[id] as Record<string, unknown> | undefined;
      if (receipt?.status === "ok") {
        results.set(id, { ok: true });
      } else if (receipt?.status === "error") {
        results.set(id, { ok: false, failureCategory: categoryFor(receipt) });
      }
    }
  }
  return results;
}
