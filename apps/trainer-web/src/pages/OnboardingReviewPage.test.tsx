/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

const REL_ID = "55555555-5555-4555-8555-555555555555";

const api = vi.hoisted(() => ({
  getCurrentOnboardingForm: vi.fn(),
  getOnboardingFormTemplate: vi.fn(),
  getOnboardingResponse: vi.fn(),
  listHistory: vi.fn(),
  reviewOnboarding: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));

import { OnboardingReviewPage } from "./OnboardingReviewPage";

type Lifecycle = "ended" | "active" | "coaching_ready" | "onboarding_submitted";

function renderPage(onboardingStatus: Lifecycle) {
  const context = {
    workspace: {
      header: {
        traineeDisplayName: "Kavya Menon",
        traineeProfile: { gender: "female" },
        onboardingStatus,
        clientWhatsappE164: null,
      },
    },
    relationshipId: REL_ID,
    online: true,
    ended: onboardingStatus === "ended",
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/onboarding`]}>
      <Routes>
        <Route
          path="/clients/:relationshipId"
          element={<Outlet context={context} />}
        >
          <Route path="onboarding" element={<OnboardingReviewPage />} />
          <Route path="configure" element={<p>configure route</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getCurrentOnboardingForm.mockResolvedValue({
    id: "f1",
    templateId: "t1",
    key: "intake",
    version: 1,
    fields: [],
  });
  api.getOnboardingFormTemplate.mockResolvedValue({ name: "Standard intake" });
  api.getOnboardingResponse.mockResolvedValue({
    status: "submitted",
    submittedAt: "2026-07-05T04:00:00.000Z",
    updatedAt: "2026-07-05T04:00:00.000Z",
    answers: {},
  });
  api.listHistory.mockResolvedValue({
    items: [{ occurredAt: "2026-07-06T04:00:00.000Z" }],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OnboardingReviewPage footer (CE2)", () => {
  it("ended client: the button reads View coaching setup and only navigates", async () => {
    renderPage("ended");
    const button = await screen.findByRole("button", { name: "View coaching setup" });
    expect(screen.queryByRole("button", { name: /configure/i })).toBeNull();
    fireEvent.click(button);
    expect(await screen.findByText("configure route")).toBeTruthy();
    expect(api.reviewOnboarding).not.toHaveBeenCalled();
  });

  it.each(["active", "coaching_ready"] as const)(
    "%s client: the button still reads Open configure",
    async (status) => {
      renderPage(status);
      expect(await screen.findByRole("button", { name: "Open configure" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "View coaching setup" })).toBeNull();
    },
  );

  it("submitted intake awaiting review: Mark ready & configure is unchanged", async () => {
    renderPage("onboarding_submitted");
    expect(
      await screen.findByRole("button", { name: "Mark ready & configure" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View coaching setup" })).toBeNull();
  });
});
