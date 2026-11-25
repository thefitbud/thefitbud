/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(await screen.findByText("No check-ins waiting")).toBeTruthy();
    expect(screen.queryByText(/Next due/)).toBeNull();
    expect(screen.getByText("Nothing to review")).toBeTruthy();
  });

  it("names the next due client and date in the empty state, from loaded Due rows", async () => {
    const dueRow = (rid: string, name: string, id: string, localDate: string) => ({
      ...item(rid, name, id, "due"),
      checkin: { id, status: "due", localDate, submittedAt: null },
    });
    api.listTrainerCheckinInbox.mockResolvedValue({
      items: [
        dueRow(ACTIVE, "Rohan Mehta", "c1", "2026-10-21"),
        dueRow("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Arjun Kapoor", "c3", "2026-10-23"),
        dueRow("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Neha Reddy", "c4", "2026-10-21"),
      ],
    });
    renderAt("/checkins?tab=to-review");
    expect(
      await screen.findByText("You're up to date. Next due: Rohan and Neha on Wed 21 Oct."),
    ).toBeTruthy();
  });

  it("shows the lede and a weekday in the When column", async () => {
    renderAt("/checkins");
    expect(await screen.findByText("1 to review")).toBeTruthy();
    expect(screen.getAllByText("Wed 21 Oct, 10:00 am").length).toBeGreaterThan(0);
  });

  it("offers Remind on Due and Overdue rows, and a Review link on submitted rows (W-166)", async () => {
    api.listTrainerCheckinInbox.mockResolvedValue({
      items: [
        item(ACTIVE, "Rohan Mehta", "c1", "due"),
        item("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Arjun Kapoor", "c3", "overdue"),
        item("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Neha Reddy", "c4", "submitted"),
      ],
    });
    api.nudgeActivity.mockResolvedValue({ deduped: false, delivery: "push", inboxReason: null });
    renderAt("/checkins?tab=due");
    const table = await screen.findByRole("table", { name: "Check-ins inbox" });
    fireEvent.click(await within(table).findByRole("button", { name: "Remind" }));
    await waitFor(() => expect(api.nudgeActivity).toHaveBeenCalledTimes(1));
    expect(api.nudgeActivity.mock.calls[0]![1]).toEqual({
      activityType: "checkin",
      activityId: "c1",
    });
    expect((await screen.findByTestId("inbox-remind-notice")).textContent).toBe(
      "Reminder sent to Rohan.",
    );
    fireEvent.click(screen.getByRole("tab", { name: /Overdue/ }));
    expect(
      await within(await screen.findByRole("table", { name: "Check-ins inbox" })).findByRole(
        "button",
        { name: "Remind" },
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /To review/ }));
    expect(
      (await screen.findAllByRole("link", { name: "Review" }))[0]!.getAttribute("href"),
    ).toContain("/check-ins/c4?from=inbox");
  });

  it("says so when Remind fails, in plain words", async () => {
    api.listTrainerCheckinInbox.mockResolvedValue({
      items: [item(ACTIVE, "Rohan Mehta", "c1", "overdue")],
    });
    api.nudgeActivity.mockRejectedValue(new Error("boom"));
    renderAt("/checkins?tab=overdue");
    fireEvent.click((await screen.findAllByRole("button", { name: "Remind" }))[0]!);
    const notice = await screen.findByTestId("inbox-remind-notice");
    expect(notice.textContent).not.toMatch(/boom/);
    expect(notice.textContent).toBeTruthy();
  });
});
