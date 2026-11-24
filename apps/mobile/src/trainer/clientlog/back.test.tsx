/** Z14-18: back (on screen and hardware) from the client page sub-screens, and the discard questions. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackHandler, Platform } from "react-native";
import { clientWorkspaceSchema } from "@fitbud/contracts";
import { act, fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";

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
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../components/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../lib/dates", async (orig) => ({
  ...(await orig<typeof import("../../lib/dates")>()),
  localDateInTimezone: () => "2026-11-04",
}));

const { ClientStatusScreen } = await import("../ClientStatusScreen");

let listener: (() => boolean) | null = null;
const realOS = Platform.OS;
const onBack = vi.fn();
beforeEach(() => {
  listener = null;
  onBack.mockClear();
  (Platform as { OS: string }).OS = "android";
  vi.spyOn(BackHandler, "addEventListener").mockImplementation(((
    _event: string,
    handler: () => boolean,
  ) => {
    listener = handler;
    return { remove: () => undefined };
  }) as never);
  api.getClientWorkspace.mockResolvedValue(workspace(false));
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

function renderScreen() {
  render(
    <ClientStatusScreen
      relationshipId={RID}
      displayName="Kavya Nair"
      backLabel="Clients"
      onBack={onBack}
      onOpenException={() => {}}
      onOpenCheckin={() => {}}
    />,
  );
}

async function openLog(name: "Log meal" | "Log measurement") {
  fireEvent.click(await screen.findByRole("button", { name: "More" }));
  fireEvent.click(await screen.findByRole("button", { name: /Log in person for / }));
  fireEvent.click(await screen.findByRole("button", { name }));
  await screen.findByRole("heading", { name });
}

describe("client page back", () => {
  it("hardware back from a log screen with nothing typed shows the client page", async () => {
    renderScreen();
    await openLog("Log measurement");
    expect(press()).toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Log measurement" })).toBeNull(),
    );
    expect(screen.getByTestId("client-status")).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("the on-screen Back and the hardware back ask the same question about unsaved input", async () => {
    renderScreen();
    await openLog("Log measurement");
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "72.4" } });
    expect(press()).toBe(true);
    expect(await screen.findByText("Discard this log?")).toBeTruthy();
    // Back with the question open closes only the question.
    expect(press()).toBe(true);
    await waitFor(() => expect(screen.queryByText("Discard this log?")).toBeNull());
    expect(screen.getByRole("heading", { name: "Log measurement" })).toBeTruthy();
    // The on-screen Back asks it too; Keep editing keeps the entry.
    const backs = screen.getAllByRole("button", { name: "Back" });
    fireEvent.click(backs[backs.length - 1]!);
    expect(await screen.findByText("Discard this log?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Value")).toBeTruthy();
    // Discard leaves the log for the client page.
    press();
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Log measurement" })).toBeNull(),
    );
    expect(screen.getByTestId("client-status")).toBeTruthy();
  });

  it("with nothing open on the page the press falls to the shell", async () => {
    renderScreen();
    await screen.findByTestId("client-status");
    expect(press()).toBe(false);
  });

  it("the inline note form closes on back; typed text asks first", async () => {
    renderScreen();
    fireEvent.click((await screen.findAllByRole("button", { name: /Add note/ }))[0]!);
    await screen.findByLabelText("Note");
    expect(press()).toBe(true);
    await waitFor(() => expect(screen.queryByLabelText("Note")).toBeNull());
    fireEvent.click((await screen.findAllByRole("button", { name: /Add note/ }))[0]!);
    fireEvent.change(await screen.findByLabelText("Note"), {
      target: { value: "Knee felt better" },
    });
    expect(press()).toBe(true);
    expect(await screen.findByText("Discard this note?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep writing" }));
    expect(screen.getByLabelText("Note")).toBeTruthy();
    press();
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByLabelText("Note")).toBeNull());
  });
});
