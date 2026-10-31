import type { PushPayload } from "@fitbud/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePushProviderMode, sendPushToDevice } from "./push-provider.js";

const PAYLOAD: PushPayload = {
  notificationId: "11111111-1111-4111-8111-111111111111",
  notificationType: "checkin_reminder",
  domainEntityType: "checkin",
  domainEntityId: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-10-31T06:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolvePushProviderMode", () => {
  it("keeps expo and fcm, maps anything else to test", () => {
    expect(resolvePushProviderMode("expo")).toBe("expo");
    expect(resolvePushProviderMode("fcm")).toBe("fcm");
    expect(resolvePushProviderMode("test")).toBe("test");
    expect(resolvePushProviderMode(undefined)).toBe("test");
    expect(resolvePushProviderMode(null)).toBe("test");
    expect(resolvePushProviderMode("apns")).toBe("test");
    expect(resolvePushProviderMode("EXPO")).toBe("test");
  });
});

describe("sendPushToDevice", () => {
  it("test double is unchanged and never calls the network", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    const accepted = await sendPushToDevice({ mode: "test", deviceToken: "fcm-test-token-abcdefgh", payload: PAYLOAD });
    expect(accepted.ok).toBe(true);
    expect(accepted.ok && accepted.providerMessageId).toMatch(/^test-fcm-/);
    expect(await sendPushToDevice({ mode: "test", deviceToken: "short", payload: PAYLOAD })).toEqual({
      ok: false,
      failureCategory: "invalid_token",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fcm still returns fcm_not_configured", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    expect(
      await sendPushToDevice({ mode: "fcm", deviceToken: "fcm-test-token-abcdefgh", payload: PAYLOAD }),
    ).toEqual({ ok: false, failureCategory: "fcm_not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("expo returns the ticket id as the provider message id", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => Response.json({ data: [{ status: "ok", id: "ticket-abc" }] }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await sendPushToDevice({
      mode: "expo",
      deviceToken: "ExponentPushToken[abc]",
      payload: PAYLOAD,
      expoAccessToken: "test-expo-access-token",
    });
    expect(result).toEqual({ ok: true, providerMessageId: "ticket-abc" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer test-expo-access-token");
    expect(JSON.parse(String(init!.body))).toEqual([
      { to: "ExponentPushToken[abc]", title: "FitBud", body: "Check-in reminder", data: PAYLOAD, sound: "default" },
    ]);
  });

  it("expo maps a ticket error to its category", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ data: [{ status: "error", message: "x", details: { error: "DeviceNotRegistered" } }] }),
      ),
    );
    expect(
      await sendPushToDevice({ mode: "expo", deviceToken: "ExponentPushToken[abc]", payload: PAYLOAD }),
    ).toEqual({ ok: false, failureCategory: "DeviceNotRegistered" });
  });
});
