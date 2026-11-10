/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const ROHAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEERA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROHAN_EXC = "11111111-1111-4111-8111-111111111111";
const ASK = "22222222-2222-4222-8222-222222222222";
const CHECKIN = "33333333-3333-4333-8333-333333333333";

const api = vi.hoisted(() => ({
  getAttentionGroups: vi.fn(),
  listCoachAsks: vi.fn(),
  getReengagementCandidates: vi.fn(),
  getActivityFeed: vi.fn(),
  listSubscriptionAttention: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listClients: vi.fn(),
  listInvitations: vi.fn(),
  acknowledgeException: vi.fn(),
  getException: vi.fn(),
  nudgeActivity: vi.fn(),
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
    acknowledgeException: api.acknowledgeException,
    getException: api.getException,
    nudgeActivity: api.nudgeActivity,
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

import { HomePage } from "./HomePage";

function Probe() {
  const loc = useLocation();
  return (
    <div data-testid="loc">
      {loc.pathname}
      {loc.search}
      {loc.hash}
    </div>
  );
}

function loc() {
  return screen.getByTestId("loc").textContent ?? "";
}

function attentionGroup() {
  return {
    relationshipId: ROHAN,
    traineeDisplayName: "Rohan Mehta",
    clientWhatsappE164: null,
    items: [
      {
        id: ROHAN_EXC,
        type: "missed_workout",
        severity: "critical" as const,
        status: "active" as const,
        ageMinutes: 120,
        summary: "Missed workout",
        details: null,
      },
    ],
  };
}

function askItem() {
  return {
    id: ASK,
    relationshipId: ROHAN,
    itemLabel: "Lunch",
    itemType: "meal_assignment",
    itemDate: "2026-10-21",
    topic: "timing",
    askedAt: "2026-10-21T04:30:00.000Z",
    status: "open",
  };
}

function seedPopulated() {
  api.getAttentionGroups.mockResolvedValue({ groups: [attentionGroup()] });
  api.listCoachAsks.mockResolvedValue({ items: [askItem()] });
  api.getReengagementCandidates.mockResolvedValue({ items: [] });
  api.getActivityFeed.mockResolvedValue({ events: [] });
  api.listSubscriptionAttention.mockResolvedValue({
    items: [
      {
        coachingRelationshipId: ROHAN,
        planName: "Strength",
        renewalState: "due",
        renewsOn: "2026-10-21",
      },
      {
        coachingRelationshipId: MEERA,
        planName: "Strength",
        renewalState: "expired",
        renewsOn: "2026-10-15",
      },
    ],
  });
  api.listTrainerCheckinInbox.mockResolvedValue({
    items: [
      {
        coachingRelationshipId: ROHAN,
        checkin: {
          id: CHECKIN,
          status: "submitted",
          submittedAt: "2026-10-21T04:30:00.000Z",
        },
      },
    ],
  });
  api.listClients.mockResolvedValue({
    items: [
      {
        relationshipId: ROHAN,
        traineeDisplayName: "Rohan Mehta",
        status: "active",
      },
      {
        relationshipId: MEERA,
        traineeDisplayName: "Meera Iyer",
        status: "active",
      },
    ],
  });
  api.listInvitations.mockResolvedValue({ items: [] });
}

async function renderHome(initial = "/") {
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Probe />
      <HomePage />
    </MemoryRouter>,
  );
  await screen.findByRole("grid", { name: "Needs attention" });
}

describe("HomePage rows and count cards (Z7-2)", () => {
  beforeEach(() => {
    seedPopulated();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the client panel from a Needs attention row click or Enter, and Review stays the drawer", async () => {
    await renderHome();
    const grid = screen.getByRole("grid", { name: "Needs attention" });
    fireEvent.click(within(grid).getByText("Rohan Mehta"));
    expect(loc()).toContain(`client=${ROHAN}`);
    expect(loc()).not.toContain("exception=");
    // Z7-3 (D-W7-2): ?client= mounts the side panel.
    expect(screen.getByRole("dialog", { name: "Exception" })).toBeTruthy();

    cleanup();
    seedPopulated();
    await renderHome();
    const row = screen.getAllByRole("row")[0]!;
    act(() => row.focus());
    fireEvent.keyDown(row, { key: "Enter" });
    expect(loc()).toContain(`client=${ROHAN}`);
    // Z7-3 (D-W7-2): ?client= mounts the side panel.
    expect(screen.getByRole("dialog", { name: "Exception" })).toBeTruthy();

    cleanup();
    seedPopulated();
    await renderHome();
    const review = within(screen.getByRole("grid", { name: "Needs attention" })).getByRole(
      "button",
      { name: "Review" },
    );
    fireEvent.keyDown(review, { key: "Enter" });
    expect(loc()).not.toContain("client=");
    fireEvent.click(review);
    expect(loc()).toContain(`exception=${ROHAN_EXC}`);
    expect(loc()).not.toContain("client=");
    expect(screen.getByRole("dialog", { name: "Exception" })).toBeTruthy();
  });

  it("selects the row on a touch tap of Review, and the click still reaches the Review handler (HM5)", async () => {
    const meera = {
      ...attentionGroup(),
      relationshipId: MEERA,
      traineeDisplayName: "Meera Iyer",
      items: [{ ...attentionGroup().items[0]!, id: "4b0e7c2a-3f1d-4a55-9c1e-2d6f8a9b1c30", ageMinutes: 60 }],
    };
    api.getAttentionGroups.mockResolvedValue({ groups: [attentionGroup(), meera] });
    await renderHome();
    const rows = screen.getAllByRole("row");
    expect(rows[0]!.className).toContain("is-focused");
    const review = within(rows[1]!).getByRole("button", { name: "Review" });
    // A touch tap: pointerdown does not select, the click does (so it must bubble).
    fireEvent.pointerDown(review, { pointerType: "touch" });
    fireEvent.click(review, { detail: 1 });
    expect(loc()).toContain("exception=4b0e7c2a");
    expect(screen.getAllByRole("row")[1]!.className).toContain("is-focused");
    expect(screen.getAllByRole("row")[0]!.className).not.toContain("is-focused");
  });

  it("clicking the open overflow menu's own padding does not open the client panel", async () => {
    await renderHome();
    const grid = screen.getByRole("grid", { name: "Needs attention" });
    fireEvent.click(within(grid).getByRole("button", { name: "More actions for Rohan Mehta" }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(menu);
    expect(loc()).not.toContain("client=");
  });

  it("opens the ask drawer from the row, and Mark answered does not also move the page", async () => {
    await renderHome();
    fireEvent.click(screen.getByText(/asked about Lunch/));
    expect(loc()).toContain(`ask=${ASK}`);
    expect(screen.getByRole("dialog", { name: "Ask" })).toBeTruthy();

    cleanup();
    seedPopulated();
    await renderHome();
    // The ask's name is a real button, so Enter/Space activate it natively.
    const askName = screen.getByRole("button", { name: /asked about Lunch/ });
    fireEvent.click(askName);
    expect(loc()).toContain(`ask=${ASK}`);

    cleanup();
    seedPopulated();
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Mark answered" }));
    expect(loc()).toContain(`ask=${ASK}`);
    expect(loc()).not.toContain("client=");
    expect(loc()).not.toContain("/home/asks");
  });

  it("opens check-in review from the row or Enter, and the Review link is its own target", async () => {
    await renderHome();
    const section = screen.getByRole("heading", { name: "Check-ins to review" }).closest("section");
    if (!section) throw new Error("no check-in section");
    fireEvent.click(within(section).getByText("Rohan Mehta"));
    expect(loc()).toBe(`/clients/${ROHAN}/check-ins/${CHECKIN}`);

    cleanup();
    seedPopulated();
    await renderHome();
    const again = screen.getByRole("heading", { name: "Check-ins to review" }).closest("section");
    if (!again) throw new Error("no check-in section");
    const nameLink = within(again).getByRole("link", { name: "Rohan Mehta" });
    expect(nameLink.getAttribute("href")).toBe(`/clients/${ROHAN}/check-ins/${CHECKIN}`);
    fireEvent.click(nameLink);
    expect(loc()).toBe(`/clients/${ROHAN}/check-ins/${CHECKIN}`);

    cleanup();
    seedPopulated();
    await renderHome();
    const review = screen.getByRole("link", { name: "Review" });
    fireEvent.click(review);
    expect(loc()).toBe(`/clients/${ROHAN}/check-ins/${CHECKIN}`);
  });

  it("sends each renewal row to that client's subscription, including the second row", async () => {
    await renderHome();
    expect(screen.queryByRole("link", { name: "Open settings" })).toBeNull();
    expect(screen.getByText("Open settings to renew")).toBeTruthy();

    fireEvent.click(screen.getByText("Meera Iyer"));
    expect(loc()).toBe(`/clients/${MEERA}/configure#subscription`);
    expect(loc()).not.toContain(ROHAN);

    cleanup();
    seedPopulated();
    await renderHome();
    const nameLink = screen.getByRole("link", { name: "Meera Iyer" });
    expect(nameLink.getAttribute("href")).toBe(`/clients/${MEERA}/configure#subscription`);
    fireEvent.click(nameLink);
    expect(loc()).toBe(`/clients/${MEERA}/configure#subscription`);
  });

  it("links count cards to full views and leaves a zero card out of the tab order", async () => {
    await renderHome("/?group=attention");
    expect(screen.getByRole("heading", { name: "Asked you on WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Check-ins to review" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Renewals" })).toBeTruthy();

    expect(screen.getByRole("link", { name: /Needs attention/ }).getAttribute("href")).toBe(
      "/home/attention",
    );
    expect(screen.getByRole("link", { name: /Check-ins to review/ }).getAttribute("href")).toBe(
      "/checkins?tab=to-review",
    );
    expect(screen.getByRole("link", { name: /Renewals due/ }).getAttribute("href")).toBe(
      "/home/renewals",
    );
    expect(screen.getByRole("link", { name: /Asked you/ }).getAttribute("href")).toBe(
      "/home/asks",
    );
    expect(screen.queryByRole("button", { name: /Needs attention/ })).toBeNull();

    cleanup();
    seedPopulated();
    api.listCoachAsks.mockResolvedValue({ items: [] });
    await renderHome();
    const asked = screen.getByRole("button", { name: /Asked you/ });
    expect((asked as HTMLButtonElement).disabled).toBe(true);
    expect(asked.textContent).toContain("0");
    expect(asked.textContent).toContain("Nothing new");
    expect(screen.queryByRole("link", { name: /Asked you/ })).toBeNull();
  });
});
