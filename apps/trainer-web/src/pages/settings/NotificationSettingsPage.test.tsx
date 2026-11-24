/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettingsPage } from "./NotificationSettingsPage";

const getNotificationPreferences = vi.fn();
const updateNotificationPreferences = vi.fn();

vi.mock("../../components/OfflineBanner", () => ({
  useOnlineStatus: () => true,
}));

vi.mock("../../lib/api", () => ({
  apiClient: {
    getNotificationPreferences: (...args: unknown[]) =>
      getNotificationPreferences(...args),
    updateNotificationPreferences: (...args: unknown[]) =>
      updateNotificationPreferences(...args),
  },
}));

const prefs = {
  pushEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  trainerCategories: {
    askCoach: true,
    checkinSubmitted: true,
    criticalDigest: true,
    intakeSubmitted: true,
    renewalsDue: true,
    mealTimesChanged: true,
    clientLogEdits: true,
    morningSummary: false,
  },
};

describe("NotificationSettingsPage", () => {
  beforeEach(() => {
    getNotificationPreferences.mockResolvedValue(prefs);
    updateNotificationPreferences.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders frame toggle rows and a single quiet-hours row", async () => {
    render(<NotificationSettingsPage />);
    await screen.findByTestId("screen-TW-29");
    expect(screen.getByText("Push to your phone and this browser.")).toBeTruthy();
    expect(screen.getByText("Clients who need you")).toBeTruthy();
    expect(screen.getByText("Check-ins submitted")).toBeTruthy();
    expect(screen.getByText("Intake submitted")).toBeTruthy();
    expect(screen.getByText("Renewals due")).toBeTruthy();
    expect(screen.getByText("Weekly summary email")).toBeTruthy();
    expect(screen.getAllByText("Quiet hours").length).toBeGreaterThan(0);
    expect(screen.getByTestId("quiet-hours-display").textContent).toMatch(
      /10:00 pm — 7:00 am • nothing during these hours/,
    );
    expect(screen.getAllByRole("switch")).toHaveLength(7);
  });

  it("shows Client log edits on by default and saves it to clientLogEdits (Z14-16)", async () => {
    // An older server answer without the key still reads as on.
    const without: Record<string, boolean> = { ...prefs.trainerCategories };
    delete without.clientLogEdits;
    getNotificationPreferences.mockResolvedValue({ ...prefs, trainerCategories: without });
    render(<NotificationSettingsPage />);
    await screen.findByText("When a client edits or removes a meal log.");
    const toggle = screen.getByRole("switch", { name: /Client log edits/i });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(updateNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          trainerCategories: expect.objectContaining({ clientLogEdits: false }),
        }),
      ),
    );
  });

  it("persists a category toggle", async () => {
    render(<NotificationSettingsPage />);
    await screen.findByText("Weekly summary email");
    const weekly = screen.getByRole("switch", {
      name: /Weekly summary email/i,
    });
    expect(weekly.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(weekly);
    await waitFor(() =>
      expect(updateNotificationPreferences).toHaveBeenCalled(),
    );
    expect(updateNotificationPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        trainerCategories: expect.objectContaining({ morningSummary: true }),
      }),
    );
  });

  it("turning quiet hours off sends null times", async () => {
    render(<NotificationSettingsPage />);
    await screen.findByRole("switch", { name: /Quiet hours/i });
    fireEvent.click(screen.getByRole("switch", { name: /Quiet hours/i }));
    await waitFor(() =>
      expect(updateNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          quietHoursStart: null,
          quietHoursEnd: null,
        }),
      ),
    );
  });
});
