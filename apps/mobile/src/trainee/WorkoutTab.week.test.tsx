/**
 * The Workout tab's week on v3 (Z12-44; Z9-6 before it): the day card lists
 * the plan (W-01a), a done day offers View summary only (W-01c, ISSUE-MAP
 * #4), a future day is a preview (W-01e), and this week's missed workouts get
 * TR-10c's one-line banner with "Log it". Same harness and caveats as
 * `WorkoutTab.render.test.tsx`: DOM-shaped, not device-shaped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  workoutAssignmentSchema,
  type CoachingRelationship,
  type WorkoutAssignment,
} from "@fitbud/contracts";
import { act, fireEvent, mockAuth, render, screen } from "../test/render";

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


/** The tab opens on today (Z9b-1); no picked or selected date overrides it. */
const FOCUS_DATE = TODAY;

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function dayAssignment(opts: {
  n: number;
  name: string;
  localDate: string;
  status: "assigned" | "missed" | "in_progress" | "completed";
  exercises: number;
  setsEach: number;
  /** The list's execution summary, when the day was started or finished. */
  execution?: "started" | "completed";
  /** False for an optional workout. */
  required?: boolean;
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
      ...(opts.required === false ? { required: false } : {}),
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
    execution: opts.execution
      ? {
          id: uuid(9000 + opts.n),
          assignmentId: uuid(1000 + opts.n),
          coachingRelationshipId: relationship.id,
          planVersionId: uuid(2),
          traineeUserId: relationship.traineeUserId,
          status: opts.execution,
          recordVersion: 3,
          startedAt: `${opts.localDate}T01:00:00.000Z`,
          pausedAt: null,
          completedAt:
            opts.execution === "completed"
              ? `${opts.localDate}T01:52:00.000Z`
              : null,
          sessionRpe: null,
          requireSessionRpe: false,
          loggedByRole: "trainee",
          lastEditedByRole: null,
          createdAt: `${opts.localDate}T01:00:00.000Z`,
          updatedAt: `${opts.localDate}T01:52:00.000Z`,
        }
      : null,
    createdAt: "2026-10-28T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  });
}

let items: WorkoutAssignment[] = [];
/** Every operation the tab queued, in order (Z14-8). */
const queuedOperations: string[] = [];

const api = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "listWorkoutAssignments") {
        return async () => ({ items, nextCursor: null });
      }
      // The full execution is not part of these tests: the card shows its
      // figures as a dash, as it does when the read fails on a device.
      if (key === "getWorkoutExecution") {
        return async () => {
          throw new Error("not in this test");
        };
      }
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
      pushPending: async () => [],
      store: {
        upsertLocal: async () => undefined,
        listLocal: async () => [],
        listOutbox: async () => [],
        getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
      },
      enqueue: async (row: { operation: string }) => {
        queuedOperations.push(row.operation);
      },
    }),
  };
});

const { WorkoutTab, missedBannerText } = await import("./WorkoutTab");
const { closeActiveSession } = await import("./workout/activeSession");
const { cacheKey, invalidateRelationshipDayData, setCached } = await import(
  "./dataCache"
);

function renderWorkout() {
  return render(
    <WorkoutTab relationship={relationship} selectedDate={TODAY} />,
  );
}

beforeEach(async () => {
  // The previous test's tree is already unmounted, but a week load it still had
  // in flight can resolve after this point and write its assignments into the
  // shared day cache, where the next test would render them. Let that settle,
  // then clear the cache, so every test starts from an empty one.
  await act(async () => {});
  invalidateRelationshipDayData(relationship.id);
  items = [];
  queuedOperations.length = 0;
  closeActiveSession();
});

describe("Start can't double-start (Z14-8)", () => {
  it("a double tap on Start workout queues one start", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 2, setsEach: 2 }),
    ];
    renderWorkout();
    const start = await screen.findByRole("button", { name: "Start workout" });
    await act(async () => {});
    await act(async () => {
      fireEvent.click(start);
      fireEvent.click(start);
    });
    expect(queuedOperations.filter((operation) => operation === "workout.start")).toEqual([
      "workout.start",
    ]);
  });
});

/**
 * Click once React has applied the commit that rendered the button.
 * react-native-web's Pressable hands `disabled` and `onPress` to its press
 * responder in a passive effect, which React flushes lazily; a click fired the
 * moment `findBy*` resolves can reach the responder before that. Flushing
 * effects first makes the click land on what the user would see.
 */
async function press(button: HTMLElement) {
  await act(async () => {});
  fireEvent.click(button);
}

describe("WorkoutTab day card (W-01a, W-01b, W-01c, W-01e)", () => {
  it("lists the plan, the start and this week's count (W-01a)", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 6, setsEach: 3 }),
    ];
    renderWorkout();
    expect(await screen.findByText("Lower body B")).toBeTruthy();
    expect(screen.getAllByText("3 × 10")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Start workout" })).toBeTruthy();
    expect(screen.getByText("This week: 0 of 1 done")).toBeTruthy();
    expect(screen.getByText(/^TODAY · /)).toBeTruthy();
  });

  it("offers only View summary on a done day, even when the list's status lags (ISSUE-MAP #4)", async () => {
    items = [
      // The list still says in progress; the execution summary says completed.
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "in_progress", exercises: 3, setsEach: 3, execution: "completed" }),
    ];
    renderWorkout();
    expect(await screen.findByRole("button", { name: "View summary" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue workout" })).toBeNull();
    expect(screen.getByLabelText("Duration 52 min")).toBeTruthy();
    expect(screen.getByTestId("day-eyebrow").textContent).toMatch(/1 of 1 done$/);
  });

  it("shows a started day as in progress with Continue (W-01b)", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "in_progress", exercises: 3, setsEach: 3, execution: "started" }),
    ];
    renderWorkout();
    expect(await screen.findByRole("button", { name: "Continue workout" })).toBeTruthy();
    expect(screen.getByText(/^In progress · \d+:\d{2}/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
  });

  it("previews a future day with no Start and no options (W-01e)", async () => {
    items = [
      dayAssignment({ n: 1, name: "Upper body A", localDate: "2026-11-14", status: "assigned", exercises: 5, setsEach: 3 }),
    ];
    render(<WorkoutTab relationship={relationship} selectedDate="2026-11-14" />);
    expect(await screen.findByText("Upper body A")).toBeTruthy();
    expect(screen.getByText("Opens on Sat 14 Nov")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Workout options" })).toBeNull();
  });

  it("keeps the action outside the card's details control (iOS a11y)", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 2, setsEach: 3 }),
    ];
    renderWorkout();
    const details = await screen.findByRole("button", { name: "Lower body B, workout details" });
    const start = screen.getByRole("button", { name: "Start workout" });
    expect(details.contains(start)).toBe(false);
    expect(start.contains(details)).toBe(false);
  });
});

describe("WorkoutTab missed banner (TR-10c)", () => {
  it("names one missed workout and offers Log it", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 6, setsEach: 3 }),
      dayAssignment({ n: 2, name: "Upper body B", localDate: "2026-11-12", status: "missed", exercises: 5, setsEach: 3 }),
    ];
    renderWorkout();
    expect(
      await screen.findByLabelText("You missed Upper body B on Thu. Did it anyway?"),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Log it" })).toHaveLength(1);
  });

  it("counts several missed workouts in one line with one Log it", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 6, setsEach: 3 }),
      dayAssignment({ n: 2, name: "Lower body A", localDate: "2026-11-10", status: "missed", exercises: 5, setsEach: 3 }),
      dayAssignment({ n: 3, name: "Upper body B", localDate: "2026-11-12", status: "missed", exercises: 5, setsEach: 3 }),
    ];
    renderWorkout();
    expect(
      await screen.findByLabelText("You missed 2 workouts this week. Did them anyway?"),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Log it" })).toHaveLength(1);
  });

  it("does not count a missed workout from before this week", async () => {
    items = [
      dayAssignment({ n: 2, name: "Lower body A", localDate: "2026-11-06", status: "missed", exercises: 5, setsEach: 3 }),
    ];
    renderWorkout();
    await screen.findByText("Rest day");
    expect(screen.queryByLabelText(/^You missed/)).toBeNull();
  });

  it("shows no banner when nothing was missed", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 6, setsEach: 3 }),
    ];
    renderWorkout();
    await screen.findByRole("button", { name: "Start workout" });
    expect(screen.queryByLabelText(/^You missed/)).toBeNull();
  });

  it("builds the one-workout line with the weekday", () => {
    expect(
      missedBannerText([{ workoutDayName: "Upper body B", localDate: "2026-11-12" }]),
    ).toEqual({ lead: "You missed ", name: "Upper body B", tail: " on Thu. Did it anyway?" });
  });
});

describe("WorkoutTab default focus and header", () => {
  const wed = () =>
    dayAssignment({ n: 1, name: "Upper body A", localDate: "2026-11-11", status: "assigned", exercises: 4, setsEach: 3 });
  const fri = () =>
    dayAssignment({ n: 2, name: "Lower body B", localDate: "2026-11-13", status: "assigned", exercises: 6, setsEach: 3 });

  it("opens on today when today is a Wednesday and no date is selected", async () => {
    vi.setSystemTime(new Date("2026-11-11T06:00:00Z"));
    try {
      items = [wed(), fri()];
      render(<WorkoutTab relationship={relationship} />);
      expect(await screen.findByText("Upper body A")).toBeTruthy();
      expect(screen.queryByText("Lower body B")).toBeNull();
    } finally {
      vi.setSystemTime(new Date("2026-11-13T06:00:00Z"));
    }
  });

  it("lets a date selected by the shell win over today", async () => {
    items = [wed(), fri()];
    render(<WorkoutTab relationship={relationship} selectedDate="2026-11-11" />);
    expect(await screen.findByText("Upper body A")).toBeTruthy();
    expect(screen.queryByText("Lower body B")).toBeNull();
  });

  it("lets a day picked on the shared v3 strip win over today", async () => {
    items = [wed(), fri()];
    render(<WorkoutTab relationship={relationship} onOpenOverlay={vi.fn()} />);
    expect(await screen.findByText("Lower body B")).toBeTruthy();
    // The strip speaks each day's workout state: Wednesday's was not done.
    await press(screen.getByRole("button", { name: "Wed 11 Nov, Missed" }));
    expect(await screen.findByText("Upper body A")).toBeTruthy();
  });

  it("has no bell (W-01a); Not today and Ask coach are in the options menu", async () => {
    items = [fri()];
    render(
      <WorkoutTab relationship={relationship} onOpenOverlay={vi.fn()} unreadNotifications={3} />,
    );
    await screen.findByText("Lower body B");
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    await press(screen.getByRole("button", { name: "Workout options" }));
    expect(await screen.findByText("Not today")).toBeTruthy();
    expect(screen.getByText("Ask coach")).toBeTruthy();
  });
});

describe("WorkoutTab strip and count agree (Z12-44 review)", () => {
  it("does not tick a day whose second workout is still owed", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 2, setsEach: 3 }),
      // Thursday: the first workout is done, the second was missed.
      dayAssignment({ n: 2, name: "Upper body A", localDate: "2026-11-12", status: "completed", exercises: 2, setsEach: 3, execution: "completed" }),
      dayAssignment({ n: 3, name: "Core", localDate: "2026-11-12", status: "missed", exercises: 2, setsEach: 3 }),
    ];
    renderWorkout();
    expect(await screen.findByText("This week: 0 of 2 done")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thu 12 Nov, Missed" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thu 12 Nov, Done" })).toBeNull();
  });

  it("leaves a past optional workout that was not done out of the missed state", async () => {
    items = [
      dayAssignment({ n: 1, name: "Mobility", localDate: "2026-11-11", status: "assigned", exercises: 2, setsEach: 1, required: false }),
    ];
    render(<WorkoutTab relationship={relationship} selectedDate="2026-11-11" />);
    expect(await screen.findByText("Mobility")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Log workout" })).toBeNull();
    expect(screen.getByRole("button", { name: "Wed 11 Nov, Rest" })).toBeTruthy();
    expect(screen.queryByLabelText(/^You missed/)).toBeNull();
  });
});

describe("WorkoutTab on a week cached before the finish (Z12-44 review)", () => {
  it("ends on View summary only once the server answers, never Start", async () => {
    const stale = dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "in_progress", exercises: 2, setsEach: 3, execution: "started" });
    // The week as cached while the session ran (Monday 9 to Sunday 15 Nov).
    setCached(
      cacheKey("workouts", relationship.id, "2026-11-09", "2026-11-15"),
      [stale],
    );
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "completed", exercises: 2, setsEach: 3, execution: "completed" }),
    ];
    renderWorkout();
    // First paint is the cache: the session it knew about, never Start.
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
    expect(await screen.findByRole("button", { name: "View summary" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue workout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
  });
});
