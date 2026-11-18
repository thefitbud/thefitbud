/**
 * Z12-49 review fix: TR-04's 20 s check for the plan must not remount the
 * screen. It used to call `refreshSession`, which routes through "loading",
 * so the account sheet closed (F01 on the device gate: Sign out was tapped on
 * a sheet that had already shut) and an open Reminders page was dropped.
 * Now the check reads the relationships and reloads the session only when
 * this relationship has moved on, or the server refused the session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { act, fireEvent, mockAuth, render, screen } from "../test/render";

let auth: Record<string, unknown>;
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

const { WaitingReviewScreen, WAITING_POLL_MS, waitingPollStep } = await import(
  "./WaitingReviewScreen"
);

const submitted = {
  id: "5b1d2c3e-4f50-4a6b-9c7d-8e9f0a1b2c3d",
  status: "active",
  onboardingStatus: "onboarding_submitted",
  startedAt: "2026-11-16T01:30:00.000Z",
  endedAt: null,
  trainerDisplayName: "Rahul Verma",
  trainerWhatsappE164: "+919820145678",
};

const SHEET_LINE = "Your plan will be here as soon as it's ready.";

let listRelationships: ReturnType<typeof vi.fn>;
let refreshSession: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  listRelationships = vi.fn(async () => ({ items: [submitted], nextCursor: null }));
  refreshSession = vi.fn(async () => undefined);
  auth = mockAuth({
    me: { timezone: "Asia/Kolkata", email: "sneha.review@demo.fitbud.test", permittedRoles: ["trainee"] },
    refreshSession,
    api: {
      listRelationships,
      getTraineeProfile: vi.fn(async () => ({ displayName: "Sneha Iyer" })),
      getOnboardingResponse: vi.fn(async () => ({ submittedAt: "2026-11-16T01:56:00.000Z" })),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(WAITING_POLL_MS);
  });
}

describe("TR-04 background check", () => {
  it("keeps the account sheet open while the intake is still with the coach", async () => {
    render(<WaitingReviewScreen relationship={submitted as never} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText(SHEET_LINE)).toBeTruthy();

    await tick();
    await tick();

    expect(listRelationships).toHaveBeenCalledTimes(2);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(screen.getByText(SHEET_LINE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("reloads the session once the plan is ready", async () => {
    render(<WaitingReviewScreen relationship={submitted as never} />);
    listRelationships.mockResolvedValueOnce({
      items: [{ ...submitted, onboardingStatus: "coaching_ready" }],
      nextCursor: null,
    });
    await tick();
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});

describe("waitingPollStep", () => {
  it("asks for a reload when the relationship is gone or the session is refused", async () => {
    await expect(
      waitingPollStep({ listRelationships: async () => ({ items: [], nextCursor: null }) } as never, submitted.id),
    ).resolves.toBe(true);
    const refused = new ApiClientError({
      code: "UNAUTHENTICATED",
      message: "Sign in again.",
      requestId: "req-1",
      status: 401,
    });
    await expect(
      waitingPollStep({ listRelationships: async () => Promise.reject(refused) } as never, submitted.id),
    ).resolves.toBe(true);
  });

  it("throws any other failure for the caller to report", async () => {
    const down = new ApiClientError({
      code: "INTERNAL",
      message: "Something went wrong.",
      requestId: "req-1",
      status: 500,
    });
    await expect(
      waitingPollStep({ listRelationships: async () => Promise.reject(down) } as never, submitted.id),
    ).rejects.toBe(down);
  });
});
