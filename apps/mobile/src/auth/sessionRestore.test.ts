import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type { MeResponse } from "@fitbud/contracts";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

const secure = vi.hoisted(() => ({ map: new Map<string, string>(), failReads: false }));
vi.mock("../lib/secureSessionStore", () => ({
  secureGet: async (key: string) => {
    if (secure.failReads) throw new Error("keystore unavailable");
    return secure.map.get(key) ?? null;
  },
  secureSet: async (key: string, value: string) => {
    secure.map.set(key, value);
  },
  secureDelete: async (key: string) => {
    secure.map.delete(key);
  },
}));

import {
  clearPersistedSession,
  flushPersistedSession,
  loadNativeSession,
  persistSession,
  persistTokenState,
} from "../lib/sessionStorage";
import { createTestIdToken } from "../lib/testToken";
import { restoreSession, type RestoreDeps } from "./sessionRestore";

const userId = "6f1c2f0e-8f58-4d3a-9d5c-0a4d2f1b7c11";
const me = { userId, permittedRoles: ["trainee"] } as unknown as MeResponse;

function apiError(status: number, code: string): ApiClientError {
  return new ApiClientError({ code, message: "refused", requestId: "req-1", status });
}

/** Wires the pure restore to the real native persistence, as the provider does. */
function deps(overrides: Partial<RestoreDeps> = {}) {
  const calls = { refresh: 0, me: 0 };
  const base: RestoreDeps = {
    load: loadNativeSession,
    refreshAuth: async () => {
      calls.refresh += 1;
      return { token: "id-fresh", refreshToken: "refresh-rotated", expiresIn: 3600 };
    },
    adoptTokens: (token, refresh) => {
      persistTokenState(
        {
          accessToken: token,
          refreshToken: refresh?.refreshToken ?? null,
          expiresAt: refresh ? Date.now() + refresh.expiresIn * 1000 : null,
        },
        null,
      );
    },
    fetchMe: async () => {
      calls.me += 1;
      return me;
    },
    clearSession: () => {
      persistTokenState({ accessToken: null, refreshToken: null, expiresAt: null }, null);
      clearPersistedSession();
    },
  };
  return { calls, deps: { ...base, ...overrides } satisfies RestoreDeps };
}

async function seedStored() {
  persistTokenState({ accessToken: "id-old", refreshToken: "refresh-stored", expiresAt: 1 }, null);
  persistSession({ accessToken: "id-old", selectedRole: "trainee", userId });
  await flushPersistedSession();
}

function keys(): string[] {
  return [...secure.map.keys()].sort();
}

describe("restoreSession (native startup)", () => {
  beforeEach(async () => {
    clearPersistedSession();
    await flushPersistedSession();
    secure.map.clear();
    secure.failReads = false;
  });

  it("refreshes then loads /me once each, restores the role and stores the rotated refresh token", async () => {
    await seedStored();
    const { calls, deps: d } = deps();

    const result = await restoreSession(d);

    expect(result).toEqual({ status: "signed_in", me, preferredRole: "trainee" });
    expect(calls).toEqual({ refresh: 1, me: 1 });
    await flushPersistedSession();
    expect(secure.map.get("fitbud.refreshToken")).toBe("refresh-rotated");
    // The ID token is never written.
    for (const value of secure.map.values()) expect(value).not.toContain("id-fresh");
  });

  it("nothing stored: signed out without any request", async () => {
    const { calls, deps: d } = deps();
    expect(await restoreSession(d)).toEqual({ status: "signed_out", reason: "nothing_stored" });
    expect(calls).toEqual({ refresh: 0, me: 0 });
  });

  it.each([400, 401, 403])("refresh %i: signed out and every key deleted", async (status) => {
    await seedStored();
    expect(keys().length).toBe(2);
    const { deps: d } = deps({
      refreshAuth: async () => {
        throw apiError(status, "AUTH_REFRESH_FAILED");
      },
    });

    expect(await restoreSession(d)).toEqual({ status: "signed_out", reason: "refused" });
    await flushPersistedSession();
    expect(keys()).toEqual([]);
  });

  it("/me 401 after a good refresh: signed out and every key deleted", async () => {
    await seedStored();
    const { deps: d } = deps({
      fetchMe: async () => {
        throw apiError(401, "UNAUTHENTICATED");
      },
    });

    expect(await restoreSession(d)).toEqual({ status: "signed_out", reason: "refused" });
    await flushPersistedSession();
    expect(keys()).toEqual([]);
  });

  it("network error on refresh: offline, keys kept, no /me call", async () => {
    await seedStored();
    const before = keys();
    const { calls, deps: d } = deps({
      refreshAuth: async () => {
        throw new TypeError("Network request failed");
      },
    });

    expect(await restoreSession(d)).toEqual({ status: "offline" });
    await flushPersistedSession();
    expect(keys()).toEqual(before);
    expect(secure.map.get("fitbud.refreshToken")).toBe("refresh-stored");
    expect(calls.me).toBe(0);
  });

  it.each([429, 500, 502, 503, 504])("refresh %i: offline, keys kept", async (status) => {
    await seedStored();
    const { deps: d } = deps({
      refreshAuth: async () => {
        throw apiError(status, status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR");
      },
    });

    expect(await restoreSession(d)).toEqual({ status: "offline" });
    await flushPersistedSession();
    expect(secure.map.get("fitbud.refreshToken")).toBe("refresh-stored");
    expect(secure.map.has("fitbud.session")).toBe(true);
  });

  it.each([
    ["a network error", () => new TypeError("Network request failed")],
    ["a 503", () => apiError(503, "INTERNAL_ERROR")],
    ["a 429", () => apiError(429, "RATE_LIMITED")],
  ])("/me answers %s after a good refresh: offline, keys kept (rotated token stored)", async (_n, err) => {
    await seedStored();
    const { deps: d } = deps({
      fetchMe: async () => {
        throw err();
      },
    });

    expect(await restoreSession(d)).toEqual({ status: "offline" });
    await flushPersistedSession();
    expect(secure.map.get("fitbud.refreshToken")).toBe("refresh-rotated");
  });

  it("retry after offline succeeds once the network is back", async () => {
    await seedStored();
    let online = false;
    const { deps: d } = deps({
      refreshAuth: async () => {
        if (!online) throw new TypeError("Network request failed");
        return { token: "id-fresh", refreshToken: "refresh-rotated", expiresIn: 3600 };
      },
    });

    expect(await restoreSession(d)).toEqual({ status: "offline" });
    online = true;
    expect((await restoreSession(d)).status).toBe("signed_in");
  });

  it("an unreadable keystore is offline, not signed out", async () => {
    await seedStored();
    secure.failReads = true;
    const { calls, deps: d } = deps();

    expect(await restoreSession(d)).toEqual({ status: "offline" });
    expect(calls).toEqual({ refresh: 0, me: 0 });
    secure.failReads = false;
    expect(secure.map.get("fitbud.refreshToken")).toBe("refresh-stored");
  });

  it("test mode: a stored test token goes straight to /me with no refresh", async () => {
    const testToken = createTestIdToken("qa-trainee-1");
    persistTokenState({ accessToken: testToken, refreshToken: null, expiresAt: null }, null);
    await flushPersistedSession();
    const adopted: Array<[string, unknown]> = [];
    const { calls, deps: d } = deps({
      adoptTokens: (token, refresh) => {
        adopted.push([token, refresh]);
      },
    });

    expect((await restoreSession(d)).status).toBe("signed_in");
    expect(calls).toEqual({ refresh: 0, me: 1 });
    expect(adopted).toEqual([[testToken, undefined]]);
  });

  it("sign out after a restore clears every key", async () => {
    await seedStored();
    const { deps: d } = deps();
    expect((await restoreSession(d)).status).toBe("signed_in");
    await flushPersistedSession();
    expect(keys()).toEqual(["fitbud.refreshToken", "fitbud.session"]);

    clearPersistedSession();
    await flushPersistedSession();
    expect(keys()).toEqual([]);
    expect(await restoreSession(deps().deps)).toEqual({
      status: "signed_out",
      reason: "nothing_stored",
    });
  });
});
