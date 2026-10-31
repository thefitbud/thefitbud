import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const unauthenticated = {
  error: { code: "UNAUTHENTICATED", message: "Authentication required.", requestId: "req-1" },
};

const invitation = {
  id: "00000000-0000-4000-8000-000000000001",
  trainerUserId: "00000000-0000-4000-8000-000000000002",
  recipientEmail: "priya.client@demo.fitbud.test",
  recipientDisplayName: "Priya",
  recipientWhatsappE164: null,
  status: "revoked",
  expiresAt: "2026-11-10T00:00:00.000Z",
  acceptedUserId: null,
  coachingRelationshipId: null,
  onboardingFormTemplateVersionId: "11111111-1111-4111-8111-111111111111",
  onboardingStatus: "invited",
  createdAt: "2026-10-26T00:00:00.000Z",
  updatedAt: "2026-10-31T00:00:00.000Z",
};

type Call = { url: string; method: string; auth: string | null; idem: string | null; body: string };

let storage: Storage;
let calls: Call[];

function stubApi(handler: (call: Call) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const call = {
        url: String(input),
        method: init?.method ?? "GET",
        auth: headers.get("Authorization"),
        idem: headers.get("Idempotency-Key"),
        body: typeof init?.body === "string" ? init.body : "",
      };
      calls.push(call);
      return handler(call);
    }),
  );
}

function signedIn() {
  storage.setItem("fitbud.trainer.accessToken", "stale-id-token");
  storage.setItem("fitbud.trainer.refreshToken", "refresh-1");
  storage.setItem("fitbud.trainer.accessTokenExpiresAt", String(Date.now() - 1000));
  storage.setItem("fitbud.trainer.email", "rahul.coach@demo.fitbud.test");
}

describe("http-api", () => {
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("unwraps { data } before schema parse for templates", async () => {
    storage.setItem("fitbud.trainer.accessToken", "test-token");
    const payload = {
      data: {
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            ownership: "trainer",
            trainerUserId: "22222222-2222-4222-8222-222222222222",
            title: "Demo strength block",
            templateType: "workout",
            recordVersion: 0,
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
    };
    stubApi(() => json(200, payload));

    const { listPlanTemplatesExtended } = await import("./http-api.js");
    const result = await listPlanTemplatesExtended();
    expect(result.items[0]?.title).toBe("Demo strength block");
  });

  it("refreshes once on 401, stores the new tokens and retries with the same Idempotency-Key", async () => {
    signedIn();
    stubApi((call) => {
      if (call.url.endsWith("/auth/refresh")) {
        return json(200, {
          data: {
            token: "fresh-id-token",
            tokenKind: "firebase_id_token",
            refreshToken: "refresh-2",
            expiresIn: 3600,
          },
        });
      }
      if (call.auth === "Bearer fresh-id-token") return json(200, { data: invitation });
      return json(401, unauthenticated);
    });

    const { revokeInvitation } = await import("./http-api.js");
    const result = await revokeInvitation(invitation.id, "idem-revoke-1");

    expect(result.status).toBe("revoked");
    expect(calls.map((c) => [c.method, c.url.replace(/^.*\/api/, ""), c.auth])).toEqual([
      ["POST", `/invitations/${invitation.id}/revoke`, "Bearer stale-id-token"],
      ["POST", "/auth/refresh", null],
      ["POST", `/invitations/${invitation.id}/revoke`, "Bearer fresh-id-token"],
    ]);
    expect(calls[0]?.idem).toBe("idem-revoke-1");
    expect(calls[2]?.idem).toBe("idem-revoke-1");
    // Refresh token travels in the body only, never in a URL.
    expect(JSON.parse(calls[1]!.body)).toEqual({ refreshToken: "refresh-1" });
    expect(calls.some((c) => c.url.includes("refresh-1"))).toBe(false);
    expect(storage.getItem("fitbud.trainer.accessToken")).toBe("fresh-id-token");
    expect(storage.getItem("fitbud.trainer.refreshToken")).toBe("refresh-2");
    expect(Number(storage.getItem("fitbud.trainer.accessTokenExpiresAt"))).toBeGreaterThan(
      Date.now() + 3_500_000,
    );
  });

  it("the shared apiClient refreshes on 401 and retries once", async () => {
    signedIn();
    stubApi((call) => {
      if (call.url.endsWith("/auth/refresh")) {
        return json(200, {
          data: {
            token: "fresh-id-token",
            tokenKind: "firebase_id_token",
            refreshToken: "refresh-2",
            expiresIn: 3600,
          },
        });
      }
      if (call.auth === "Bearer fresh-id-token") {
        return json(200, { data: { id: invitation.id } });
      }
      return json(401, unauthenticated);
    });

    const { apiClient } = await import("./api.js");
    await expect(
      apiClient.request("GET", "/probe", { parse: (v: unknown) => v }, { auth: true }),
    ).resolves.toEqual({ id: invitation.id });
    expect(calls.map((c) => c.auth)).toEqual([
      "Bearer stale-id-token",
      null,
      "Bearer fresh-id-token",
    ]);
    (await import("./api.js")).cancelTokenRefresh();
  });

  it("clears the session and signs out when the refresh token is refused", async () => {
    signedIn();
    stubApi((call) => {
      if (call.url.endsWith("/auth/refresh")) {
        return json(401, {
          error: {
            code: "AUTH_REFRESH_FAILED",
            message: "Session expired. Sign in again.",
            requestId: "req-2",
          },
        });
      }
      return json(401, unauthenticated);
    });

    const api = await import("./api.js");
    const onExpired = vi.fn();
    api.setSessionExpiredListener(onExpired);
    const { revokeInvitation } = await import("./http-api.js");

    const err = await revokeInvitation(invitation.id, "idem-revoke-2").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).not.toContain("refresh-1");
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(storage.getItem("fitbud.trainer.accessToken")).toBeNull();
    expect(storage.getItem("fitbud.trainer.refreshToken")).toBeNull();
    expect(storage.getItem("fitbud.trainer.accessTokenExpiresAt")).toBeNull();
    // No retry of the original request after a refused refresh.
    expect(calls.filter((c) => c.url.includes("/revoke"))).toHaveLength(1);
  });

  it("keeps the session when refresh fails only because the network is down", async () => {
    signedIn();
    stubApi((call) => {
      if (call.url.endsWith("/auth/refresh")) throw new TypeError("Failed to fetch");
      return json(401, unauthenticated);
    });

    const api = await import("./api.js");
    const onExpired = vi.fn();
    api.setSessionExpiredListener(onExpired);
    const { revokeInvitation } = await import("./http-api.js");

    await expect(revokeInvitation(invitation.id, "idem-revoke-3")).rejects.toBeInstanceOf(Error);
    expect(onExpired).not.toHaveBeenCalled();
    expect(storage.getItem("fitbud.trainer.refreshToken")).toBe("refresh-1");
    api.cancelTokenRefresh();
  });

  it("does not call /auth/refresh in test mode (no refresh token)", async () => {
    storage.setItem("fitbud.trainer.accessToken", "test-token");
    stubApi(() => json(401, unauthenticated));

    const { revokeInvitation } = await import("./http-api.js");
    await expect(revokeInvitation(invitation.id, "idem-revoke-4")).rejects.toBeInstanceOf(Error);
    expect(calls.map((c) => c.url)).not.toContainEqual(expect.stringContaining("/auth/refresh"));
    expect(calls).toHaveLength(1);
  });

  it("refreshes about 60 s before the ID token expires", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    storage.setItem("fitbud.trainer.accessToken", "id-1");
    storage.setItem("fitbud.trainer.refreshToken", "refresh-1");
    storage.setItem("fitbud.trainer.accessTokenExpiresAt", String(now + 3_600_000));
    stubApi(() =>
      json(200, {
        data: {
          token: "id-2",
          tokenKind: "firebase_id_token",
          refreshToken: "refresh-2",
          expiresIn: 3600,
        },
      }),
    );

    const api = await import("./api.js");
    api.scheduleTokenRefresh(now);

    await vi.advanceTimersByTimeAsync(3_600_000 - 61_000);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls.map((c) => c.url)).toEqual([expect.stringMatching(/\/auth\/refresh$/)]);
    expect(storage.getItem("fitbud.trainer.accessToken")).toBe("id-2");
    api.cancelTokenRefresh();
  });

  it("schedules nothing in test mode", async () => {
    vi.useFakeTimers();
    storage.setItem("fitbud.trainer.accessToken", "test-token");
    stubApi(() => json(500, {}));

    const api = await import("./api.js");
    api.scheduleTokenRefresh();
    await vi.advanceTimersByTimeAsync(10 * 3_600_000);
    expect(calls).toHaveLength(0);
  });
});
