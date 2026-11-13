// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type { CoachingRelationship, MeResponse } from "@fitbud/contracts";
import { NET_COPY } from "../lib/authErrors";
import { createTestIdToken } from "../lib/testToken";
import { routerView } from "../navigation/routerView";

/**
 * Z11b-7: a mid-session `refreshSession` (pull to refresh, a notification tap,
 * coaching resume) that fails while offline keeps the app on screen. Renders
 * the real provider with the real session storage (web localStorage), the
 * real token session and the real router-view rule. Only the network client,
 * push, the deep-link source and the error reporter are replaced.
 */

const h = vi.hoisted(() => {
  const platform = { OS: "web" as string };
  const client = { me: vi.fn(), listRelationships: vi.fn(), refreshAuth: vi.fn() };
  const reportError = vi.fn();
  // Native SecureStore, as the trainee iOS build reads it at launch.
  const secure = new Map<string, string>();
  return { platform, client, reportError, secure };
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

import { AuthProvider, useAuth } from "./AuthProvider";

const AARAV = "5e2b7c9a-1d3f-4a6b-8c0e-2f4a6b8c0d1e";
const RAHUL = "8a1c3e5b-7d9f-4b2a-9c4e-6f8a0b2c4d6e";
const RELATIONSHIP = "2c4e6a8b-0d1f-4e3a-8b5c-7d9e1f3a5b7c";
const TOKEN = "test-token-aarav";
/** The AUTH_MODE=test token the native build keeps in SecureStore. */
const NATIVE_TOKEN = createTestIdToken("firebase-aarav-mehta", "aarav.client@demo.fitbud.test");

const aaravMe = {
  userId: AARAV,
  firebaseUid: "firebase-aarav-mehta",
  accountState: "active",
  timezone: "Asia/Calcutta",
  email: "aarav.client@demo.fitbud.test",
  permittedRoles: ["trainee"],
  selectedRole: "trainee",
  surface: "mobile",
  trainerProfileId: null,
  traineeProfileId: AARAV,
  trainerProfile: null,
} as unknown as MeResponse;

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

/** What AppRouter would show right now. */
function view() {
  return routerView(auth!.route, auth!.errorMessage);
}

/** A status-0 client error, as `isNetworkFailure` recognises it. */
function networkError(): ApiClientError {
  return new ApiClientError({
    code: "NETWORK_ERROR",
    message: "Network request failed.",
    requestId: "req-offline",
    status: 0,
  });
}

function apiError(status: number, code: string): ApiClientError {
  return new ApiClientError({ code, message: "Request refused.", requestId: "req-1", status });
}

/** Aarav is signed in and on Today, with `me` and his coaching loaded. */
async function signedInOnTraineeShell() {
  launch();
  await act(async () => {
    await auth!.signInWithToken(TOKEN);
  });
  expect(view()).toMatchObject({ view: "route", route: { name: "trainee_shell" } });
  h.reportError.mockClear();
}

async function refresh() {
  await act(async () => {
    await auth!.refreshSession();
  });
}

function expectStillOnTraineeShell() {
  expect(auth!.errorMessage).toBeNull();
  expect(view()).toMatchObject({
    view: "route",
    route: { name: "trainee_shell", relationship: { id: RELATIONSHIP } },
  });
  expect(auth!.me?.userId).toBe(AARAV);
  expect(auth!.accessToken).toBe(TOKEN);
  expect(localStorage.getItem("fitbud.accessToken")).toBe(TOKEN);
}

beforeEach(() => {
  h.platform.OS = "web";
  h.client.me = vi.fn(async () => aaravMe);
  h.client.listRelationships = vi.fn(async () => ({ items: [coachingReady], nextCursor: null }));
  h.client.refreshAuth = vi.fn();
  h.reportError.mockReset();
  h.secure.clear();
  localStorage.clear();
  auth = null;
});

afterEach(() => {
  cleanup();
});

describe("refreshSession mid-session (Z11b-7)", () => {
  it("offline (status-0 client error): stays on the trainee shell and reports quietly", async () => {
    await signedInOnTraineeShell();
    h.client.me.mockRejectedValueOnce(networkError());
    await refresh();
    expectStillOnTraineeShell();
    expect(h.reportError).toHaveBeenCalledTimes(1);
    expect(h.reportError.mock.calls[0]![0]).toBe("auth-refresh-offline");
  });

  it("offline (fetch TypeError): stays on the trainee shell", async () => {
    await signedInOnTraineeShell();
    h.client.me.mockRejectedValueOnce(new TypeError("Network request failed"));
    await refresh();
    expectStillOnTraineeShell();
    expect(h.reportError.mock.calls[0]![0]).toBe("auth-refresh-offline");
  });

  it("offline after /me answers (relationships fail): keeps the loaded coaching", async () => {
    await signedInOnTraineeShell();
    h.client.listRelationships.mockRejectedValueOnce(networkError());
    await refresh();
    expectStillOnTraineeShell();
    expect(auth!.relationships.map((r) => r.id)).toEqual([RELATIONSHIP]);
  });

  it("a server error with the account loaded also keeps the app and reports it", async () => {
    await signedInOnTraineeShell();
    h.client.me.mockRejectedValueOnce(apiError(503, "SERVICE_UNAVAILABLE"));
    await refresh();
    expectStillOnTraineeShell();
    expect(h.reportError.mock.calls[0]![0]).toBe("auth-refresh");
  });

  it("the next refresh after reconnecting loads /me as usual", async () => {
    await signedInOnTraineeShell();
    h.client.me.mockRejectedValueOnce(networkError());
    await refresh();
    await refresh();
    expectStillOnTraineeShell();
    expect(h.client.me).toHaveBeenCalledTimes(3);
  });

  it("401 still drops the session (unchanged)", async () => {
    await signedInOnTraineeShell();
    h.client.me.mockRejectedValueOnce(apiError(401, "UNAUTHENTICATED"));
    await refresh();
    expect(auth!.me).toBeNull();
    expect(auth!.accessToken).toBeNull();
    expect(localStorage.getItem("fitbud.accessToken")).toBeNull();
    expect(auth!.route.name).toBe("auth");
    expect(h.reportError).not.toHaveBeenCalled();
  });
});

describe("native (iOS) build", () => {
  /** A signed-in trainee test session, as SecureStore holds it. */
  function storeNativeSession() {
    h.platform.OS = "ios";
    h.secure.set("fitbud.testToken", NATIVE_TOKEN);
    h.secure.set(
      "fitbud.session",
      JSON.stringify({ v: 1, userId: AARAV, tokenKind: "test_id_token", selectedRole: "trainee" }),
    );
  }

  it("in-session pull to refresh offline keeps the trainee shell", async () => {
    storeNativeSession();
    launch();
    await waitFor(() =>
      expect(view()).toMatchObject({ view: "route", route: { name: "trainee_shell" } }),
    );
    h.client.me.mockRejectedValueOnce(new TypeError("Network request failed"));
    await refresh();
    expect(auth!.errorMessage).toBeNull();
    expect(view()).toMatchObject({ view: "route", route: { name: "trainee_shell" } });
    expect(auth!.me?.userId).toBe(AARAV);
    expect(h.secure.get("fitbud.testToken")).toBe(NATIVE_TOKEN);
  });

  it("offline at launch (no account yet) still shows the error screen with Retry", async () => {
    storeNativeSession();
    h.client.me.mockRejectedValueOnce(new TypeError("Network request failed"));
    launch();
    await waitFor(() => expect(view().view).toBe("error"));
    expect(auth!.me).toBeNull();
    expect(h.secure.get("fitbud.testToken")).toBe(NATIVE_TOKEN);

    // Retry once back online opens the app.
    await refresh();
    expect(view()).toMatchObject({ view: "route", route: { name: "trainee_shell" } });
  });
});

describe("refreshSession with no account loaded yet (web)", () => {
  it("offline on launch with a stored token: the AUTH-NET message still shows", async () => {
    localStorage.setItem("fitbud.accessToken", TOKEN);
    localStorage.setItem("fitbud.selectedRole", "trainee");
    // What fetch throws on a phone with no network (the device report's copy).
    h.client.me.mockRejectedValueOnce(new TypeError("Network request failed"));
    launch();
    await waitFor(() => expect(auth!.errorMessage).toBe(NET_COPY));
    expect(auth!.me).toBeNull();
    // With no `me`, web lands on the auth screen, which shows the message.
    expect(view()).toEqual({ view: "route", route: { name: "auth" } });
    // The stored session is kept for Retry.
    expect(localStorage.getItem("fitbud.accessToken")).toBe(TOKEN);

    await refresh();
    expect(auth!.errorMessage).toBeNull();
    expect(view()).toMatchObject({ view: "route", route: { name: "trainee_shell" } });
  });
});
