/**
 * Z14-32 (follow-up of Z14-25): Android Back on a live workout, through the
 * REAL `WorkoutTab` and `ActiveWorkoutScreen` inside `TraineeShell` (the
 * Z14-25 nav tests stub the tab). Back minimises the workout and never
 * discards it or exits the app; the next Backs follow the shell's tab rule
 * (Workout, then Today, then the app).
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

const calls = vi.hoisted(() => ({ progress: 0, meDays: [] as string[] }));

const shellApi = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "getEffectivePlan") return () => new Promise<never>(() => undefined);
      if (key === "getProgressSummary") {
        return async () => {
          calls.progress += 1;
          return { measurements: [], entries: [], media: [] };
        };
      }
      if (key === "getMeDay") {
        return async (date: string) => {
          calls.meDays.push(date);
          return null;
        };
      }
      if (key === "getMeWeek") return async () => null;
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      if (key === "then") return undefined;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);

/** The auth value the shell reads; a test sets a notification link on it. */
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  const { mockAuth } = await import("../test/render");
  auth.value = mockAuth({
    api: shellApi,
    me: {
      id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
      email: "aarav.ontrack@demo.fitbud.test",
      timezone: "Asia/Kolkata",
    },
    clearPendingNotificationLink: () => {
      auth.value.pendingNotificationLink = null;
    },
  });
  return { ...actual, useAuth: () => auth.value };
});

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  const engine = {
    pullAndApply: async () => undefined,
    store: {
      upsertLocal: async () => undefined,
      listLocal: async () => [],
      listOutbox: async () => [],
      getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
    },
    enqueue: async () => undefined,
    subscribe: () => () => undefined,
  };
  return { ...actual, useSyncEngine: () => engine };
});

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

vi.mock("../realtime/useRealtimeHints", () => ({ useRealtimeHints: () => undefined }));

const START = "2026-11-14T13:00:00.000Z";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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
      sets: [1, 2, 3].map((order) => ({
        id: uuid(10 + order),
        exerciseExecutionId: uuid(500),
        setTargetId: uuid(1010 + order),
        order,
        status: order <= 2 ? "completed" : "pending",
        prescribedReps: 10,
        prescribedLoadLabel: "40 kg",
        actualReps: order <= 2 ? 10 : null,
        actualLoadLabel: order <= 2 ? "40 kg" : null,
        completedAt: order <= 2 ? "2026-11-14T13:22:00.000Z" : null,
        createdAt: START,
        updatedAt: START,
      })),
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
  workoutDay: { id: uuid(7), order: 1, name: "Lower body B", exercises: [] },
  execution: null,
  createdAt: START,
  updatedAt: START,
});


const { closeActiveSession, getActiveSession, openActiveSession } = await import(
  "./workout/activeSession"
);
const { BackHandler, Platform } = await import("react-native");
const { clearDayViews } = await import("./dataCache");
const { fireEvent, render, screen, waitFor, act } = await import("../test/render");
const { TraineeShell } = await import("./TraineeShell");

const paneShown = (id: string) =>
  screen.getByTestId(`trainee-pane-${id}`).getAttribute("aria-hidden") !== "true";

beforeEach(() => {
  calls.progress = 0;
  calls.meDays = [];
  closeActiveSession();
  clearDayViews();
});

afterEach(() => {
  closeActiveSession();
  vi.restoreAllMocks();
});

describe("TraineeShell Android back on a live workout (real WorkoutTab)", () => {
  // The real tab is heavy to boot: its own timeout, not the shared default.
  it(
    "Back minimises the live workout, never discards it, never exits, and ends on Today",
    { timeout: 30_000 },
    async () => {
      const handlers: Array<() => boolean | null | undefined> = [];
      vi.spyOn(BackHandler, "addEventListener").mockImplementation(((
        _event: string,
        handler: () => boolean | null | undefined,
      ) => {
        handlers.push(handler);
        return {
          remove: () => {
            const at = handlers.indexOf(handler);
            if (at >= 0) handlers.splice(at, 1);
          },
        };
      }) as typeof BackHandler.addEventListener);
      const pressBack = () => {
        let consumed = false;
        act(() => {
          consumed = [...handlers].reverse().some((handler) => handler() === true);
        });
        return consumed;
      };
      // Only the gesture-handler stub's ref warning is allowed on "android".
      const otherErrors: unknown[][] = [];
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        if (String(args[0]).includes("Function components cannot be given refs")) return;
        otherErrors.push(args);
      });
      const platformOs = Platform.OS;
      try {
        (Platform as { OS: string }).OS = "android";
        openActiveSession({ relationshipId: shellRelationship.id, execution, assignment });
        render(<TraineeShell relationship={shellRelationship} />);
        await waitFor(() => expect(screen.getByTestId("tab-progress")).toBeTruthy());
        fireEvent.click(screen.getByTestId("tab-workout"));
        // The live log is on screen and owns Back: the shell's dispatcher
        // plus the real workout screen's own handler.
        await waitFor(() => expect(handlers.length).toBe(2), { timeout: 10_000 });
        expect(getActiveSession(shellRelationship.id)?.minimised).toBe(false);

        // Back on the live workout: consumed (the app does not exit), the
        // workout is kept and minimised, not discarded.
        expect(pressBack()).toBe(true);
        expect(getActiveSession(shellRelationship.id)).toBeTruthy();
        expect(getActiveSession(shellRelationship.id)?.minimised).toBe(true);
        expect(paneShown("workout")).toBe(true);

        // Then the shell's tab rule: Workout to Today, and only then the app.
        expect(pressBack()).toBe(true);
        await waitFor(() => expect(paneShown("today")).toBe(true));
        expect(getActiveSession(shellRelationship.id)).toBeTruthy();
        expect(pressBack()).toBe(false);
        expect(otherErrors).toEqual([]);
      } finally {
        (Platform as { OS: string }).OS = platformOs;
      }
    },
  );
});
