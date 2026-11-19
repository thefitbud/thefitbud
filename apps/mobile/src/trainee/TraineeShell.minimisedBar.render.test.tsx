/**
 * Z12-45 / W-14: the minimised workout bar mounts above the tab bar on
 * Today, Diet, Progress and More, and stays off the Workout tab (that tab
 * keeps only the hero's Continue workout / Finish now).
 *
 * Harness (CU6): text, roles and labels — not layout. Device shots of W-14
 * over Diet in both themes on both platforms come later.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  workoutAssignmentSchema,
  workoutExecutionSchema,
  type CoachingRelationship,
  type WorkoutAssignment,
  type WorkoutExecution,
} from "@fitbud/contracts";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const shellRelationship: CoachingRelationship = coachingRelationshipSchema.parse({
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

const neverSettles = new Promise<never>(() => undefined);

const shellApi = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "getEffectivePlan") return () => neverSettles;
      if (key === "getProgressSummary")
        return async () => ({ measurements: [], entries: [], media: [] });
      if (key === "getMeWeek" || key === "getMeDay") return async () => null;
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      if (key === "then") return undefined;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  const { mockAuth } = await import("../test/render");
  const auth = mockAuth({
    api: shellApi,
    me: {
      id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
      email: "aarav.ontrack@demo.fitbud.test",
      timezone: "Asia/Kolkata",
      permittedRoles: ["trainee"],
    },
  });
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

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../providers/ConfigProvider",
  );
  return {
    ...actual,
    useConfig: () => ({
      config: null,
      loading: false,
      refresh: async () => undefined,
    }),
  };
});

vi.mock("../realtime/useRealtimeHints", () => ({
  useRealtimeHints: () => undefined,
}));

const START = "2026-11-14T13:00:00.000Z";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function set(id: number, order: number, logged: boolean) {
  return {
    id: uuid(id),
    exerciseExecutionId: uuid(500),
    setTargetId: uuid(id + 1000),
    order,
    status: logged ? ("completed" as const) : ("pending" as const),
    prescribedReps: 10,
    prescribedLoadLabel: "40 kg",
    actualReps: logged ? 10 : null,
    actualLoadLabel: logged ? "40 kg" : null,
    completedAt: logged ? "2026-11-14T13:22:00.000Z" : null,
    createdAt: START,
    updatedAt: START,
  };
}

const execution: WorkoutExecution = workoutExecutionSchema.parse({
  id: uuid(1),
  assignmentId: uuid(2),
  coachingRelationshipId: shellRelationship.id,
  planVersionId: uuid(4),
  traineeUserId: shellRelationship.traineeUserId,
  status: "started",
  recordVersion: 3,
  startedAt: START,
  pausedAt: null,
  completedAt: null,
  sessionRpe: null,
  requireSessionRpe: false,
  exercises: [
    {
      id: uuid(500),
      workoutExecutionId: uuid(1),
      exerciseId: uuid(600),
      name: "Romanian deadlift",
      order: 1,
      status: "pending",
      sets: [1, 2, 3].map((order) => set(10 + order, order, order <= 2)),
      createdAt: START,
      updatedAt: START,
    },
  ],
  createdAt: START,
  updatedAt: START,
});

const assignment: WorkoutAssignment = workoutAssignmentSchema.parse({
  id: uuid(2),
  coachingRelationshipId: shellRelationship.id,
  planId: uuid(6),
  planVersionId: uuid(4),
  workoutDayId: uuid(7),
  workoutDayName: "Lower body B",
  localDate: "2026-11-14",
  windowStartsAt: "2026-11-14T01:30:00.000Z",
  windowEndsAt: "2026-11-15T01:30:00.000Z",
  status: "in_progress",
  workoutDay: {
    id: uuid(7),
    order: 1,
    name: "Lower body B",
    exercises: [],
  },
  execution: null,
  createdAt: START,
  updatedAt: START,
});

const {
  closeActiveSession,
  openActiveSession,
  updateActiveSession,
} = await import("./workout/activeSession");
const { act, fireEvent, render, screen, waitFor } = await import("../test/render");
const { TraineeShell } = await import("./TraineeShell");

/** The Resume control's aria-label always ends with "Resume". */
function resumeBar() {
  return screen.queryByRole("button", { name: /Resume$/ });
}

async function openShellOnTab(
  tabLabel: "Today" | "Workout" | "Diet" | "Progress" | "More",
) {
  render(<TraineeShell relationship={shellRelationship} />);
  await waitFor(() => {
    expect(screen.getByRole("tab", { name: "Today" })).toBeTruthy();
  });
  if (tabLabel !== "Today") {
    // rnw does not always expose aria-selected on these tabs; the click is
    // enough for the shell's `tab` state, and the assertions below check the
    // bar for that tab.
    fireEvent.click(screen.getByRole("tab", { name: tabLabel }));
  }
}

function minimiseOpenSession() {
  act(() => {
    openActiveSession({
      relationshipId: shellRelationship.id,
      execution,
      assignment,
    });
    updateActiveSession(shellRelationship.id, { minimised: true });
  });
}

beforeEach(() => {
  closeActiveSession();
});

afterEach(() => {
  closeActiveSession();
});

describe("TraineeShell minimised workout bar (W-14)", () => {
  it.each([
    ["Today"],
    ["Diet"],
    ["Progress"],
    ["More"],
  ] as const)(
    "shows the bar above the tab bar on %s when a session is minimised",
    async (tab) => {
      await openShellOnTab(tab);
      expect(resumeBar()).toBeNull();
      minimiseOpenSession();
      const bar = resumeBar();
      expect(bar).toBeTruthy();
      expect(bar!.getAttribute("aria-label")).toMatch(
        /^Lower body B, in progress, [0-9:]+\. Romanian deadlift · set 3 of 3\. Resume$/,
      );
    },
  );

  it("hides the bar on the Workout tab (hero Continue / Finish now only)", async () => {
    await openShellOnTab("Workout");
    minimiseOpenSession();
    expect(resumeBar()).toBeNull();
  });

  it("Resume from another tab opens the Workout tab and clears minimised", async () => {
    await openShellOnTab("Diet");
    minimiseOpenSession();
    const bar = resumeBar();
    expect(bar).toBeTruthy();
    fireEvent.click(bar!);
    // The shell switched to Workout and cleared minimised, so the bar is gone.
    await waitFor(() => {
      expect(resumeBar()).toBeNull();
    });
  });
});
