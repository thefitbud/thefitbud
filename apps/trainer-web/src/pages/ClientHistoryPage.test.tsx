/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HistoryItem } from "@fitbud/contracts";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import {
  ClientHistoryPage,
  formatHistoryWhen,
} from "./ClientHistoryPage";

const REL_ID = "c422296e-ed7b-4196-a2b4-647096af3002";

const api = vi.hoisted(() => ({
  listHistory: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));

function item(
  partial: Partial<HistoryItem> &
    Pick<HistoryItem, "id" | "title" | "kind" | "occurredAt">,
): HistoryItem {
  return {
    summary: "History row",
    sourceEntityType: partial.kind,
    sourceEntityId: partial.id,
    status: null,
    ...partial,
  };
}

function renderPage(search = "") {
  const context = {
    refreshEpoch: 0,
    online: true,
    relationshipId: REL_ID,
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/history${search}`]}>
      <Routes>
        <Route
          path="/clients/:relationshipId"
          element={<Outlet context={context} />}
        >
          <Route path="history" element={<ClientHistoryPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("formatHistoryWhen", () => {
  it("formats absolute civil date and clock (not relative)", () => {
    const label = formatHistoryWhen(
      "2026-10-16T16:00:00.000Z",
      "Asia/Kolkata",
      new Date("2026-11-17T12:00:00.000Z"),
    );
    expect(label).toMatch(/^Fri 16 Oct,/);
    expect(label).toMatch(/\d{1,2}:\d{2} [ap]m$/);
    expect(label).not.toMatch(/ago|yesterday|just now/);
  });
});

describe("ClientHistoryPage", () => {
  beforeEach(() => {
    api.listHistory.mockReset();
    api.listHistory.mockResolvedValue({
      items: [
        item({
          id: "11111111-1111-4111-8111-111111111111",
          kind: "checkin_submitted",
          title: "Check-in submitted",
          occurredAt: "2026-10-16T16:00:00.000Z",
        }),
        item({
          id: "22222222-2222-4222-8222-222222222222",
          kind: "meal_compliance",
          title: "Meal Confirmed",
          occurredAt: "2026-10-15T12:00:00.000Z",
        }),
      ],
      nextCursor: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("groups rows by day with sentence titles and an actor line, no raw ids", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("history-day").length).toBe(2);
    });
    const days = screen.getAllByTestId("history-day");
    expect(within(days[0]!).getByRole("heading", { name: "Fri 16 Oct" })).toBeTruthy();
    expect(within(days[1]!).getByRole("heading", { name: "Thu 15 Oct" })).toBeTruthy();
    const rows = screen.getAllByTestId("history-row");
    expect(rows[0]!.textContent).toMatch(/sent a check-in/);
    expect(rows[0]!.textContent).toMatch(/Submitted by/);
    expect(screen.queryByText(/Check-in submitted|Meal Confirmed/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}|[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("filters by type through the Type menu, and by who through the Who menu", async () => {
    renderPage();
    await waitFor(() => {
      expect(api.listHistory).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: /^Type/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Meals" }));
    await waitFor(() => {
      const last = api.listHistory.mock.calls.at(-1)?.[1] as { kind?: string } | undefined;
      expect(last?.kind).toBe("meal_compliance");
    });
    fireEvent.click(screen.getByRole("button", { name: /^Who/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "You" }));
    await waitFor(() => {
      expect(screen.getByText("Nothing matches those filters.")).toBeTruthy();
    });
  });

  it("searches the loaded rows and offers the date range menu", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("history-row").length).toBe(2);
    });
    fireEvent.change(screen.getByLabelText("Search history"), { target: { value: "check-in" } });
    expect(screen.getAllByTestId("history-row").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /^Date range/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Custom range" }));
    expect(screen.getAllByText("Choose a date").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByDisplayValue(/mm\/dd\/yyyy/i)).toBeNull();
  });

  it("shows empty copy when nothing is recorded", async () => {
    api.listHistory.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Nothing recorded yet.")).toBeTruthy();
    });
  });
});
