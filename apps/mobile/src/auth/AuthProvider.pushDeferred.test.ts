// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachingRelationship, MeResponse } from "@fitbud/contracts";
import { createTestIdToken } from "../lib/testToken";
import { routerView } from "../navigation/routerView";

/**
 * Z14-3: push registration runs after the first screen renders. The real
 * provider, with the push call held open by a deferred promise: the app must
 * reach its shell while registration is still pending, and a registration
 * that fails later is reported, never shown.
 */

const h = vi.hoisted(() => {
  const client = { me: vi.fn(), listRelationships: vi.fn(), refreshAuth: vi.fn() };
  const reportError = vi.fn();
  const secure = new Map<string, string>();
  const push: { release: (value: unknown) => void; reject: (error: unknown) => void } = {
    release: () => undefined,
    reject: () => undefined,
  };
  return { client, reportError, secure, push };
});

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  NativeModules: {},
  View: ({ children }: { children?: unknown }) => children,
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

const registerDeviceTokenForPush = vi.hoisted(() => vi.fn());
vi.mock("../notifications/register", () => ({
  registerDeviceTokenForPush,
  signOutPushRegistration: vi.fn(),
  watchPushTokenChanges: vi.fn(async () => () => undefined),
}));

vi.mock("../navigation/useAppDeepLinks", () => ({ useAppDeepLinks: () => undefined }));

import { flushPersistedSession } from "../lib/sessionStorage";
import { setTrainerCacheOwner } from "../trainer/cache";
import { AuthProvider, useAuth } from "./AuthProvider";
import { flushMeSnapshot } from "./meSnapshot";

const AARAV = "5e2b7c9a-1d3f-4a6b-8c0e-2f4a6b8c0d1e";
const RAHUL = "8a1c3e5b-7d9f-4b2a-9c4e-6f8a0b2c4d6e";
const RELATIONSHIP = "2c4e6a8b-0d1f-4e3a-8b5c-7d9e1f3a5b7c";
const NATIVE_TOKEN = createTestIdToken("firebase-aarav-mehta", "aarav.client@demo.fitbud.test");

const me = {
  userId: AARAV,
  firebaseUid: "firebase-5e2b7c9a",
  accountState: "active",
  timezone: "Asia/Kolkata",
  email: "aarav.client@demo.fitbud.test",
  permittedRoles: ["trainee"],
  selectedRole: "trainee",
  surface: "mobile",
  trainerProfileId: null,
  traineeProfileId: AARAV,
  trainerProfile: null,
} as MeResponse;

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

beforeEach(() => {
  h.secure.clear();
  h.reportError.mockReset();
  registerDeviceTokenForPush.mockReset();
  h.secure.set("fitbud.testToken", NATIVE_TOKEN);
  h.secure.set(
    "fitbud.session",
    JSON.stringify({ v: 1, userId: AARAV, tokenKind: "test_id_token", selectedRole: "trainee" }),
  );
  h.client.me = vi.fn(async () => me);
  h.client.listRelationships = vi.fn(async () => ({ items: [coachingReady], nextCursor: null }));
  h.client.refreshAuth = vi.fn();
  auth = null;
});

afterEach(async () => {
  cleanup();
  auth = null;
  setTrainerCacheOwner(null);
  await flushPersistedSession();
  await flushMeSnapshot();
});

describe("cold start and push registration (Z14-3)", () => {
  it("renders the first screen before push registration resolves", async () => {
    const pending = new Promise((resolve, reject) => {
      h.push.release = resolve;
      h.push.reject = reject;
    });
    registerDeviceTokenForPush.mockReturnValue(pending);

    render(createElement(AuthProvider, null, createElement(Probe)));

    await waitFor(() =>
      expect(routerView(auth!.route, auth!.errorMessage)).toMatchObject({
        view: "route",
        route: { name: "trainee_shell", relationship: { id: RELATIONSHIP } },
      }),
    );
    // Registration was started and is still open: the screen did not wait.
    expect(registerDeviceTokenForPush).toHaveBeenCalledTimes(1);
    expect(auth!.errorMessage).toBeNull();

    h.push.release({ status: "permission_denied" });
    await Promise.resolve();
    expect(h.reportError).not.toHaveBeenCalled();
  });

  it("a registration that fails after the first screen is reported, not shown", async () => {
    const failure = new Error("push service unavailable");
    registerDeviceTokenForPush.mockRejectedValue(failure);

    render(createElement(AuthProvider, null, createElement(Probe)));

    await waitFor(() => expect(h.reportError).toHaveBeenCalledWith("auth-push-register", failure));
    expect(auth!.errorMessage).toBeNull();
    expect(routerView(auth!.route, auth!.errorMessage)).toMatchObject({ view: "route" });
  });
});
