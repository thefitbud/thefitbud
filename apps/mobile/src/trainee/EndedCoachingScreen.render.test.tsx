/** Z12-49: ended coaching (TR-22a) and the coach's restart request (TR-22b). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

let auth: Record<string, unknown>;
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

const { EndedCoachingScreen, reactivationOpen } = await import("./EndedCoachingScreen");

const ended = {
  id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  status: "ended",
  onboardingStatus: "ended",
  startedAt: "2026-09-01T04:30:00.000Z",
  endedAt: "2026-10-31T06:00:00.000Z",
  trainerDisplayName: "Rahul Verma",
};

function renderEnded(relationship: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const props = {
    relationship: relationship as never,
    coachName: "Rahul Verma",
    onOpenHistory: vi.fn(),
    onSignOut: vi.fn(),
    onCoachingResumed: vi.fn(),
    ...overrides,
  };
  render(<EndedCoachingScreen {...props} />);
  return props;
}

describe("EndedCoachingScreen", () => {
  beforeEach(() => {
    auth = mockAuth({
      me: { timezone: "Asia/Kolkata", permittedRoles: ["trainee"] },
      api: {
        getRelationship: vi.fn(async () => ({ ...ended, pendingReactivation: null })),
        confirmReactivation: vi.fn(async () => ({ ...ended, status: "active" })),
        acceptInvitation: vi.fn(async () => ({})),
      },
    });
  });

  it("TR-22a: says when coaching ended and keeps the history", async () => {
    const props = renderEnded({ ...ended, pendingReactivation: null });
    expect(screen.getByText("Coaching with Rahul ended on Sat 31 Oct.")).toBeTruthy();
    expect(screen.getByText("Your history is safe")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View past coaching" }));
    expect(props.onOpenHistory).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/wants to coach you again/)).toBeNull();
  });

  it("embedded in the Today tab it leaves the header and Sign out to the shell", () => {
    renderEnded({ ...ended, pendingReactivation: null }, { embedded: true });
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("a new coach's code is sent from the Enter code sheet", async () => {
    renderEnded({ ...ended, pendingReactivation: null });
    fireEvent.click(screen.getByRole("button", { name: "Enter code" }));
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "K7Q2PM" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this code" }));
    const api = auth.api as { acceptInvitation: ReturnType<typeof vi.fn> };
    await waitFor(() =>
      expect(api.acceptInvitation).toHaveBeenCalledWith(expect.objectContaining({ token: "K7Q2PM" })),
    );
  });

  it("TR-22b: a live restart request asks; Restart confirms it", async () => {
    const props = renderEnded({
      ...ended,
      pendingReactivation: {
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        intakeUpdateRequested: false,
      },
    });
    expect(screen.getByText("Rahul wants to coach you again")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restart with Rahul" }));
    await waitFor(() => expect(props.onCoachingResumed).toHaveBeenCalledTimes(1));
  });

  it("TR-22b: Not now closes the sheet and leaves coaching ended", async () => {
    const props = renderEnded({
      ...ended,
      pendingReactivation: {
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        intakeUpdateRequested: false,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByText("Rahul wants to coach you again")).toBeNull());
    expect(props.onCoachingResumed).not.toHaveBeenCalled();
  });

  it("an expired request says so and does not ask", () => {
    renderEnded({
      ...ended,
      pendingReactivation: {
        expiresAt: "2026-11-01T00:00:00.000Z",
        intakeUpdateRequested: false,
      },
    });
    expect(screen.getByText(/request to restart has expired/)).toBeTruthy();
    expect(screen.queryByText("Rahul wants to coach you again")).toBeNull();
  });

  it("reactivationOpen is false once the request expired", () => {
    expect(reactivationOpen(null)).toBe(false);
    expect(reactivationOpen({ expiresAt: "2026-11-01T00:00:00.000Z" } as never, Date.parse("2026-11-02"))).toBe(false);
    expect(reactivationOpen({ expiresAt: "2026-11-03T00:00:00.000Z" } as never, Date.parse("2026-11-02"))).toBe(true);
  });
});
