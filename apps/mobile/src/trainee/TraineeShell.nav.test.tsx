/**
 * Z14-25 (D-W14-24): Android back in the trainee shell, one test per row of
 * the back-target table in docs/specs/Z14-25.md. The harness drives the
 * shell's one dispatcher (the BackHandler listener the app registers). A
 * sheet's own Modal `onRequestClose` is native-only, so the sheet rows prove
 * what the shell does (pop only the sheet), and the live-workout row proves
 * the workout's own handler is not mounted under an overlay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkinSchema,
  coachingRelationshipSchema,
  workoutAssignmentSchema,
  workoutExecutionSchema,
  type Checkin,
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

/** What a test hands the shell: deep links and the API answers it needs. */
const h = vi.hoisted(() => ({
  auth: null as null | Record<string, unknown>,
  overrides: {} as Record<string, (...args: unknown[]) => unknown>,
  invalidate: vi.fn(),
}));

const shellApi = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (h.overrides[key]) return h.overrides[key];
      if (key === "getEffectivePlan") return () => new Promise<never>(() => undefined);
      if (key === "getProgressSummary") {
        return async () => ({ measurements: [], entries: [], media: [] });
      }
      if (key === "getMeDay" || key === "getMeWeek") return async () => null;
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      if (key === "then") return undefined;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  const { mockAuth } = await import("../test/render");
  const auth = mockAuth({
    api: shellApi,
    me: {
      id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
      email: "aarav.ontrack@demo.fitbud.test",
      timezone: "Asia/Kolkata",
      permittedRoles: ["trainee"],
    },
  }) as unknown as Record<string, unknown>;
  // The same object every render: a test sets a pending link on it, and the
  // shell's clear call empties it, as the real provider does.
  auth.clearPendingDeepLink = () => {
    auth.pendingDeepLink = null;
  };
  auth.clearPendingNotificationLink = () => {
    auth.pendingNotificationLink = null;
  };
  h.auth = auth;
  return { ...actual, useAuth: () => auth };
});

vi.mock("./dataCache", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./dataCache");
  return {
    ...actual,
    invalidateRelationshipDayData: (...args: unknown[]) => {
      h.invalidate(...args);
      return (actual.invalidateRelationshipDayData as (...a: unknown[]) => unknown)(...args);
    },
  };
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

// The reminders screen's own content is covered by its tests; here it only has to be open.
vi.mock("./settings/ReminderSettingsScreen", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./settings/ReminderSettingsScreen");
  return { ...actual, ReminderSettingsScreen: () => <div data-testid="reminders-stub">reminders</div> };
});

// The real Workout tab is heavy to boot in this harness. This stand-in keeps
// what the shell's row depends on: with a live workout open it reports itself
// immersive (and not immersive as it unmounts, as WorkoutTab does), and while
// mounted it owns an Android Back handler that minimises the workout and never
// discards it (W-14), as ActiveWorkoutScreen does. With no live workout it is
// an ordinary week list: no handler, not immersive.
vi.mock("./WorkoutTab", async () => {
  const { BackHandler: BH } = await import("react-native");
  const React = await import("react");
  const store = await import("./workout/activeSession");
  return {
    WorkoutTab: ({
      relationship,
      onImmersiveChange,
    }: {
      relationship: { id: string };
      onImmersiveChange?: (immersive: boolean) => void;
    }) => {
      React.useEffect(() => {
        const live = store.getActiveSession(relationship.id);
        if (!live || live.minimised) return undefined;
        onImmersiveChange?.(true);
        const sub = BH.addEventListener("hardwareBackPress", () => {
          store.updateActiveSession(relationship.id, { minimised: true });
          return true;
        });
        return () => {
          sub.remove();
          onImmersiveChange?.(false);
        };
      }, [relationship.id, onImmersiveChange]);
      return React.createElement("div", { "data-testid": "workout-tab" }, "workout tab");
    },
  };
});

// The meal sheet's own content is covered elsewhere; here it only has to be open.
vi.mock("./SomethingDifferentSheet", () => ({
  SomethingDifferentSheet: () => <div data-testid="meal-sheet">meal sheet</div>,
}));

vi.mock("../realtime/useRealtimeHints", () => ({ useRealtimeHints: () => undefined }));

const { BackHandler, Platform } = await import("react-native");
const { clearDayViews } = await import("./dataCache");
const { closeActiveSession, getActiveSession, openActiveSession } = await import(
  "./workout/activeSession"
);
const { act, fireEvent, render, screen, waitFor } = await import("../test/render");
const { TraineeShell } = await import("./TraineeShell");

/** A fake Android Back: the listeners the app registered, newest asked first. */
const listeners: Array<() => boolean | null | undefined> = [];
const realOS = Platform.OS;

function pressBack(): boolean {
  let consumed = false;
  act(() => {
    consumed = [...listeners].reverse().some((listener) => listener() === true);
  });
  return consumed;
}

const paneShown = (id: string) =>
  screen.getByTestId(`trainee-pane-${id}`).getAttribute("aria-hidden") !== "true";

async function openShell() {
  const view = render(<TraineeShell relationship={shellRelationship} />);
  await waitFor(() => expect(screen.getByTestId("tab-progress")).toBeTruthy());
  return view;
}

beforeEach(() => {
  listeners.length = 0;
  h.overrides = {};
  h.invalidate.mockClear();
  if (h.auth) {
    h.auth.pendingDeepLink = null;
    h.auth.pendingNotificationLink = null;
  }
  closeActiveSession();
  clearDayViews();
  vi.spyOn(BackHandler, "addEventListener").mockImplementation(((
    _event: string,
    listener: () => boolean | null | undefined,
  ) => {
    listeners.push(listener);
    return {
      remove: () => {
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      },
    };
  }) as typeof BackHandler.addEventListener);
  (Platform as { OS: string }).OS = "android";
  // The harness's gesture-handler stub warns about refs on "android"; only
  // that warning is allowed.
  const real = console.error;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("Function components cannot be given refs")) return;
    real(...args);
  });
});

afterEach(() => {
  closeActiveSession();
  (Platform as { OS: string }).OS = realOS;
  vi.restoreAllMocks();
});

describe("TraineeShell Android back (Z14-25)", () => {
  it("Today with nothing open: back is not consumed, so Android leaves the app", async () => {
    await openShell();
    expect(paneShown("today")).toBe(true);
    expect(pressBack()).toBe(false);
  });

  it("Diet tab: back shows Today; then back leaves", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-diet"));
    await waitFor(() => expect(paneShown("diet")).toBe(true));
    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
    expect(pressBack()).toBe(false);
  });

  it("a tab left by the tab bar stays mounted hidden and never answers back", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-diet"));
    await waitFor(() => expect(paneShown("diet")).toBe(true));
    fireEvent.click(screen.getByTestId("tab-progress"));
    await waitFor(() => expect(paneShown("progress")).toBe(true));
    // Diet is kept (hidden); only the shell's one dispatcher is registered.
    expect(screen.getByTestId("trainee-pane-diet").getAttribute("aria-hidden")).toBe("true");
    expect(listeners).toHaveLength(1);
    // Back goes to Today, not into the hidden Diet pane.
    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
  });

  it("More -> Account -> Password: back returns to Account, then More, then Today", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-more"));
    await waitFor(() => expect(paneShown("more")).toBe(true));
    fireEvent.click(await screen.findByText("Account"));
    await screen.findByTestId("trainee-overlay-account");
    fireEvent.click(await screen.findByText("Password"));
    await screen.findByTestId("trainee-overlay-password");
    // Account stays mounted underneath, so the swipe shows the real screen.
    expect(screen.getByTestId("trainee-overlay-account")).toBeTruthy();

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("trainee-overlay-password")).toBeNull());
    expect(screen.getByTestId("trainee-overlay-account")).toBeTruthy();

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("trainee-overlay-account")).toBeNull());
    // An overlay opened from a tab goes back to that tab as it was left.
    expect(paneShown("more")).toBe(true);

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
    expect(pressBack()).toBe(false);
  });

  it("the on-screen back (Cancel on an edit page) does what hardware back does", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-more"));
    fireEvent.click(await screen.findByText("Account"));
    await screen.findByTestId("trainee-overlay-account");
    fireEvent.click(await screen.findByText("Password"));
    await screen.findByTestId("trainee-overlay-password");
    // Password is an edit page (TR-20b): its on-screen back is Cancel, which
    // calls the same pop as hardware back.
    const top = screen.getByTestId("trainee-overlay-password");
    const cancel = Array.from(top.querySelectorAll("[role=button]")).find(
      (node) => node.textContent?.trim() === "Cancel",
    );
    expect(cancel).toBeTruthy();
    fireEvent.click(cancel as Element);
    await waitFor(() => expect(screen.queryByTestId("trainee-overlay-password")).toBeNull());
    expect(screen.getByTestId("trainee-overlay-account")).toBeTruthy();
  });
});

// ---- Fix round 1: the remaining rows of the back table ----

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const START = "2026-11-14T13:00:00.000Z";

const dueCheckin: Checkin = checkinSchema.parse({
  id: uuid(901),
  coachingRelationshipId: shellRelationship.id,
  checkinScheduleId: null,
  localDate: "2026-11-14",
  windowStartsAt: "2026-11-13T18:30:00.000Z",
  windowEndsAt: "2026-11-14T18:29:00.000Z",
  recordStatus: "draft",
  recordVersion: 1,
  definitionVersion: 1,
  checkinFormVersionId: uuid(902),
  answers: null,
  submittedAt: null,
  status: "due",
  review: null,
  createdAt: START,
  updatedAt: START,
});

const lowerBody: WorkoutAssignment = workoutAssignmentSchema.parse({
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

function loggedSet(id: number, order: number, logged: boolean) {
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

const liveExecution: WorkoutExecution = workoutExecutionSchema.parse({
  id: uuid(1),
  assignmentId: lowerBody.id,
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
      sets: [1, 2, 3].map((order) => loggedSet(10 + order, order, order <= 2)),
      createdAt: START,
      updatedAt: START,
    },
  ],
  createdAt: START,
  updatedAt: START,
});

/** Mount the shell with a link already pending, as the auth provider hands it over. */
async function openShellWithLink(kind: "meal" | "workout" | "checkin", id: string) {
  (h.auth as Record<string, unknown>).pendingDeepLink = { kind, id };
  await openShell();
}

/** One meal the trainee has, answered once the shell is up (the Diet tab has loaded by then). */
function ownOneMeal(id: string) {
  h.overrides.listMealAssignments = async () => ({
    items: [{ id, localDate: "2026-11-14" }],
    nextCursor: null,
  });
}

describe("TraineeShell Android back: sheets, check-in, links, live workout (Z14-25 fix round 1)", () => {
  it("a sheet over a tab: back closes only the sheet, the tab stays, the day views refresh", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-diet"));
    await waitFor(() => expect(paneShown("diet")).toBe(true));
    fireEvent.click(await screen.findByText(/^Ask Rahul on WhatsApp$/));
    await screen.findByLabelText("Dismiss");
    h.invalidate.mockClear();

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByLabelText("Dismiss")).toBeNull());
    // Still on Diet (not Today); the sheet branch of popTop refreshed the day views.
    expect(paneShown("diet")).toBe(true);
    expect(h.invalidate).toHaveBeenCalledWith(shellRelationship.id);
    // The next back is the tab rule.
    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
  });

  it("a sheet opened from a pushed screen: back closes the sheet and leaves that screen as it was", async () => {
    h.overrides.getWorkoutAssignment = async () => lowerBody;
    await openShellWithLink("workout", lowerBody.id);
    await screen.findByTestId("trainee-overlay-workout_overview");
    // The overview's overflow menu holds Ask coach.
    fireEvent.click(await screen.findByLabelText("Workout day options"));
    fireEvent.click(await screen.findByText("Ask coach"));
    await screen.findByLabelText("Dismiss");
    // The pushed overview stays mounted under the sheet.
    expect(screen.getByTestId("trainee-overlay-workout_overview")).toBeTruthy();

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByLabelText("Dismiss")).toBeNull());
    expect(screen.getByTestId("trainee-overlay-workout_overview")).toBeTruthy();
  });
});

describe("TraineeShell Android back: check-in, links and a live workout (Z14-25 fix round 1)", () => {
  it("a check-in covering Today: back closes it, exactly as its Close button does", async () => {
    h.overrides.listCheckins = async () => ({ items: [dueCheckin], nextCursor: null });
    await openShellWithLink("checkin", dueCheckin.id);
    const close = await screen.findByLabelText("Close");
    expect(close).toBeTruthy();

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByLabelText("Close")).toBeNull());
    // Today is as it was; the next back leaves the app.
    expect(paneShown("today")).toBe(true);
    expect(pressBack()).toBe(false);
  });

  it("the check-in's own Close ends in the same place as back", async () => {
    h.overrides.listCheckins = async () => ({ items: [dueCheckin], nextCursor: null });
    await openShellWithLink("checkin", dueCheckin.id);
    fireEvent.click(await screen.findByLabelText("Close"));
    await waitFor(() => expect(screen.queryByLabelText("Close")).toBeNull());
    expect(paneShown("today")).toBe(true);
    expect(pressBack()).toBe(false);
  });

  it("a meal link: back closes the meal sheet, stays on Diet, then Today, then exits", async () => {
    const mealId = uuid(801);
    const view = await openShell();
    ownOneMeal(mealId);
    (h.auth as Record<string, unknown>).pendingDeepLink = { kind: "meal", id: mealId };
    act(() => {
      view.rerender(<TraineeShell relationship={shellRelationship} />);
    });
    await screen.findByTestId("meal-sheet");
    expect(paneShown("diet")).toBe(true);

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("meal-sheet")).toBeNull());
    expect(paneShown("diet")).toBe(true);

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
    expect(pressBack()).toBe(false);
  });

  it("a workout overview link: back closes it, stays on Workout, then Today, then exits", async () => {
    h.overrides.getWorkoutAssignment = async () => lowerBody;
    await openShellWithLink("workout", lowerBody.id);
    await screen.findByTestId("trainee-overlay-workout_overview");
    expect(paneShown("workout")).toBe(true);

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("trainee-overlay-workout_overview")).toBeNull());
    expect(paneShown("workout")).toBe(true);

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
    expect(pressBack()).toBe(false);
  });

  it("a reminders link: back closes the settings, stays on More, then Today, then exits", async () => {
    (h.auth as Record<string, unknown>).pendingNotificationLink = {
      tab: "more",
      domainEntityType: "coaching_relationship",
      domainEntityId: shellRelationship.id,
      route: { type: "reminders" },
      path: "/go/reminders",
      refetchRequired: false,
    };
    await openShell();
    await screen.findByTestId("trainee-overlay-reminder_settings");
    expect(paneShown("more")).toBe(true);

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("trainee-overlay-reminder_settings")).toBeNull());
    expect(paneShown("more")).toBe(true);

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
    expect(pressBack()).toBe(false);
  });

  it("a live workout under an overlay: back pops the overlay and does not minimise the workout", async () => {
    h.overrides.getWorkoutAssignment = async () => lowerBody;
    const view = await openShell();
    act(() => {
      openActiveSession({
        relationshipId: shellRelationship.id,
        execution: liveExecution,
        assignment: lowerBody,
      });
    });
    fireEvent.click(screen.getByTestId("tab-workout"));
    // The live workout is mounted and has its own back handler (the shell's plus the workout's).
    await waitFor(() => {
      if (listeners.length !== 2) throw new Error("the live workout's own back handler is not mounted");
    });
    expect(getActiveSession(shellRelationship.id)?.minimised).toBeFalsy();

    // A link opens an overview over the workout tab.
    (h.auth as Record<string, unknown>).pendingDeepLink = { kind: "workout", id: lowerBody.id };
    act(() => {
      view.rerender(<TraineeShell relationship={shellRelationship} />);
    });
    await screen.findByTestId("trainee-overlay-workout_overview");
    // Under the overlay only the shell answers: the workout's handler is not mounted.
    expect(listeners).toHaveLength(1);

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("trainee-overlay-workout_overview")).toBeNull());
    expect(getActiveSession(shellRelationship.id)?.minimised).toBeFalsy();
  });
});
