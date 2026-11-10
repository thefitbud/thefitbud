/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import {
  attentionGroupsResponseSchema,
  type AttentionGroupsResponse,
} from "@fitbud/contracts";

const api = vi.hoisted(() => ({
  getAttentionGroups: vi.fn(),
  listClients: vi.fn(),
}));

vi.mock("../../lib/stage1-api", () => ({
  stage1Api: { getAttentionGroups: api.getAttentionGroups },
}));
vi.mock("../../lib/api", () => ({
  apiClient: { listClients: api.listClients },
}));
vi.mock("../../realtime/useRealtimeHints", () => ({
  useRealtimeHints: () => undefined,
}));

import { AttentionViewPage, formatSince } from "./AttentionViewPage";

const ROHAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const NEHA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";
const PRIYA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03";
const REVIEWED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04";

function groups(): AttentionGroupsResponse {
  const raw = {
    groups: [
      {
        relationshipId: NEHA,
        traineeDisplayName: "Neha Reddy",
        clientWhatsappE164: null,
        items: [
          {
            id: "11111111-1111-4111-8111-111111111101",
            type: "overdue_meal",
            severity: "attention",
            status: "active",
            ageMinutes: 3 * 24 * 60,
            summary: "Breakfast not logged",
            details: { localDate: "2026-10-30", mealSlot: "breakfast" },
          },
        ],
      },
      {
        relationshipId: ROHAN,
        traineeDisplayName: "Rohan Mehta",
        clientWhatsappE164: "+919800000001",
        items: [
          {
            id: "11111111-1111-4111-8111-111111111102",
            type: "missed_workout",
            severity: "critical",
            status: "detected",
            ageMinutes: 5 * 24 * 60,
            summary: "Missed Upper body A",
            details: { localDate: "2026-10-27" },
          },
          {
            id: "11111111-1111-4111-8111-111111111103",
            type: "missed_workout",
            severity: "attention",
            status: "active",
            ageMinutes: 3 * 24 * 60,
            summary: "Missed Lower body A",
            details: { localDate: "2026-10-29" },
          },
        ],
      },
      {
        relationshipId: PRIYA,
        traineeDisplayName: "Priya Sharma",
        clientWhatsappE164: null,
        items: [
          {
            id: "11111111-1111-4111-8111-111111111104",
            type: "overdue_checkin",
            severity: "attention",
            status: "active",
            ageMinutes: 90,
            summary: "Check-in overdue",
            details: null,
          },
        ],
      },
      {
        // Every open item already reviewed: not in Needs attention.
        relationshipId: REVIEWED,
        traineeDisplayName: "Aarav Shah",
        clientWhatsappE164: null,
        items: [
          {
            id: "11111111-1111-4111-8111-111111111105",
            type: "overdue_meal",
            severity: "critical",
            status: "acknowledged",
            ageMinutes: 600,
            summary: "Lunch not logged",
            details: { localDate: "2026-11-01" },
            acknowledgedAt: "2026-11-02T08:00:00.000Z",
          },
        ],
      },
    ],
    needsYou: [],
    reviewed: [],
  };
  return attentionGroupsResponseSchema.parse(raw);
}

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <>
      <div data-testid="location">{`${location.pathname}${location.search}`}</div>
      <div data-testid="nav-type">{navigationType}</div>
    </>
  );
}

function renderPage(initial = "/home/attention") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/home/attention" element={<AttentionViewPage />} />
        <Route path="/" element={<div>Home page</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getAttentionGroups.mockReset();
  api.listClients.mockReset();
  api.listClients.mockResolvedValue({
    items: [],
    facets: { status: { active: 24, invited: 2 }, adherence: {}, renewal: {} },
    nextCursor: null,
  });
});

afterEach(() => {
  cleanup();
});

describe("AttentionViewPage", () => {
  it("lists every open client grouped by severity, most urgent first", async () => {
    api.getAttentionGroups.mockResolvedValue(groups());
    renderPage();

    const critical = await screen.findByRole("region", { name: /Critical/ });
    const attention = screen.getByRole("region", { name: /Attention/ });

    const criticalRows = within(critical).getAllByRole("link");
    expect(criticalRows).toHaveLength(1);
    expect(criticalRows[0]?.textContent).toContain("Rohan Mehta");
    expect(criticalRows[0]?.textContent).toContain("since 5 d");

    const attentionRows = within(attention).getAllByRole("link");
    expect(attentionRows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Neha Reddy"),
      expect.stringContaining("Priya Sharma"),
    ]);
    expect(attentionRows[1]?.textContent).toContain("since 2 h");

    // Reviewed-only clients stay off this list.
    expect(screen.queryByText("Aarav Shah")).toBeNull();
    // Header count is clients, not items.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Needs attention\s*3/);
    // No ISO dates or raw enums leak into the rows.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/overdue_meal|missed_workout|overdue_checkin/);
    expect(text).not.toContain("%");
    // The active-client count is only for the empty state.
    expect(api.listClients).not.toHaveBeenCalled();
  });

  it("filters by severity with the chips", async () => {
    api.getAttentionGroups.mockResolvedValue(groups());
    renderPage();
    await screen.findByRole("region", { name: /Critical/ });

    const criticalChip = screen.getByRole("button", { name: /Critical\s*1/ });
    fireEvent.click(criticalChip);
    expect(criticalChip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Neha Reddy")).toBeNull();
    expect(screen.getByText("Rohan Mehta")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toContain("/home/attention?severity=critical",
    );
  });

  it("shows the empty state with the active client count", async () => {
    api.getAttentionGroups.mockResolvedValue(
      attentionGroupsResponseSchema.parse({ groups: [], needsYou: [], reviewed: [] }),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "No one needs you right now" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText(/All 24 active clients are on track\./),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /All/ })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Back to Home" }));
    expect(await screen.findByText("Home page")).toBeTruthy();
  });

  it("row opens that client's panel on Home", async () => {
    api.getAttentionGroups.mockResolvedValue(groups());
    renderPage();

    const row = await screen.findByRole("link", { name: /^Rohan Mehta\./ });
    fireEvent.click(row);

    expect(await screen.findByText("Home page")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toContain(`/?client=${ROHAN}`,
    );
  });

  it("shows the error state when the first load fails", async () => {
    api.getAttentionGroups
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(groups());
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Couldn't load needs attention" }),
    ).toBeTruthy();
  });
});

describe("AttentionViewPage back to Home", () => {
  it("pops back to the Home entry it was opened from", async () => {
    api.getAttentionGroups.mockResolvedValue(groups());
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/home/attention" element={<AttentionViewPage />} />
          <Route
            path="/"
            element={
              <div data-testid="screen-TW-04">
                <Link to="/home/attention">Needs attention 3</Link>
              </div>
            }
          />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Needs attention 3" }));
    await screen.findByRole("region", { name: /Critical/ });
    expect(screen.getByTestId("nav-type").textContent).toBe("PUSH");

    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    await screen.findByTestId("screen-TW-04");
    // A history pop, not a new Home entry, so Home's place is kept.
    expect(screen.getByTestId("nav-type").textContent).toBe("POP");
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("pushes Home when the view was opened directly", async () => {
    api.getAttentionGroups.mockResolvedValue(groups());
    renderPage();
    await screen.findByRole("region", { name: /Critical/ });
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(await screen.findByText("Home page")).toBeTruthy();
    expect(screen.getByTestId("nav-type").textContent).toBe("PUSH");
  });
});

describe("formatSince", () => {
  it("reads in minutes, hours and days", () => {
    expect(formatSince(12)).toBe("since 12 min");
    expect(formatSince(60)).toBe("since 1 h");
    expect(formatSince(24 * 60)).toBe("since 1 d");
  });
});
