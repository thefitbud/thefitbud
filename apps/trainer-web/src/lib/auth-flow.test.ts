import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createWebSession = vi.fn();
const me = vi.fn();
const login = vi.fn();
const scheduleTokenRefresh = vi.fn();
const cancelTokenRefresh = vi.fn();

vi.mock("./api", () => ({
  apiClient: { createWebSession, me },
  scheduleTokenRefresh,
  cancelTokenRefresh,
}));

vi.mock("./stage1-api", () => ({
  stage1Api: { login },
}));

const { AuthFlowError, signInWithOtpToken, signInWithPassword } = await import("./auth-flow");

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

const profile = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "rahul.coach@demo.fitbud.test",
  permittedRoles: ["trainer"],
};

describe("AuthFlowError", () => {
  it("carries a stable code for UI mapping", () => {
    const err = new AuthFlowError("network", "offline");
    expect(err.code).toBe("network");
    expect(err.message).toBe("offline");
  });
});

describe("trainer sign-in passes the refresh token through (AU1c)", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    createWebSession.mockReset().mockResolvedValue({ ok: true });
    me.mockReset().mockResolvedValue(profile);
    login.mockReset();
    scheduleTokenRefresh.mockReset();
    cancelTokenRefresh.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("password sign-in stores the refresh token and expiry, then arms the refresh timer", async () => {
    login.mockResolvedValue({
      token: "id-token-1",
      tokenKind: "firebase_id_token",
      refreshToken: "refresh-1",
      expiresIn: 3600,
      userId: profile.userId,
    });
    const before = Date.now();

    await signInWithPassword("rahul.coach@demo.fitbud.test", "FitBud-demo-2026");

    expect(storage.getItem("fitbud.trainer.accessToken")).toBe("id-token-1");
    expect(storage.getItem("fitbud.trainer.refreshToken")).toBe("refresh-1");
    const expiresAt = Number(storage.getItem("fitbud.trainer.accessTokenExpiresAt"));
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000);
    expect(scheduleTokenRefresh).toHaveBeenCalled();
    // The refresh token never goes to /auth/session.
    expect(JSON.stringify(createWebSession.mock.calls)).not.toContain("refresh-1");
  });

  it("test-mode sign-in stores no refresh token (behaves as before)", async () => {
    login.mockResolvedValue({
      token: "test-token",
      tokenKind: "test_id_token",
      userId: profile.userId,
    });

    await signInWithPassword("rahul.coach@demo.fitbud.test", "FitBud-demo-2026");

    expect(storage.getItem("fitbud.trainer.accessToken")).toBe("test-token");
    expect(storage.getItem("fitbud.trainer.refreshToken")).toBeNull();
    expect(storage.getItem("fitbud.trainer.accessTokenExpiresAt")).toBeNull();
  });

  it("code sign-in stores the refresh token it is given", async () => {
    await signInWithOtpToken("id-token-2", "rahul.coach@demo.fitbud.test", {
      refreshToken: "refresh-2",
      expiresIn: 3600,
    });

    expect(storage.getItem("fitbud.trainer.accessToken")).toBe("id-token-2");
    expect(storage.getItem("fitbud.trainer.refreshToken")).toBe("refresh-2");
  });

  it("a failed sign-in clears the token, refresh token and expiry", async () => {
    me.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      signInWithOtpToken("id-token-3", "rahul.coach@demo.fitbud.test", {
        refreshToken: "refresh-3",
        expiresIn: 3600,
      }),
    ).rejects.toMatchObject({ code: "network" });

    expect(storage.length).toBe(0);
    expect(cancelTokenRefresh).toHaveBeenCalled();
  });
});
