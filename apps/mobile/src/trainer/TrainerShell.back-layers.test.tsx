/** Z14-18: a client page kept under an overlay must not answer hardware back. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackHandler, Platform } from "react-native";
import { clientWorkspaceSchema } from "@fitbud/contracts";
import { act, fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

const RID = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const EXC = "11111111-1111-4111-8111-111111111111";
const A1 = "00000000-0000-4000-8000-0000000000a1";

function workspace() {
  return clientWorkspaceSchema.parse({
    header: {
      relationshipId: RID,
      traineeDisplayName: "Kavya Nair",
      onboardingStatus: "coaching_ready",
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
    history: { relationshipId: RID },
  });
}

const empty = async () => ({ items: [], nextCursor: null });
const api = {
  listClients: vi.fn(async () => ({
    items: [{ relationshipId: RID, traineeDisplayName: "Kavya Nair", status: "active" }],
  })),
  getClientWorkspace: vi.fn(async () => workspace()),
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
vi.mock("./AttentionTab", () => ({ AttentionTab: () => <div data-testid="attention-tab" /> }));
vi.mock("./ClientsTab", () => ({
  ClientsTab: (p: { onOpenClient: (row: unknown) => void }) => (
    <button
      onClick={() =>
        p.onOpenClient({ relationshipId: RID, name: "Kavya Nair", onboardingStatus: "active" })
      }
    >
      open-client-row
    </button>
  ),
}));
vi.mock("./CheckinsTab", () => ({ CheckinsTab: () => <div /> }));
vi.mock("./MoreScreen", () => ({ TrainerMoreScreen: () => <div /> }));
vi.mock("./TrainerNotificationSettingsScreen", () => ({
  TrainerNotificationSettingsScreen: () => <div />,
}));
vi.mock("./TrainerProfileScreen", () => ({ TrainerProfileScreen: () => <div /> }));
vi.mock("./CheckinReviewScreen", () => ({ CheckinReviewScreen: () => <div /> }));
vi.mock("./ExceptionReviewScreen", () => ({
  ExceptionReviewScreen: () => <div data-testid="exception-screen" />,
}));

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

describe("hardware back with a client page under an overlay", () => {
  it("pops the Exception overlay and leaves the open note sheet underneath", async () => {
    render(<TrainerShell />);
    fireEvent.click(screen.getByLabelText("Clients"));
    fireEvent.click(screen.getByText("open-client-row"));
    fireEvent.click((await screen.findAllByRole("button", { name: /Add note/ }))[0]!);
    await screen.findByLabelText("Note");
    fireEvent.click(await screen.findByTestId("client-review-exception"));
    await screen.findByTestId("exception-screen");

    expect(press()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("exception-screen")).toBeNull());
    // The note sheet was not touched while it was hidden.
    expect(screen.getByLabelText("Note")).toBeTruthy();
    // Z14-24: the note sheet is a Modal that answers Android back itself, so the
    // client page has no handler of its own and the press goes on to the shell.
    expect(press()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("client-status")).toBeNull());
  });
});
