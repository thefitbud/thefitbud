/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

const ROHAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROHAN_EXC = "11111111-1111-4111-8111-111111111111";

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
  ExceptionDrawer: (props: {
    exceptionId?: string | null;
    relationshipId?: string | null;
    onClose: () => void;
  }) => (
    <div
      role="dialog"
      aria-label="Exception"
      data-exception={props.exceptionId ?? ""}
      data-client={props.relationshipId ?? ""}
    >
      <button
        type="button"
        onClick={() => {
          props.onClose();
          // Escape lands inside the same event turn, before React commits the
          // close: the Home handler still sees the drawer as open.
          document.querySelector('[role="row"]')?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
        }}
      >
        Close panel
      </button>
    </div>
  ),
}));
vi.mock("../components/CoachAskDrawer", () => ({
  CoachAskDrawer: () => <div role="dialog" aria-label="Ask" />,
}));

import { HomePage } from "./HomePage";

const keys = new Set<string>();
let goBack: () => void = () => {};
function Probe() {
  const loc = useLocation();
  const navigate = useNavigate();
  goBack = () => navigate(-1);
  keys.add(loc.key);
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function seed() {
  api.getAttentionGroups.mockResolvedValue({
    groups: [
      {
        relationshipId: ROHAN,
        traineeDisplayName: "Rohan Mehta",
        clientWhatsappE164: null,
        items: [
          {
            id: ROHAN_EXC,
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
  api.listCoachAsks.mockResolvedValue({ items: [] });
  api.getReengagementCandidates.mockResolvedValue({ items: [] });
  api.getActivityFeed.mockResolvedValue({ events: [] });
  api.listSubscriptionAttention.mockResolvedValue({ items: [] });
  api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
  api.listClients.mockResolvedValue({
    items: [
      { relationshipId: ROHAN, traineeDisplayName: "Rohan Mehta", status: "active" },
    ],
  });
  api.listInvitations.mockResolvedValue({ items: [] });
}

async function renderHome(initial: string) {
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Probe />
      <HomePage />
    </MemoryRouter>,
  );
  await screen.findByRole("grid", { name: "Needs attention" });
}

describe("HomePage drawer close and client panel (Z7-3)", () => {
  beforeEach(() => {
    keys.clear();
    seed();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("an Escape right after a close adds no extra history entry (HB1)", async () => {
    await renderHome(`/?exception=${ROHAN_EXC}`);
    expect(screen.getByRole("dialog", { name: "Exception" })).toBeTruthy();
    const before = keys.size;
    // Close and Escape land in the same tick, before the URL change re-renders.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    });
    expect(screen.getByTestId("loc").textContent).toBe("/");
    expect(keys.size - before).toBe(1);
    // One Back leaves the closed state: it lands on the entry that had the
    // drawer open, not on a duplicate "/" entry.
    act(() => goBack());
    expect(screen.getByTestId("loc").textContent).toBe(`/?exception=${ROHAN_EXC}`);
  });

  it("does not navigate when Escape is pressed with nothing open", async () => {
    await renderHome("/");
    const before = keys.size;
    act(() => {
      fireEvent.keyDown(screen.getAllByRole("row")[0]!, { key: "Escape" });
    });
    expect(keys.size).toBe(before);
  });

  it("mounts the side panel for ?client= alone and passes the client id", async () => {
    await renderHome(`/?client=${ROHAN}`);
    const dialog = screen.getByRole("dialog", { name: "Exception" });
    expect(dialog.getAttribute("data-client")).toBe(ROHAN);
    expect(dialog.getAttribute("data-exception")).toBe("");
  });

  it("clicking a Needs attention row opens the panel for that client", async () => {
    await renderHome("/");
    expect(screen.queryByRole("dialog", { name: "Exception" })).toBeNull();
    fireEvent.click(
      within(screen.getByRole("grid", { name: "Needs attention" })).getByText("Rohan Mehta"),
    );
    const dialog = await screen.findByRole("dialog", { name: "Exception" });
    expect(dialog.getAttribute("data-client")).toBe(ROHAN);
  });
});
