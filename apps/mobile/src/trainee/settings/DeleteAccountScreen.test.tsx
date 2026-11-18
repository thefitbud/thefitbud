import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FitBudApiClient } from "@fitbud/api-client";
import type { MeResponse } from "@fitbud/contracts";
import { fireEvent, render, screen, waitFor } from "../../test/render";

/**
 * Z12-29 delete flow: typed confirm, a fresh sign-in, then POST
 * /account/deletion with that sign-in's token (D-W6-31), never the session's.
 * The client is the real FitBudApiClient (real contracts and error parsing)
 * over a stand-in server that answers with the API's envelopes (Z6-14).
 */

const USER = "3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d";
const OTHER_USER = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";
const PURGE_AFTER = "2027-05-03T04:12:09.000Z";
const SESSION_TOKEN = "test.session-from-yesterday";
const FRESH_TOKEN = "test.fresh-sign-in";

type Call = { method: string; path: string; auth: string | null; role: string | null; body: unknown };

const h = vi.hoisted(() => ({
  calls: [] as Call[],
  routes: {} as Record<string, (call: Call) => { status: number; body: unknown }>,
  auth: {} as Record<string, unknown>,
}));

function stubFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.pathname,
      auth: headers.get("authorization"),
      role: headers.get("x-fitbud-role"),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    h.calls.push(call);
    const route = h.routes[`${call.method} ${call.path}`];
    const reply = route
      ? route(call)
      : { status: 404, body: { error: { code: "NOT_FOUND", message: "Not found.", requestId: "r" } } };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function client(token: string, role: string | null) {
  return new FitBudApiClient({
    baseUrl: "http://api.test",
    fetch: stubFetch(),
    getAccessToken: () => token,
    getSelectedRole: () => role as never,
  });
}

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    createMobileApiClient: (session: {
      getAccessToken: () => string | null;
      getSelectedRole: () => string | null;
    }) =>
      new FitBudApiClient({
        baseUrl: "http://api.test",
        fetch: stubFetch(),
        getAccessToken: session.getAccessToken,
        getSelectedRole: session.getSelectedRole as never,
      }),
  };
});

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => h.auth }));

const { DeleteAccountScreen, isDeleteConfirmed } = await import("./DeleteAccountScreen");
const Linking = (await import("react-native")).Linking;

function me(overrides: Partial<MeResponse> = {}): MeResponse {
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
    ...overrides,
  };
}

function relationship(id: string, status: "active" | "ended") {
  return {
    id,
    trainerUserId: USER,
    traineeUserId: OTHER_USER,
    status,
    onboardingStatus: status === "active" ? "active" : "ended",
    invitationId: null,
    startedAt: "2026-09-01T04:30:00.000Z",
    endedAt: status === "ended" ? "2026-10-20T04:30:00.000Z" : null,
    createdAt: "2026-09-01T04:30:00.000Z",
    updatedAt: "2026-10-20T04:30:00.000Z",
  };
}

const loginOk = (userId = USER) => () => ({
  status: 200,
  body: { data: { token: FRESH_TOKEN, tokenKind: "test_id_token", userId } },
});
const deletionOk = () => ({
  status: 200,
  body: {
    data: {
      accountState: "archived",
      archivedAt: "2026-11-03T04:12:09.000Z",
      purgeAfter: PURGE_AFTER,
    },
  },
});

let finishAccountDeletion: ReturnType<typeof vi.fn>;
let selectRole: ReturnType<typeof vi.fn>;

function setup(meResponse: MeResponse = me(), selectedRole = "trainee") {
  finishAccountDeletion = vi.fn();
  selectRole = vi.fn(async () => undefined);
  h.auth = {
    api: client(SESSION_TOKEN, selectedRole),
    me: meResponse,
    selectedRole,
    selectRole,
    finishAccountDeletion,
  };
  return render(createElement(DeleteAccountScreen, { onBack: vi.fn() }));
}

function typeConfirm(value = "DELETE") {
  fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value } });
}

function continueButton() {
  return screen.getByTestId("delete-account-continue");
}

beforeEach(() => {
  h.calls = [];
  h.routes = {};
});

describe("isDeleteConfirmed", () => {
  it("needs the word DELETE in capitals", () => {
    expect(isDeleteConfirmed("DELETE")).toBe(true);
    expect(isDeleteConfirmed("  DELETE ")).toBe(true);
    expect(isDeleteConfirmed("delete")).toBe(false);
    expect(isDeleteConfirmed("DELET")).toBe(false);
  });
});

describe("DeleteAccountScreen (Z12-29)", () => {
  it("shows the D-W12-6 copy and the mailto link with the subject", () => {
    setup();
    expect(
      screen.getByText(
        "We'll archive your account for 6 months. Sign in again any time in those 6 months to bring it back, with everything as you left it. After 6 months your account and its data are deleted for good.",
      ),
    ).toBeTruthy();
    expect(document.body.textContent).toContain(
      "Want it deleted permanently right away? Email tech@thefitbud.com from the email or phone number on this account and we'll delete it.",
    );
    expect(document.body.textContent).not.toMatch(/30 days/);
    const openURL = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
    fireEvent.click(screen.getByLabelText("Email tech@thefitbud.com"));
    expect(openURL).toHaveBeenCalledWith(
      "mailto:tech@thefitbud.com?subject=Delete%20my%20FitBud%20account",
    );
    openURL.mockRestore();
  });

  it("Delete account stays off until DELETE is typed; nothing is sent before the proof", () => {
    setup();
    expect(continueButton().getAttribute("aria-disabled")).toBe("true");
    typeConfirm("delete");
    expect(continueButton().getAttribute("aria-disabled")).toBe("true");
    typeConfirm("DELETE");
    expect(continueButton().getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(continueButton());
    expect(screen.getByText("Enter your password to delete your account.")).toBeTruthy();
    expect(h.calls).toEqual([]);
  });

  it("deletes with the fresh sign-in's token, then ends the session with the purge date", async () => {
    h.routes["POST /auth/login"] = loginOk();
    h.routes["POST /account/deletion"] = deletionOk;
    setup();
    typeConfirm();
    fireEvent.click(continueButton());
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "FitBud-demo-2026" } });
    fireEvent.click(screen.getByTestId("delete-account-submit"));
    await waitFor(() => expect(finishAccountDeletion).toHaveBeenCalledWith(PURGE_AFTER));
    expect(h.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /auth/login",
      "POST /account/deletion",
    ]);
    expect(h.calls[0]!.body).toEqual({
      identifier: "aarav.patel@demo.fitbud.test",
      password: "FitBud-demo-2026",
    });
    // The session's own (possibly old) token is never the proof.
    expect(h.calls[1]!.auth).toBe(`Bearer ${FRESH_TOKEN}`);
  });

  it("a wrong password says so only behind 401 INVALID_CREDENTIALS, and nothing is deleted", async () => {
    h.routes["POST /auth/login"] = () => ({
      status: 401,
      body: { error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials.", requestId: "r" } },
    });
    setup();
    typeConfirm();
    fireEvent.click(continueButton());
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not-my-password" } });
    fireEvent.click(screen.getByTestId("delete-account-submit"));
    await screen.findByText("That isn't your current password.");
    expect(h.calls.some((c) => c.path === "/account/deletion")).toBe(false);
    expect(finishAccountDeletion).not.toHaveBeenCalled();
  });

  it("refuses a sign-in that belongs to another account", async () => {
    h.routes["POST /auth/login"] = loginOk(OTHER_USER);
    setup(me({ email: null }));
    typeConfirm();
    fireEvent.click(continueButton());
    fireEvent.change(screen.getByLabelText("Mobile number or email"), {
      target: { value: "someone.else@demo.fitbud.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "FitBud-demo-2026" } });
    fireEvent.click(screen.getByTestId("delete-account-submit"));
    await screen.findByText(
      "Those details are for a different account. Use the ones for this account.",
    );
    expect(h.calls.some((c) => c.path === "/account/deletion")).toBe(false);
  });

  it("a trainer with active clients sees the end-coaching-first copy and nothing is archived", async () => {
    h.routes["POST /auth/login"] = loginOk();
    h.routes["POST /account/deletion"] = () => ({
      status: 409,
      body: {
        error: { code: "ACTIVE_CLIENTS", message: "End coaching with your clients first.", requestId: "r" },
      },
    });
    h.routes["GET /relationships"] = (call) => ({
      status: 200,
      body: {
        data: {
          items:
            call.role === "trainer"
              ? [relationship("11111111-1111-4111-8111-111111111111", "active"),
                 relationship("22222222-2222-4222-8222-222222222222", "active"),
                 relationship("33333333-3333-4333-8333-333333333333", "ended")]
              : [],
          nextCursor: null,
        },
      },
    });
    setup(me({ permittedRoles: ["trainer", "trainee"], trainerProfileId: USER }));
    typeConfirm();
    fireEvent.click(continueButton());
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "FitBud-demo-2026" } });
    fireEvent.click(screen.getByTestId("delete-account-submit"));
    await screen.findByText(
      "End coaching with your active clients first. You have 2 active clients.",
    );
    expect(finishAccountDeletion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Go to Clients"));
    expect(selectRole).toHaveBeenCalledWith("trainer");
  });

  it("an account already archived (a second tap) still ends with the server's purge date", async () => {
    h.routes["POST /auth/login"] = loginOk();
    h.routes["POST /account/deletion"] = () => ({
      status: 403,
      body: {
        error: {
          code: "ACCOUNT_ARCHIVED",
          message: "This account is deleted. Sign in again and bring it back to continue.",
          requestId: "r",
          details: { accountState: "archived", purgeAfter: PURGE_AFTER },
        },
      },
    });
    setup();
    typeConfirm();
    fireEvent.click(continueButton());
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "FitBud-demo-2026" } });
    fireEvent.click(screen.getByTestId("delete-account-submit"));
    await waitFor(() => expect(finishAccountDeletion).toHaveBeenCalledWith(PURGE_AFTER));
  });

  it("a code works as the proof too", async () => {
    h.routes["POST /auth/otp/start"] = () => ({
      status: 200,
      body: { data: { sent: true, channels: ["email"] } },
    });
    h.routes["POST /auth/otp/verify"] = () => ({
      status: 200,
      body: { data: { purpose: "login", token: FRESH_TOKEN, tokenKind: "test_id_token", userId: USER } },
    });
    h.routes["POST /account/deletion"] = deletionOk;
    setup();
    typeConfirm();
    fireEvent.click(continueButton());
    fireEvent.click(screen.getByText("Send me a code instead"));
    fireEvent.click(screen.getByTestId("delete-account-send-code"));
    await screen.findByText(
      "We sent a 6-digit code to aarav.patel@demo.fitbud.test. Enter it to delete your account.",
    );
    const input = document.querySelector("input[inputmode='numeric'], input[type='tel'], input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "123456" } });
    await waitFor(() => expect(finishAccountDeletion).toHaveBeenCalledWith(PURGE_AFTER));
    expect(h.calls.find((c) => c.path === "/account/deletion")!.auth).toBe(`Bearer ${FRESH_TOKEN}`);
  });
});
