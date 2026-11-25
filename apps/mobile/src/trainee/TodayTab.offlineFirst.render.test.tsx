/**
 * Z14-2: Today is offline-first. One TR-06f skeleton until the day, the plan
 * and the week have answered (or failed), then every block at once; a day on
 * the phone paints at once with no skeleton; queued logs are applied on top
 * of the cached day; offline is neutral and "Couldn't refresh" is crit only
 * when the API was reachable (TR-06e, TR-06g).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  mealAssignmentSchema,
  type MealAssignment,
} from "@fitbud/contracts";
import { clearDayViews, dayViewKey, hydrateCached } from "./dataCache";
import { act, mockAuth, render, screen, waitFor } from "../test/render";
import { localDateInTimezone } from "../lib/dates";

const TIME_ZONE = "Asia/Kolkata";
/**
 * The clock is pinned to 3:30 pm IST (10:00 UTC) so the fixture's meal windows
 * (01:00-02:59 UTC, i.e. 6:30-8:29 am IST) are always earlier in the trainee's
 * own day, whatever time the suite really runs. Only `Date` is faked: the
 * tests still use real timers for their waits.
 */
const PINNED_NOW = new Date("2026-11-10T10:00:00.000Z");
const TODAY = localDateInTimezone(TIME_ZONE, PINNED_NOW);

const relationship = coachingRelationshipSchema.parse({
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

const livePlan = effectivePlanResponseSchema.parse({
  plan: {
    id: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    coachingRelationshipId: relationship.id,
    title: "Strength block",
    createdAt: "2026-09-01T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  },
  version: {
    id: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
    planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    versionNumber: 3,
    status: "effective",
    recordVersion: 4,
    content: {
      workoutDays: [
        { id: "7a8b9c0d-1e2f-4304-9516-273849506172", order: 1, name: "Lower body B", exercises: [] },
      ],
      mealPrescriptions: [],
    },
    creationSource: "blank",
    sourceTemplateId: null,
    publishedAt: "2026-10-28T06:30:00.000Z",
    effectiveFrom: "2026-10-28T06:30:00.000Z",
    effectiveTo: null,
    createdAt: "2026-10-28T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  },
});

function meal(n: number, name: string, status: MealAssignment["status"]): MealAssignment {
  return mealAssignmentSchema.parse({
    id: `00000000-0000-4000-8000-0000000001${n}0`,
    coachingRelationshipId: relationship.id,
    planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    planVersionId: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
    mealPrescriptionId: `00000000-0000-4000-8000-0000000002${n}0`,
    mealName: name,
    localDate: TODAY,
    windowStartsAt: `${TODAY}T0${n}:00:00.000Z`,
    windowEndsAt: `${TODAY}T0${n}:59:00.000Z`,
    photoRequired: false,
    status,
    scheduleStatus: "scheduled",
    prescription: {
      id: `00000000-0000-4000-8000-0000000003${n}0`,
      order: n,
      name,
      mealType: "lunch",
      photoRequired: false,
      items: [
        {
          name: "Vegetable poha",
          portionLabel: "1 bowl",
          calories: 400,
          proteinGrams: 20,
          carbsGrams: 60,
          fatGrams: 10,
        },
      ],
      instructions: null,
      scheduleHint: null,
    },
    compliance: null,
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
  });
}

/** Never settles: the network has not answered. */
const never = () => new Promise<never>(() => undefined);

let dayRead: () => Promise<unknown> = async () => ({ items: [], nextCursor: null });
let weekRead: () => Promise<unknown> = async () => null;
let outboxRows: unknown[] = [];
let apiReachable: boolean | null = null;

const api = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "listWorkoutAssignments" || key === "listMealAssignments") {
        return () => dayRead();
      }
      if (key === "getMeWeek") return () => weekRead();
      if (key === "listCheckins" || key === "listNotifications") {
        return async () => ({ items: [], nextCursor: null });
      }
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      if (key === "getStepsToday") {
        return async () => ({ localDate: TODAY, steps: null, target: 8000 });
      }
      if (key === "then") return undefined;
      return async () => null;
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
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
const engine = {
  pullAndApply: vi.fn(async () => undefined),
  store: {
    upsertLocal: vi.fn(),
    listLocal: vi.fn(async () => []),
    listOutbox: vi.fn(async () => outboxRows),
    getMeta: vi.fn(async () => ({ cursor: null, lastSyncedAt: null })),
  },
  enqueue: vi.fn(),
  subscribe: () => () => undefined,
};
vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  return {
    ...actual,
    useReachability: () =>
      apiReachable === null
        ? null
        : { isReachable: () => apiReachable, subscribe: () => () => undefined },
    useSyncEngine: () => engine,
  };
});
vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

const { TodayTab, effectivePlanStateFor, EFFECTIVE_PLAN_LOADING } = await import("./TodayTab");

type PlanState = React.ComponentProps<typeof TodayTab>["planState"];

function today(planState: PlanState, onFirstPaint = vi.fn()) {
  return (
    <TodayTab
      relationship={relationship}
      planState={planState}
      planCacheError={null}
      selectedDate={TODAY}
      onSelectDate={() => undefined}
      onStartWorkout={() => undefined}
      onOpenDiet={() => undefined}
      onOpenCheckin={() => undefined}
      onRefreshPlan={() => undefined}
      onOpenOverlay={() => undefined}
      onFirstPaint={onFirstPaint}
    />
  );
}

/** A day saved on the phone at `savedAt` (what a cold start hydrates). */
function snapshot(meals: MealAssignment[], savedAt: number) {
  hydrateCached([
    {
      key: dayViewKey("today", relationship.id, TODAY),
      value: { workout: null, meals, day: null, notes: [], checkin: null },
      savedAt,
    },
  ]);
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

/** Blocks that render only once the gate is open. */
function anyBlockRendered(): boolean {
  return (
    screen.queryByLabelText("Open diet") !== null ||
    screen.queryByText("This week") !== null ||
    screen.queryByTestId("today-summary") !== null ||
    screen.queryByLabelText("View meal plan") !== null
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: PINNED_NOW, toFake: ["Date"] });
  clearDayViews();
  dayRead = async () => ({ items: [], nextCursor: null });
  weekRead = async () => null;
  outboxRows = [];
  apiReachable = null;
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("one Today skeleton (TR-06f, #2)", () => {
  it("with nothing cached: the skeleton until day, plan and week have answered; then everything at once", async () => {
    let releaseWeek: () => void = () => undefined;
    weekRead = () =>
      new Promise((resolve) => {
        releaseWeek = () => resolve(null);
      });
    const onFirstPaint = vi.fn();
    const view = render(today(EFFECTIVE_PLAN_LOADING, onFirstPaint));
    await settle();
    // Day answered; plan and week have not.
    expect(screen.getByLabelText("Loading today")).toBeTruthy();
    expect(anyBlockRendered()).toBe(false);

    view.rerender(today(effectivePlanStateFor(livePlan), onFirstPaint));
    await settle();
    // The week is still out: still one skeleton, still no block.
    expect(screen.getByLabelText("Loading today")).toBeTruthy();
    expect(anyBlockRendered()).toBe(false);
    expect(onFirstPaint).not.toHaveBeenCalled();

    await act(async () => {
      releaseWeek();
    });
    await waitFor(() => expect(screen.queryByLabelText("Loading today")).toBeNull());
    expect(screen.getByLabelText("Open diet")).toBeTruthy();
    expect(screen.getByLabelText("View meal plan")).toBeTruthy();
    // Flake trace (CI run 45480773153): onFirstPaint fires from an effect after
    // the gate opens, so it can land a tick after the skeleton leaves. Wait for it.
    await waitFor(() => expect(onFirstPaint).toHaveBeenCalledTimes(1));
  });

  it("a failed day load also opens the gate (the failure is shown, not a skeleton)", async () => {
    dayRead = async () => {
      throw new TypeError("Network request failed");
    };
    render(today(effectivePlanStateFor(livePlan)));
    await waitFor(() => expect(screen.queryByLabelText("Loading today")).toBeNull());
    expect(screen.getByText(/^You're offline\./)).toBeTruthy();
  });

  it("with a snapshot on the phone: paints at once, never the skeleton, while the network has not answered", () => {
    dayRead = never;
    weekRead = never;
    snapshot([meal(1, "Breakfast", "confirmed"), meal(2, "Lunch", "pending")], Date.now() - 60_000);
    render(today(effectivePlanStateFor(livePlan)));
    // Same frame as the first render: no waitFor.
    expect(screen.queryByLabelText("Loading today")).toBeNull();
    expect(screen.getByLabelText("Open diet")).toBeTruthy();
    expect(screen.getByText("1 of 2 logged ›")).toBeTruthy();
  });
});

describe("offline-first Today (TR-06e, TR-06g)", () => {
  const savedAt = Date.parse(`${TODAY}T04:10:00.000Z`); // 9:40 am IST

  it("the inconsistent home: a queued meal and a failed refresh agree everywhere", async () => {
    const lunch = meal(2, "Lunch", "pending");
    snapshot([meal(1, "Breakfast", "confirmed"), lunch], savedAt);
    dayRead = async () => {
      throw new TypeError("Network request failed");
    };
    outboxRows = [
      {
        mutationId: "00000000-0000-4000-8000-000000000901",
        idempotencyKey: "00000000-0000-4000-8000-000000000901",
        operation: "meal.confirm",
        entityType: "meal_compliance",
        recordId: lunch.id,
        status: "pending",
        attempts: 1,
        lastErrorCode: "UNREACHABLE",
        payloadJson: JSON.stringify({
          assignmentId: lunch.id,
          mealName: "Lunch",
          body: { photoIntent: null },
        }),
        createdAt: `${TODAY}T05:00:00.000Z`,
      },
    ];
    render(today(effectivePlanStateFor(livePlan)));
    await screen.findByText("Not sent yet · eaten as planned");
    expect(screen.getByText("2 of 2 logged ›")).toBeTruthy();
    expect(screen.getByText("1 log waiting to send")).toBeTruthy();
    expect(screen.getByLabelText("800 of 800 kcal")).toBeTruthy();
    expect(screen.getByLabelText("Meals 2 of 2, done")).toBeTruthy();
    expect(screen.getByLabelText("0 kcal left, Goal 800")).toBeTruthy();
    expect(
      screen.getByText(
        "You're offline. Showing what was saved at 9:40 am. Logs will send when you're back.",
      ),
    ).toBeTruthy();
    // Offline is neutral: no alert, no "Couldn't refresh".
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Couldn't refresh/)).toBeNull();
  });

  it("an API last seen unreachable is offline too, even before a load fails", () => {
    apiReachable = false;
    dayRead = never;
    weekRead = never;
    snapshot([meal(1, "Breakfast", "pending")], savedAt);
    render(today(effectivePlanStateFor(livePlan)));
    expect(screen.getByTestId("offline-banner")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Couldn't refresh is crit, with Retry, only when the API was reachable", async () => {
    snapshot([meal(1, "Breakfast", "pending")], savedAt);
    dayRead = async () => {
      throw new Error("Internal error");
    };
    render(today(effectivePlanStateFor(livePlan)));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Couldn't refresh. Showing 9:40 am.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    // The last answer stays on screen under it.
    expect(screen.getByLabelText("Open diet")).toBeTruthy();
  });
});
