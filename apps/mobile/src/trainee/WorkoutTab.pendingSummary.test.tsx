/**
 * Z10-20 (D-W10-9): Today's "View summary" opens the Workout tab with
 * `pendingSummaryExecutionId`; the tab opens that execution's summary (or the
 * coach-logged view), then clears it through `onPendingSummaryConsumed`.
 * Same harness as `WorkoutTab.week.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  workoutAssignmentSchema,
  type CoachingRelationship,
  type WorkoutAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";

/*
 * `WorkoutTab` reaches `modules/live-activity` through the active-workout
 * screen, and that module calls into `expo-modules-core`, which has no JS
 * implementation off-device. `src/test/render.tsx` is CU6's file and outside
 * CU24's `files_owned`, so this is mocked here, the same way
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
/*
 * The clock is pinned to Fri 13 Nov 2026 so the fixture's past days of the
 * current week (Mon 9 to Thu 12 Nov) exist whatever weekday the suite runs on.
 */
const TODAY = "2026-11-13";
vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-13T06:00:00Z") });

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


const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function dayAssignment(opts: {
  n: number;
  name: string;
  localDate: string;
  status: "assigned" | "missed";
  exercises: number;
  setsEach: number;
}): WorkoutAssignment {
  return workoutAssignmentSchema.parse({
    id: uuid(1000 + opts.n),
    coachingRelationshipId: relationship.id,
    planId: uuid(1),
    planVersionId: uuid(2),
    workoutDayId: uuid(3000 + opts.n),
    workoutDayName: opts.name,
    localDate: opts.localDate,
    windowStartsAt: `${opts.localDate}T00:30:00.000Z`,
    windowEndsAt: `${opts.localDate}T18:30:00.000Z`,
    status: opts.status,
    scheduleStatus: "scheduled",
    workoutDay: {
      id: uuid(3000 + opts.n),
      order: opts.n,
      name: opts.name,
      exercises: Array.from({ length: opts.exercises }, (_, e) => ({
        id: uuid(5000 + opts.n * 100 + e),
        order: e + 1,
        name: `Exercise ${e + 1}`,
        instructions: null,
        setTargets: Array.from({ length: opts.setsEach }, (_, s) => ({
          id: uuid(7000 + opts.n * 1000 + e * 10 + s),
          order: s + 1,
          reps: 10,
          loadLabel: null,
          rpe: null,
        })),
      })),
    },
    execution: null,
    createdAt: "2026-10-28T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  });
}

let items: WorkoutAssignment[] = [];
let executionDetail: unknown = null;

const api = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "listWorkoutAssignments") {
        return async () => ({ items, nextCursor: null });
      }
      if (key === "getWorkoutExecution") return async () => executionDetail;
      if (key === "then") return undefined;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);
const auth = mockAuth({
  api,
  me: {
    id: relationship.traineeUserId,
    email: "aarav.ontrack@demo.fitbud.test",
    timezone: TIME_ZONE,
  },
});

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../sync/SyncProvider",
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

const { WorkoutTab } = await import("./WorkoutTab");
const { invalidateRelationshipDayData } = await import("./dataCache");


beforeEach(() => {
  invalidateRelationshipDayData(relationship.id);
  items = [];
});


function doneToday(loggedByRole: "trainee" | "coach") {
  const base = dayAssignment({
    n: 1,
    name: "Lower body B",
    localDate: TODAY,
    status: "assigned",
    exercises: 2,
    setsEach: 2,
  });
  const execution = {
    id: uuid(8001),
    assignmentId: base.id,
    coachingRelationshipId: relationship.id,
    planVersionId: base.planVersionId,
    traineeUserId: relationship.traineeUserId,
    status: "completed",
    recordVersion: 2,
    startedAt: `${TODAY}T13:00:00.000Z`,
    pausedAt: null,
    completedAt: `${TODAY}T13:52:00.000Z`,
    sessionRpe: null,
    requireSessionRpe: false,
    loggedByRole,
    createdAt: `${TODAY}T13:00:00.000Z`,
    updatedAt: `${TODAY}T13:52:00.000Z`,
  };
  const assignment = workoutAssignmentSchema.parse({
    ...base,
    status: "completed",
    execution,
  });
  executionDetail = {
    ...execution,
    exercises: base.workoutDay.exercises.map((ex, i) => ({
      id: uuid(9000 + i),
      workoutExecutionId: execution.id,
      exerciseId: ex.id,
      name: ex.name,
      order: i + 1,
      status: "completed",
      sets: [
        {
          id: uuid(9500 + i),
          exerciseExecutionId: uuid(9000 + i),
          setTargetId: ex.setTargets[0]!.id,
          order: 1,
          status: "completed",
          prescribedReps: 10,
          prescribedLoadLabel: null,
          actualReps: 10,
          actualLoadLabel: null,
          completedAt: `${TODAY}T13:30:00.000Z`,
          createdAt: `${TODAY}T13:00:00.000Z`,
          updatedAt: `${TODAY}T13:52:00.000Z`,
        },
      ],
      createdAt: `${TODAY}T13:00:00.000Z`,
      updatedAt: `${TODAY}T13:52:00.000Z`,
    })),
  };
  return assignment;
}

beforeEach(() => {
  invalidateRelationshipDayData(relationship.id);
  items = [];
  executionDetail = null;
});

describe("WorkoutTab pendingSummaryExecutionId (Z10-20, D-W10-9)", () => {
  it("opens that execution's summary once loaded, then clears the prop", async () => {
    items = [doneToday("trainee")];
    const consumed = vi.fn();
    render(
      <WorkoutTab
        relationship={relationship}
        selectedDate={TODAY}
        pendingSummaryExecutionId={uuid(8001)}
        onPendingSummaryConsumed={consumed}
      />,
    );
    expect(await screen.findByText("How hard it felt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    await waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
  });

  it("opens the coach-logged screen for a coach-logged entry", async () => {
    items = [doneToday("coach")];
    const consumed = vi.fn();
    render(
      <WorkoutTab
        relationship={relationship}
        selectedDate={TODAY}
        pendingSummaryExecutionId={uuid(8001)}
        onPendingSummaryConsumed={consumed}
      />,
    );
    // Only CoachLoggedWorkoutScreen has a Back bar and per-exercise rows
    // labelled "<name>, N set(s)"; the week list and the trainee's own
    // summary have neither.
    expect(await screen.findByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByLabelText("Exercise 1, 1 set")).toBeTruthy();
    expect(screen.queryByText("How hard it felt")).toBeNull();
    await waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
  });

  it("does nothing but clear the prop when no assignment holds that execution", async () => {
    items = [];
    const consumed = vi.fn();
    render(
      <WorkoutTab
        relationship={relationship}
        selectedDate={TODAY}
        pendingSummaryExecutionId={uuid(8001)}
        onPendingSummaryConsumed={consumed}
      />,
    );
    await waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("How hard it felt")).toBeNull();
  });
});
