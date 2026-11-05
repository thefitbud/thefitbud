/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ResponsivenessResponse } from "@fitbud/contracts";

const REL_ID = "12121212-1212-4121-8121-121212121212";

const stage1 = vi.hoisted(() => ({ getResponsiveness: vi.fn() }));
vi.mock("../../lib/stage1-api", () => ({ stage1Api: stage1 }));

import { ResponsivenessPanel } from "./ResponsivenessPanel";

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
    expect(await screen.findByText("Network blip")).toBeTruthy();

    stage1.getResponsiveness.mockResolvedValueOnce(RESPONSIVE);
    view.rerender(<ResponsivenessPanel relationshipId={REL_ID} refreshEpoch={1} />);
    await waitFor(() => expect(screen.queryByText("Network blip")).toBeNull());
    expect(screen.queryByText(/Loading reminder responsiveness/)).toBeNull();
  });
});
