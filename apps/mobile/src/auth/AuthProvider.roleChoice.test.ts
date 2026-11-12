// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type { CoachingRelationship, MeResponse, Role } from "@fitbud/contracts";
import type { ParsedDeepLink } from "../navigation/linking";

/**
 * Z11-14: role choice in the real AuthProvider, with the real session storage
 * (web localStorage) and the real token session. Only the network client,
 * push and the deep-link source are replaced. A "relaunch" unmounts the
 * provider and mounts a new one over the same localStorage.
 */

const h = vi.hoisted(() => {
  const platform = { OS: "web" as string };
  const client = {
    me: vi.fn(),
    listRelationships: vi.fn(),
    refreshAuth: vi.fn(),
  };
  // The provider's deep-link callback, so a test can open a link.
  const deepLink = { onLink: null as null | ((link: unknown) => void) };
  return { platform, client, deepLink };
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
  secureGet: async () => null,
  secureSet: async () => undefined,
  secureDelete: async () => undefined,
}));

vi.mock("../notifications/register", () => ({
  registerDeviceTokenForPush: vi.fn(async () => ({ status: "permission_denied" })),
  signOutPushRegistration: vi.fn(),
  watchPushTokenChanges: vi.fn(async () => () => undefined),
}));

vi.mock("../navigation/useAppDeepLinks", () => ({
  useAppDeepLinks: (onLink: (link: unknown) => void) => {
    h.deepLink.onLink = onLink;
  },
}));

import { AuthProvider, useAuth } from "./AuthProvider";

const USER = "7a2d4c1e-5b3f-4d6a-9e8c-2f1a0b9c8d7e";
const TRAINER_OF_USER = "3c9e1b7a-2d4f-4a6c-8e0b-5f7d9a1c3e2b";
const RELATIONSHIP = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";

function meFor(roles: Role[], displayName = "Karan Shah"): MeResponse {
  return {
    userId: USER,
    firebaseUid: "firebase-karan-shah",
    accountState: "active",
    timezone: "Asia/Calcutta",
    email: "karan.coach@demo.fitbud.test",
    permittedRoles: roles,
    selectedRole: null,
    surface: "mobile",
    trainerProfileId: roles.includes("trainer") ? USER : null,
    traineeProfileId: roles.includes("trainee") ? USER : null,
    trainerProfile: roles.includes("trainer") ? { displayName, whatsappE164: null } : null,
  } as unknown as MeResponse;
}

const coachingReady: CoachingRelationship = {
  id: RELATIONSHIP,
  trainerUserId: TRAINER_OF_USER,
  traineeUserId: USER,
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-10-01T04:30:00.000Z",
  endedAt: null,
  createdAt: "2026-10-01T04:30:00.000Z",
  updatedAt: "2026-10-01T04:30:00.000Z",
  trainerDisplayName: "Meera Iyer",
} as CoachingRelationship;

let auth: ReturnType<typeof useAuth> | null = null;
/** Every route name the provider rendered, in order. */
let routes: string[] = [];
function Probe() {
  auth = useAuth();
  routes.push(auth.route.name);
  return null;
}

function launch() {
  return render(createElement(AuthProvider, null, createElement(Probe)));
}

/** The app is closed and opened again over the same storage. */
function relaunch() {
  cleanup();
  auth = null;
  routes = [];
  return launch();
}

async function signInDual() {
  h.client.me.mockResolvedValueOnce(meFor(["trainer", "trainee"]));
  await act(async () => {
    await auth!.signInWithToken("test-token-karan");
  });
  expect(auth!.route.name).toBe("role_select");
}

async function pick(role: Role, options?: { remember?: boolean }) {
  h.client.me.mockResolvedValueOnce(meFor(["trainer", "trainee"]));
  await act(async () => {
    await auth!.selectRole(role, options);
  });
}

function openLink(link: ParsedDeepLink) {
  act(() => h.deepLink.onLink!(link));
}

beforeEach(() => {
  h.platform.OS = "web";
  h.client.me = vi.fn(async () => meFor(["trainer", "trainee"]));
  h.client.listRelationships = vi.fn(async () => ({ items: [coachingReady], nextCursor: null }));
  h.client.refreshAuth = vi.fn();
  localStorage.clear();
  auth = null;
  routes = [];
});

afterEach(() => {
  cleanup();
});

describe("Remember my choice (frame 59)", () => {
  it("ticked (the default) restores the last role on the next launch", async () => {
    launch();
    await signInDual();
    expect(auth!.rememberRole).toBe(true);
    await pick("trainee", { remember: true });
    expect(auth!.route.name).toBe("trainee_shell");

    relaunch();
    await waitFor(() => expect(auth!.route.name).toBe("trainee_shell"));
    expect(auth!.selectedRole).toBe("trainee");
  });

  it("unticked keeps the role for this session, then the next launch asks again", async () => {
    launch();
    await signInDual();
    await pick("trainer", { remember: false });
    expect(auth!.route.name).toBe("trainer_shell");
    expect(auth!.rememberRole).toBe(false);
    expect(localStorage.getItem("fitbud.selectedRole")).toBeNull();

    relaunch();
    await waitFor(() => expect(auth!.route.name).toBe("role_select"));
    expect(auth!.selectedRole).toBeNull();
    // The screen opens with the box as the user left it.
    expect(auth!.rememberRole).toBe(false);
  });

  it("a token refresh while unticked does not store the role", async () => {
    launch();
    await signInDual();
    await pick("trainee", { remember: false });
    // refreshSession persists the session again (as a web reload does).
    await act(async () => {
      await auth!.refreshSession();
    });
    expect(localStorage.getItem("fitbud.selectedRole")).toBeNull();
    expect(localStorage.getItem("fitbud.accessToken")).toBe("test-token-karan");
  });

  it("ticking it again stores the role once more", async () => {
    launch();
    await signInDual();
    await pick("trainer", { remember: false });
    act(() => auth!.requestRoleSelect());
    await pick("trainer", { remember: true });

    relaunch();
    await waitFor(() => expect(auth!.route.name).toBe("trainer_shell"));
  });

  it("a switch without a remember choice keeps the stored one", async () => {
    launch();
    await signInDual();
    await pick("trainer", { remember: false });
    await pick("trainee");
    expect(auth!.rememberRole).toBe(false);
    expect(localStorage.getItem("fitbud.selectedRole")).toBeNull();
  });

  it("sign-out clears it, so the next sign-in starts ticked", async () => {
    launch();
    await signInDual();
    await pick("trainer", { remember: false });
    act(() => auth!.signOut());
    expect(localStorage.getItem("fitbud.rememberRole")).toBeNull();
    expect(auth!.rememberRole).toBe(true);

    await signInDual();
    expect(auth!.rememberRole).toBe(true);
  });

  it("a stored role the server no longer permits is ignored", async () => {
    localStorage.setItem("fitbud.accessToken", "test-token-karan");
    localStorage.setItem("fitbud.selectedRole", "trainer");
    h.client.me = vi.fn(async () => meFor(["trainee"]));

    launch();
    await waitFor(() => expect(auth!.route.name).toBe("trainee_shell"));
    expect(auth!.selectedRole).toBe("trainee");
  });
});

describe("Switch role from trainer More", () => {
  it("opens role select for a dual-role account, and picking leaves it", async () => {
    launch();
    await signInDual();
    await pick("trainer");
    act(() => auth!.requestRoleSelect());
    expect(auth!.route.name).toBe("role_select");
    // The current role still applies until the user picks.
    expect(auth!.selectedRole).toBe("trainer");

    await pick("trainee");
    expect(auth!.route.name).toBe("trainee_shell");
  });

  it("does nothing for a trainer-only account", async () => {
    h.client.me = vi.fn(async () => meFor(["trainer"]));
    launch();
    await act(async () => {
      await auth!.signInWithToken("test-token-karan");
    });
    expect(auth!.route.name).toBe("trainer_shell");
    act(() => auth!.requestRoleSelect());
    expect(auth!.route.name).toBe("trainer_shell");
  });

  it("sign-out drops a pending role select request", async () => {
    launch();
    await signInDual();
    await pick("trainer");
    act(() => auth!.requestRoleSelect());
    act(() => auth!.signOut());
    h.client.me.mockResolvedValueOnce(meFor(["trainer"]));
    await act(async () => {
      await auth!.signInWithToken("test-token-other");
    });
    expect(auth!.route.name).toBe("trainer_shell");
  });
});

describe("Links that need the other role (frame 61)", () => {
  const exceptionLink: ParsedDeepLink = { kind: "exception", id: "exc-1" };
  const mealLink: ParsedDeepLink = { kind: "meal", id: "meal-1" };

  it("a coach link in trainee mode asks first and is held back from the shells", async () => {
    launch();
    await signInDual();
    await pick("trainee");
    openLink(exceptionLink);
    expect(auth!.pendingRoleSwitch).toEqual({ targetRole: "trainer", linkKind: "exception" });
    expect(auth!.pendingDeepLink).toBeNull();
  });

  it("Switch changes to the trainer role and then hands the link over", async () => {
    launch();
    await signInDual();
    await pick("trainee");
    openLink(exceptionLink);
    h.client.me.mockResolvedValueOnce(meFor(["trainer", "trainee"]));
    await act(async () => {
      await auth!.confirmRoleSwitch();
    });
    expect(auth!.selectedRole).toBe("trainer");
    expect(auth!.route.name).toBe("trainer_shell");
    expect(auth!.pendingRoleSwitch).toBeNull();
    expect(auth!.pendingDeepLink).toEqual(exceptionLink);
  });

  it("Cancel stays in trainee mode and drops the link", async () => {
    launch();
    await signInDual();
    await pick("trainee");
    openLink(exceptionLink);
    act(() => auth!.cancelRoleSwitch());
    expect(auth!.selectedRole).toBe("trainee");
    expect(auth!.route.name).toBe("trainee_shell");
    expect(auth!.pendingRoleSwitch).toBeNull();
    expect(auth!.pendingDeepLink).toBeNull();
  });

  it("a trainee link in trainer mode shows no prompt (unchanged)", async () => {
    launch();
    await signInDual();
    await pick("trainer");
    openLink(mealLink);
    expect(auth!.pendingRoleSwitch).toBeNull();
    expect(auth!.pendingDeepLink).toEqual(mealLink);
    expect(auth!.selectedRole).toBe("trainer");
  });

  it("a coach link for a trainee-only account shows no prompt", async () => {
    h.client.me = vi.fn(async () => meFor(["trainee"]));
    launch();
    await act(async () => {
      await auth!.signInWithToken("test-token-karan");
    });
    openLink(exceptionLink);
    expect(auth!.pendingRoleSwitch).toBeNull();
  });

  it("a coach link that arrives before the role is picked asks once trainee is picked", async () => {
    launch();
    await signInDual();
    openLink(exceptionLink);
    expect(auth!.pendingRoleSwitch).toBeNull();
    await pick("trainee");
    expect(auth!.pendingRoleSwitch).toEqual({ targetRole: "trainer", linkKind: "exception" });
  });
});

describe("reloadMe (profile Save)", () => {
  it("refreshes me without the loading state or a route change", async () => {
    launch();
    await signInDual();
    await pick("trainer");
    routes = [];
    h.client.me.mockResolvedValueOnce(meFor(["trainer", "trainee"], "Karan S"));
    await act(async () => {
      await auth!.reloadMe();
    });
    expect(auth!.me?.trainerProfile?.displayName).toBe("Karan S");
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((name) => name === "trainer_shell")).toBe(true);
  });

  it("a failed reload keeps me and shows no error screen", async () => {
    launch();
    await signInDual();
    await pick("trainer");
    routes = [];
    h.client.me.mockRejectedValueOnce(new TypeError("Network request failed"));
    await act(async () => {
      await auth!.reloadMe();
    });
    expect(auth!.me?.trainerProfile?.displayName).toBe("Karan Shah");
    expect(auth!.errorMessage).toBeNull();
    expect(routes.every((name) => name === "trainer_shell")).toBe(true);
  });

  it("a 401 on reload ends the session, as refreshSession does", async () => {
    launch();
    await signInDual();
    await pick("trainer");
    h.client.me.mockRejectedValueOnce(
      new ApiClientError({ code: "UNAUTHENTICATED", message: "Sign in again.", requestId: "req-1", status: 401 }),
    );
    await act(async () => {
      await auth!.reloadMe();
    });
    expect(auth!.me).toBeNull();
    expect(localStorage.getItem("fitbud.accessToken")).toBeNull();
  });

  it("a role the server no longer permits is dropped on reload", async () => {
    launch();
    await signInDual();
    await pick("trainer");
    h.client.me.mockResolvedValueOnce(meFor(["trainee"]));
    await act(async () => {
      await auth!.reloadMe();
    });
    expect(auth!.selectedRole).toBe("trainee");
    expect(auth!.route.name).toBe("trainee_shell");
  });
});
