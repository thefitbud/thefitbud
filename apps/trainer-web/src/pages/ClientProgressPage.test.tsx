/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

const REL_ID = "77777777-7777-4777-8777-777777777777";

const api = vi.hoisted(() => ({
  listMeasurements: vi.fn(),
  listProgressEntries: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));

import { ClientProgressPage } from "./ClientProgressPage";

type Lifecycle = "ended" | "active" | "coaching_ready" | "onboarding_submitted";

function renderPage(onboardingStatus: Lifecycle) {
  const context = {
    workspace: {
      header: {
        relationshipId: REL_ID,
        traineeDisplayName: "Kavya Menon",
        onboardingStatus,
        renewalState: null,
        traineeProfile: { displayName: "Kavya Menon", age: null, gender: "female" },
        traineeTimezone: "Asia/Kolkata",
        hasCustomMealTimes: false,
        trainerWhatsappE164: null,
        clientWhatsappE164: null,
      },
    },
    refreshEpoch: 0,
    relationshipId: REL_ID,
    online: true,
    ended: onboardingStatus === "ended",
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/progress`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="progress" element={<ClientProgressPage />} />
          <Route path="configure" element={<p>configure route</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // No weigh-ins: the empty state with the check-in settings link.
  api.listMeasurements.mockResolvedValue({ items: [] });
  api.listProgressEntries.mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClientProgressPage no-weigh-ins link (CE3)", () => {
  it("ended client: the link reads View coaching setup and only navigates", async () => {
    renderPage("ended");
    expect(
      await screen.findByText("No weigh-ins yet. Weight is collected in check-ins."),
    ).toBeTruthy();
    const link = await screen.findByRole("link", { name: "View coaching setup" });
    expect(link.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
    expect(screen.queryByRole("link", { name: "Open check-in settings" })).toBeNull();
    fireEvent.click(link);
    expect(await screen.findByText("configure route")).toBeTruthy();
  });

  it.each(["active", "coaching_ready", "onboarding_submitted"] as const)(
    "%s client: the link still reads Open check-in settings",
    async (status) => {
      renderPage(status);
      const link = await screen.findByRole("link", { name: "Open check-in settings" });
      expect(link.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
      expect(screen.queryByRole("link", { name: "View coaching setup" })).toBeNull();
    },
  );

  it("ended client with weigh-ins: no empty-state link", async () => {
    api.listMeasurements.mockResolvedValue({
      items: [
        {
          id: "m1",
          type: "body_weight_kg",
          value: 61.2,
          unit: "kg",
          observedAt: "2026-10-01T03:00:00.000Z",
          source: "checkin",
          checkinId: null,
        },
      ],
    });
    renderPage("ended");
    expect(await screen.findByRole("tab", { name: "Weight" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View coaching setup" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open check-in settings" })).toBeNull();
  });
});
