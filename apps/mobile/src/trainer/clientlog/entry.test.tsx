/** Z10-16: the "Log workout" entry on the client status screen; ended clients get none. */
import { describe, expect, it, vi } from "vitest";
import { clientWorkspaceSchema } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen } from "../../test/render";

const RID = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";

function workspace(ended: boolean) {
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
      recentActivity: [],
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
};
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../components/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { ClientStatusScreen } = await import("../ClientStatusScreen");

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

describe("Log workout entry", () => {
  it("opens the log form from an active client", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace(false));
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Log workout" }));
    expect(await screen.findByText("Date · up to 7 days back")).toBeTruthy();
  });

  it("has no Log workout entry for an ended client", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace(true));
    renderScreen();
    await screen.findByText(/Coaching ended/);
    expect(screen.queryByRole("button", { name: "Log workout" })).toBeNull();
  });
});
