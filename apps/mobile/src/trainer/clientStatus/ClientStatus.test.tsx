/**
 * Client status (Z10-9, frames 18 and 74): kcal from the week read model, the
 * Reminders card, and the ended summary with Reactivate. DOM-shaped harness:
 * proves copy and behaviour, not layout; the visual check is the authority there.
 */
import { describe, expect, it, vi } from "vitest";
import { clientWorkspaceSchema, responsivenessResponseSchema } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";
import { buildEndedSummary, kcalTileValue, reminderLine, weekDayCells } from "./model";

const RID = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const UID = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";
const PV = "6d0f2a64-3c1b-4f6e-9a10-7b6f4e0c1d11";

function workspace(over: { ended: boolean }) {
  return clientWorkspaceSchema.parse({
    header: {
      relationshipId: RID,
      traineeDisplayName: "Kavya Nair",
      onboardingStatus: over.ended ? "ended" : "coaching_ready",
      effectivePlan: null,
      goalShort: "Lose 4 kg",
      renewalState: null,
      startedAt: "2026-07-06T04:00:00.000Z",
      adherenceState: "on_track",
      traineeProfile: { displayName: "Kavya Nair", age: null, gender: null },
      traineeTimezone: "Asia/Kolkata",
      hasCustomMealTimes: false,
      trainerWhatsappE164: null,
      clientWhatsappE164: null,
      endedAt: over.ended ? "2026-10-03T10:00:00.000Z" : null,
    },
    overview: {
      openException: null,
      nextCheckin: null,
      recentActivity: [
        {
          type: "workout",
          id: UID,
          occurredAt: "2026-11-10T04:00:00.000Z",
          localDate: "2026-11-10",
          title: "Lower body A",
          state: "completed",
          planVersionId: PV,
        },
      ],
      progress: { measurements: [], entries: [], media: [] },
    },
    plan: { plan: null, version: null },
    configuration: { configuration: null, subscription: null },
    history: { relationshipId: RID },
  });
}

const responsiveness = responsivenessResponseSchema.parse({
  label: "responds",
  counts: { sent: 7, opened: 6, loggedAfter: 5, loggedBefore: 1 },
});

const api = {
  getClientWorkspace: vi.fn(),
  listWorkoutAssignments: vi.fn(async () => ({ items: [], nextCursor: null })),
  listMealAssignments: vi.fn(async () => ({ items: [], nextCursor: null })),
  listTrainerNotes: vi.fn(async () => ({ items: [], nextCursor: null })),
  getWorkspaceWeek: vi.fn(async () => ({
    start: "2026-11-09",
    workouts: { assigned: 4, completed: 2 },
    meals: { assigned: 25, logged: 18 },
    days: [],
    todayNutrition: {
      date: "2026-11-11",
      logged: { kcal: 410, proteinG: 20, carbsG: 40, fatG: 10 },
      assigned: { kcal: 1950, proteinG: 120, carbsG: 200, fatG: 60 },
    },
  })),
  getResponsiveness: vi.fn(async () => responsiveness),
  getProgressMetrics: vi.fn(async () => ({
    series: [
      {
        key: "weight",
        unit: "kg",
        points: [
          { localDate: "2026-07-06", value: 68.2, checkinId: null },
          { localDate: "2026-10-02", value: 65.1, checkinId: null },
        ],
      },
    ],
  })),
  getWorkoutAdherence: vi.fn(async () => ({
    items: [
      { assignmentId: UID, localDate: "2026-09-28", workoutDayName: "A", status: "completed", planVersionId: PV, startedAt: null, completedAt: null, sessionRpe: null },
      { assignmentId: UID, localDate: "2026-09-30", workoutDayName: "B", status: "missed", planVersionId: PV, startedAt: null, completedAt: null, sessionRpe: null },
    ],
  })),
  getMealCompliance: vi.fn(async () => ({ items: [], totals: {} })),
  listCheckins: vi.fn(async () => ({ items: [], nextCursor: null })),
  requestReactivation: vi.fn<(rid: string, body: object, key: string) => Promise<{ requestId: string; status: string }>>(async () => ({ requestId: UID, status: "pending" })),
};
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));

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

describe("model", () => {
  it("reads kcal as logged of assigned from the week model", () => {
    expect(
      kcalTileValue({ logged: { kcal: 410 }, assigned: { kcal: 1950 } }),
    ).toBe("410 of 1,950");
    expect(kcalTileValue(null)).toBe("–");
  });

  it("words the reminder line without percentages", () => {
    expect(reminderLine(responsiveness)).toBe(
      "Responds to reminders · Logged 5 of 7 after a reminder · 6 opened",
    );
  });

  it("marks a day done, missed or empty", () => {
    const cells = weekDayCells("Asia/Kolkata", ["2026-09-28", "2026-09-29", "2026-09-30"], [
      { localDate: "2026-09-28", status: "completed" },
      { localDate: "2026-09-30", status: "missed" },
    ]);
    expect(cells.map((c) => c.mark)).toEqual(["done", "none", "missed"]);
    expect(cells.map((c) => c.count)).toEqual(["1/1", "–", "0/1"]);
  });

  it("builds the ended summary on the trainee-local last week", async () => {
    const summary = buildEndedSummary({
      zone: "Asia/Kolkata",
      startedAt: "2026-07-06T04:00:00.000Z",
      endedAt: "2026-10-03T10:00:00.000Z",
      weights: (await api.getProgressMetrics()).series[0]!.points as never,
      workouts: (await api.getWorkoutAdherence()).items as never,
      meals: [],
      checkins: [],
    });
    expect(summary.weeksCoached).toBe(13);
    expect(summary.lastWeekStart).toBe("2026-09-27");
    expect(summary.workouts).toBe("1 of 2");
    expect(summary.weight?.headline).toBe("68.2 → 65.1 kg");
    expect(summary.weight?.sub).toBe("−3.1 kg from Mon 6 Jul to Fri 2 Oct");
    expect(summary.lastWeek.lastCheckin).toBe("None");
  });
});

describe("ClientStatusScreen", () => {
  it("active client: kcal against the plan, Reminders card, Recent activity", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: false }));
    renderScreen();
    await screen.findByText("410 of 1,950");
    expect(screen.getByText("Reminders")).toBeTruthy();
    expect(screen.getByText(/Responds to reminders/)).toBeTruthy();
    expect(screen.getByText("Recent activity")).toBeTruthy();
    expect(screen.getByText("Lower body A")).toBeTruthy();
    expect(screen.queryByText("Reactivate")).toBeNull();
  });

  it("ended client: read-only summary and Reactivate, no live actions", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: true }));
    renderScreen();
    await screen.findByText("Coaching summary");
    expect(screen.getByText(/Everything here is read-only/)).toBeTruthy();
    expect(screen.getByText("Last week")).toBeTruthy();
    expect(screen.queryByText("WhatsApp")).toBeNull();
    expect(screen.queryByText("Add note")).toBeNull();
    expect(screen.queryByText("Reminders")).toBeNull();
    fireEvent.click(screen.getByText("Reactivate"));
    await waitFor(() => expect(api.requestReactivation).toHaveBeenCalledTimes(1));
    expect(api.requestReactivation.mock.calls[0]![0]).toBe(RID);
  });
});
