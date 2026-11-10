/**
 * @vitest-environment happy-dom
 *
 * D14 (Z8-3): both renewal row sources, the Home "Renewals" card and the
 * Renewals full view, open the client's Client settings subscription section.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const ROHAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEERA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

vi.mock("../../lib/stage1-api", () => ({
  stage1Api: {
    getAttentionGroups: api.getAttentionGroups,
    listCoachAsks: api.listCoachAsks,
    getReengagementCandidates: api.getReengagementCandidates,
    getActivityFeed: api.getActivityFeed,
  },
}));
vi.mock("../../lib/api", () => ({
  apiClient: {
    listSubscriptionAttention: api.listSubscriptionAttention,
    listTrainerCheckinInbox: api.listTrainerCheckinInbox,
    listClients: api.listClients,
    listInvitations: api.listInvitations,
  },
}));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));
vi.mock("../../components/OfflineBanner", () => ({
  useOnlineStatus: () => true,
}));
vi.mock("../../realtime/useRealtimeHints", () => ({
  useRealtimeHints: () => undefined,
}));
vi.mock("../../components/ExceptionDrawer", () => ({
  ExceptionDrawer: () => <div role="dialog" aria-label="Exception" />,
}));
vi.mock("../../components/CoachAskDrawer", () => ({
  CoachAskDrawer: () => <div role="dialog" aria-label="Ask" />,
}));

import { HomePage } from "../HomePage";
import { RenewalsViewPage, subscriptionHref } from "../home-views/RenewalsViewPage";

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}${loc.hash}`}</div>;
}

function loc() {
  return screen.getByTestId("loc").textContent ?? "";
}

function renewalItem(rid: string, n: number, renewalState: "due" | "expired", renewsOn: string) {
  return {
    coachingRelationshipId: rid,
    traineeUserId: `cccccccc-cccc-4ccc-8ccc-cccccccccc0${n}`,
    planName: "Strength coaching",
    paymentFrequency: "monthly" as const,
    renewsOn,
    renewalState,
    versionNumber: 1,
  };
}

function seed() {
  api.getAttentionGroups.mockResolvedValue({ groups: [] });
  api.listCoachAsks.mockResolvedValue({ items: [] });
  api.getReengagementCandidates.mockResolvedValue({ items: [] });
  api.getActivityFeed.mockResolvedValue({ events: [] });
  api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
  api.listInvitations.mockResolvedValue({ items: [] });
  api.listSubscriptionAttention.mockResolvedValue({
    items: [
      renewalItem(ROHAN, 1, "due", "2026-11-10"),
      renewalItem(MEERA, 2, "expired", "2026-11-01"),
    ],
  });
  api.listClients.mockResolvedValue({
    items: [
      { relationshipId: ROHAN, traineeDisplayName: "Rohan Mehta", status: "active" },
      { relationshipId: MEERA, traineeDisplayName: "Meera Iyer", status: "active" },
    ],
    facets: { status: {}, adherence: {}, renewal: {} },
    nextCursor: null,
  });
}

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Probe />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/home/renewals" element={<RenewalsViewPage />} />
        <Route path="/clients/:rid/settings" element={<div>Client settings page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T06:00:00.000Z"));
  seed();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("renewal rows point to Client settings (D14)", () => {
  it("builds the settings subscription anchor", () => {
    expect(subscriptionHref(ROHAN)).toBe(`/clients/${ROHAN}/settings#subscription`);
  });

  it("Home renewal rows link and navigate to the settings subscription section", async () => {
    renderAt("/");
    const link = await screen.findByRole("link", { name: "Meera Iyer" });
    expect(link.getAttribute("href")).toBe(`/clients/${MEERA}/settings#subscription`);
    expect(screen.getByRole("link", { name: "Rohan Mehta" }).getAttribute("href")).toBe(
      `/clients/${ROHAN}/settings#subscription`,
    );
    // A click anywhere on the row goes to the same place.
    fireEvent.click(screen.getByText(/^Ended /));
    expect(loc()).toBe(`/clients/${MEERA}/settings#subscription`);
    expect(await screen.findByText("Client settings page")).toBeTruthy();
    expect(document.body.innerHTML).not.toContain("/configure#subscription");
  });

  it("Renewals full-view rows link and navigate to the settings subscription section", async () => {
    renderAt("/home/renewals");
    const row = await screen.findByRole("link", { name: /^Rohan Mehta\./ });
    expect(row.getAttribute("href")).toBe(`/clients/${ROHAN}/settings#subscription`);
    expect(screen.getByRole("link", { name: /^Meera Iyer\./ }).getAttribute("href")).toBe(
      `/clients/${MEERA}/settings#subscription`,
    );
    expect(document.body.innerHTML).not.toContain("/configure#subscription");
    fireEvent.click(row);
    expect(await screen.findByText("Client settings page")).toBeTruthy();
    expect(loc()).toBe(`/clients/${ROHAN}/settings#subscription`);
  });
});
