/**
 * Z14-16 (D-W14-23 c, TM-07b2): "Client log edits" is on by default and saves to
 * `clientLogEdits`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

const prefs = {
  userId: "00000000-0000-4000-8000-000000000001",
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
    morningSummary: false,
  },
};

const getNotificationPreferences = vi.fn();
const updateNotificationPreferences = vi.fn();
const auth = mockAuth({ api: { getNotificationPreferences, updateNotificationPreferences } });
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../notifications/usePushPermission", () => ({
  usePushPermission: () => ({ state: "granted", refresh: vi.fn() }),
}));
vi.mock("../notifications/register", () => ({
  requestPushPermission: vi.fn(async () => "granted"),
}));

const { TrainerNotificationSettingsScreen } = await import("./TrainerNotificationSettingsScreen");

describe("TrainerNotificationSettingsScreen Client log edits (Z14-16)", () => {
  beforeEach(() => {
    getNotificationPreferences.mockReset();
    updateNotificationPreferences.mockReset();
    // An older server answer without the key still reads as on.
    getNotificationPreferences.mockResolvedValue(prefs);
    updateNotificationPreferences.mockImplementation(async (body: { trainerCategories: object }) => ({
      ...prefs,
      trainerCategories: { ...prefs.trainerCategories, ...body.trainerCategories },
    }));
  });

  it("shows the row on by default and saves the toggle to clientLogEdits", async () => {
    render(<TrainerNotificationSettingsScreen onBack={() => {}} />);
    await screen.findByText("Client log edits");
    expect(screen.getByText("When a client edits or removes a meal log")).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Client log edits" }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(updateNotificationPreferences).toHaveBeenCalledWith({
        trainerCategories: { clientLogEdits: false },
      }),
    );
  });
});
