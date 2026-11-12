/** Z10-19: the "Log meal" and "Log measurement" entries on the client status screen. */
import { describe, expect, it, vi } from "vitest";
import { clientWorkspaceSchema } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen } from "../../../test/render";

const RID = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";

const A1 = "00000000-0000-4000-8000-0000000000a1";
const A2 = "00000000-0000-4000-8000-0000000000a2";
const PV = "6d0f2a64-3c1b-4f6e-9a10-7b6f4e0c1d11";

function workspace(ended: boolean, activity = false) {
  return clientWorkspaceSchema.parse({
    header: {
      relationshipId: RID,
      traineeDisplayName: "Kavya Nair",
      onboardingStatus: ended ? "ended" : "coaching_ready",
      effectivePlan: null,
      goalShort: null,
      renewalState: null,
      startedAt: "2026-07-06T04:00:00.000Z",
      adherenceState: "on_track",
      traineeProfile: { displayName: "Kavya Nair", age: null, gender: null },
      traineeTimezone: "Asia/Kolkata",
      hasCustomMealTimes: false,
      trainerWhatsappE164: null,
      clientWhatsappE164: null,
      endedAt: ended ? "2026-10-03T10:00:00.000Z" : null,
    },
    overview: {
      openException: null,
      nextCheckin: null,
      recentActivity: activity
        ? [
            { type: "workout", id: A1, occurredAt: "2026-11-02T04:00:00.000Z", localDate: "2026-11-02", title: "Upper body A", state: "completed", planVersionId: PV },
            { type: "workout", id: A2, occurredAt: "2026-10-27T04:00:00.000Z", localDate: "2026-10-27", title: "Lower body A", state: "completed", planVersionId: PV },
          ]
        : [],
      progress: { measurements: [], entries: [], media: [] },
    },
    plan: { plan: null, version: null },
    configuration: { configuration: null, subscription: null },
    history: { relationshipId: RID },
  });
}

const empty = async () => ({ items: [], nextCursor: null });
const api = {
  getClientWorkspace: vi.fn(),
  listWorkoutAssignments: vi.fn(empty),
  listMealAssignments: vi.fn(empty),
  listTrainerNotes: vi.fn(empty),
  getWorkspaceWeek: vi.fn(async () => ({ start: "2026-11-09", workouts: { assigned: 0, completed: 0 }, meals: { assigned: 0, logged: 0 }, days: [], todayNutrition: null })),
  getResponsiveness: vi.fn(async () => ({ label: "responds", counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 } })),
  getProgressMetrics: vi.fn(async () => ({ series: [] })),
  getWorkoutAdherence: vi.fn(async () => ({ items: [] })),
  getMealCompliance: vi.fn(async () => ({ items: [], totals: {} })),
  listCheckins: vi.fn(empty),
  listMeasurements: vi.fn(empty),
};
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../../components/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../lib/dates", async (orig) => ({
  ...(await orig<typeof import("../../../lib/dates")>()),
  localDateInTimezone: () => "2026-11-04",
}));

const { ClientStatusScreen } = await import("../../ClientStatusScreen");

function renderScreen() {
  render(
    <ClientStatusScreen
      relationshipId={RID}
      displayName="Kavya Nair"
      onBack={() => {}}
      onOpenException={() => {}}
      onOpenCheckin={() => {}}
    />,
  );
}

describe("Log meal and Log measurement entries", () => {
  it("opens each form from an active client", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace(false));
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Log meal" }));
    expect(await screen.findByRole("heading", { name: "Log meal" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Log measurement" }));
    expect(await screen.findByRole("heading", { name: "Log measurement" })).toBeTruthy();
  });

  it("has neither entry for an ended client", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace(true));
    renderScreen();
    await screen.findByText(/Coaching ended/);
    expect(screen.queryByRole("button", { name: "Log meal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Log measurement" })).toBeNull();
  });
});
