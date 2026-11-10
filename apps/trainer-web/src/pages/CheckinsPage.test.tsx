/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const ACTIVE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENDED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const api = vi.hoisted(() => ({
  listClients: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listCheckins: vi.fn(),
  nudgeActivity: vi.fn(),
}));
vi.mock("../lib/api", () => ({ apiClient: api }));

import { CheckinsPage } from "./CheckinsPage";

function item(rid: string, name: string, id: string, status: string) {
  return {
    coachingRelationshipId: rid,
    traineeUserId: "u-" + id,
    traineeDisplayName: name,
    traineeTimezone: "Asia/Kolkata",
    checkin: {
      id,
      status,
      localDate: "2026-10-21",
      submittedAt: status === "submitted" ? "2026-10-21T04:30:00.000Z" : null,
    },
  };
}

// Names are deliberately not the old hard-coded demo first names.
function seed() {
  api.listClients.mockResolvedValue({
    items: [
      { relationshipId: ACTIVE, traineeDisplayName: "Rohan Mehta", status: "active" },
      { relationshipId: ENDED, traineeDisplayName: "Tara Shah", status: "ended" },
    ],
  });
  api.listTrainerCheckinInbox.mockResolvedValue({
    items: [
      item(ACTIVE, "Rohan Mehta", "c1", "submitted"),
      item(ENDED, "Tara Shah", "c2", "submitted"),
    ],
  });
  api.listCheckins.mockImplementation(async (rid: string) => ({
    items: [
      {
        id: "r-" + rid,
        status: "reviewed",
        localDate: "2026-10-20",
        submittedAt: null,
      },
    ],
  }));
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <CheckinsPage />
    </MemoryRouter>,
  );
}

describe("CheckinsPage (Z7-3)", () => {
  beforeEach(seed);
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("hides ended clients by relationship status, whatever their name", async () => {
    renderAt("/checkins?tab=to-review");
    await waitFor(() =>
      expect(screen.getAllByText("Rohan Mehta").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Tara Shah")).toBeNull();
  });

  it("does not hide an active client who shares a former demo first name", async () => {
    api.listClients.mockResolvedValue({
      items: [{ relationshipId: ACTIVE, traineeDisplayName: "Kavya Rao", status: "active" }],
    });
    api.listTrainerCheckinInbox.mockResolvedValue({
      items: [item(ACTIVE, "Kavya Rao", "c1", "submitted")],
    });
    renderAt("/checkins");
    await waitFor(() =>
      expect(screen.getAllByText("Kavya Rao").length).toBeGreaterThan(0),
    );
  });

  it("the Reviewed tab skips ended clients using status", async () => {
    renderAt("/checkins?tab=reviewed");
    await waitFor(() => expect(api.listCheckins).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getAllByText("Rohan Mehta").length).toBeGreaterThan(0),
    );
    expect(api.listCheckins).toHaveBeenCalledTimes(1);
    expect(api.listCheckins.mock.calls[0]![0]).toBe(ACTIVE);
  });

  it("opens on To review for ?tab=to-review and for no param", async () => {
    for (const url of ["/checkins?tab=to-review", "/checkins"]) {
      renderAt(url);
      const tab = await screen.findByRole("tab", { name: /To review/ });
      expect(tab.getAttribute("aria-selected")).toBe("true");
      cleanup();
    }
  });

  it("shows the empty state on To review with nothing waiting", async () => {
    api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
    renderAt("/checkins?tab=to-review");
    expect(await screen.findByText("No check-ins waiting. Nice.")).toBeTruthy();
  });
});
