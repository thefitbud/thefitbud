import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ OS: "web" as string }));
vi.mock("react-native", () => ({ Platform: platform }));

import {
  clearPersistedSession,
  loadPersistedSession,
  persistRefreshState,
  persistSession,
} from "./sessionStorage";

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

describe("mobile session storage", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    platform.OS = "web";
    vi.unstubAllGlobals();
  });

  it("web: writes the refresh token and expiry next to fitbud.accessToken", () => {
    platform.OS = "web";
    persistSession({ accessToken: "id-1", selectedRole: "trainee" });
    persistRefreshState({ refreshToken: "refresh-1", expiresAt: 1_800_000_000_000 });

    expect(storage.getItem("fitbud.accessToken")).toBe("id-1");
    expect(storage.getItem("fitbud.refreshToken")).toBe("refresh-1");
    expect(storage.getItem("fitbud.accessTokenExpiresAt")).toBe("1800000000000");
    expect(loadPersistedSession()).toEqual({
      accessToken: "id-1",
      selectedRole: "trainee",
      refreshToken: "refresh-1",
      expiresAt: 1_800_000_000_000,
    });
  });

  it("web: test mode (no refresh token) removes the refresh keys", () => {
    platform.OS = "web";
    persistRefreshState({ refreshToken: "refresh-1", expiresAt: 1 });
    persistRefreshState({ refreshToken: null, expiresAt: null });

    expect(storage.getItem("fitbud.refreshToken")).toBeNull();
    expect(storage.getItem("fitbud.accessTokenExpiresAt")).toBeNull();
  });

  it("web: clearing the session removes the token, refresh token, expiry and role", () => {
    platform.OS = "web";
    persistSession({ accessToken: "id-1", selectedRole: "trainer" });
    persistRefreshState({ refreshToken: "refresh-1", expiresAt: 1 });
    clearPersistedSession();

    expect(storage.length).toBe(0);
  });

  it("native: writes nothing and loads nothing (memory only, D-W2-13)", () => {
    platform.OS = "ios";
    persistSession({ accessToken: "id-1", selectedRole: "trainee" });
    persistRefreshState({ refreshToken: "refresh-1", expiresAt: 1 });

    expect(storage.length).toBe(0);
    expect(loadPersistedSession()).toEqual({
      accessToken: null,
      selectedRole: null,
      refreshToken: null,
      expiresAt: null,
    });
  });
});
