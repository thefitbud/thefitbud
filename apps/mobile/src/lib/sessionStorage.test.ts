import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ OS: "web" as string }));
vi.mock("react-native", () => ({ Platform: platform }));

// In-memory stand-in for the OS keystore (the wrapper is the mock seam).
const secure = vi.hoisted(() => ({ map: new Map<string, string>(), failReads: false }));
vi.mock("./secureSessionStore", () => ({
  secureGet: async (key: string) => {
    if (secure.failReads) throw new Error("keystore unavailable");
    return secure.map.get(key) ?? null;
  },
  secureSet: async (key: string, value: string) => {
    // A real keystore write takes time; this makes write order observable.
    await new Promise((resolve) => setTimeout(resolve, 5));
    secure.map.set(key, value);
  },
  secureDelete: async (key: string) => {
    secure.map.delete(key);
  },
}));

import { createTestIdToken } from "./testToken";
import {
  SECURE_VALUE_MAX_BYTES,
  clearPersistedSession,
  flushPersistedSession,
  loadNativeSession,
  loadPersistedSession,
  loadRememberRole,
  persistRefreshState,
  persistRememberRole,
  persistSession,
  persistTokenState,
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
    secure.map.clear();
    secure.failReads = false;
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

  it("web: a refreshed token is persisted with the current role", () => {
    platform.OS = "web";
    persistTokenState(
      { accessToken: "id-2", refreshToken: "refresh-2", expiresAt: 42 },
      "trainer",
    );
    expect(loadPersistedSession()).toEqual({
      accessToken: "id-2",
      selectedRole: "trainer",
      refreshToken: "refresh-2",
      expiresAt: 42,
    });
  });

  it("web: a cleared token state removes the refresh keys", () => {
    platform.OS = "web";
    persistTokenState({ accessToken: "id-1", refreshToken: "refresh-1", expiresAt: 1 }, "trainee");
    persistTokenState({ accessToken: null, refreshToken: null, expiresAt: null }, null);
    expect(storage.getItem("fitbud.refreshToken")).toBeNull();
    expect(storage.getItem("fitbud.accessTokenExpiresAt")).toBeNull();
  });

  it("web: SecureStore is untouched", async () => {
    platform.OS = "web";
    persistTokenState({ accessToken: "id-1", refreshToken: "refresh-1", expiresAt: 5 }, "trainee");
    persistSession({ accessToken: "id-1", selectedRole: "trainee" });
    clearPersistedSession();
    await flushPersistedSession();
    expect(secure.map.size).toBe(0);
  });

  describe("native (SecureStore, D-W3-11)", () => {
    const userId = "6f1c2f0e-8f58-4d3a-9d5c-0a4d2f1b7c11";
    const firebaseIdToken = `eyJ${"a".repeat(1000)}`;

    it("round trips the refresh token and session metadata", async () => {
      platform.OS = "android";
      persistTokenState(
        { accessToken: firebaseIdToken, refreshToken: "refresh-1", expiresAt: 5 },
        null,
      );
      persistSession({ accessToken: firebaseIdToken, selectedRole: "trainee", userId });
      await flushPersistedSession();

      expect(await loadNativeSession()).toEqual({
        refreshToken: "refresh-1",
        testToken: null,
        userId,
        tokenKind: "firebase_id_token",
        selectedRole: "trainee",
      });
      const meta = JSON.parse(secure.map.get("fitbud.session") ?? "{}");
      expect(meta).toMatchObject({
        v: 1,
        userId,
        tokenKind: "firebase_id_token",
        selectedRole: "trainee",
      });
      expect(typeof meta.savedAt).toBe("string");
    });

    it("never writes the ID token and never touches localStorage", async () => {
      platform.OS = "ios";
      persistTokenState(
        { accessToken: firebaseIdToken, refreshToken: "refresh-1", expiresAt: 5 },
        "trainee",
      );
      persistSession({ accessToken: firebaseIdToken, selectedRole: "trainee", userId });
      await flushPersistedSession();

      for (const [key, value] of secure.map) {
        expect(value, key).not.toContain(firebaseIdToken);
      }
      expect([...secure.map.keys()].sort()).toEqual(["fitbud.refreshToken", "fitbud.session"]);
      expect(storage.length).toBe(0);
    });

    it("a rotated refresh token replaces the old one", async () => {
      platform.OS = "android";
      persistTokenState({ accessToken: "id-1", refreshToken: "refresh-1", expiresAt: 5 }, null);
      persistTokenState({ accessToken: "id-2", refreshToken: "refresh-2", expiresAt: 9 }, null);
      await flushPersistedSession();
      expect(secure.map.get("fitbud.refreshToken")).toBe("refresh-2");
    });

    it("test mode stores the short test token because there is no refresh token", async () => {
      platform.OS = "android";
      const testToken = createTestIdToken("qa-trainee-1");
      persistTokenState({ accessToken: testToken, refreshToken: null, expiresAt: null }, null);
      await flushPersistedSession();
      const loaded = await loadNativeSession();
      expect(loaded.testToken).toBe(testToken);
      expect(loaded.refreshToken).toBeNull();
    });

    it("does not write a value over 2000 bytes and says only the key name", async () => {
      platform.OS = "android";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const oversized = "r".repeat(SECURE_VALUE_MAX_BYTES + 100);
      persistTokenState({ accessToken: "id-1", refreshToken: oversized, expiresAt: 5 }, null);
      await flushPersistedSession();

      expect(secure.map.has("fitbud.refreshToken")).toBe(false);
      expect(warn).toHaveBeenCalled();
      for (const call of warn.mock.calls) {
        expect(String(call[0])).toContain("fitbud.refreshToken");
        expect(String(call[0])).not.toContain(oversized.slice(0, 50));
      }
      warn.mockRestore();
    });

    it("measures bytes, not characters", async () => {
      platform.OS = "android";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      // 1000 characters of 3 bytes each = 3000 bytes.
      persistTokenState(
        { accessToken: "id-1", refreshToken: "€".repeat(1000), expiresAt: 5 },
        null,
      );
      await flushPersistedSession();
      expect(secure.map.has("fitbud.refreshToken")).toBe(false);
      warn.mockRestore();
    });

    it("clearPersistedSession deletes all three keys", async () => {
      platform.OS = "android";
      const testToken = createTestIdToken("qa-trainee-1");
      persistTokenState({ accessToken: "id-1", refreshToken: "refresh-1", expiresAt: 5 }, null);
      persistSession({ accessToken: "id-1", selectedRole: "trainer", userId });
      await flushPersistedSession();
      secure.map.set("fitbud.testToken", testToken);
      expect([...secure.map.keys()].sort()).toEqual([
        "fitbud.refreshToken",
        "fitbud.session",
        "fitbud.testToken",
      ]);

      clearPersistedSession();
      await flushPersistedSession();
      expect(secure.map.size).toBe(0);
      expect(await loadNativeSession()).toEqual({
        refreshToken: null,
        testToken: null,
        userId: null,
        tokenKind: null,
        selectedRole: null,
      });
    });

    it("a write queued before a clear cannot bring the session back", async () => {
      platform.OS = "android";
      persistTokenState({ accessToken: "id-1", refreshToken: "refresh-1", expiresAt: 5 }, null);
      clearPersistedSession();
      await flushPersistedSession();
      expect(secure.map.size).toBe(0);
    });

    it("a cleared token state deletes the refresh token", async () => {
      platform.OS = "android";
      persistTokenState({ accessToken: "id-1", refreshToken: "refresh-1", expiresAt: 5 }, null);
      persistTokenState({ accessToken: null, refreshToken: null, expiresAt: null }, null);
      await flushPersistedSession();
      expect(secure.map.has("fitbud.refreshToken")).toBe(false);
    });

    it("a keystore read failure propagates so it is never read as signed out", async () => {
      platform.OS = "android";
      secure.failReads = true;
      await expect(loadNativeSession()).rejects.toThrow();
    });

    it("loadPersistedSession stays empty on native", () => {
      platform.OS = "android";
      expect(loadPersistedSession()).toEqual({
        accessToken: null,
        selectedRole: null,
        refreshToken: null,
        expiresAt: null,
      });
    });

    describe("Remember my choice (Z11-14)", () => {
      afterEach(async () => {
        platform.OS = "android";
        clearPersistedSession();
        await flushPersistedSession();
      });

      it("defaults to remembered and round trips the role", async () => {
        platform.OS = "android";
        persistSession({ accessToken: firebaseIdToken, selectedRole: "trainer", userId });
        await flushPersistedSession();
        expect(loadRememberRole()).toBe(true);
        const loaded = await loadNativeSession();
        expect(loaded.selectedRole).toBe("trainer");
        expect(loadRememberRole()).toBe(true);
      });

      it("off is stored in fitbud.session, drops the role and survives a reload", async () => {
        platform.OS = "ios";
        persistSession({ accessToken: firebaseIdToken, selectedRole: "trainee", userId });
        persistRememberRole(false);
        // A later write (a token refresh, a role switch) must not store the role.
        persistSession({ accessToken: firebaseIdToken, selectedRole: "trainer", userId });
        await flushPersistedSession();

        const meta = JSON.parse(secure.map.get("fitbud.session") ?? "{}");
        expect(meta).toMatchObject({ v: 1, userId, selectedRole: null, rememberRole: false });
        const loaded = await loadNativeSession();
        expect(loaded.selectedRole).toBeNull();
        expect(loadRememberRole()).toBe(false);
      });

      it("a stored role next to rememberRole false is never restored", async () => {
        platform.OS = "android";
        secure.map.set(
          "fitbud.session",
          JSON.stringify({ v: 1, userId, tokenKind: "firebase_id_token", selectedRole: "trainer", rememberRole: false }),
        );
        expect((await loadNativeSession()).selectedRole).toBeNull();
        expect(loadRememberRole()).toBe(false);
      });

      it("sign-out resets it to remembered", async () => {
        platform.OS = "android";
        persistSession({ accessToken: firebaseIdToken, selectedRole: "trainer", userId });
        persistRememberRole(false);
        clearPersistedSession();
        await flushPersistedSession();
        expect(loadRememberRole()).toBe(true);
        expect(secure.map.has("fitbud.session")).toBe(false);
      });
    });
  });

  describe("web: Remember my choice (Z11-14)", () => {
    it("defaults to remembered when nothing is stored", () => {
      platform.OS = "web";
      expect(loadRememberRole()).toBe(true);
      persistSession({ accessToken: "id-1", selectedRole: "trainee" });
      expect(loadPersistedSession().selectedRole).toBe("trainee");
    });

    it("off removes the stored role and keeps it out of later writes", () => {
      platform.OS = "web";
      persistSession({ accessToken: "id-1", selectedRole: "trainee" });
      persistRememberRole(false);
      expect(storage.getItem("fitbud.selectedRole")).toBeNull();
      expect(storage.getItem("fitbud.rememberRole")).toBe("0");

      persistTokenState({ accessToken: "id-2", refreshToken: "refresh-2", expiresAt: 42 }, "trainer");
      persistSession({ accessToken: "id-2", selectedRole: "trainer" });
      expect(loadRememberRole()).toBe(false);
      expect(loadPersistedSession()).toEqual({
        accessToken: "id-2",
        selectedRole: null,
        refreshToken: "refresh-2",
        expiresAt: 42,
      });
    });

    it("a role left in storage next to the off flag is not restored", () => {
      platform.OS = "web";
      storage.setItem("fitbud.accessToken", "id-1");
      storage.setItem("fitbud.selectedRole", "trainer");
      storage.setItem("fitbud.rememberRole", "0");
      expect(loadPersistedSession().selectedRole).toBeNull();
    });

    it("on again removes the flag and stores the next role", () => {
      platform.OS = "web";
      persistRememberRole(false);
      persistRememberRole(true);
      expect(storage.getItem("fitbud.rememberRole")).toBeNull();
      persistSession({ accessToken: "id-1", selectedRole: "trainer" });
      expect(loadPersistedSession().selectedRole).toBe("trainer");
    });

    it("clearing the session clears the flag", () => {
      platform.OS = "web";
      persistSession({ accessToken: "id-1", selectedRole: "trainer" });
      persistRememberRole(false);
      clearPersistedSession();
      expect(storage.length).toBe(0);
      expect(loadRememberRole()).toBe(true);
    });
  });
});
