/**
 * Z14-19: a client's avatar or name opens their profile pushed on top of the
 * screen the trainer tapped from; Back returns there. The name comes from the
 * client cache or the client's own workspace header, not a 50-row list page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackHandler, Platform } from "react-native";
import { clientWorkspaceSchema } from "@fitbud/contracts";
import { act, fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

const RID_55 = "55555555-5555-4555-8555-555555555555";
const EXC = "11111111-1111-4111-8111-111111111111";
const A1 = "00000000-0000-4000-8000-0000000000a1";

function workspace(relationshipId: string, name: string) {
  return clientWorkspaceSchema.parse({
    header: {
      relationshipId,
      traineeDisplayName: name,
      onboardingStatus: "coaching_ready",
      effectivePlan: null,
      goalShort: null,
      renewalState: null,
      startedAt: "2026-07-06T04:00:00.000Z",
      adherenceState: "on_track",
      traineeProfile: { displayName: name, age: null, gender: null },
      traineeTimezone: "Asia/Kolkata",
      hasCustomMealTimes: false,
      trainerWhatsappE164: null,
      clientWhatsappE164: null,
      endedAt: null,
    },
    overview: {
      openException: { id: EXC, type: "missed_workout", severity: "attention", status: "active", summary: "Missed Upper body A", sourceEntityType: "workout_assignment", sourceEntityId: A1, detectedAt: "2026-11-03T04:00:00.000Z" },
      nextCheckin: null,
      recentActivity: [],
      progress: { measurements: [], entries: [], media: [] },
    },
    plan: { plan: null, version: null },
    configuration: { configuration: null, subscription: null },
    history: { relationshipId },
  });
}

const empty = async () => ({ items: [], nextCursor: null });
const api = {
  // The first page only: client 55 is not in it.
  listClients: vi.fn(async () => ({
    items: Array.from({ length: 50 }, (_, i) => ({
      relationshipId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      traineeDisplayName: `Client ${i + 1}`,
      status: "coaching_ready",
    })),
  })),
  getClientWorkspace: vi.fn(async (id: string) =>
    workspace(id, id === RID_55 ? "Meera Iyer" : "Kavya Nair"),
  ),
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
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () =>
    mockAuth({ api, relationships: [], me: { timezone: "Asia/Kolkata" } }),
}));
vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("../components/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../lib/dates", async (orig) => ({
  ...(await orig<typeof import("../lib/dates")>()),
  localDateInTimezone: () => "2026-11-04",
}));
vi.mock("./AttentionTab", () => ({
  AttentionTab: (p: {
    onOpenAsk?: (ask: { id: string; relationshipId: string }, name: string) => void;
  }) => (
    <button
      onClick={() => p.onOpenAsk?.({ id: "ask-1", relationshipId: RID_55 }, "Meera Iyer")}
    >
      open-ask
    </button>
  ),
}));
vi.mock("./ask/AskDetailScreen", () => ({
  AskDetailScreen: (p: { onOpenClient?: (id: string) => void; onBack: () => void }) => (
    <div data-testid="ask-screen">
      <button onClick={() => p.onOpenClient?.(RID_55)}>open-profile</button>
    </div>
  ),
}));
vi.mock("./session/SessionDetailScreen", () => ({ SessionDetailScreen: () => <div /> }));
vi.mock("./ClientsTab", () => ({ ClientsTab: () => <div /> }));
vi.mock("./CheckinsTab", () => ({ CheckinsTab: () => <div /> }));
vi.mock("./MoreScreen", () => ({ TrainerMoreScreen: () => <div /> }));
vi.mock("./TrainerNotificationSettingsScreen", () => ({
  TrainerNotificationSettingsScreen: () => <div />,
}));
vi.mock("./TrainerProfileScreen", () => ({ TrainerProfileScreen: () => <div /> }));
vi.mock("./CheckinReviewScreen", () => ({ CheckinReviewScreen: () => <div /> }));
vi.mock("./ExceptionReviewScreen", () => ({ ExceptionReviewScreen: () => <div /> }));

const { TrainerShell } = await import("./TrainerShell");

let listener: (() => boolean) | null = null;
const realOS = Platform.OS;
beforeEach(() => {
  listener = null;
  (Platform as { OS: string }).OS = "android";
  vi.spyOn(BackHandler, "addEventListener").mockImplementation(((
    _event: string,
    handler: () => boolean,
  ) => {
    listener = handler;
    return { remove: () => undefined };
  }) as never);
});
afterEach(() => {
  (Platform as { OS: string }).OS = realOS;
  vi.restoreAllMocks();
});
const press = (): boolean => {
  let consumed = false;
  act(() => {
    consumed = listener?.() ?? false;
  });
  return consumed;
};

describe("opening a client from a detail screen", () => {
  it("pushes the profile with the right name for a client past the first 50, and Back returns", async () => {
    render(<TrainerShell />);
    fireEvent.click(screen.getByText("open-ask"));
    await screen.findByTestId("ask-screen");

    fireEvent.click(screen.getByText("open-profile"));
    await screen.findByTestId("client-status");
    // Client 55 is not in the first page of the list; the name still resolves.
    expect(screen.getAllByText("Meera Iyer").length).toBeGreaterThan(0);
    expect(api.listClients).not.toHaveBeenCalled();
    expect(api.getClientWorkspace).toHaveBeenCalledWith(RID_55);

    expect(press()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("client-status")).toBeNull());
    expect(screen.getByTestId("ask-screen")).toBeTruthy();
  });

  it("still opens the page when the header read fails (offline)", async () => {
    api.getClientWorkspace.mockRejectedValueOnce(new Error("network down"));
    render(<TrainerShell />);
    fireEvent.click(screen.getByText("open-ask"));
    await screen.findByTestId("ask-screen");
    fireEvent.click(screen.getByText("open-profile"));
    await screen.findByTestId("client-status");
  });
});
