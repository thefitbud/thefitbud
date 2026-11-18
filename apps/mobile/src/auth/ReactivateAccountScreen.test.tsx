import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type { MeResponse } from "@fitbud/contracts";
import { formatPurgeDate } from "@fitbud/core";
import { act, fireEvent, render, screen, waitFor } from "../test/render";

/**
 * Z12-29: an archived account after sign-in goes to the reactivate screen
 * (BP1-reactivate-account-ios.png, D-W12-6 copy), and the notice shows after
 * a deletion. Renders the real AuthProvider with the real token session; only
 * the network client, storage and push are replaced. The client errors are
 * the API's own shapes: 403 ACCOUNT_ARCHIVED with `purgeAfter` (Z6-14).
 */

const h = vi.hoisted(() => ({
  client: {
    me: vi.fn(),
    listRelationships: vi.fn(),
    refreshAuth: vi.fn(),
    reactivateAccount: vi.fn(),
  },
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, createMobileApiClient: () => h.client };
});

vi.mock("../lib/sessionStorage", () => ({
  clearPersistedSession: vi.fn(),
  loadNativeSession: vi.fn(async () => ({ refreshToken: null, testToken: null, selectedRole: null })),
  loadPersistedSession: vi.fn(() => ({
    accessToken: null,
    selectedRole: null,
    refreshToken: null,
    expiresAt: null,
  })),
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

const { AuthProvider, archivedPurgeAfter, useAuth } = await import("./AuthProvider");
const { ReactivateAccountScreen } = await import("./ReactivateAccountScreen");

const USER = "3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d";
const PURGE_AFTER = "2027-05-03T04:12:09.000Z";
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const PURGE_LABEL = formatPurgeDate(PURGE_AFTER, ZONE);

function archivedError(): ApiClientError {
  return new ApiClientError({
    code: "ACCOUNT_ARCHIVED",
    message: "This account is deleted. Sign in again and bring it back to continue.",
    requestId: "req-archived",
    status: 403,
    details: { accountState: "archived", purgeAfter: PURGE_AFTER },
  });
}

function traineeMe(): MeResponse {
  return {
    userId: USER,
    firebaseUid: "firebase-aarav-patel",
    accountState: "active",
    timezone: "Asia/Kolkata",
    email: "aarav.patel@demo.fitbud.test",
    permittedRoles: ["trainee"],
    selectedRole: "trainee",
    surface: "mobile",
    trainerProfileId: null,
    traineeProfileId: "8d7c6b5a-4f3e-4d2c-9b1a-0f9e8d7c6b5a",
  };
}

let auth: ReturnType<typeof useAuth> | null = null;
function Probe() {
  auth = useAuth();
  return null;
}

function renderProvider() {
  return render(createElement(AuthProvider, null, createElement(Probe)));
}

async function signInArchived() {
  h.client.me.mockRejectedValueOnce(archivedError());
  await act(async () => {
    await auth!.signInWithToken("test.fresh-sign-in");
  });
  await screen.findByText("Welcome back");
}

beforeEach(() => {
  auth = null;
  h.client.me.mockReset();
  h.client.listRelationships.mockReset();
  h.client.reactivateAccount.mockReset();
  h.client.listRelationships.mockResolvedValue({ items: [], nextCursor: null });
});

describe("formatPurgeDate", () => {
  it("reads like Mon 3 May 2027 in the given zone, never ISO", () => {
    expect(formatPurgeDate(PURGE_AFTER, "Asia/Kolkata")).toBe("Mon 3 May 2027");
    // Late on 2 May in UTC is already 3 May in India.
    expect(formatPurgeDate("2027-05-02T20:00:00.000Z", "Asia/Kolkata")).toBe("Mon 3 May 2027");
    expect(formatPurgeDate("2027-05-02T20:00:00.000Z", "UTC")).toBe("Sun 2 May 2027");
  });
});

describe("archivedPurgeAfter", () => {
  it("reads the purge date only from a 403 ACCOUNT_ARCHIVED", () => {
    expect(archivedPurgeAfter(archivedError())).toBe(PURGE_AFTER);
    expect(
      archivedPurgeAfter(
        new ApiClientError({ code: "FORBIDDEN", message: "No.", requestId: "r", status: 403 }),
      ),
    ).toBeNull();
    expect(archivedPurgeAfter(new TypeError("Network request failed"))).toBeNull();
  });
});

describe("ReactivateAccountScreen (Z12-29)", () => {
  it("shows the purge date, the trainee note and both actions", () => {
    render(
      createElement(ReactivateAccountScreen, {
        purgeAfter: PURGE_AFTER,
        role: "trainee",
        busy: false,
        error: null,
        onReactivate: vi.fn(),
        onSignOut: vi.fn(),
        timeZone: "Asia/Kolkata",
      }),
    );
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(
      screen.getByText("Your account is archived and will be deleted for good on Mon 3 May 2027."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Coaching that ended when you deleted your account stays ended. Ask your coach to restart it.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Reactivate my account")).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.getByText("Signing out keeps it archived.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("shows the trainer note for a phone last used as a coach", () => {
    render(
      createElement(ReactivateAccountScreen, {
        purgeAfter: PURGE_AFTER,
        role: "trainer",
        busy: false,
        error: null,
        onReactivate: vi.fn(),
        onSignOut: vi.fn(),
        timeZone: "Asia/Kolkata",
      }),
    );
    expect(
      screen.getByText("Your clients' coaching stays ended. You can restart it from Clients."),
    ).toBeTruthy();
  });
});

describe("AuthProvider routes an archived account (Z12-29)", () => {
  it("signing in to an archived account shows the reactivate screen, not the app", async () => {
    renderProvider();
    await signInArchived();
    expect(
      screen.getByText(`Your account is archived and will be deleted for good on ${PURGE_LABEL}.`),
    ).toBeTruthy();
    // The app underneath shows the splash; the token is kept for reactivation.
    expect(auth!.route).toEqual({ name: "loading" });
    expect(auth!.accessToken).toBe("test.fresh-sign-in");
    expect(auth!.me).toBeNull();
  });

  it("Reactivate my account calls the API, then loads the account into the app", async () => {
    renderProvider();
    await signInArchived();
    h.client.reactivateAccount.mockResolvedValueOnce({ accountState: "active" });
    h.client.me.mockResolvedValueOnce(traineeMe());
    fireEvent.click(screen.getByText("Reactivate my account"));
    await waitFor(() => expect(screen.queryByText("Welcome back")).toBeNull());
    expect(h.client.reactivateAccount).toHaveBeenCalledTimes(1);
    expect(auth!.me?.userId).toBe(USER);
    expect(auth!.selectedRole).toBe("trainee");
  });

  it("a refused reactivation keeps the screen and shows the API's own message", async () => {
    renderProvider();
    await signInArchived();
    h.client.reactivateAccount.mockRejectedValueOnce(
      new ApiClientError({
        code: "RECENT_SIGN_IN_REQUIRED",
        message: "Sign in again to bring your account back.",
        requestId: "req-2",
        status: 403,
      }),
    );
    fireEvent.click(screen.getByText("Reactivate my account"));
    await screen.findByText("Sign in again to bring your account back.");
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(h.client.me).toHaveBeenCalledTimes(1);
  });

  it("Sign out leaves it archived: no reactivation call, back to sign-in", async () => {
    renderProvider();
    await signInArchived();
    fireEvent.click(screen.getByText("Sign out"));
    await waitFor(() => expect(screen.queryByText("Welcome back")).toBeNull());
    expect(h.client.reactivateAccount).not.toHaveBeenCalled();
    expect(auth!.accessToken).toBeNull();
    expect(auth!.route).toEqual({ name: "auth" });
  });

  it("after a deletion the session ends and the archived notice shows the purge date", async () => {
    renderProvider();
    h.client.me.mockResolvedValueOnce(traineeMe());
    await act(async () => {
      await auth!.signInWithToken("test.signed-in");
    });
    expect(auth!.me?.userId).toBe(USER);
    act(() => {
      auth!.finishAccountDeletion(PURGE_AFTER);
    });
    await screen.findByText(
      `Your account is archived. Sign in before ${PURGE_LABEL} to bring it back.`,
    );
    expect(auth!.accessToken).toBeNull();
    expect(auth!.me).toBeNull();
    fireEvent.click(screen.getByText("OK"));
    await waitFor(() =>
      expect(screen.queryByText(/Your account is archived\. Sign in before/)).toBeNull(),
    );
    expect(auth!.route).toEqual({ name: "auth" });
  });
});
