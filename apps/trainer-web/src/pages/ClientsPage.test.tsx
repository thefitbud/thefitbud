/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";

const api = vi.hoisted(() => ({ listClients: vi.fn() }));
vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));

import { ClientsPage } from "./ClientsPage";

const NOW = "2026-10-21T04:30:00.000Z";
const FACETS = {
  // Facets count every directory row, ended included (API directory).
  status: { active: 15, invited: 1, onboarding_submitted: 1, coaching_ready: 1, ended: 2 },
  adherence: { on_track: 4, needs_attention: 6, no_recent_data: 5, not_available: 3 },
  renewal: { expired: 1, due: 1, none: 18 },
};

function row(
  id: string,
  name: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  return {
    relationshipId: id,
    invitationId: null,
    traineeDisplayName: name,
    status,
    goalShort: "Lose 6 kg",
    nextCheckin: null,
    effectivePlan: null,
    adherenceState: "not_available",
    renewalState: null,
    renewsOn: null,
    updatedAt: NOW,
    ...extra,
  };
}

const CURRENT = [
  row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Rohan Mehta", "active", {
    adherenceState: "needs_attention",
    renewalState: "expired",
  }),
];
const ENDED = [
  row("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Kavya Nair", "ended", {
    startedAt: "2026-07-06T05:30:00.000Z",
    endedAt: "2026-10-03T06:00:00.000Z",
    effectivePlan: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Fat loss", versionNumber: 4, status: "effective" },
  }),
];

let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ClientsPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.listClients.mockImplementation(async (query: { status?: string[] }) => ({
    items: query.status?.includes("ended") ? ENDED : CURRENT,
    facets: FACETS,
    nextCursor: null,
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClientsPage toolbar (Z8-19, D-W8-13)", () => {
  it("shows '{n} clients · {m} active' and the switch with counts in the toolbar row", async () => {
    renderAt("/clients");
    await screen.findByText("Rohan Mehta");
    expect(screen.getByText("18 clients · 15 active")).toBeTruthy();

    const toolbar = screen.getByTestId("filter-bar");
    const tablist = within(toolbar).getByRole("tablist", {
      name: "Client list segment",
    });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Current 18", "Ended 2"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("lists filter options through labelFor with facet counts", async () => {
    renderAt("/clients");
    await screen.findByText("Rohan Mehta");
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    const labels = screen
      .getAllByRole("menuitemcheckbox")
      .map((item) => item.textContent);
    expect(labels).toEqual([
      "Invited 1",
      "Onboarding",
      "Awaiting review 1",
      "Ready to coach 1",
      "Active 15",
    ]);
  });

  it("pushes a filter pick into the URL and shows it on the button", async () => {
    renderAt("/clients");
    await screen.findByText("Rohan Mehta");
    fireEvent.click(screen.getByRole("button", { name: "Renewal" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Expired/ }));
    await waitFor(() => expect(lastSearch).toContain("renewal=expired"));
    expect(screen.getByRole("button", { name: "Renewal: Expired" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear renewal" }));
    await waitFor(() => expect(lastSearch).not.toContain("renewal="));
  });

  it("switches to Ended with the frame-140 columns and the read-only footer", async () => {
    renderAt("/clients");
    await screen.findByText("Rohan Mehta");
    fireEvent.click(screen.getByRole("tab", { name: "Ended 2" }));
    await screen.findByText("Kavya Nair");
    expect(lastSearch).toContain("segment=ended");
    expect(
      screen.getByRole("tab", { name: "Ended 2" }).getAttribute("aria-selected"),
    ).toBe("true");
    const headers = screen
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual([
      "Client",
      "Status",
      "Coached",
      "Last plan",
      "Action",
    ]);
    expect(screen.getByText("Ended Sat 3 Oct")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reactivate" })).toBeTruthy();
    expect(
      screen.getByText(
        "Ended clients are read-only. Their history and progress stay visible.",
      ),
    ).toBeTruthy();
    // Subtitle stays the same on both segments (frames 136 and 140).
    expect(screen.getByText("18 clients · 15 active")).toBeTruthy();
  });

  it("keeps the current table columns", async () => {
    renderAt("/clients");
    await screen.findByText("Rohan Mehta");
    expect(
      screen.getAllByRole("columnheader").map((th) => th.textContent),
    ).toEqual([
      "Client",
      "Status",
      "Adherence",
      "Next check-in",
      "Plan",
      "Renewal",
      "Action",
    ]);
  });

  it("shows the Coached range from startedAt and endedAt, agreeing with the ended chip", async () => {
    renderAt("/clients?segment=ended&status=ended");
    const name = await screen.findByText("Kavya Nair");
    const tr = name.closest("tr") as HTMLElement;
    expect(within(tr).getByText("Ended Sat 3 Oct")).toBeTruthy();
    const coached = tr.querySelector("td.col-coached") as HTMLElement;
    expect(coached.textContent).toBe("Mon 6 Jul – Sat 3 Oct");
    expect(coached.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("leaves the Coached cell empty when startedAt is missing", async () => {
    api.listClients.mockImplementation(async () => ({
      items: [
        row("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Nikhil Joshi", "ended", {
          startedAt: null,
          endedAt: "2026-08-31T06:00:00.000Z",
        }),
      ],
      nextCursor: null,
      facets: FACETS,
    }));
    renderAt("/clients?segment=ended&status=ended");
    const name = await screen.findByText("Nikhil Joshi");
    const tr = name.closest("tr") as HTMLElement;
    expect(within(tr).getByText("Ended Mon 31 Aug")).toBeTruthy();
    const coached = tr.querySelector("td.col-coached") as HTMLElement;
    expect(coached.textContent).toBe("");
  });

  it("renders Open as the outlined action and keeps other actions tinted", async () => {
    api.listClients.mockImplementation(async () => ({
      items: [
        ...CURRENT,
        row("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "Vikram Singh", "coaching_ready"),
      ],
      nextCursor: null,
      facets: FACETS,
    }));
    renderAt("/clients");
    await screen.findByText("Rohan Mehta");
    const open = screen.getByRole("link", { name: "Open" });
    expect(open.className).toContain("client-row-cta-outline");
    expect(open.className).not.toContain("button-tinted");
    const setUp = screen.getByRole("link", { name: "Set up plan" });
    expect(setUp.className).toContain("button-tinted");
    expect(setUp.className).not.toContain("client-row-cta-outline");
  });
});

describe("ClientsPage states (Z12-3)", () => {
  it("shows a centred filtered-empty card with helper and keeps the toolbar", async () => {
    api.listClients.mockImplementation(async () => ({
      items: [],
      nextCursor: null,
      facets: FACETS,
    }));
    renderAt("/clients?adherenceState=no_recent_data&renewal=due");
    const empty = await screen.findByTestId("clients-empty");
    expect(empty.textContent).toContain("No clients match these filters");
    expect(empty.textContent).toContain(
      "Try fewer filters, or clear them to see everyone.",
    );
    expect(empty.querySelector(".clients-state-icon")).toBeTruthy();
    expect(screen.getByTestId("filter-bar")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Adherence: No recent data" }).className,
    ).toContain("has-selection");
    expect(
      screen.getByRole("button", { name: "Renewal: Due" }).className,
    ).toContain("has-selection");
    fireEvent.click(within(empty).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      expect(lastSearch).not.toContain("adherenceState=");
      expect(lastSearch).not.toContain("renewal=");
    });
  });

  it("hides the filter bar on true empty and shows the icon tile CTA", async () => {
    api.listClients.mockImplementation(async () => ({
      items: [],
      nextCursor: null,
      facets: { status: { ended: 0 }, adherence: {}, renewal: {} },
    }));
    renderAt("/clients");
    const empty = await screen.findByTestId("clients-empty");
    expect(empty.textContent).toContain("No clients yet");
    expect(empty.textContent).toContain(
      "Invite your first client to start coaching.",
    );
    expect(empty.querySelector(".clients-state-icon")).toBeTruthy();
    expect(screen.queryByTestId("filter-bar")).toBeNull();
    expect(
      screen.getAllByRole("link", { name: /Add client/i }).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      document.querySelector(".clients-count")?.textContent?.trim(),
    ).toBe("No clients yet");
  });

  it("centres ErrorState with Retry and Email support on list failure", async () => {
    api.listClients.mockRejectedValue(
      new ApiClientError({
        code: "INTERNAL",
        message: "Please retry in a moment.",
        requestId: "req-z12-3-error",
        status: 500,
      }),
    );
    renderAt("/clients");
    const panel = await screen.findByTestId("error-state");
    expect(panel.textContent).toContain("Couldn't load your clients");
    expect(panel.textContent).toContain(
      "Something went wrong on our side. Your data is safe. Try again in a moment.",
    );
    expect(panel.textContent).toContain("Request id: req-z12-3-error");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Email support/i })).toBeTruthy();
    expect(panel.closest(".clients-state-mount")).toBeTruthy();
    // Frame 139 keeps the toolbar above the error card.
    expect(screen.getByTestId("filter-bar")).toBeTruthy();
  });
});
