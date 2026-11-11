/**
 * The Workout tab's week load state (CU24, D-W3b-29).
 *
 * The defect these tests pin is the one CU22 removed from Today, on the
 * trainee's other main tab: "No plan yet / Workouts appear here when <Coach>
 * publishes your plan" was gated on `assignments.length === 0`, which is
 * equally true before the first load settles and after a load that failed. A
 * trainee offline on a first run was told their coach had published nothing.
 *
 * What this harness can and cannot prove (CU6): it is `happy-dom` plus
 * `react-native-web`, so it is DOM-shaped, not device-shaped. It proves which
 * text, roles and accessibility labels a screen reader and Maestro's
 * content-desc matching would see, and how those change as the load state
 * changes. It proves nothing about layout, Hermes, native gestures or
 * `Platform.OS` branches.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  workoutAssignmentSchema,
  type CoachingRelationship,
  type WorkoutAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";
import { localDateInTimezone } from "../lib/dates";

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

/** What `listWorkoutAssignments` does on the next call. */
let listWorkout: () => Promise<{
  items: WorkoutAssignment[];
  nextCursor: null;
}>;
let listCalls = 0;

function answerWith(items: WorkoutAssignment[]): void {
  listWorkout = async () => ({ items, nextCursor: null });
}

function failWith(message: string): void {
  listWorkout = async () => {
    throw new Error(message);
  };
}

/** A fetch that never settles: the cold start, before anything has answered. */
function neverAnswer(): void {
  listWorkout = () => new Promise(() => undefined);
}

const api = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "listWorkoutAssignments") {
        return () => {
          listCalls += 1;
          return listWorkout();
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
const { PLAN_UNAVAILABLE_MESSAGE } = await import("./TodayTab");
const { invalidateRelationshipDayData } = await import("./dataCache");

const NO_PLAN_YET = "No plan yet";

function renderWorkout() {
  return render(
    <WorkoutTab relationship={relationship} selectedDate={TODAY} />,
  );
}

beforeEach(() => {
  // The week cache is module state shared by every trainee screen, so a test
  // that left a cached week behind would make the next one's "nothing cached"
  // a lie.
  invalidateRelationshipDayData(relationship.id);
  listCalls = 0;
  answerWith([]);
});

describe("WorkoutTab week state", () => {
  it("says nothing about a published plan while the week is loading", async () => {
    neverAnswer();
    renderWorkout();

    await waitFor(() => {
      expect(screen.getByText("Loading workouts…")).toBeTruthy();
    });

    // The assertion the defect fails. "No plan yet" is a claim about the
    // coach, and nothing has answered yet.
    expect(screen.queryByText(NO_PLAN_YET)).toBeNull();
    expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
    expect(screen.queryByText("Rest day")).toBeNull();
  });

  it("tells a trainee with an empty week that no plan is published yet", async () => {
    answerWith([]);
    renderWorkout();

    // `none` is still reached, and only from an answer the server gave.
    await waitFor(() => {
      expect(screen.getByText(NO_PLAN_YET)).toBeTruthy();
    });
    expect(
      screen.getByText("Workouts appear here when Rahul publishes your plan."),
    ).toBeTruthy();
    expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
  });

  it("says the plan could not be loaded when the read fails with nothing cached", async () => {
    failWith("Request failed");
    renderWorkout();

    await waitFor(() => {
      expect(screen.getByText(PLAN_UNAVAILABLE_MESSAGE)).toBeTruthy();
    });

    // The decided copy, verbatim (D-W3b-27), shared with Today.
    expect(
      screen.getByText(
        "Couldn't load your plan. Check your connection and try again",
      ),
    ).toBeTruthy();
    // And this is what goes red if `unavailable` collapses back into `none`.
    expect(screen.queryByText(NO_PLAN_YET)).toBeNull();
    expect(screen.queryByText("Loading workouts…")).toBeNull();
  });

  it("offers a retry that re-attempts the read", async () => {
    failWith("Request failed");
    renderWorkout();

    await waitFor(() => {
      expect(screen.getByText(PLAN_UNAVAILABLE_MESSAGE)).toBeTruthy();
    });
    const callsBefore = listCalls;

    // "try again" in the copy is only honest because this control runs the
    // same handler as the screen's pull-to-refresh, which calls `load` — the
    // read that failed.
    answerWith([assignment]);
    screen.getByLabelText("Try again").click();

    await waitFor(() => {
      expect(listCalls).toBeGreaterThan(callsBefore);
    });
    await waitFor(() => {
      expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
    });
  });

  it("does not re-trigger its own load when it writes the week to the cache", async () => {
    answerWith([assignment]);
    renderWorkout();

    await waitFor(() => {
      expect(screen.getByText("Lower body B")).toBeTruthy();
    });
    const callsAfterFirstLoad = listCalls;

    // `load` writes the cache and `setCached` notifies that key's
    // subscribers, so refetching on that notification made every successful
    // load trigger the next one. On a device that is an unbounded refetch
    // loop; here it exhausted the runner's heap, which is how it was found.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(listCalls).toBe(callsAfterFirstLoad);
  });

  it("keeps showing a cached week when the read fails: that is not unavailable", async () => {
    answerWith([assignment]);
    const first = renderWorkout();
    await waitFor(() => {
      expect(screen.queryByText("Loading workouts…")).toBeNull();
    });
    first.unmount();

    // Same week, same cache entry, and now the read fails. D-W3b-27 draws the
    // line here: `unavailable` is "could not ask and have nothing", not
    // "could not refresh".
    failWith("Request failed");
    renderWorkout();

    await waitFor(() => {
      expect(screen.getByText("Lower body B")).toBeTruthy();
    });
    expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
    expect(screen.queryByText(NO_PLAN_YET)).toBeNull();
  });
});
