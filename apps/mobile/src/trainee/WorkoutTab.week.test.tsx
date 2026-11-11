/**
 * Z9-6: the Workout tab's current week (frame 10-trainee-workout-overview-ios).
 * The day card says "6 exercises / 18 sets", and missed workouts get the card
 * "<Count> workouts this week weren't logged. If you did them, log them now."
 * with a "Log it" row each. Same harness and caveats as
 * `WorkoutTab.render.test.tsx`: DOM-shaped, not device-shaped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  workoutAssignmentSchema,
  type CoachingRelationship,
  type WorkoutAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";
import { localDateInTimezone, startOfWeekMonday, addDays } from "../lib/dates";

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


/** The tab opens on the Saturday of the current week (its own default focus). */
const FOCUS_DATE = addDays(startOfWeekMonday(TODAY), 5);

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

const api = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "listWorkoutAssignments") {
        return async () => ({ items, nextCursor: null });
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

const { WorkoutTab, missedCardHeadline } = await import("./WorkoutTab");
const { invalidateRelationshipDayData } = await import("./dataCache");

function renderWorkout() {
  return render(
    <WorkoutTab relationship={relationship} selectedDate={TODAY} />,
  );
}

beforeEach(() => {
  invalidateRelationshipDayData(relationship.id);
  items = [];
});

describe("WorkoutTab current week", () => {
  it("summarises the day's workout as exercises and sets", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 6, setsEach: 3 }),
    ];
    renderWorkout();
    expect(await screen.findByText("Lower body B")).toBeTruthy();
    const hasText = (text: string) =>
      screen.queryAllByText((_, el) => el?.textContent === text).length > 0;
    await waitFor(() => expect(hasText("6 exercises")).toBe(true));
    expect(hasText("18 sets")).toBe(true);
  });

  it("shows the missed card with the frame's headline and a Log it row per workout", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 6, setsEach: 3 }),
      dayAssignment({ n: 2, name: "Lower body A", localDate: addDays(TODAY, -2), status: "missed", exercises: 5, setsEach: 3 }),
      dayAssignment({ n: 3, name: "Upper body B", localDate: addDays(TODAY, -1), status: "missed", exercises: 5, setsEach: 3 }),
    ];
    renderWorkout();
    expect(
      await screen.findByText(
        "Two workouts this week weren't logged. If you did them, log them now.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("Missed · you can still log it")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Log it" })).toHaveLength(2);
  });

  it("uses the singular headline for one missed workout", async () => {
    items = [
      dayAssignment({ n: 2, name: "Lower body A", localDate: addDays(TODAY, -1), status: "missed", exercises: 5, setsEach: 3 }),
    ];
    renderWorkout();
    expect(
      await screen.findByText(
        "One workout this week wasn't logged. If you did it, log it now.",
      ),
    ).toBeTruthy();
  });

  it("shows no missed card when nothing was missed", async () => {
    items = [
      dayAssignment({ n: 1, name: "Lower body B", localDate: FOCUS_DATE, status: "assigned", exercises: 6, setsEach: 3 }),
    ];
    renderWorkout();
    await screen.findByText("Start workout");
    expect(screen.queryByText(/weren't logged|wasn't logged/)).toBeNull();
  });
});

describe("missedCardHeadline", () => {
  it("spells 2 to 10 and falls back to digits", () => {
    expect(missedCardHeadline(2)).toMatch(/^Two workouts this week weren't logged/);
    expect(missedCardHeadline(10)).toMatch(/^Ten workouts/);
    expect(missedCardHeadline(11)).toMatch(/^11 workouts/);
  });
});
