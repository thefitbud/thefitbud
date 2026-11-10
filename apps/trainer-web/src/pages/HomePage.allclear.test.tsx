/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const ARJUN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEHA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POOJA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const KAVYA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NEHA_EXC = "11111111-1111-4111-8111-111111111111";

const api = vi.hoisted(() => ({
  getAttentionGroups: vi.fn(),
  listCoachAsks: vi.fn(),
  getReengagementCandidates: vi.fn(),
  getActivityFeed: vi.fn(),
  listSubscriptionAttention: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listClients: vi.fn(),
  listInvitations: vi.fn(),
}));

vi.mock("../lib/stage1-api", () => ({
  stage1Api: {
    getAttentionGroups: api.getAttentionGroups,
    listCoachAsks: api.listCoachAsks,
    getReengagementCandidates: api.getReengagementCandidates,
    getActivityFeed: api.getActivityFeed,
  },
}));
vi.mock("../lib/api", () => ({
  apiClient: {
    listSubscriptionAttention: api.listSubscriptionAttention,
    listTrainerCheckinInbox: api.listTrainerCheckinInbox,
    listClients: api.listClients,
    listInvitations: api.listInvitations,
  },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));
vi.mock("../components/OfflineBanner", () => ({
  useOnlineStatus: () => true,
}));
vi.mock("../realtime/useRealtimeHints", () => ({
  useRealtimeHints: () => undefined,
}));
vi.mock("../components/ExceptionDrawer", () => ({
  ExceptionDrawer: () => <div role="dialog" aria-label="Exception" />,
}));
vi.mock("../components/CoachAskDrawer", () => ({
  CoachAskDrawer: () => <div role="dialog" aria-label="Ask" />,
}));

import { HomePage, nextCheckinDue } from "./HomePage";

const UPDATED = "2026-11-01T04:30:00.000Z";

function client(
  relationshipId: string,
  traineeDisplayName: string,
  status: "active" | "ended" | "onboarding_submitted",
  nextCheckin: {
    localDate: string;
    status: "scheduled" | "due" | "overdue";
  } | null,
  endedAt: string | null = null,
) {
  return {
    relationshipId,
    invitationId: null,
    traineeDisplayName,
    status,
    goalShort: null,
    nextCheckin: nextCheckin
      ? { id: `${relationshipId.slice(0, 8)}-0000-4000-8000-000000000000`, ...nextCheckin }
      : null,
    effectivePlan: null,
    adherenceState: "on_track" as const,
    renewalState: null,
    renewsOn: null,
    endedAt,
    updatedAt: UPDATED,
  };
}

// Tue 10 Nov 2026 in Asia/Kolkata.
const CLIENTS = [
  // Overdue (past) check-ins are not "next due".
  client(POOJA, "Pooja Agarwal", "active", { localDate: "2026-11-08", status: "overdue" }),
  client(NEHA, "Neha Reddy", "active", { localDate: "2026-11-12", status: "scheduled" }),
  client(ARJUN, "Arjun Kapoor", "active", { localDate: "2026-11-11", status: "scheduled" }),
  // Ended clients are read-only and have no upcoming check-in.
  client(KAVYA, "Kavya Iyer", "ended", { localDate: "2026-11-10", status: "scheduled" }, "2026-11-02T10:00:00.000Z"),
];

function seedAllClear() {
  api.getAttentionGroups.mockResolvedValue({ groups: [] });
  api.listCoachAsks.mockResolvedValue({ items: [] });
  api.getReengagementCandidates.mockResolvedValue({ items: [] });
  api.getActivityFeed.mockResolvedValue({
    events: [
      {
        id: "meal:1",
        relationshipId: ARJUN,
        traineeDisplayName: "Arjun Kapoor",
        summary: "logged breakfast as planned",
        occurredAt: "2026-11-10T03:42:00.000Z",
      },
    ],
  });
  api.listSubscriptionAttention.mockResolvedValue({ items: [] });
  api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
  api.listClients.mockResolvedValue({ items: CLIENTS, nextCursor: null });
  api.listInvitations.mockResolvedValue({ items: [] });
}

function renderHome() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("Home all clear (Z7-4, frame 135)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T06:30:00.000Z"));
    seedAllClear();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("shows one calm message, the all-clear card and the next check-in due", async () => {
    renderHome();
    await screen.findByRole("heading", { name: "All clear" });
    expect(screen.getByText("Nobody needs you right now.")).toBeTruthy();
    expect(
      screen.getByText(
        "New items appear here as clients log or miss a log. Reviewed items that are still open stay in their own list.",
      ),
    ).toBeTruthy();
    const attention = screen
      .getByRole("heading", { name: "Needs attention" })
      .closest("section")!;
    expect(within(attention).getByText("0")).toBeTruthy();
    expect(
      await screen.findByText(
        "No check-ins waiting. Next due: Arjun on Wed 11 Nov.",
      ),
    ).toBeTruthy();
    // No invite button or activity feed (frame 135). The count cards stay in
    // the DOM as DS4 zero cards (not links, "Nothing new"), hidden by CSS.
    // home.css hides them in the all-clear state (frame 135 draws none).
    expect(
      screen.getByTestId("screen-TW-04").classList.contains("is-all-clear"),
    ).toBe(true);
    const cards = screen.getByRole("group", { name: "Open a full list" });
    expect(within(cards).queryAllByRole("link")).toHaveLength(0);
    expect(within(cards).getAllByText("Nothing new")).toHaveLength(4);
    expect(screen.queryByText("Invite a client")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recent activity" })).toBeNull();
    expect(screen.queryByText(/all caught up/i)).toBeNull();
  });

  it("leaves out the next-due part when the client list is incomplete", async () => {
    api.listClients.mockResolvedValue({ items: CLIENTS, nextCursor: "more" });
    renderHome();
    await screen.findByRole("heading", { name: "All clear" });
    await vi.waitFor(() => expect(api.listClients).toHaveBeenCalledTimes(2));
    expect(screen.getByText("No check-ins waiting.")).toBeTruthy();
    expect(screen.queryByText(/Next due/)).toBeNull();
  });

  it("keeps Reviewed, still open and Getting started below the all-clear card", async () => {
    api.getAttentionGroups.mockResolvedValue({
      groups: [
        {
          relationshipId: NEHA,
          traineeDisplayName: "Neha Reddy",
          clientWhatsappE164: null,
          items: [
            {
              id: NEHA_EXC,
              type: "missed_meal",
              severity: "attention",
              status: "acknowledged",
              ageMinutes: 600,
              summary: "Breakfast not logged",
              details: null,
            },
          ],
        },
      ],
    });
    api.listClients.mockResolvedValue({
      items: [
        ...CLIENTS,
        client(
          "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          "Sneha Kulkarni",
          "onboarding_submitted",
          null,
        ),
      ],
      nextCursor: null,
    });
    renderHome();
    await screen.findByRole("heading", { name: "All clear" });
    expect(
      await screen.findByRole("heading", { name: "Reviewed, still open" }),
    ).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Getting started" })).toBeTruthy();
    expect(screen.getByText("Sneha Kulkarni")).toBeTruthy();
  });

  it("is not all clear while Home is still loading", async () => {
    api.getAttentionGroups.mockReturnValue(new Promise(() => {}));
    renderHome();
    expect(await screen.findByText("Loading your day…")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "All clear" })).toBeNull();
    expect(screen.queryByText("Nobody needs you right now.")).toBeNull();
    expect(
      screen.getByTestId("screen-TW-04").classList.contains("is-all-clear"),
    ).toBe(false);
  });

  it("is not all clear when a section fails to load", async () => {
    api.getAttentionGroups.mockRejectedValue(new Error("offline"));
    renderHome();
    await vi.waitFor(() =>
      expect(screen.queryByText("Loading your day…")).toBeNull(),
    );
    await vi.waitFor(() =>
      expect(api.getAttentionGroups).toHaveBeenCalled(),
    );
    expect(screen.queryByRole("heading", { name: "All clear" })).toBeNull();
    expect(screen.queryByText("Nobody needs you right now.")).toBeNull();
    expect(screen.queryByText("No check-ins waiting.", { exact: false })).toBeNull();
  });

  it("is not all clear when one section fails after the others load", async () => {
    api.listTrainerCheckinInbox.mockRejectedValue(new Error("offline"));
    renderHome();
    await vi.waitFor(() =>
      expect(screen.queryByText("Loading your day…")).toBeNull(),
    );
    await vi.waitFor(() =>
      expect(api.listTrainerCheckinInbox).toHaveBeenCalled(),
    );
    expect(screen.queryByRole("heading", { name: "All clear" })).toBeNull();
    expect(screen.queryByText("Nobody needs you right now.")).toBeNull();
  });

  it("is not all clear while a renewal is due", async () => {
    api.listSubscriptionAttention.mockResolvedValue({
      items: [
        {
          coachingRelationshipId: ARJUN,
          planName: "Fat loss",
          renewsOn: "2026-11-12",
          renewalState: "due",
        },
      ],
    });
    renderHome();
    await screen.findByRole("heading", { name: "Renewals" });
    expect(screen.queryByRole("heading", { name: "All clear" })).toBeNull();
    expect(screen.queryByText("Nobody needs you right now.")).toBeNull();
    expect(screen.getByRole("group", { name: "Open a full list" })).toBeTruthy();
  });
});

describe("Needs attention row label with the side panel (Z7-4)", () => {
  const ROHAN = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  let wide = true;
  beforeEach(() => {
    seedAllClear();
    api.getAttentionGroups.mockResolvedValue({
      groups: [
        {
          relationshipId: ROHAN,
          traineeDisplayName: "Rohan Mehta",
          clientWhatsappE164: null,
          items: [
            {
              id: NEHA_EXC,
              type: "missed_workout",
              severity: "critical",
              status: "active",
              ageMinutes: 120,
              summary: "Missed workout",
              details: null,
            },
          ],
        },
      ],
    });
    window.matchMedia = ((query: string) => ({
      matches: wide && query === "(min-width: 1024px)",
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderAt(url: string) {
    render(
      <MemoryRouter initialEntries={[url]}>
        <HomePage />
      </MemoryRouter>,
    );
  }

  it("drops 'Review button' while the panel is docked (Review cell hidden)", async () => {
    wide = true;
    renderAt(`/?client=${ROHAN}`);
    const row = await screen.findByRole("row");
    expect(row.getAttribute("aria-label")).not.toContain("Review button");
  });

  it("keeps 'Review button' without the panel, or when it overlays (< 1024)", async () => {
    wide = true;
    renderAt("/");
    expect((await screen.findByRole("row")).getAttribute("aria-label")).toContain(
      "Review button.",
    );
    cleanup();
    wide = false;
    renderAt(`/?client=${ROHAN}`);
    expect((await screen.findByRole("row")).getAttribute("aria-label")).toContain(
      "Review button.",
    );
  });
});

describe("nextCheckinDue", () => {
  it("picks the earliest upcoming check-in of a coached client", () => {
    expect(nextCheckinDue(CLIENTS, "2026-11-10", true)).toEqual({
      firstName: "Arjun",
      localDate: "2026-11-11",
    });
  });

  it("returns null with no upcoming check-in or an incomplete list", () => {
    expect(nextCheckinDue(CLIENTS.slice(0, 1), "2026-11-10", true)).toBeNull();
    expect(nextCheckinDue(CLIENTS, "2026-11-10", false)).toBeNull();
  });
});
