/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import {
  ACCOUNT_DELETION_MAILTO,
  accountDeletionCopy,
  formatPurgeDate,
} from "@fitbud/core";

const finishAccountDeletion = vi.fn();
const login = vi.fn();

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: {
      userId: "trainer-user-1",
      email: "rahul.coach@demo.fitbud.test",
      timezone: "Asia/Kolkata",
      permittedRoles: ["trainer"],
    },
    finishAccountDeletion,
    loading: false,
  }),
}));

vi.mock("../../lib/stage1-api", () => ({
  stage1Api: {
    login: (...args: unknown[]) => login(...args),
  },
}));

const { PrivacyDataPage, isDeleteConfirmed, requestAccountDeletion } = await import(
  "./PrivacyDataPage"
);

const PURGE_AFTER = "2027-05-03T04:12:09.000Z";
const FRESH_TOKEN = "test.fresh-sign-in";
const TRAINER = "3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d";
const TRAINEE_A = "11111111-1111-4111-8111-111111111111";
const TRAINEE_B = "22222222-2222-4222-8222-222222222222";
const REL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function relationship(id: string, traineeUserId: string, status: "active" | "ended") {
  return {
    id,
    trainerUserId: TRAINER,
    traineeUserId,
    status,
    onboardingStatus: status === "active" ? "active" : "ended",
    invitationId: null,
    startedAt: "2026-09-01T04:30:00.000Z",
    endedAt: status === "ended" ? "2026-10-20T04:30:00.000Z" : null,
    createdAt: "2026-09-01T04:30:00.000Z",
    updatedAt: "2026-10-20T04:30:00.000Z",
  };
}

type Call = { method: string; path: string; auth: string | null; credentials: RequestCredentials | undefined };

const h = vi.hoisted(() => ({
  calls: [] as Call[],
  routes: {} as Record<string, (call: Call) => { status: number; body: unknown }>,
}));

function stubFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://api.test");
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.pathname.replace(/^\/api/, "") || url.pathname,
      auth: headers.get("authorization"),
      credentials: init?.credentials,
    };
    // FitBudApiClient prefixes baseUrl; path may be /api/... when base is /api
    if (call.path.startsWith("/api/")) call.path = call.path.slice(4);
    h.calls.push(call);
    const route = h.routes[`${call.method} ${call.path}`];
    const reply = route
      ? route(call)
      : {
          status: 404,
          body: {
            error: { code: "NOT_FOUND", message: "Not found.", requestId: "r" },
          },
        };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.calls = [];
  h.routes = {};
  vi.stubGlobal("fetch", undefined);
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PrivacyDataPage />
    </MemoryRouter>,
  );
}

describe("isDeleteConfirmed", () => {
  it("needs the word DELETE in capitals", () => {
    expect(isDeleteConfirmed("DELETE")).toBe(true);
    expect(isDeleteConfirmed("  DELETE ")).toBe(true);
    expect(isDeleteConfirmed("delete")).toBe(false);
    expect(isDeleteConfirmed("DELET")).toBe(false);
  });
});

describe("requestAccountDeletion", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("POSTs /account/deletion with the fresh bearer and omits cookies", async () => {
    h.routes["POST /account/deletion"] = () => ({
      status: 200,
      body: {
        data: {
          accountState: "archived",
          archivedAt: "2026-11-03T04:12:09.000Z",
          purgeAfter: PURGE_AFTER,
        },
      },
    });
    const outcome = await requestAccountDeletion({ token: FRESH_TOKEN });
    expect(outcome).toEqual({ kind: "archived", purgeAfter: PURGE_AFTER });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.auth).toBe(`Bearer ${FRESH_TOKEN}`);
    expect(h.calls[0]!.credentials).toBe("omit");
  });

  it("returns active_clients copy on 409 ACTIVE_CLIENTS", async () => {
    h.routes["POST /account/deletion"] = () => ({
      status: 409,
      body: {
        error: {
          code: "ACTIVE_CLIENTS",
          message: "End coaching with your clients first.",
          requestId: "r",
        },
      },
    });
    h.routes["GET /relationships"] = () => ({
      status: 200,
      body: {
        data: {
          items: [
            relationship(REL_A, TRAINEE_A, "active"),
            relationship(REL_B, TRAINEE_B, "active"),
          ],
          nextCursor: null,
        },
      },
    });
    const outcome = await requestAccountDeletion({ token: FRESH_TOKEN });
    expect(outcome).toEqual({
      kind: "active_clients",
      copy: accountDeletionCopy.activeClients(2),
    });
  });
});

describe("PrivacyDataPage delete account (Z12-30)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
    login.mockResolvedValue({
      token: FRESH_TOKEN,
      tokenKind: "test_id_token",
      userId: "trainer-user-1",
    });
  });

  it("shows D-W12-6 copy and the mailto with subject", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("delete-account-open"));
    expect(
      screen.getByText(
        "We'll archive your account for 6 months. Sign in again any time in those 6 months to bring it back, with everything as you left it. After 6 months your account and its data are deleted for good.",
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/30 days/);
    const mail = screen.getByRole("link", { name: "tech@thefitbud.com" });
    expect(mail.getAttribute("href")).toBe(ACCOUNT_DELETION_MAILTO);
  });

  it("keeps Delete account off until DELETE is typed; nothing is sent before proof", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("delete-account-open"));
    const continueBtn = screen.getByTestId(
      "delete-account-continue",
    ) as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("delete-account-confirm"), {
      target: { value: "delete" },
    });
    expect(continueBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("delete-account-confirm"), {
      target: { value: "DELETE" },
    });
    expect(continueBtn.disabled).toBe(false);
    fireEvent.click(continueBtn);
    expect(
      screen.getByText("Enter your password to delete your account."),
    ).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it("deletes with the fresh sign-in's token, then ends the session", async () => {
    h.routes["POST /account/deletion"] = () => ({
      status: 200,
      body: {
        data: {
          accountState: "archived",
          archivedAt: "2026-11-03T04:12:09.000Z",
          purgeAfter: PURGE_AFTER,
        },
      },
    });
    renderPage();
    fireEvent.click(screen.getByTestId("delete-account-open"));
    fireEvent.change(screen.getByTestId("delete-account-confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByTestId("delete-account-continue"));
    fireEvent.change(screen.getByTestId("delete-account-password"), {
      target: { value: "FitBud-demo-2026" },
    });
    fireEvent.click(screen.getByTestId("delete-account-submit"));
    await waitFor(() =>
      expect(finishAccountDeletion).toHaveBeenCalledWith(PURGE_AFTER),
    );
    expect(login).toHaveBeenCalledWith({
      identifier: "rahul.coach@demo.fitbud.test",
      password: "FitBud-demo-2026",
    });
    expect(h.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /account/deletion",
    ]);
    expect(h.calls[0]!.auth).toBe(`Bearer ${FRESH_TOKEN}`);
    expect(h.calls[0]!.credentials).toBe("omit");
  });

  it("a wrong password says so only behind 401 INVALID_CREDENTIALS", async () => {
    login.mockRejectedValue(
      new ApiClientError({
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials.",
        requestId: "r",
        status: 401,
      }),
    );
    renderPage();
    fireEvent.click(screen.getByTestId("delete-account-open"));
    fireEvent.change(screen.getByTestId("delete-account-confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByTestId("delete-account-continue"));
    fireEvent.change(screen.getByTestId("delete-account-password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByTestId("delete-account-submit"));
    await screen.findByText("That password doesn't match.");
    expect(h.calls.some((c) => c.path === "/account/deletion")).toBe(false);
    expect(finishAccountDeletion).not.toHaveBeenCalled();
  });

  it("shows end-coaching-first copy and links to Clients when active", async () => {
    h.routes["POST /account/deletion"] = () => ({
      status: 409,
      body: {
        error: {
          code: "ACTIVE_CLIENTS",
          message: "End coaching with your clients first.",
          requestId: "r",
        },
      },
    });
    h.routes["GET /relationships"] = () => ({
      status: 200,
      body: {
        data: {
          items: [
            relationship(REL_A, TRAINEE_A, "active"),
            relationship(REL_B, TRAINEE_B, "active"),
          ],
          nextCursor: null,
        },
      },
    });
    renderPage();
    fireEvent.click(screen.getByTestId("delete-account-open"));
    fireEvent.change(screen.getByTestId("delete-account-confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByTestId("delete-account-continue"));
    fireEvent.change(screen.getByTestId("delete-account-password"), {
      target: { value: "FitBud-demo-2026" },
    });
    fireEvent.click(screen.getByTestId("delete-account-submit"));
    await screen.findByTestId("delete-account-active-clients");
    expect(screen.getByText(accountDeletionCopy.activeClients(2))).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Clients" }).getAttribute("href")).toBe(
      "/clients",
    );
    expect(finishAccountDeletion).not.toHaveBeenCalled();
  });
});

describe("purge date formatting", () => {
  it("formats as a civil date with year, never ISO", () => {
    const label = formatPurgeDate(PURGE_AFTER, "Asia/Kolkata");
    expect(label).toMatch(/May 2027/);
    expect(label).not.toMatch(/2027-05/);
  });
});
