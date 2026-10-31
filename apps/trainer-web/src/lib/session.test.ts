import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  getStoredAccessToken,
  getStoredEmail,
  getStoredExpiresAt,
  getStoredRefreshToken,
  pickSessionRefresh,
  storeRefreshedTokens,
  storeSession,
} from "./session";

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

describe("trainer session storage", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores the access token, refresh token and expiry next to each other", () => {
    const now = Date.UTC(2026, 9, 31, 10, 0, 0);
    storeSession("id-token-1", "rahul.coach@demo.fitbud.test", {
      refreshToken: "refresh-1",
      expiresIn: 3600,
    }, now);

    expect(getStoredAccessToken()).toBe("id-token-1");
    expect(getStoredRefreshToken()).toBe("refresh-1");
    expect(getStoredExpiresAt()).toBe(now + 3600 * 1000);
    expect(getStoredEmail()).toBe("rahul.coach@demo.fitbud.test");
    expect(storage.getItem("fitbud.trainer.refreshToken")).toBe("refresh-1");
    expect(storage.getItem("fitbud.trainer.accessTokenExpiresAt")).toBe(
      String(now + 3600 * 1000),
    );
  });

  it("stores no refresh token or expiry for a test-mode sign-in", () => {
    storeSession("old", "a@b.test", { refreshToken: "refresh-old", expiresIn: 60 });
    storeSession("test-token", "a@b.test");

    expect(getStoredAccessToken()).toBe("test-token");
    expect(getStoredRefreshToken()).toBeNull();
    expect(getStoredExpiresAt()).toBeNull();
  });

  it("replaces the tokens after a refresh and keeps the email", () => {
    storeSession("id-1", "a@b.test", { refreshToken: "r-1", expiresIn: 3600 }, 0);
    storeRefreshedTokens("id-2", { refreshToken: "r-2", expiresIn: 1800 }, 5_000);

    expect(getStoredAccessToken()).toBe("id-2");
    expect(getStoredRefreshToken()).toBe("r-2");
    expect(getStoredExpiresAt()).toBe(5_000 + 1_800_000);
    expect(getStoredEmail()).toBe("a@b.test");
  });

  it("clears all keys", () => {
    storeSession("id-1", "a@b.test", { refreshToken: "r-1", expiresIn: 3600 });
    clearSession();

    expect(storage.length).toBe(0);
    expect(getStoredAccessToken()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();
    expect(getStoredExpiresAt()).toBeNull();
  });

  it("reads an unparseable expiry as unknown", () => {
    storage.setItem("fitbud.trainer.accessTokenExpiresAt", "soon");
    expect(getStoredExpiresAt()).toBeNull();
  });

  it("picks refresh fields only when both are present", () => {
    expect(
      pickSessionRefresh({ token: "t", refreshToken: "r", expiresIn: 3600 }),
    ).toEqual({ refreshToken: "r", expiresIn: 3600 });
    expect(pickSessionRefresh({ token: "t", tokenKind: "test_id_token" })).toBeUndefined();
    expect(pickSessionRefresh({ token: "t", refreshToken: "r" })).toBeUndefined();
    expect(pickSessionRefresh({ token: "t", refreshToken: "", expiresIn: 3600 })).toBeUndefined();
  });
});
