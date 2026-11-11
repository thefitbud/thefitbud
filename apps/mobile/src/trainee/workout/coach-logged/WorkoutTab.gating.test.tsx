/**
 * Z9-11 gating: a coach-logged workout (loggedByRole "coach") hides the hero
 * Start, shows "View workout", and opens the read-only CoachLoggedWorkoutScreen
 * without starting an execution. Harness copied from WorkoutTab.render.test.tsx
 * (happy-dom + react-native-web: proves text and roles, not layout or native).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  workoutAssignmentSchema,
  type CoachingRelationship,
  type WorkoutAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../../../test/render";
import { localDateInTimezone } from "../../../lib/dates";

/*
 * `WorkoutTab` reaches `modules/live-activity` through the active-workout
 * screen, and that module calls into `expo-modules-core`, which has no JS
 * implementation off-device. `src/test/render.tsx` is CU6's file and outside
 * Z9-11's `files_owned`, so this is mocked here, the same way
 * `TraineeShell.planLoad.render.test.tsx` already does it. Nothing in this
 * file exercises a Live Activity.
 */
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const TIME_ZONE = "Asia/Kolkata";
const TODAY = localDateInTimezone(TIME_ZONE);

const relationship: CoachingRelationship = coachingRelationshipSchema.parse({
  id: "1b65e3ad-84cf-4fe1-a546-0d62656c2c79",
  trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
  traineeUserId: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-09-01T06:30:00.000Z",
  endedAt: null,
  createdAt: "2026-09-01T06:30:00.000Z",
  updatedAt: "2026-11-01T06:30:00.000Z",
  trainerDisplayName: "Rahul Verma",
});

/**
 * One scheduled assignment in the week the tab opens on, parsed by the same
 * contract the API answers with so the fixture cannot drift into a shape the
 * server never returns. `scheduleStatus` must be "scheduled" or
 * `scheduledAssignments` filters it out — the same filter production applies,
 * with no shortcut around it here.
 */
const FOCUS_DATE = TODAY;

const assignment: WorkoutAssignment = workoutAssignmentSchema.parse({
  id: "9a1b2c3d-4e5f-4061-8273-849506172839",
  coachingRelationshipId: relationship.id,
  planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
  planVersionId: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
  workoutDayId: "7a8b9c0d-1e2f-4304-9516-273849506172",
  workoutDayName: "Lower body B",
  localDate: FOCUS_DATE,
  windowStartsAt: `${FOCUS_DATE}T00:30:00.000Z`,
  windowEndsAt: `${FOCUS_DATE}T18:30:00.000Z`,
  status: "assigned",
  scheduleStatus: "scheduled",
  workoutDay: {
    id: "7a8b9c0d-1e2f-4304-9516-273849506172",
    order: 2,
    name: "Lower body B",
    exercises: [],
  },
  execution: null,
  createdAt: "2026-10-28T06:30:00.000Z",
  updatedAt: "2026-10-28T06:30:00.000Z",
});


const t = "2026-11-02T01:42:00.000Z";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const executionSummary = {
  id: id(1),
  assignmentId: assignment.id,
  coachingRelationshipId: relationship.id,
  planVersionId: assignment.planVersionId,
  traineeUserId: relationship.traineeUserId,
  status: "completed",
  recordVersion: 1,
  startedAt: t,
  pausedAt: null,
  completedAt: "2026-11-02T02:34:00.000Z",
  sessionRpe: null,
  requireSessionRpe: false,
  loggedByRole: "coach",
  lastEditedByRole: null,
  createdAt: t,
  updatedAt: t,
};
const fullExecution = {
  ...executionSummary,
  exercises: [
    {
      id: id(10),
      workoutExecutionId: id(1),
      exerciseId: id(11),
      name: "Bench press",
      order: 1,
      status: "completed",
      sets: [
        {
          id: id(21),
          exerciseExecutionId: id(10),
          setTargetId: id(31),
          order: 1,
          status: "completed",
          prescribedReps: 8,
          prescribedLoadLabel: "40 kg",
          actualReps: 8,
          actualLoadLabel: "40 kg",
          completedAt: t,
          createdAt: t,
          updatedAt: t,
        },
      ],
      createdAt: t,
      updatedAt: t,
    },
  ],
};

let startCalls = 0;
const loggedAssignment: WorkoutAssignment = workoutAssignmentSchema.parse({
  ...assignment,
  localDate: FOCUS_DATE,
  status: "completed",
  execution: executionSummary,
});

const api = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "listWorkoutAssignments") {
        return async () => ({ items: [loggedAssignment], nextCursor: null });
      }
      if (key === "getWorkoutExecution") return async () => fullExecution;
      if (key === "startWorkoutExecution" || key === "createWorkoutExecution") {
        return async () => {
          startCalls += 1;
          return fullExecution;
        };
      }
      if (key === "then") return undefined;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);

const auth = mockAuth({
  api,
  me: { id: relationship.traineeUserId, email: "aarav.ontrack@demo.fitbud.test", timezone: TIME_ZONE },
});
vi.mock("../../../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../../../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});

vi.mock("../../../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../../../sync/SyncProvider",
  );
  return {
    ...actual,
    useSyncEngine: () => ({
      pullAndApply: async () => undefined,
      store: {
        upsertLocal: async () => undefined,
        listLocal: async () => [],
        listOutbox: async () => [],
        getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
      },
      enqueue: async () => undefined,
    }),
  };
});

const { WorkoutTab } = await import("../../WorkoutTab");
const { invalidateRelationshipDayData } = await import("../../dataCache");


beforeEach(() => {
  invalidateRelationshipDayData(relationship.id);
  startCalls = 0;
});

describe("WorkoutTab coach-logged gating (Z9-11)", () => {
  it("hides Start, shows View workout, and opens the read-only screen", async () => {
    render(<WorkoutTab relationship={relationship} selectedDate={TODAY} />);

    await waitFor(() => {
      expect(screen.getByLabelText("View workout")).toBeTruthy();
    });
    expect(screen.getByText("Logged by your coach")).toBeTruthy();
    expect(screen.queryByLabelText("Start workout")).toBeNull();
    expect(screen.queryByLabelText("Continue workout")).toBeNull();

    screen.getByLabelText("View workout").click();

    await waitFor(() => {
      expect(
        screen.getByText("Read-only · only your coach can change it"),
      ).toBeTruthy();
    });
    expect(screen.queryByLabelText("Note for coach")).toBeNull();
    expect(startCalls).toBe(0);
  });
});
