/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ClientDirectoryItem } from "@fitbud/contracts";
import { ClientRow } from "./ClientRow";

const ended: ClientDirectoryItem = {
  relationshipId: "22222222-2222-4222-8222-222222222222",
  invitationId: null,
  traineeDisplayName: "Kavya Iyer",
  status: "ended",
  goalShort: null,
  nextCheckin: null,
  effectivePlan: null,
  adherenceState: "not_available",
  renewalState: null,
  renewsOn: null,
  // 19:30Z on 21 Oct is 01:00 IST on 22 Oct.
  startedAt: "2026-08-02T19:00:00.000Z",
  endedAt: "2026-10-21T19:30:00.000Z",
  startedOn: "2026-08-03",
  endedOn: "2026-10-22",
  week: null,
  city: null,
  updatedAt: "2026-10-22T00:00:00.000Z",
};

afterEach(cleanup);

describe("ClientRow ended dates (Z10-21)", () => {
  it("shows the trainer-zone civil dates, not the UTC slice", () => {
    render(
      <MemoryRouter>
        <ClientRow item={ended} variant="ended" />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/Ended Thu 22 Oct/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/21 Oct/)).toBeNull();
    expect(screen.getByText(/Mon 3 Aug – Thu 22 Oct/)).toBeTruthy();
  });
});
