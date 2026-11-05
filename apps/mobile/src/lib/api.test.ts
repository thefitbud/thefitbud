import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
}));

import { ApiClientError } from "@fitbud/api-client";
import {
  DEFAULT_API_BASE_URL,
  REFRESH_LEAD_MS,
  createMobileApiClient,
  createTokenSession,
  isForegroundAppState,
  pickSessionRefresh,
  resolveApiBaseUrl,
  type TokenState,
} from "./api";

describe("resolveApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses EXPO_PUBLIC_API_BASE_URL when it is set", () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api-staging.thefitbud.com/");
    expect(resolveApiBaseUrl()).toBe("https://api-staging.thefitbud.com");
  });

  it("falls back to the local Wrangler default when it is unset", () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", undefined);
    expect(resolveApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
  });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const unauthenticated = {
  error: { code: "UNAUTHENTICATED", message: "Authentication required.", requestId: "req-1" },
};

const refused = {
  error: { code: "AUTH_REFRESH_FAILED", message: "Session expired. Sign in again.", requestId: "req-2" },
};

const meBody = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "priya.client@demo.fitbud.test",
};

type Call = { url: string; auth: string | null; body: string };

/**
 * Builds the session and client the way AuthProvider does: the client's
 * refresh hook is the session's refresh, and the session refreshes through
 * the client's refreshAuth.
 */
function wire(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = {
        url: String(input),
        auth: new Headers(init?.headers).get("Authorization"),
        body: typeof init?.body === "string" ? init.body : "",
      };
      calls.push(call);
      return handler(call);
    }),
  );
  const persisted: TokenState[] = [];
  const onExpired = vi.fn();
  let client: ReturnType<typeof createMobileApiClient> | null = null;
  const session = createTokenSession({
    refreshAuth: (rt) => client!.refreshAuth(rt),
    persist: (state) => persisted.push(state),
    onExpired,
  });
  client = createMobileApiClient({
    getAccessToken: () => session.getAccessToken(),
    getSelectedRole: () => "trainee",
    refreshAccessToken: () => session.refresh(),
  });
  return { calls, persisted, onExpired, session, client };
}

describe("mobile token refresh (AU1d)", () => {
  beforeEach(() => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api.test");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("builds the client with the refresh hook: 401 -> refresh -> retry", async () => {
    const { calls, session, client, persisted } = wire((call) => {
      if (call.url.endsWith("/auth/refresh")) {
        return json(200, {
          data: {
            token: "fresh-id",
            tokenKind: "firebase_id_token",
            refreshToken: "refresh-2",
            expiresIn: 3600,
          },
        });
      }
      return call.auth === "Bearer fresh-id" ? json(200, { data: meBody }) : json(401, unauthenticated);
    });
    session.signIn("stale-id", { refreshToken: "refresh-1", expiresIn: 3600 });

    await expect(
      client.request("GET", "/me", { parse: (v: unknown) => v }, { auth: true }),
    ).resolves.toEqual(meBody);
    expect(calls.map((c) => [c.url.replace("https://api.test", ""), c.auth])).toEqual([
      ["/me", "Bearer stale-id"],
      ["/auth/refresh", null],
      ["/me", "Bearer fresh-id"],
    ]);
    expect(JSON.parse(calls[1]!.body)).toEqual({ refreshToken: "refresh-1" });
    expect(calls.some((c) => c.url.includes("refresh-1"))).toBe(false);
    expect(session.getState()).toMatchObject({ accessToken: "fresh-id", refreshToken: "refresh-2" });
    expect(persisted.at(-1)?.refreshToken).toBe("refresh-2");
    session.setForeground(false);
  });

  it("refresh refused: clears both tokens and the expiry and signs out", async () => {
    const { calls, session, client, onExpired } = wire((call) =>
      call.url.endsWith("/auth/refresh") ? json(401, refused) : json(401, unauthenticated),
    );
    session.signIn("stale-id", { refreshToken: "refresh-1", expiresIn: 3600 });

    const err = await client.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as Error).message).not.toContain("refresh-1");
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({ accessToken: null, refreshToken: null, expiresAt: null });
    expect(calls.filter((c) => c.url.endsWith("/me"))).toHaveLength(1);
  });

  it("refresh fails offline: keeps the session and does not sign out", async () => {
    const { session, client, onExpired } = wire((call) => {
      if (call.url.endsWith("/auth/refresh")) throw new TypeError("Network request failed");
      return json(401, unauthenticated);
    });
    session.signIn("stale-id", { refreshToken: "refresh-1", expiresIn: 3600 });

    await expect(client.me()).rejects.toBeInstanceOf(ApiClientError);
    expect(onExpired).not.toHaveBeenCalled();
    expect(session.getState().refreshToken).toBe("refresh-1");
    session.setForeground(false);
  });

  it("test-mode token: no refresh call, behaves as before", async () => {
    const { calls, session, client, persisted } = wire(() => json(401, unauthenticated));
    session.signIn("test-token");

    await expect(client.me()).rejects.toBeInstanceOf(ApiClientError);
    expect(calls).toHaveLength(1);
    expect(persisted.at(-1)).toEqual({ accessToken: "test-token", refreshToken: null, expiresAt: null });
  });

  it("one refresh in flight when a 401 and the timer refresh overlap", async () => {
    const { calls, session, client } = wire((call) => {
      if (call.url.endsWith("/auth/refresh")) {
        return json(200, {
          data: {
            token: "fresh-id",
            tokenKind: "firebase_id_token",
            refreshToken: "refresh-2",
            expiresIn: 3600,
          },
        });
      }
      return call.auth === "Bearer fresh-id" ? json(200, { data: meBody }) : json(401, unauthenticated);
    });
    session.signIn("stale-id", { refreshToken: "refresh-1", expiresIn: 3600 });

    const timerRefresh = session.refresh();
    const a = client.request("GET", "/a", { parse: (v: unknown) => v }, { auth: true });
    const b = client.request("GET", "/b", { parse: (v: unknown) => v }, { auth: true });
    await Promise.all([timerRefresh, a, b]);
    expect(calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(1);
    session.setForeground(false);
  });

  it("concurrent refresh calls share one /auth/refresh request", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { calls, session } = wire(async () => {
      await gate;
      return json(200, {
        data: {
          token: "fresh-id",
          tokenKind: "firebase_id_token",
          refreshToken: "refresh-2",
          expiresIn: 3600,
        },
      });
    });
    session.signIn("stale-id", { refreshToken: "refresh-1", expiresIn: 3600 });

    const first = session.refresh();
    const second = session.refresh();
    release();
    await expect(Promise.all([first, second])).resolves.toEqual(["fresh-id", "fresh-id"]);
    expect(calls).toHaveLength(1);
    session.setForeground(false);
  });

  it("arms no timer while in the background, even after a refresh", async () => {
    vi.useFakeTimers();
    const { calls, session } = wire(() =>
      json(200, {
        data: {
          token: "fresh-id",
          tokenKind: "firebase_id_token",
          refreshToken: "refresh-2",
          expiresIn: 3600,
        },
      }),
    );
    session.signIn("id-1", { refreshToken: "refresh-1", expiresIn: 3600 });
    session.setForeground(false);

    await session.refresh(); // e.g. a 401 from a background fetch
    await vi.advanceTimersByTimeAsync(2 * 3_600_000);
    expect(calls).toHaveLength(1);
  });

  it("refreshes about 60 s before expiry in the foreground, not in the background", async () => {
    vi.useFakeTimers();
    const { calls, session } = wire(() =>
      json(200, {
        data: {
          token: "fresh-id",
          tokenKind: "firebase_id_token",
          refreshToken: "refresh-2",
          expiresIn: 3600,
        },
      }),
    );
    session.signIn("id-1", { refreshToken: "refresh-1", expiresIn: 3600 });

    session.setForeground(false);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(calls).toHaveLength(0);

    // Back in the foreground after expiry: refresh straight away.
    session.setForeground(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);

    // The next refresh is armed for 60 s before the new expiry.
    await vi.advanceTimersByTimeAsync(3_600_000 - REFRESH_LEAD_MS - 1_000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(2);
    session.setForeground(false);
  });

  it("drops a refresh that finishes after sign-out", async () => {
    let finish: () => void = () => undefined;
    const { session } = wire(() => json(500, {}));
    session.signIn("id-1", { refreshToken: "refresh-1", expiresIn: 3600 });
    const late = new Promise<Response>((resolve) => {
      finish = () =>
        resolve(
          json(200, {
            data: {
              token: "late-id",
              tokenKind: "firebase_id_token",
              refreshToken: "late-refresh",
              expiresIn: 3600,
            },
          }),
        );
    });
    vi.stubGlobal("fetch", vi.fn(() => late));

    const pending = session.refresh();
    session.clear();
    finish();
    await expect(pending).resolves.toBeNull();
    expect(session.getState()).toEqual({ accessToken: null, refreshToken: null, expiresAt: null });
  });

  it("a new sign-in does not join the old session's in-flight refresh", async () => {
    let releaseOld: () => void = () => undefined;
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const { calls, session } = wire(async (call) => {
      const body = JSON.parse(call.body) as { refreshToken: string };
      if (body.refreshToken === "refresh-old") await oldGate;
      return json(200, {
        data: {
          token: `${body.refreshToken}-id`,
          tokenKind: "firebase_id_token",
          refreshToken: `${body.refreshToken}-next`,
          expiresIn: 3600,
        },
      });
    });
    session.signIn("id-old", { refreshToken: "refresh-old", expiresIn: 3600 });
    const oldRefresh = session.refresh();
    session.clear();
    session.signIn("id-new", { refreshToken: "refresh-new", expiresIn: 3600 });

    await expect(session.refresh()).resolves.toBe("refresh-new-id");
    releaseOld();
    await expect(oldRefresh).resolves.toBeNull();
    expect(calls).toHaveLength(2);
    expect(session.getState().refreshToken).toBe("refresh-new-next");
    session.setForeground(false);
  });

  it("a short expiresIn refreshes at half-life, not back to back", async () => {
    vi.useFakeTimers();
    const { calls, session } = wire(() =>
      json(200, {
        data: {
          token: "fresh-id",
          tokenKind: "firebase_id_token",
          refreshToken: "refresh-2",
          expiresIn: 30,
        },
      }),
    );
    session.signIn("id-1", { refreshToken: "refresh-1", expiresIn: 30 });

    await vi.advanceTimersByTimeAsync(14_000);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(1);
    session.setForeground(false);
  });

  it("only the active AppState runs the timer", () => {
    expect(isForegroundAppState("active")).toBe(true);
    expect(isForegroundAppState("background")).toBe(false);
    expect(isForegroundAppState("inactive")).toBe(false);
  });

  it("pickSessionRefresh reads refresh fields only when both are present", () => {
    expect(pickSessionRefresh({ token: "t", refreshToken: "r", expiresIn: 3600 })).toEqual({
      refreshToken: "r",
      expiresIn: 3600,
    });
    expect(pickSessionRefresh({ token: "t", tokenKind: "test_id_token" })).toBeUndefined();
  });
});
