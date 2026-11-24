/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ProfileSettingsPage } from "./ProfileSettingsPage";

const updateTrainerProfile = vi.fn();
const setPassword = vi.fn();
const refreshMe = vi.fn();

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: {
      email: "rahul.coach@demo.fitbud.test",
      timezone: "Asia/Kolkata",
      trainerProfile: {
        displayName: "Rahul Verma",
        whatsappE164: "+919000000001",
      },
    },
    refreshMe,
    loading: false,
  }),
}));

vi.mock("../../components/OfflineBanner", () => ({
  useOnlineStatus: () => true,
}));

vi.mock("../../lib/stage1-api", () => ({
  stage1Api: {
    updateTrainerProfile: (...args: unknown[]) => updateTrainerProfile(...args),
    setPassword: (...args: unknown[]) => setPassword(...args),
  },
}));

describe("ProfileSettingsPage", () => {
  beforeEach(() => {
    updateTrainerProfile.mockResolvedValue({});
    setPassword.mockResolvedValue({});
    refreshMe.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <ProfileSettingsPage />
      </MemoryRouter>,
    );
  }

  it("shows India (IST), +91 WhatsApp field, avatar and Save changes", () => {
    renderPage();
    expect(screen.getByTestId("screen-TW-28")).toBeTruthy();
    expect(screen.getByRole("option", { name: "India Standard Time (IST)" })).toBeTruthy();
    expect(screen.getByText("+91")).toBeTruthy();
    expect(screen.getByDisplayValue("90000 00001")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change photo" })).toBeTruthy();
    expect(screen.getByText("RV")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.getByText("Used in reminders: “Rahul sent you a reminder”")).toBeTruthy();
  });

  it("saves seeded profile as India E.164 and IST timezone", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateTrainerProfile).toHaveBeenCalled());
    expect(updateTrainerProfile).toHaveBeenCalledWith({
      displayName: "Rahul Verma",
      whatsappE164: "+919000000001",
      timezone: "Asia/Kolkata",
    });
    expect(refreshMe).toHaveBeenCalled();
  });
});
