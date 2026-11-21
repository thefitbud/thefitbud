import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuth, render, screen } from "../../test/render";
import { SessionDetailScreen } from "./SessionDetailScreen";

const EXEC_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSIGN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const execution = {
  id: EXEC_ID,
  assignmentId: ASSIGN,
  coachingRelationshipId: REL,
  planVersionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  traineeUserId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  status: "completed" as const,
  recordVersion: 1,
  startedAt: "2026-11-07T12:30:00.000Z",
  pausedAt: null,
  completedAt: "2026-11-07T13:01:00.000Z",
  sessionRpe: null,
  requireSessionRpe: false,
  exercises: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      workoutExecutionId: EXEC_ID,
      exerciseId: "22222222-2222-4222-8222-222222222222",
      name: "Walking lunge",
      order: 1,
      status: "skipped" as const,
      sets: [
        {
          id: "33333333-3333-4333-8333-333333333331",
          exerciseExecutionId: "11111111-1111-4111-8111-111111111111",
          setTargetId: "44444444-4444-4444-8444-444444444441",
          order: 1,
          status: "skipped" as const,
          prescribedReps: 12,
          prescribedLoadLabel: null,
          actualReps: null,
          actualLoadLabel: null,
          completedAt: null,
          createdAt: "2026-11-07T12:30:00.000Z",
          updatedAt: "2026-11-07T12:30:00.000Z",
        },
      ],
      createdAt: "2026-11-07T12:30:00.000Z",
      updatedAt: "2026-11-07T12:30:00.000Z",
    },
  ],
  createdAt: "2026-11-07T12:30:00.000Z",
  updatedAt: "2026-11-07T13:01:00.000Z",
};

const assignment = {
  id: ASSIGN,
  coachingRelationshipId: REL,
  planId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  planVersionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  workoutDayId: "99999999-9999-4999-8999-999999999999",
  workoutDayName: "Lower body A",
  localDate: "2026-11-07",
  windowStartsAt: "2026-11-07T12:00:00.000Z",
  windowEndsAt: "2026-11-07T15:00:00.000Z",
  status: "completed" as const,
  scheduleStatus: "scheduled" as const,
  workoutDay: {
    id: "99999999-9999-4999-8999-999999999999",
    name: "Lower body A",
    order: 1,
    exercises: [],
  },
  execution: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-07T13:01:00.000Z",
};

const api = {
  getWorkoutExecution: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getClientWorkspace: vi.fn(),
  listCoachAsks: vi.fn(),
  createTrainerNote: vi.fn(),
};

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => mockAuth({ api }),
}));
vi.mock("../../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("../whatsapp", () => ({
  openContextualWhatsApp: vi.fn(async () => true),
}));

describe("SessionDetailScreen TM-11", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getWorkoutExecution.mockResolvedValue(execution);
    api.getWorkoutAssignment.mockResolvedValue(assignment);
    api.getClientWorkspace.mockResolvedValue({
      header: {
        traineeDisplayName: "Rohan Mehta",
        clientWhatsappE164: null,
        traineeTimezone: "Asia/Kolkata",
      },
    });
    api.listCoachAsks.mockResolvedValue({ items: [] });
  });

  it("shows Finished early and exercise skip chrome", async () => {
    render(
      <SessionDetailScreen
        executionId={EXEC_ID}
        displayName="Rohan Mehta"
        onBack={vi.fn()}
      />,
    );
    expect(await screen.findByText("Workout")).toBeTruthy();
    expect(screen.getByText("Rohan Mehta")).toBeTruthy();
    expect(screen.getByText("Finished early")).toBeTruthy();
    expect(screen.getByText("Walking lunge")).toBeTruthy();
    expect(screen.getByText(/Skipped all/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add note" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Reply on WhatsApp" }),
    ).toBeTruthy();
  });
});
