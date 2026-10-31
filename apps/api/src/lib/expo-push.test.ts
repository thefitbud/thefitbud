import type { PushPayload } from "@fitbud/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPO_PUSH_RECEIPTS_URL,
  EXPO_PUSH_SEND_URL,
  EXPO_PUSH_TIMEOUT_MS,
  getExpoPushReceipts,
  sendExpoPushMessages,
} from "./expo-push.js";

const ACCESS = "test-expo-access-token";
const PAYLOAD: PushPayload = {
  notificationId: "11111111-1111-4111-8111-111111111111",
  notificationType: "workout_reminder",
  domainEntityType: "workout_assignment",
  domainEntityId: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-10-31T06:00:00.000Z",
};
const token = (i: number) => `ExponentPushToken[device-${i}]`;

type Call = { url: string; init: RequestInit; body: unknown };

function mockFetch(respond: (body: unknown, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn<typeof fetch>(async (url, init) => {
    const body = JSON.parse(String(init!.body)) as unknown;
    calls.push({ url: String(url), init: init!, body });
    return respond(body, calls.length - 1);
  });
  return { fn, calls };
}

const okTickets = (body: unknown) =>
  Response.json({
    data: (body as unknown[]).map((_, i) => ({ status: "ok", id: `ticket-${i}` })),
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("sendExpoPushMessages", () => {
  it("posts to the Expo send URL with routing data, safe text and sound; no Authorization without a token", async () => {
    const { fn, calls } = mockFetch(okTickets);
    const results = await sendExpoPushMessages([{ to: token(1), payload: PAYLOAD }], { fetchImpl: fn });
    expect(results).toEqual([{ ok: true, ticketId: "ticket-0" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://exp.host/--/api/v2/push/send");
    expect(calls[0]!.url).toBe(EXPO_PUSH_SEND_URL);
    expect(calls[0]!.init.method).toBe("POST");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers).not.toHaveProperty("Authorization");
    expect(calls[0]!.body).toEqual([
      { to: token(1), title: "FitBud", body: "Workout reminder", data: PAYLOAD, sound: "default" },
    ]);
  });

  it("sends Authorization: Bearer <token> only when the access token is set", async () => {
    const { fn, calls } = mockFetch(okTickets);
    await sendExpoPushMessages([{ to: token(1), payload: PAYLOAD }], { fetchImpl: fn, accessToken: ACCESS });
    await sendExpoPushMessages([{ to: token(1), payload: PAYLOAD }], { fetchImpl: fn, accessToken: "  " });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS}`);
    expect(calls[1]!.init.headers as Record<string, string>).not.toHaveProperty("Authorization");
  });

  it("chunks at 100 messages per request and keeps input order", async () => {
    const { fn, calls } = mockFetch((body, index) =>
      Response.json({
        data: (body as unknown[]).map((_, i) => ({ status: "ok", id: `t-${index}-${i}` })),
      }),
    );
    const messages = Array.from({ length: 250 }, (_, i) => ({ to: token(i), payload: PAYLOAD }));
    const results = await sendExpoPushMessages(messages, { fetchImpl: fn });
    expect(calls.map((c) => (c.body as unknown[]).length)).toEqual([100, 100, 50]);
    expect((calls[2]!.body as Array<{ to: string }>)[0]!.to).toBe(token(200));
    expect(results).toHaveLength(250);
    expect(results[0]).toEqual({ ok: true, ticketId: "t-0-0" });
    expect(results[100]).toEqual({ ok: true, ticketId: "t-1-0" });
    expect(results[249]).toEqual({ ok: true, ticketId: "t-2-49" });
  });

  it("maps ticket errors to failure categories", async () => {
    const { fn } = mockFetch(() =>
      Response.json({
        data: [
          { status: "ok", id: "ticket-ok" },
          { status: "error", message: `"${token(2)}" is not registered`, details: { error: "DeviceNotRegistered" } },
          { status: "error", message: "too big", details: { error: "MessageTooBig" } },
          { status: "error", message: "creds", details: { error: "InvalidCredentials" } },
          { status: "error", message: "rate", details: { error: "MessageRateExceeded" } },
          { status: "error", message: "no details" },
          { status: "ok" },
        ],
      }),
    );
    const results = await sendExpoPushMessages(
      Array.from({ length: 8 }, (_, i) => ({ to: token(i), payload: PAYLOAD })),
      { fetchImpl: fn },
    );
    expect(results).toEqual([
      { ok: true, ticketId: "ticket-ok" },
      { ok: false, failureCategory: "DeviceNotRegistered" },
      { ok: false, failureCategory: "MessageTooBig" },
      { ok: false, failureCategory: "InvalidCredentials" },
      { ok: false, failureCategory: "provider_error" },
      { ok: false, failureCategory: "provider_error" },
      { ok: false, failureCategory: "provider_error" },
      // Missing ticket for the 8th message.
      { ok: false, failureCategory: "provider_error" },
    ]);
  });

  it("a non-2xx response, a network error or a bad body maps every message to provider_error", async () => {
    for (const respond of [
      () => new Response("{}", { status: 500 }),
      () => new Response("{}", { status: 401 }),
      () => new Response("not json", { status: 200 }),
      () => {
        throw new TypeError(`network down ${ACCESS}`);
      },
    ]) {
      const { fn } = mockFetch(respond);
      const results = await sendExpoPushMessages(
        [
          { to: token(1), payload: PAYLOAD },
          { to: token(2), payload: PAYLOAD },
        ],
        { fetchImpl: fn, accessToken: ACCESS },
      );
      expect(results).toEqual([
        { ok: false, failureCategory: "provider_error" },
        { ok: false, failureCategory: "provider_error" },
      ]);
    }
  });

  it("times out after 10 s as provider_error", async () => {
    vi.useFakeTimers();
    const fn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const pending = sendExpoPushMessages([{ to: token(1), payload: PAYLOAD }], { fetchImpl: fn });
    await vi.advanceTimersByTimeAsync(EXPO_PUSH_TIMEOUT_MS - 1);
    expect(fn.mock.calls[0]![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(EXPO_PUSH_TIMEOUT_MS).toBe(10_000);
    await expect(pending).resolves.toEqual([{ ok: false, failureCategory: "provider_error" }]);
  });

  it("never logs", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m));
    const { fn } = mockFetch(() => {
      throw new Error(`boom ${ACCESS} ${token(1)}`);
    });
    await sendExpoPushMessages([{ to: token(1), payload: PAYLOAD }], { fetchImpl: fn, accessToken: ACCESS });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });
});

describe("getExpoPushReceipts", () => {
  it("posts ids to the receipts URL in chunks of 1,000 and maps receipts", async () => {
    const { fn, calls } = mockFetch((body) => {
      const ids = (body as { ids: string[] }).ids;
      const data: Record<string, unknown> = {};
      for (const id of ids) {
        if (id === "id-1") data[id] = { status: "error", details: { error: "DeviceNotRegistered" } };
        else if (id === "id-2") data[id] = { status: "error", details: { error: "MessageRateExceeded" } };
        else if (id !== "id-3") data[id] = { status: "ok" };
      }
      return Response.json({ data });
    });
    const ids = Array.from({ length: 2_500 }, (_, i) => `id-${i}`);
    const receipts = await getExpoPushReceipts(ids, { fetchImpl: fn, accessToken: ACCESS });
    expect(calls.map((c) => c.url)).toEqual([EXPO_PUSH_RECEIPTS_URL, EXPO_PUSH_RECEIPTS_URL, EXPO_PUSH_RECEIPTS_URL]);
    expect(EXPO_PUSH_RECEIPTS_URL).toBe("https://exp.host/--/api/v2/push/getReceipts");
    expect(calls.map((c) => (c.body as { ids: string[] }).ids.length)).toEqual([1_000, 1_000, 500]);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS}`);
    expect(receipts.get("id-0")).toEqual({ ok: true });
    expect(receipts.get("id-1")).toEqual({ ok: false, failureCategory: "DeviceNotRegistered" });
    expect(receipts.get("id-2")).toEqual({ ok: false, failureCategory: "provider_error" });
    expect(receipts.has("id-3")).toBe(false);
    expect(receipts.size).toBe(2_499);
  });

  it("a failed request leaves its ids out", async () => {
    const { fn } = mockFetch(() => new Response("{}", { status: 503 }));
    const receipts = await getExpoPushReceipts(["a", "b"], { fetchImpl: fn });
    expect(receipts.size).toBe(0);
  });
});
