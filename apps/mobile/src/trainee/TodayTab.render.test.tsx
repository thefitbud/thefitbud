/**
 * Today's plan-state gating (CU22, D-W3b-25).
 *
 * The defect these tests pin: `effectivePlan === null` meant both "not loaded
 * yet" and "no plan published", and the shell's plan load always settles after
 * `TodayTab`'s own day load (it awaits a full sync pull first). So every
 * trainee with a published plan saw their real workout under "<Coach> is
 * preparing your plan" on every cold start, and the Maestro flow's
 * `assertVisible: "Today's workout"` could not catch it because that header
 * rendered for a plan-less trainee too.
 *
 * What this harness can and cannot prove (CU6): it is `happy-dom` plus
 * `react-native-web`, so it is DOM-shaped, not device-shaped. It proves which
 * text, roles and accessibility labels a screen reader and Maestro's
 * content-desc matching would see, and how those change as the plan state
 * changes. It proves nothing about layout, Hermes, native gestures or
 * `Platform.OS` branches — the visual check and the Maestro run on a device
 * stay the authority on those.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  type CoachingRelationship,
  type EffectivePlanResponse,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";
import { localDateInTimezone } from "../lib/dates";

const TIME_ZONE = "Asia/Kolkata";
const TODAY = localDateInTimezone(TIME_ZONE);

/**
 * Realistic product data, parsed by the same contracts the API answers with,
 * so a fixture cannot drift into a shape the server never returns.
 */
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

const livePlan: EffectivePlanResponse = effectivePlanResponseSchema.parse({
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
        { id: "7a8b9c0d-1e2f-4304-9516-273849506172", order: 1, name: "Upper body A", exercises: [] },
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

/** The response the API gives a trainee whose trainer has published nothing. */
const noPlan: EffectivePlanResponse = effectivePlanResponseSchema.parse({
  plan: null,
  version: null,
});

/**
 * The day's reads. `dayLoad` is a gate the test opens, so a slow plan load can
 * be interleaved with a day load that has already settled — the ordering the
 * defect needs.
 */
let dayLoad: Promise<void>;
let openDayLoad: () => void;

function resetDayLoad(): void {
  let release: () => void = () => undefined;
  dayLoad = new Promise<void>((resolve) => {
    release = resolve;
  });
  openDayLoad = release;
}

const api = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "listWorkoutAssignments" || key === "listMealAssignments") {
        return async () => {
          await dayLoad;
          return { items: [], nextCursor: null };
        };
      }
      if (key === "listCheckins" || key === "listNotifications") {
        return async () => ({ items: [], nextCursor: null });
      }
      if (key === "listMeCoachNotes") {
        return async () => ({ items: [] });
      }
      if (key === "getMeDay" || key === "getMeWeek") {
        return async () => null;
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
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});

const syncEngine = {
  pullAndApply: vi.fn(async () => undefined),
  store: {
    upsertLocal: vi.fn(async () => undefined),
    listLocal: vi.fn(async () => []),
  },
  enqueue: vi.fn(async () => undefined),
};

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../sync/SyncProvider",
  );
  return { ...actual, useSyncEngine: () => syncEngine };
});

/*
 * `StepsCard` (rendered inside Today) reads the remote config, and the real
 * provider fetches it. Stubbed so these tests make no network call: steps are
 * off until Health Connect / HealthKit is wired, which is what `config: null`
 * means to `isStepsEnabled`.
 */
vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../providers/ConfigProvider",
  );
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

const { TodayTab, EFFECTIVE_PLAN_LOADING, effectivePlanStateFor } = await import(
  "./TodayTab"
);

const PREPARING = /is preparing your plan/;

function renderToday(
  planState = EFFECTIVE_PLAN_LOADING,
  planCacheError: string | null = null,
) {
  return render(
    <TodayTab
      relationship={relationship}
      planState={planState}
      planCacheError={planCacheError}
      selectedDate={TODAY}
      onSelectDate={() => undefined}
      onStartWorkout={() => undefined}
      onOpenDiet={() => undefined}
      onOpenCheckin={() => undefined}
      onRefreshPlan={() => undefined}
      onOpenOverlay={() => undefined}
    />,
  );
}

beforeEach(() => {
  resetDayLoad();
});

describe("TodayTab plan state", () => {
  it("says nothing about a plan while the plan is still loading", async () => {
    renderToday(EFFECTIVE_PLAN_LOADING);
    openDayLoad();
    await waitFor(() => {
      expect(screen.queryByText("Loading your day…")).toBeNull();
    });

    // Neither "preparing" site may render: not the greeting subtitle, and not
    // the card (whose accessibilityLabel is what Maestro reads as
    // content-desc, so it counts as visible text for the flow).
    expect(screen.queryAllByText(PREPARING)).toEqual([]);
    expect(
      screen.queryByLabelText("Your coach is preparing your plan"),
    ).toBeNull();
    // And nothing may claim the day is ready either.
    expect(screen.queryByText("Here's your day.")).toBeNull();
    expect(screen.queryByText("Today's workout")).toBeNull();
  });

  it("shows the day once the plan has loaded", async () => {
    renderToday(effectivePlanStateFor(livePlan));
    openDayLoad();

    await waitFor(() => {
      expect(screen.getByText("Here's your day.")).toBeTruthy();
    });
    expect(screen.getByText("Today's workout")).toBeTruthy();
    expect(screen.queryAllByText(PREPARING)).toEqual([]);
    expect(
      screen.queryByLabelText("Your coach is preparing your plan"),
    ).toBeNull();
  });

  it("tells a trainee with no published plan, and shows no workout section", async () => {
    renderToday(effectivePlanStateFor(noPlan));
    openDayLoad();

    await waitFor(() => {
      expect(screen.getByText("Rahul is preparing your plan.")).toBeTruthy();
    });
    expect(
      screen.getByLabelText("Your coach is preparing your plan"),
    ).toBeTruthy();
    // Item 3: a plan-less trainee gets no empty workout section.
    expect(screen.queryByText("Today's workout")).toBeNull();
    expect(screen.queryByText("Here's your day.")).toBeNull();
  });

  it("never shows both states at once, through the race the defect needs", async () => {
    // The day load settles first (it did on device: the shell's plan load
    // awaits a sync pull and up to 50 serial SQLite writes), while the plan is
    // still loading. This is the interleaving, not just the end states: a test
    // that only set the final states would stay green with the bug alive.
    const view = renderToday(EFFECTIVE_PLAN_LOADING);
    openDayLoad();
    await waitFor(() => {
      expect(screen.queryByText("Loading your day…")).toBeNull();
    });

    // The day is on screen and the plan has not answered yet. Before CU22 the
    // greeting read "<Coach> is preparing your plan." at exactly this point,
    // beside the trainee's real workout.
    expect(screen.queryAllByText(PREPARING)).toEqual([]);

    // The plan answers late. Only now may the day be claimed ready.
    view.rerender(
      <TodayTab
        relationship={relationship}
        planState={effectivePlanStateFor(livePlan)}
        planCacheError={null}
        selectedDate={TODAY}
        onSelectDate={() => undefined}
        onStartWorkout={() => undefined}
        onOpenDiet={() => undefined}
        onOpenCheckin={() => undefined}
        onRefreshPlan={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Here's your day.")).toBeTruthy();
    });
    expect(screen.queryAllByText(PREPARING)).toEqual([]);
  });

  it("announces a cache-write failure as its own error, not as a missing plan", async () => {
    renderToday(
      effectivePlanStateFor(livePlan),
      "Your plan loaded, but saving it on this phone failed (SQLiteError). Your plan still shows while you're online — pull down to try saving it again.",
    );
    openDayLoad();

    await waitFor(() => {
      expect(screen.getByText("Here's your day.")).toBeTruthy();
    });
    const alerts = screen.getAllByRole("alert").map((node) => node.textContent);
    expect(
      alerts.some((text) => text?.includes("saving it on this phone failed")),
    ).toBe(true);
    // The plan is still shown: a failed cache write is not "no plan".
    expect(screen.queryAllByText(PREPARING)).toEqual([]);
    expect(screen.getByText("Today's workout")).toBeTruthy();
  });
});
