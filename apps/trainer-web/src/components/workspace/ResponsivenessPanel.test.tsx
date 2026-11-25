/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ResponsivenessResponse } from "@fitbud/contracts";

const REL_ID = "12121212-1212-4121-8121-121212121212";

const stage1 = vi.hoisted(() => ({ getResponsiveness: vi.fn() }));
vi.mock("../../lib/stage1-api", () => ({ stage1Api: stage1 }));

import { RemindersDrawer, ResponsivenessPanel } from "./ResponsivenessPanel";

const RESPONSIVE: ResponsivenessResponse = {
  label: "responds",
  counts: { sent: 6, opened: 4, loggedAfter: 3, loggedBefore: 2 },
  pushEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ResponsivenessPanel footer (D-W7-7)", () => {
  it("ended client: reminders are off, with no Configure suggestion", async () => {
    stage1.getResponsiveness.mockResolvedValueOnce(RESPONSIVE);
    render(
      <ResponsivenessPanel relationshipId={REL_ID} traineeFirstName="Kavya" ended />,
    );
    expect(
      await screen.findByText("Reminders are off while coaching is ended."),
    ).toBeTruthy();
    expect(screen.queryByText(/switch categories on or off/i)).toBeNull();
  });

  it("active client: the footer points to Settings › Reminders (W13-10)", async () => {
    stage1.getResponsiveness.mockResolvedValueOnce(RESPONSIVE);
    render(
      <ResponsivenessPanel relationshipId={REL_ID} traineeFirstName="Rohan" />,
    );
    expect(
      await screen.findByText(
        /Switch categories on or off in Settings › Reminders/i,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("Reminders are off while coaching is ended."),
    ).toBeNull();
  });
});

describe("ResponsivenessPanel on a workspace refresh", () => {
  it("keeps its data when a background refresh fails", async () => {
    stage1.getResponsiveness.mockResolvedValueOnce(RESPONSIVE);
    const view = render(<ResponsivenessPanel relationshipId={REL_ID} refreshEpoch={0} />);
    await waitFor(() => expect(screen.queryByText(/Loading reminder responsiveness/)).toBeNull());
    const shown = document.body.textContent;

    stage1.getResponsiveness.mockRejectedValueOnce(new Error("Network blip"));
    view.rerender(<ResponsivenessPanel relationshipId={REL_ID} refreshEpoch={1} />);
    await waitFor(() => expect(stage1.getResponsiveness).toHaveBeenCalledTimes(2));
    await Promise.resolve();

    expect(screen.queryByText("Network blip")).toBeNull();
    expect(document.body.textContent).toBe(shown);
  });

  it("recovers from a failed first load on the next refresh", async () => {
    stage1.getResponsiveness.mockRejectedValueOnce(new Error("Network blip"));
    const view = render(<ResponsivenessPanel relationshipId={REL_ID} refreshEpoch={0} />);
    expect(await screen.findByText("Could not load reminders data.")).toBeTruthy();

    stage1.getResponsiveness.mockResolvedValueOnce(RESPONSIVE);
    view.rerender(<ResponsivenessPanel relationshipId={REL_ID} refreshEpoch={1} />);
    await waitFor(() => expect(screen.queryByText("Could not load reminders data.")).toBeNull());
    expect(screen.queryByText(/Loading reminder responsiveness/)).toBeNull();
  });
});

describe("RemindersDrawer opened-from line (FLOW §6 item 4)", () => {
  function renderDrawer(entry: string, openedFrom?: string | null) {
    stage1.getResponsiveness.mockResolvedValue(RESPONSIVE);
    render(
      <MemoryRouter initialEntries={[entry]}>
        <RemindersDrawer
          relationshipId={REL_ID}
          traineeName="Rohan Mehta"
          timeZone="Asia/Kolkata"
          openedFrom={openedFrom}
          onClose={() => undefined}
        />
      </MemoryRouter>,
    );
  }

  it("reads Overview › Reminders › Details on the client Overview", async () => {
    renderDrawer(`/clients/${REL_ID}/overview`);
    expect(await screen.findByText("Opened from Overview › Reminders › Details")).toBeTruthy();
  });

  it.each([
    ["Home review panel", "/"],
    ["review open on the Overview", `/clients/${REL_ID}/overview?exception=abc`],
    ["Check-ins inbox", "/checkins"],
  ])("is left out from the %s", async (_label, entry) => {
    renderDrawer(entry);
    await screen.findByRole("dialog");
    expect(screen.queryByText(/^Opened from/)).toBeNull();
  });

  it("an explicit openedFrom wins", async () => {
    renderDrawer("/", "Review › Signals › Details");
    expect(await screen.findByText("Opened from Review › Signals › Details")).toBeTruthy();
  });
});
