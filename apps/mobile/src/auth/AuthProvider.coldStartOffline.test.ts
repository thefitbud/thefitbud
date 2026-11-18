// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type { CoachingRelationship, MeResponse } from "@fitbud/contracts";
import { createTestIdToken } from "../lib/testToken";
import { routerView } from "../navigation/routerView";

/**
 * Z12-41 (ISSUE-MAP #9): a cold start with no network opens the app on the
 * cached account instead of the error screen. Renders the real provider with
 * the real native session storage, token session, snapshot and router-view
 * rule, over an in-memory keychain. Only the network client, push, the
 * deep-link source and the error reporter are replaced. "Killing the app" is
 * unmounting the provider: the keychain is all that survives.
 */

const h = vi.hoisted(() => {
  const client = { me: vi.fn(), listRelationships: vi.fn(), refreshAuth: vi.fn() };
  const reportError = vi.fn();
  const secure = new Map<string, string>();
  const appState = new Set<(state: string) => void>();
  return { client, reportError, secure, appState };
});

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  NativeModules: {},
  // AuthProvider wraps the app in a View (Z12-29); a pass-through is enough here.
  View: ({ children }: { children?: unknown }) => children,
  AppState: {
    currentState: "active",
    addEventListener: (_type: string, listener: (state: string) => void) => {
      h.appState.add(listener);
      return { remove: () => h.appState.delete(listener) };
    },
  },
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, createMobileApiClient: () => h.client };
});

vi.mock("../lib/secureSessionStore", () => ({
  secureGet: async (key: string) => h.secure.get(key) ?? null,
  secureSet: async (key: string, value: string) => {
    h.secure.set(key, value);
  },
  secureDelete: async (key: string) => {
    h.secure.delete(key);
  },
}));

vi.mock("../lib/reportError", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/reportError")>();
  return { ...actual, reportError: h.reportError };
});

vi.mock("../notifications/register", () => ({
  registerDeviceTokenForPush: vi.fn(async () => ({ status: "permission_denied" })),
  signOutPushRegistration: vi.fn(),
  watchPushTokenChanges: vi.fn(async () => () => undefined),
}));

vi.mock("../navigation/useAppDeepLinks", () => ({ useAppDeepLinks: () => undefined }));

import { flushPersistedSession } from "../lib/sessionStorage";
import {
  readTrainerCache,
  setTrainerCacheOwner,
  trainerCacheEpoch,
  writeTrainerCache,
} from "../trainer/cache";
import { AuthProvider, useAuth } from "./AuthProvider";
import { flushMeSnapshot } from "./meSnapshot";

const AARAV = "5e2b7c9a-1d3f-4a6b-8c0e-2f4a6b8c0d1e";
const KARAN = "9b3d5f7a-2c4e-4a6b-8d0f-1a3c5e7b9d2f";
const RAHUL = "8a1c3e5b-7d9f-4b2a-9c4e-6f8a0b2c4d6e";
const RELATIONSHIP = "2c4e6a8b-0d1f-4e3a-8b5c-7d9e1f3a5b7c";
const NATIVE_TOKEN = createTestIdToken("firebase-aarav-mehta", "aarav.client@demo.fitbud.test");

function meFor(userId: string): MeResponse {
  return {
    userId,
    firebaseUid: `firebase-${userId.slice(0, 8)}`,
    accountState: "active",
    timezone: "Asia/Kolkata",
    email: "aarav.client@demo.fitbud.test",
    permittedRoles: ["trainee"],
    selectedRole: "trainee",
    surface: "mobile",
    trainerProfileId: null,
    traineeProfileId: userId,
    trainerProfile: null,
  } as MeResponse;
}

const coachingReady = {
  id: RELATIONSHIP,
  trainerUserId: RAHUL,
  traineeUserId: AARAV,
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-10-08T04:30:00.000Z",
  endedAt: null,
  createdAt: "2026-10-08T04:30:00.000Z",
  updatedAt: "2026-10-08T04:30:00.000Z",
  trainerDisplayName: "Rahul Verma",
} as CoachingRelationship;

let auth: ReturnType<typeof useAuth> | null = null;
function Probe() {
  auth = useAuth();
  return null;
}

function launch() {
  return render(createElement(AuthProvider, null, createElement(Probe)));
}

function view() {
  return routerView(auth!.route, auth!.errorMessage);
}

function online() {
  h.client.me = vi.fn(async () => meFor(AARAV));
  h.client.listRelationships = vi.fn(async () => ({ items: [coachingReady], nextCursor: null }));
}

function offline() {
  h.client.me = vi.fn(async () => {
    throw new TypeError("Network request failed");
  });
  h.client.listRelationships = vi.fn(async () => {
    throw new TypeError("Network request failed");
  });
  h.client.refreshAuth = vi.fn(async () => {
    throw new TypeError("Network request failed");
  });
}

/** Unmount and let every queued keychain write land: the process is gone. */
async function kill() {
  cleanup();
  auth = null;
  // Module state dies with the process: no trainer cache owner survives.
  setTrainerCacheOwner(null);
  await flushPersistedSession();
  await flushMeSnapshot();
}

function storeTestSession(userId = AARAV) {
  h.secure.set("fitbud.testToken", NATIVE_TOKEN);
  h.secure.set(
    "fitbud.session",
    JSON.stringify({ v: 1, userId, tokenKind: "test_id_token", selectedRole: "trainee" }),
  );
}

/** A launch with the network up: the app loads and the snapshot is saved. */
async function firstLaunchOnline() {
  storeTestSession();
  online();
  launch();
  await waitFor(() =>
    expect(view()).toMatchObject({ view: "route", route: { name: "trainee_shell" } }),
  );
  await waitFor(() => expect(h.secure.has("fitbud.me.snapshot")).toBe(true));
  await kill();
}

function foreground() {
  for (const listener of [...h.appState]) listener("active");
}

beforeEach(() => {
  h.secure.clear();
  h.appState.clear();
  h.reportError.mockReset();
  h.client.refreshAuth = vi.fn();
  online();
  auth = null;
});

afterEach(async () => {
  await kill();
});

describe("cold start with no network", () => {
  it("opens on the cached account and coaching, with no error screen", async () => {
    await firstLaunchOnline();
    offline();

    launch();

    await waitFor(() =>
      expect(view()).toMatchObject({
        view: "route",
        route: { name: "trainee_shell", relationship: { id: RELATIONSHIP } },
      }),
    );
    expect(auth!.errorMessage).toBeNull();
    expect(auth!.me?.userId).toBe(AARAV);
    expect(auth!.offlineSnapshot?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The stored session is untouched.
    expect(h.secure.get("fitbud.testToken")).toBe(NATIVE_TOKEN);
  });

  it("with nothing cached it still shows the error screen with Retry", async () => {
    storeTestSession();
    offline();

    launch();

    await waitFor(() => expect(view().view).toBe("error"));
    expect(auth!.me).toBeNull();
    expect(auth!.offlineSnapshot).toBeNull();
  });

  it("never opens on another user's snapshot", async () => {
    await firstLaunchOnline();
    // The phone now holds Karan's session; Aarav's snapshot is still stored.
    storeTestSession(KARAN);
    offline();

    launch();

    await waitFor(() => expect(view().view).toBe("error"));
    expect(auth!.me).toBeNull();
  });

  it("does not set the trainer cache owner from cached data", async () => {
    await firstLaunchOnline();
    offline();
    launch();
    await waitFor(() => expect(auth!.offlineSnapshot).not.toBeNull());

    writeTrainerCache("trainer:clients", { items: [] }, trainerCacheEpoch());

    expect(readTrainerCache("trainer:clients")).toBeNull();
  });

  it("loads the real account as soon as the server answers, without a tap", async () => {
    await firstLaunchOnline();
    offline();
    launch();
    await waitFor(() => expect(auth!.offlineSnapshot).not.toBeNull());

    online();
    await act(async () => {
      foreground();
    });

    await waitFor(() => expect(auth!.offlineSnapshot).toBeNull());
    expect(h.client.me).toHaveBeenCalled();
    expect(view()).toMatchObject({ view: "route", route: { name: "trainee_shell" } });
    expect(auth!.errorMessage).toBeNull();
  });

  it("still offline on the next try: stays on the cached account, quietly", async () => {
    await firstLaunchOnline();
    offline();
    launch();
    await waitFor(() => expect(auth!.offlineSnapshot).not.toBeNull());

    await act(async () => {
      foreground();
    });

    expect(auth!.offlineSnapshot).not.toBeNull();
    expect(view()).toMatchObject({ view: "route", route: { name: "trainee_shell" } });
    expect(h.reportError).not.toHaveBeenCalledWith("auth-snapshot-restore", expect.anything());
  });

  it("the server refusing the session ends it: no stale account stays on screen", async () => {
    await firstLaunchOnline();
    offline();
    launch();
    await waitFor(() => expect(auth!.offlineSnapshot).not.toBeNull());

    h.client.me = vi.fn(async () => {
      throw new ApiClientError({
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
        requestId: "req-1",
        status: 401,
      });
    });
    await act(async () => {
      foreground();
    });

    await waitFor(() => expect(auth!.me).toBeNull());
    expect(auth!.offlineSnapshot).toBeNull();
    await flushMeSnapshot();
    expect(h.secure.has("fitbud.me.snapshot")).toBe(false);
  });

  it("sign-out clears the snapshot: the next offline launch has nothing to open", async () => {
    await firstLaunchOnline();
    launch();
    await waitFor(() => expect(view()).toMatchObject({ route: { name: "trainee_shell" } }));

    act(() => auth!.signOut());
    await kill();

    expect([...h.secure.keys()].filter((key) => key.startsWith("fitbud.me."))).toEqual([]);
    offline();
    launch();
    await waitFor(() => expect(auth!.route.name).toBe("auth"));
    expect(auth!.me).toBeNull();
  });

  it("Firebase session: holds the refresh token offline, then mints a token and loads /me", async () => {
    await firstLaunchOnline();
    h.secure.delete("fitbud.testToken");
    h.secure.set("fitbud.refreshToken", "refresh-stored");
    h.secure.set(
      "fitbud.session",
      JSON.stringify({ v: 1, userId: AARAV, tokenKind: "firebase_id_token", selectedRole: "trainee" }),
    );
    offline();

    launch();
    await waitFor(() =>
      expect(view()).toMatchObject({ view: "route", route: { name: "trainee_shell" } }),
    );
    expect(auth!.accessToken).toBeNull();
    expect(h.client.me).not.toHaveBeenCalled();
    expect(h.secure.get("fitbud.refreshToken")).toBe("refresh-stored");

    online();
    h.client.refreshAuth = vi.fn(async () => ({
      token: "id-fresh",
      refreshToken: "refresh-rotated",
      expiresIn: 3600,
    }));
    await act(async () => {
      foreground();
    });

    await waitFor(() => expect(auth!.offlineSnapshot).toBeNull());
    expect(auth!.accessToken).toBe("id-fresh");
    await flushPersistedSession();
    expect(h.secure.get("fitbud.refreshToken")).toBe("refresh-rotated");
  });
});
