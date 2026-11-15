// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type { MeResponse } from "@fitbud/contracts";

/**
 * Z11-8: AuthProvider scopes the trainer offline cache to the `/me` user and
 * clears it on every path that ends the session (sign-out, refused refresh,
 * refused restore, a 401 on `/me`, a failed sign-in). Z12-33: a fetch started
 * under one trainer never writes after another signs in, and a new `/me` user
 * removes the previous trainer's entries even without a sign-out. Renders the real
 * provider with the real token session and the real cache module; only the
 * network client, native storage and push are replaced.
 */

const h = vi.hoisted(() => {
  const platform = { OS: "web" as string };
  const persisted = {
    accessToken: null as string | null,
    selectedRole: null as "trainer" | "trainee" | null,
    refreshToken: null as string | null,
    expiresAt: null as number | null,
  };
  const nativeSession = {
    refreshToken: null as string | null,
    testToken: null as string | null,
    selectedRole: null as "trainer" | "trainee" | null,
  };
  const client = { me: vi.fn(), listRelationships: vi.fn(), refreshAuth: vi.fn() };
  // The provider's own session hook (`refreshAccessToken`), captured so a
  // test can drive a refresh the way the API client would on a 401.
  const sessions: Array<{ refreshAccessToken?: () => Promise<string | null> }> = [];
  return { platform, persisted, nativeSession, client, sessions };
});

vi.mock("react-native", () => ({
  Platform: h.platform,
  NativeModules: {},
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: () => undefined }),
  },
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    createMobileApiClient: (session: { refreshAccessToken?: () => Promise<string | null> }) => {
      h.sessions.push(session);
      return h.client;
    },
  };
});

vi.mock("../lib/sessionStorage", () => ({
  clearPersistedSession: vi.fn(),
  loadNativeSession: vi.fn(async () => ({ ...h.nativeSession })),
  loadPersistedSession: vi.fn(() => ({ ...h.persisted })),
  loadRememberRole: vi.fn(() => true),
  persistRememberRole: vi.fn(),
  persistSession: vi.fn(),
  persistTokenState: vi.fn(),
}));

vi.mock("../notifications/register", () => ({
  registerDeviceTokenForPush: vi.fn(async () => ({ status: "permission_denied" })),
  signOutPushRegistration: vi.fn(),
  watchPushTokenChanges: vi.fn(async () => () => undefined),
}));

vi.mock("../navigation/useAppDeepLinks", () => ({ useAppDeepLinks: () => undefined }));

import { AuthProvider, useAuth } from "./AuthProvider";
import {
  clearTrainerCache,
  readTrainerCache,
  setTrainerCacheOwner,
  trainerCacheEpoch,
  writeTrainerCache,
} from "../trainer/cache";

/** A cache write whose fetch started now, under the current owner. */
function writeNow(key: string, value: unknown) {
  writeTrainerCache(key, value, trainerCacheEpoch());
}

const TRAINER_A = "6f1c2a9e-3b4d-4c5e-8f70-1a2b3c4d5e6f";
const TRAINER_B = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b";
const snapshotA = {
  items: [{ id: "exc-a-1", clientName: "Priya Sharma" }],
  savedAt: "2026-11-11T05:30:00.000Z",
};

function trainerMe(userId: string, displayName: string): MeResponse {
  return {
    userId,
    firebaseUid: `firebase-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
    accountState: "active",
    timezone: "Asia/Calcutta",
    email: null,
    permittedRoles: ["trainer"],
    selectedRole: "trainer",
    surface: "mobile",
    trainerProfileId: userId,
    traineeProfileId: null,
    trainerProfile: { displayName, whatsappE164: null },
  } as unknown as MeResponse;
}

function apiError(status: number, code: string): ApiClientError {
  return new ApiClientError({ code, message: "Request refused.", requestId: "req-1", status });
}

let auth: ReturnType<typeof useAuth> | null = null;
function Probe() {
  auth = useAuth();
  return null;
}

function renderProvider() {
  return render(createElement(AuthProvider, null, createElement(Probe)));
}

function trainerKeysInStorage(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("trainer:")) keys.push(key);
  }
  return keys;
}

/** A's snapshot is gone for good, not merely hidden behind another owner. */
function expectCacheCleared() {
  expect(trainerKeysInStorage()).toEqual([]);
  setTrainerCacheOwner(TRAINER_A);
  expect(readTrainerCache("trainer:attention")).toBeNull();
  expect(readTrainerCache("trainer:clients")).toBeNull();
}

/** Trainer A's snapshot, as a previous session on this phone left it. */
function seedCacheForA() {
  setTrainerCacheOwner(TRAINER_A);
  writeNow("trainer:attention", snapshotA);
  writeNow("trainer:clients", { items: [{ id: "client-1" }] });
  setTrainerCacheOwner(null);
  // And an unscoped key written by a build before Z11-8.
  localStorage.setItem("trainer:attention", JSON.stringify(snapshotA));
}

async function signIn(token: string, me: MeResponse, refresh?: { refreshToken: string; expiresIn: number }) {
  h.client.me.mockResolvedValueOnce(me);
  await act(async () => {
    await auth!.signInWithToken(token, refresh);
  });
}

beforeEach(() => {
  h.platform.OS = "web";
  Object.assign(h.persisted, { accessToken: null, selectedRole: null, refreshToken: null, expiresAt: null });
  Object.assign(h.nativeSession, { refreshToken: null, testToken: null, selectedRole: null });
  h.sessions.length = 0;
  h.client.me = vi.fn();
  h.client.listRelationships = vi.fn(async () => ({ items: [], nextCursor: null }));
  h.client.refreshAuth = vi.fn();
  localStorage.clear();
  clearTrainerCache();
  setTrainerCacheOwner(null);
  auth = null;
});

afterEach(() => {
  cleanup();
});

describe("AuthProvider and the trainer cache (Z11-8)", () => {
  it("sign-in sets the cache owner from /me, so A's own snapshot reads back", async () => {
    renderProvider();
    expect(readTrainerCache("trainer:attention")).toBeNull();

    await signIn("token-a", trainerMe(TRAINER_A, "Rahul Coach"));
    expect(auth!.me?.userId).toBe(TRAINER_A);

    writeNow("trainer:attention", snapshotA);
    expect(readTrainerCache("trainer:attention")).toEqual(snapshotA);
    expect(trainerKeysInStorage().every((key) => key.includes(TRAINER_A))).toBe(true);
  });

  it("a second trainer signing in on the same phone reads nothing of A's", async () => {
    renderProvider();
    await signIn("token-a", trainerMe(TRAINER_A, "Rahul Coach"));
    writeNow("trainer:attention", snapshotA);

    await signIn("token-b", trainerMe(TRAINER_B, "Meera Coach"));
    expect(auth!.me?.userId).toBe(TRAINER_B);
    expect(readTrainerCache("trainer:attention")).toBeNull();
    // Removed when B's `/me` set the owner, though nothing signed A out.
    expect(trainerKeysInStorage().filter((key) => key.includes(TRAINER_A))).toEqual([]);
  });

  it("a /me reload that returns a different user removes the previous trainer's entries (Z12-33)", async () => {
    renderProvider();
    await signIn("token-a", trainerMe(TRAINER_A, "Rahul Coach"));
    writeNow("trainer:attention", snapshotA);
    expect(trainerKeysInStorage()).toHaveLength(1);

    h.client.me.mockResolvedValueOnce(trainerMe(TRAINER_B, "Meera Coach"));
    await act(async () => {
      await auth!.refreshSession();
    });

    expect(auth!.me?.userId).toBe(TRAINER_B);
    expect(trainerKeysInStorage()).toEqual([]);
    expect(readTrainerCache("trainer:attention")).toBeNull();
  });

  it("a /me reload for the same trainer keeps their snapshot and in-flight writes", async () => {
    renderProvider();
    await signIn("token-a", trainerMe(TRAINER_A, "Rahul Coach"));
    writeNow("trainer:attention", snapshotA);
    const startedAt = trainerCacheEpoch();

    h.client.me.mockResolvedValueOnce(trainerMe(TRAINER_A, "Rahul Coach"));
    await act(async () => {
      await auth!.refreshSession();
    });

    expect(readTrainerCache("trainer:attention")).toEqual(snapshotA);
    writeTrainerCache("trainer:clients", { items: [{ id: "client-1" }] }, startedAt);
    expect(readTrainerCache("trainer:clients")).toEqual({ items: [{ id: "client-1" }] });
  });

  it("a fetch started for A that resolves after A signs out and B signs in writes nothing (Z12-33)", async () => {
    renderProvider();
    await signIn("token-a", trainerMe(TRAINER_A, "Rahul Coach"));
    // A trainer screen starts its fetch while A is signed in.
    const startedUnderA = trainerCacheEpoch();

    act(() => auth!.signOut());
    await signIn("token-b", trainerMe(TRAINER_B, "Meera Coach"));
    expect(auth!.me?.userId).toBe(TRAINER_B);

    // A's response arrives now.
    writeTrainerCache("trainer:attention", snapshotA, startedUnderA);

    expect(readTrainerCache("trainer:attention")).toBeNull();
    expect(trainerKeysInStorage()).toEqual([]);
  });

  it("sign-out clears every trainer: entry and the owner; B then reads null", async () => {
    renderProvider();
    await signIn("token-a", trainerMe(TRAINER_A, "Rahul Coach"));
    writeNow("trainer:attention", snapshotA);
    writeNow("trainer:clients", { items: [{ id: "client-1" }] });
    localStorage.setItem("trainer:attention", JSON.stringify(snapshotA));
    localStorage.setItem("trainer:client:legacy-relationship", "{}");

    act(() => auth!.signOut());

    expect(auth!.me).toBeNull();
    // No owner after sign-out: reads are null and writes are dropped.
    expect(readTrainerCache("trainer:attention")).toBeNull();
    writeNow("trainer:attention", snapshotA);
    expect(trainerKeysInStorage()).toEqual([]);

    await signIn("token-b", trainerMe(TRAINER_B, "Meera Coach"));
    expect(readTrainerCache("trainer:attention")).toBeNull();
    expectCacheCleared();
  });

  it("a refused token refresh signs out and clears the cache", async () => {
    renderProvider();
    await signIn("token-a", trainerMe(TRAINER_A, "Rahul Coach"), {
      refreshToken: "refresh-a",
      expiresIn: 3600,
    });
    writeNow("trainer:attention", snapshotA);
    expect(trainerKeysInStorage()).toHaveLength(1);

    h.client.refreshAuth.mockRejectedValueOnce(apiError(401, "UNAUTHENTICATED"));
    const session = h.sessions.find((item) => item.refreshAccessToken);
    await act(async () => {
      await session!.refreshAccessToken!();
    });

    expect(h.client.refreshAuth).toHaveBeenCalledWith("refresh-a");
    expect(auth!.accessToken).toBeNull();
    expect(readTrainerCache("trainer:attention")).toBeNull();
    expectCacheCleared();
  });

  it("web: a stored session whose /me is refused (401) clears the cache", async () => {
    seedCacheForA();
    Object.assign(h.persisted, { accessToken: "token-a", selectedRole: "trainer" });
    h.client.me.mockRejectedValueOnce(apiError(401, "UNAUTHENTICATED"));

    renderProvider();
    await waitFor(() => expect(h.client.me).toHaveBeenCalled());
    await waitFor(() => expect(trainerKeysInStorage()).toEqual([]));
    expectCacheCleared();
  });

  it("native: a restore whose refresh is refused clears the cache", async () => {
    h.platform.OS = "ios";
    seedCacheForA();
    Object.assign(h.nativeSession, { refreshToken: "refresh-a", selectedRole: "trainer" });
    h.client.refreshAuth.mockRejectedValueOnce(apiError(401, "UNAUTHENTICATED"));

    renderProvider();
    await waitFor(() => expect(h.client.refreshAuth).toHaveBeenCalledWith("refresh-a"));
    await waitFor(() => expect(trainerKeysInStorage()).toEqual([]));
    expect(auth!.errorMessage).toBe("You've been signed out. Please sign in again.");
    expectCacheCleared();
  });

  it("a sign-in that fails (not a 401) clears the cache and sets no owner", async () => {
    renderProvider();
    seedCacheForA();
    h.client.me.mockRejectedValueOnce(apiError(500, "INTERNAL"));

    await act(async () => {
      await auth!.signInWithToken("token-b");
    });

    expect(auth!.me).toBeNull();
    expect(readTrainerCache("trainer:attention")).toBeNull();
    expectCacheCleared();
  });
});
