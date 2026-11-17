/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WelcomePage } from "./WelcomePage";

const refreshMe = vi.fn();
const updateTrainerProfile = vi.fn();
const listOnboardingFormTemplates = vi.fn();
const getOnboardingFormTemplate = vi.fn();
const createInvitation = vi.fn();

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: {
      timezone: "Asia/Kolkata",
      trainerProfile: { displayName: null, whatsappE164: null },
      permittedRoles: ["trainer"],
    },
    refreshMe,
  }),
}));

vi.mock("../hooks/useOnline", () => ({
  useOnline: () => true,
}));

vi.mock("../lib/stage1-api", () => ({
  stage1Api: {
    updateTrainerProfile: (...args: unknown[]) => updateTrainerProfile(...args),
  },
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    listOnboardingFormTemplates: (...args: unknown[]) =>
      listOnboardingFormTemplates(...args),
    getOnboardingFormTemplate: (...args: unknown[]) =>
      getOnboardingFormTemplate(...args),
    createInvitation: (...args: unknown[]) => createInvitation(...args),
  },
}));

vi.mock("../lib/idempotency", () => ({
  createIdempotencyKey: () => "idem-test",
}));

beforeEach(() => {
  sessionStorage.clear();
  updateTrainerProfile.mockResolvedValue({});
  refreshMe.mockResolvedValue(undefined);
  listOnboardingFormTemplates.mockResolvedValue({
    items: [
      {
        id: "tmpl-1",
        ownership: "global",
        trainerUserId: null,
        name: "FitBud standard intake",
        description: null,
        latestVersionId: "ver-1",
        latestVersionNumber: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    nextCursor: null,
  });
  getOnboardingFormTemplate.mockResolvedValue({
    id: "tmpl-1",
    ownership: "global",
    trainerUserId: null,
    name: "FitBud standard intake",
    description: null,
    latestVersionId: "ver-1",
    latestVersionNumber: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    versions: [
      {
        id: "ver-1",
        version: 3,
        fields: [{ id: "f1", label: "Goals", required: true, type: "text" }],
      },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWelcome(path = "/welcome?capture=welcome") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/" element={<div data-testid="home-route">home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WelcomePage first-run", () => {
  it("shows profile step with stepper, IST label, and helpers", () => {
    renderWelcome();

    expect(screen.getByTestId("screen-TW-02")).toBeTruthy();
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your coaching profile" })).toBeTruthy();
    expect(screen.getByText("This is what your clients see.")).toBeTruthy();
    expect(
      screen.getByText("Shown to clients in the app and in reminders."),
    ).toBeTruthy();
    expect(
      screen.getByText("Used for your clients' Ask coach links."),
    ).toBeTruthy();
    expect(screen.getByText("+91")).toBeTruthy();
    expect(screen.getByLabelText("Timezone")).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "India (IST) · detected" }),
    ).toBeTruthy();
    expect(screen.getByText("Draft saved · you can leave and come back")).toBeTruthy();
    expect(screen.queryByText("Asia/Kolkata")).toBeNull();
  });

  it("advances to template cards then invite copy", async () => {
    renderWelcome();

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Nova Coach" },
    });
    fireEvent.change(screen.getByPlaceholderText(/98765/i), {
      target: { value: "9876500999" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Your starting templates" }),
      ).toBeTruthy();
    });
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    expect(screen.getByText("FitBud standard intake")).toBeTruthy();
    expect(screen.getByText(/Onboarding form · v3 · 5 sections/)).toBeTruthy();
    expect(screen.getAllByText("FitBud base").length).toBe(4);
    expect(screen.getByRole("button", { name: /^back$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Invite your first client" }),
      ).toBeTruthy();
    });
    expect(screen.getByTestId("welcome-invite-form")).toBeTruthy();
    expect(
      screen.getByText("Used to sign in and for sign-in codes."),
    ).toBeTruthy();
    await waitFor(() => {
      expect(
        screen.getByRole("option", {
          name: "FitBud standard intake (global) · v3",
        }),
      ).toBeTruthy();
    });
  });

  it("skip finishes on the centred You're set screen", async () => {
    sessionStorage.setItem(
      "fitbud.welcome.draft",
      JSON.stringify({
        step: 3,
        displayName: "Nova Coach",
        whatsapp: "9876500999",
        timezone: "Asia/Kolkata",
      }),
    );
    renderWelcome();

    await waitFor(() => {
      expect(screen.getByTestId("welcome-invite-form")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));

    expect(screen.getByTestId("welcome-done")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "You're set" })).toBeTruthy();
    expect(
      screen.getByText("FitBud will show you who needs attention here."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /go to home/i })).toBeTruthy();
    expect(screen.queryByText(/Step 3 of 3/)).toBeNull();
  });

  it("shows inline WhatsApp field error on profile", async () => {
    renderWelcome();
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Nova Coach" },
    });
    fireEvent.change(screen.getByPlaceholderText(/98765/i), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/10-digit/i);
    });
  });
});
