/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";

const REL_ID = "55555555-5555-4555-8555-555555555555";

const api = vi.hoisted(() => ({
  getCurrentOnboardingForm: vi.fn(),
  getOnboardingFormTemplate: vi.fn(),
  getOnboardingResponse: vi.fn(),
  listHistory: vi.fn(),
  listInvitations: vi.fn(),
  reviewOnboarding: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));

import { OnboardingReviewPage } from "./OnboardingReviewPage";

type Lifecycle = "ended" | "active" | "coaching_ready" | "onboarding_submitted" | "onboarding_pending";

function pageTree(
  onboardingStatus: Lifecycle,
  refreshEpoch = 0,
  clientWhatsappE164: string | null = null,
) {
  const context = {
    workspace: {
      header: {
        traineeDisplayName: "Kavya Menon",
        traineeProfile: { gender: "female" },
        onboardingStatus,
        clientWhatsappE164,
        traineeTimezone: "Asia/Kolkata",
        startedAt: "2026-07-04T04:00:00.000Z",
      },
    },
    relationshipId: REL_ID,
    refreshEpoch,
    online: true,
    ended: onboardingStatus === "ended",
  };
  return (
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/onboarding`]}>
      <Routes>
        <Route
          path="/clients/:relationshipId"
          element={<Outlet context={context} />}
        >
          <Route path="onboarding" element={<OnboardingReviewPage />} />
          <Route path="settings" element={<SettingsProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

/** Stands in for the Settings tab: shows which section the hash selects. */
function SettingsProbe() {
  const { hash } = useLocation();
  return <p>{`settings route ${hash}`}</p>;
}

function renderPage(
  onboardingStatus: Lifecycle,
  clientWhatsappE164: string | null = null,
) {
  return render(pageTree(onboardingStatus, 0, clientWhatsappE164));
}

beforeEach(() => {
  api.getCurrentOnboardingForm.mockResolvedValue({
    id: "f1",
    templateId: "t1",
    key: "intake",
    version: 1,
    fields: [
      {
        id: "goals",
        type: "long_text",
        label: "Goal",
        required: true,
        section: "Goals",
      },
      {
        id: "injuries",
        type: "long_text",
        label: "Injuries",
        required: false,
        section: "Health",
        highlight: true,
      },
    ],
  });
  api.getOnboardingFormTemplate.mockResolvedValue({ name: "Default onboarding" });
  api.getOnboardingResponse.mockResolvedValue({
    status: "submitted",
    submittedAt: "2026-07-05T04:00:00.000Z",
    createdAt: "2026-07-04T05:00:00.000Z",
    updatedAt: "2026-07-05T04:00:00.000Z",
    answers: {
      goals: "Lose 5 kg",
      injuries: "Left knee pain",
    },
  });
  api.listHistory.mockResolvedValue({
    items: [{ occurredAt: "2026-07-06T04:00:00.000Z" }],
  });
  api.listInvitations.mockResolvedValue({
    items: [
      {
        id: "inv1",
        coachingRelationshipId: REL_ID,
        createdAt: "2026-07-01T04:00:00.000Z",
      },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OnboardingReviewPage submitted (frame 146)", () => {
  it("W-146: answers grouped by form section, the flagged ones listed first to keep in mind", async () => {
    renderPage("active");
    const keep = await screen.findByTestId("intake-keep-in-mind");
    expect(within(keep).getByText("1 answer to keep in mind")).toBeTruthy();
    expect(within(keep).getByText("Health")).toBeTruthy();
    expect(keep.textContent).toContain("Injuries: Left knee pain");
    expect(screen.getByRole("heading", { name: "Goals" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Health" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "FitBud standard intake · v1" })).toBeTruthy();
    // Coached already: no onboarding stepper.
    expect(screen.queryByLabelText("Onboarding progress")).toBeNull();
  });

  it("shows stepper, Review flag, Next step actions, and Timeline", async () => {
    renderPage("onboarding_submitted", "+919876543210");
    expect(
      await screen.findByRole("button", { name: "Mark ready & configure" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Onboarding progress")).toBeTruthy();
    expect(screen.getByText("Ready to coach")).toBeTruthy();
    expect(screen.getByText("Review")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Next step" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Timeline" })).toBeTruthy();
    expect(screen.getByText(/Intake submitted/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Message on WhatsApp/i })).toBeTruthy();
    expect(screen.queryByText("Worth noting")).toBeNull();
  });

  it("submitted intake awaiting review: Mark ready & configure is unchanged", async () => {
    renderPage("onboarding_submitted");
    expect(
      await screen.findByRole("button", { name: "Mark ready & configure" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View coaching setup" })).toBeNull();
  });
});

describe("OnboardingReviewPage not submitted (frame 147)", () => {
  it("shows centred empty state with section progress and Remind on WhatsApp", async () => {
    api.getOnboardingResponse.mockResolvedValue({
      status: "draft",
      submittedAt: null,
      createdAt: "2026-07-04T05:00:00.000Z",
      updatedAt: "2026-07-04T06:00:00.000Z",
      answers: { goals: "Build strength" },
    });
    renderPage("onboarding_pending", "+919876543210");
    expect(
      await screen.findByText(/Kavya hasn't submitted her intake yet/),
    ).toBeTruthy();
    expect(screen.getByText(/answered 1 of 2 sections/i)).toBeTruthy();
    const remind = screen.getByRole("link", { name: /Remind on WhatsApp/i });
    expect(remind.getAttribute("href") ?? "").toMatch(/^https:\/\/wa\.me\//);
    expect(screen.getByRole("heading", { name: "Next step" })).toBeTruthy();
    expect(screen.getByText(/Intake started/)).toBeTruthy();
  });
});

describe("OnboardingReviewPage footer (CE2)", () => {
  it("ended client: the button reads View coaching setup and only navigates", async () => {
    renderPage("ended");
    const button = await screen.findByRole("button", { name: "View coaching setup" });
    expect(screen.queryByRole("button", { name: /configure/i })).toBeNull();
    fireEvent.click(button);
    // W13-10: the CTA selects the Settings tab's Coaching setup section.
    expect(await screen.findByText("settings route #coaching")).toBeTruthy();
    expect(api.reviewOnboarding).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /WhatsApp/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /WhatsApp/i })).toBeNull();
  });

  it("ended client with a WhatsApp number: the intake draft is hidden", async () => {
    renderPage("ended", "+919876543210");
    await screen.findByRole("button", { name: "View coaching setup" });
    expect(screen.queryByRole("link", { name: /WhatsApp/i })).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/wa\.me/);
    expect(document.body.textContent).not.toMatch(/Thanks for filling your intake/);
  });

  it.each(["active", "coaching_ready"] as const)(
    "%s client: the button reads Open coaching setup and selects that section",
    async (status) => {
      renderPage(status);
      const open = await screen.findByRole("button", { name: "Open coaching setup" });
      expect(screen.queryByRole("button", { name: /configure/i })).toBeNull();
      expect(screen.queryByRole("button", { name: "View coaching setup" })).toBeNull();
      expect(screen.getByRole("button", { name: /Message on WhatsApp/i })).toBeTruthy();
      fireEvent.click(open);
      expect(await screen.findByText("settings route #coaching")).toBeTruthy();
    },
  );

  it("active client: WhatsApp still opens the intake draft", async () => {
    renderPage("active", "+919876543210");
    const link = await screen.findByRole("link", { name: /Message on WhatsApp/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(decodeURIComponent(href)).toMatch(
      /Thanks for filling your intake, Kavya/,
    );
  });
});

describe("OnboardingReviewPage refresh", () => {
  it("refetches when the workspace refreshes without remounting the page", async () => {
    const view = render(pageTree("onboarding_submitted", 0));
    await screen.findByRole("button", { name: "Mark ready & configure" });
    expect(api.getOnboardingResponse).toHaveBeenCalledTimes(1);

    view.rerender(pageTree("onboarding_submitted", 1));
    // Quiet: the page stays on screen, no full-page loading swap.
    expect(screen.queryByText("Loading intake…")).toBeNull();
    await waitFor(() => expect(api.getOnboardingResponse).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Mark ready & configure" })).toBeTruthy();
  });
});
