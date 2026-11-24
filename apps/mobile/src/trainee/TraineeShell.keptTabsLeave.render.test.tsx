/**
 * Z14-2 fix round 1: kept tabs leave nothing live behind, and refresh when
 * shown again after 30 s.
 *
 * - A tab left by a notification, a deep link or a cover is unmounted, so an
 *   RN `Modal` sheet open on it (it ignores the parent's `display: none`) or
 *   a live workout's Android Back handler cannot outlive it off screen.
 * - A kept tab shown again after more than 30 s refetches underneath what it
 *   shows; a quicker switch back changes nothing (the trainer app's rule).
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
import type { NotificationDeepLink } from "../notifications/routing";

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

/** A tap on a "go to Today" notification, as the push router hands it over. */
const todayLink = {
  tab: "today",
  domainEntityType: "coaching_relationship",
  domainEntityId: shellRelationship.id,
  route: { type: "tab", tab: "today" },
  path: "/go/today",
  refetchRequired: true,
} as unknown as NotificationDeepLink;

const { closeActiveSession, getActiveSession, openActiveSession } = await import(
  "./workout/activeSession"
);
const { BackHandler, Platform } = await import("react-native");
const { clearDayViews } = await import("./dataCache");
const { act, fireEvent, render, screen, waitFor } = await import("../test/render");
const { TraineeShell } = await import("./TraineeShell");

async function openShell() {
  const view = render(<TraineeShell relationship={shellRelationship} />);
  await waitFor(() => expect(screen.getByTestId("tab-progress")).toBeTruthy());
  return view;
}

/** Hands the shell a notification tap, as AuthProvider does. */
async function tapNotification(view: ReturnType<typeof render>, link: NotificationDeepLink) {
  auth.value.pendingNotificationLink = link;
  await act(async () => {
    view.rerender(<TraineeShell relationship={shellRelationship} />);
  });
}

beforeEach(() => {
  calls.progress = 0;
  calls.meDays = [];
  closeActiveSession();
  // Each test starts with nothing cached, as a fresh session does.
  clearDayViews();
});

afterEach(() => {
  closeActiveSession();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TraineeShell kept tabs leave nothing live behind (Z14-2)", () => {
  it("a live workout left by a notification keeps no Android Back handler: Back goes to the shell", async () => {
    // A fake Android Back: handlers are asked newest first, as on a device.
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
    const pressBack = () => [...handlers].reverse().some((handler) => handler() === true);
    // On "android" the harness's gesture-handler stub (a function component)
    // is handed the set rows' swipe ref; that warning is the stub's, not the
    // shell's. Anything else still fails the test.
    const otherErrors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (String(args[0]).includes("Function components cannot be given refs")) return;
      otherErrors.push(args);
    });
    const platformOs = Platform.OS;
    try {
      (Platform as { OS: string }).OS = "android";
      openActiveSession({ relationshipId: shellRelationship.id, execution, assignment });
      const view = await openShell();
      fireEvent.click(screen.getByTestId("tab-workout"));
      // The live log is on screen and owns Back (it minimises, W-14).
      await waitFor(() => expect(handlers.length).toBe(1));

      await tapNotification(view, todayLink);
      await waitFor(() =>
        expect(screen.getByTestId("trainee-pane-today").getAttribute("aria-hidden")).not.toBe(
          "true",
        ),
      );

      // Nothing swallows Back off screen (it goes to the shell)...
      expect(pressBack()).toBe(false);
      // ...the workout was not silently minimised...
      expect(getActiveSession(shellRelationship.id)?.minimised).toBe(false);
      // ...because the Workout pane is gone, not hidden.
      expect(screen.queryByTestId("trainee-pane-workout")).toBeNull();
      expect(otherErrors).toEqual([]);
    } finally {
      (Platform as { OS: string }).OS = platformOs;
    }
  });

  it("a sheet open on a tab is gone after a notification switches tab", async () => {
    const view = await openShell();
    fireEvent.click(screen.getByTestId("tab-progress"));
    await waitFor(() => expect(calls.progress).toBe(1));
    fireEvent.click(await screen.findByRole("button", { name: "Log weight" }));
    expect(screen.getByRole("button", { name: "Dismiss sheet" })).toBeTruthy();

    await tapNotification(view, todayLink);
    await waitFor(() =>
      expect(screen.getByTestId("trainee-pane-today").getAttribute("aria-hidden")).not.toBe(
        "true",
      ),
    );
    // The sheet left with its tab; it does not float over Today.
    expect(screen.queryByRole("button", { name: "Dismiss sheet" })).toBeNull();
    expect(screen.queryByTestId("trainee-pane-progress")).toBeNull();
  });
});

describe("TraineeShell kept tabs refresh when shown again (Z14-2)", () => {
  it("a kept tab shown again after 30 s refetches underneath; sooner it does not", async () => {
    const t0 = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(t0);
    await openShell();
    // Today's first read is the day on screen; the prefetch follows.
    await waitFor(() => expect(calls.meDays.length).toBeGreaterThan(0));
    const today = calls.meDays[0]!;
    const todayReads = () => calls.meDays.filter((date) => date === today).length;
    await waitFor(() => expect(todayReads()).toBe(1));

    fireEvent.click(screen.getByTestId("tab-progress"));
    await waitFor(() => expect(calls.progress).toBe(1));
    const progressPane = screen.getByTestId("trainee-pane-progress");

    // Back to Today within 30 s: shown at once, nothing refetched.
    vi.setSystemTime(t0 + 10_000);
    fireEvent.click(screen.getByTestId("tab-today"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(todayReads()).toBe(1);

    // Progress again after 31 s since it loaded: it refetches, painting the
    // summary it had meanwhile (no loading state in between).
    vi.setSystemTime(t0 + 31_000);
    fireEvent.click(screen.getByTestId("tab-progress"));
    expect(screen.getByTestId("trainee-pane-progress").getAttribute("aria-hidden")).not.toBe(
      "true",
    );
    await waitFor(() => expect(calls.progress).toBe(2));
    expect(screen.getByTestId("trainee-pane-progress")).not.toBe(progressPane);

    // Today again, its day now older than 30 s: refetched underneath the
    // kept tab (same element, still on screen).
    const todayPane = screen.getByTestId("trainee-pane-today");
    vi.setSystemTime(t0 + 45_000);
    fireEvent.click(screen.getByTestId("tab-today"));
    await waitFor(() => expect(todayReads()).toBe(2));
    expect(screen.getByTestId("trainee-pane-today")).toBe(todayPane);
  });
});

describe("advancePaneBook (Z14-2)", () => {
  it("keeps a tab left by the tab bar, drops one left under a cover or immersive", async () => {
    const { advancePaneBook, initialPaneBook } = await import("./TraineeShell");
    let book = initialPaneBook("today", 0);
    // Tab bar: Today stays mounted behind Progress.
    book = advancePaneBook({ ...book, picked: "progress" }, "progress", false, 1);
    expect([...book.kept].sort()).toEqual(["progress", "today"]);
    // A check-in covers Progress: Progress unmounts, Today stays kept.
    book = advancePaneBook(book, null, false, 2);
    expect([...book.kept]).toEqual(["today"]);
    // Closed: Progress mounts again.
    book = advancePaneBook(book, "progress", false, 3);
    expect(book.kept.has("progress")).toBe(true);
    // A Workout pane kept hidden never stays mounted once it is immersive.
    book = advancePaneBook({ ...book, picked: "workout" }, "workout", false, 4);
    book = advancePaneBook({ ...book, picked: "diet" }, "diet", false, 5);
    expect(book.kept.has("workout")).toBe(true);
    book = advancePaneBook(book, "diet", true, 6);
    expect(book.kept.has("workout")).toBe(false);
    // Nothing changed: the same object back.
    expect(advancePaneBook(book, "diet", false, 7)).toBe(book);
  });
});
