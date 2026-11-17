import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
}));

import { ApiClientError } from "@fitbud/api-client";
import {
  REFRESH_RETRY_MS,
  createObservedFetch,
  createTokenSession,
  isSyncRequest,
  onApiActivity,
  type ApiActivity,
  type TokenState,
} from "./api";

/** Z12-41: the app's own API calls tell the sync triggers about the network. */

function ok(): Response {
  return new Response("{}", { status: 200 });
}

describe("observed fetch", () => {
  let seen: ApiActivity[];
  let stop: () => void;
  beforeEach(() => {
    seen = [];
    stop = onApiActivity((activity) => seen.push(activity));
  });
  afterEach(() => stop());

  it("reports a successful call", async () => {
    const observed = createObservedFetch(async () => ok());
    await observed("http://api.test/me");
    expect(seen).toEqual(["success"]);
  });

  it("reports a call that could not connect, and still throws it", async () => {
    const observed = createObservedFetch(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(observed("http://api.test/me")).rejects.toThrow("Network request failed");
    expect(seen).toEqual(["unreachable"]);
  });

  it("an HTTP error is an answer: neither success nor unreachable", async () => {
    const observed = createObservedFetch(async () => new Response("{}", { status: 500 }));
    await observed("http://api.test/me");
    expect(seen).toEqual([]);
  });

  it("sync's own calls are left out, so a push never triggers the next push", async () => {
    const observed = createObservedFetch(async () => ok());
    await observed("http://api.test/sync/push");
    await observed("http://api.test/sync/pull?limit=50");
    await observed(new URL("http://api.test/sync/push"));
    expect(seen).toEqual([]);
    expect(isSyncRequest("http://api.test/meals/sync/pushups")).toBe(false);
  });

  it("stops telling a listener that unsubscribed, and survives one that throws", async () => {
    const stopBad = onApiActivity(() => {
      throw new Error("listener bug");
    });
    const observed = createObservedFetch(async () => ok());
    await expect(observed("http://api.test/me")).resolves.toBeInstanceOf(Response);
    stopBad();
    stop();
    await observed("http://api.test/me");
    expect(seen).toEqual(["success"]);
  });
});

describe("token session: held refresh token (cold start with no network)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function session(refreshAuth: (token: string) => Promise<{ token: string; refreshToken: string; expiresIn: number }>) {
    const persisted: TokenState[] = [];
    let expired = 0;
    const s = createTokenSession({
      refreshAuth: (token) =>
        refreshAuth(token) as ReturnType<Parameters<typeof createTokenSession>[0]["refreshAuth"]>,
      persist: (state) => persisted.push(state),
      onExpired: () => {
        expired += 1;
      },
    });
    return { s, persisted, expired: () => expired };
  }

  it("holds the refresh token with no ID token, and mints one when the server answers", async () => {
    let online = false;
    const { s } = session(async () => {
      if (!online) throw new TypeError("Network request failed");
      return { token: "id-fresh", refreshToken: "refresh-rotated", expiresIn: 3600 };
    });

    s.hold("refresh-stored");
    expect(s.getState()).toMatchObject({ accessToken: null, refreshToken: "refresh-stored" });

    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS);
    expect(s.getAccessToken()).toBeNull();

    online = true;
    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS);
    expect(s.getAccessToken()).toBe("id-fresh");
    expect(s.getState().refreshToken).toBe("refresh-rotated");
  });

  it("refreshes straight away on the return to the foreground", async () => {
    const { s } = session(async () => ({
      token: "id-fresh",
      refreshToken: "refresh-rotated",
      expiresIn: 3600,
    }));
    s.hold("refresh-stored");
    s.setForeground(false);
    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS * 3);
    expect(s.getAccessToken()).toBeNull();

    s.setForeground(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(s.getAccessToken()).toBe("id-fresh");
  });

  it("a held token the server refuses ends the session", async () => {
    const { s, expired } = session(async () => {
      throw new ApiClientError({
        code: "AUTH_REFRESH_FAILED",
        message: "Session expired. Sign in again.",
        requestId: "req-1",
        status: 401,
      });
    });
    s.hold("refresh-stored");

    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS);

    expect(expired()).toBe(1);
    expect(s.getState()).toEqual({ accessToken: null, refreshToken: null, expiresAt: null });
  });
});
