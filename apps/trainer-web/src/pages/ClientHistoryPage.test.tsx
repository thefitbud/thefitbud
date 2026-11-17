/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("shows All events select, civil date placeholders, and absolute times", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Check-in submitted")).toBeTruthy();
    });

    const kind = screen.getByLabelText("All events") as HTMLSelectElement;
    expect(kind.value).toBe("");
    expect(screen.getByRole("option", { name: "All events" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Workouts" })).toBeTruthy();

    const choose = screen.getAllByText("Choose a date");
    expect(choose.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByDisplayValue(/mm\/dd\/yyyy/i)).toBeNull();

    const when = screen.getAllByText(/Oct,/);
    expect(when.length).toBeGreaterThan(0);
    expect(screen.queryByText(/min ago|h ago|yesterday|\d+ d ago/i)).toBeNull();
  });

  it("filters by kind through the compact All events control", async () => {
    renderPage();
    await waitFor(() => {
      expect(api.listHistory).toHaveBeenCalled();
    });
    const kind = screen.getByLabelText("All events");
    fireEvent.change(kind, { target: { value: "meals" } });
    await waitFor(() => {
      const last = api.listHistory.mock.calls.at(-1)?.[1] as
        | { kind?: string }
        | undefined;
      expect(last?.kind).toBe("meal_compliance");
    });
  });

  it("shows empty copy when nothing is recorded", async () => {
    api.listHistory.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Nothing recorded yet.")).toBeTruthy();
    });
  });
});
