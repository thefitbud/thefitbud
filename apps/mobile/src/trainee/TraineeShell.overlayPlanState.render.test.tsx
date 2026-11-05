/**
 * The shell hands its plan state to the overlay (Z5-17, G14; BT15 #230).
 *
 * BT15 made `AssignedMealPlanScreen` read the un-narrowed `planState`, so
 * `unavailable` is no longer shown as a permanent spinner. That only holds if
 * `TraineeShell` passes its own `planState` (and its retry) through
 * `TraineeOverlayHost`. BT15's tests rendered the screen directly. These
 * render the real shell, open the meal plan the way a trainee does (Diet tab,
 * then "Meal plan"), and check what the overlay shows for each plan state.
 *
 * Harness (CU6): happy-dom plus react-native-web. It proves text, roles and
 * labels, not layout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  type CoachingRelationship,
  type EffectivePlanResponse,
} from "@fitbud/contracts";

/* Same off-device stub as `TraineeShell.planLoad.render.test.tsx`. */
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

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

/** What `GET /relationships/:id/effective-plan` does in the current test. */
let planFetch: () => Promise<EffectivePlanResponse> = () =>
  new Promise<never>(() => undefined);
const getEffectivePlan = vi.fn(() => planFetch());

const shellApi = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "getEffectivePlan") return getEffectivePlan;
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
        // Nothing cached: a failed fetch therefore settles on `unavailable`.
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
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

vi.mock("../realtime/useRealtimeHints", () => ({
  useRealtimeHints: () => undefined,
}));

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));

const { fireEvent, render, screen, waitFor } = await import("../test/render");
const { TraineeShell } = await import("./TraineeShell");
const { PLAN_UNAVAILABLE_MESSAGE } = await import("./TodayTab");

/** Opens the meal plan overlay from the Diet tab, as a trainee does. */
async function openMealPlan(): Promise<void> {
  fireEvent.click(await screen.findByRole("tab", { name: "Diet" }));
  // Diet has two ways in (the header icon and the plan link); either opens
  // the same overlay.
  const [entry] = await screen.findAllByRole("button", { name: "Meal plan" });
  fireEvent.click(entry!);
  // The overlay's own day-type switch: only the meal plan screen has it.
  await screen.findByText("Training day");
}

beforeEach(() => {
  getEffectivePlan.mockClear();
  planFetch = () => new Promise<never>(() => undefined);
});

describe("TraineeShell passes planState to the meal plan overlay", () => {
  it("shows the overlay loading while the shell's plan load is pending", async () => {
    render(<TraineeShell relationship={relationship} />);
    await openMealPlan();

    expect(screen.getByText("Loading meal plan…")).toBeTruthy();
    expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
  });

  it("shows unavailable with a retry, not a spinner, when the shell's plan load failed", async () => {
    planFetch = async () => {
      throw new Error("Request failed");
    };
    render(<TraineeShell relationship={relationship} />);
    await waitFor(() => expect(getEffectivePlan).toHaveBeenCalled());
    await openMealPlan();

    await waitFor(() => {
      expect(screen.getByText(PLAN_UNAVAILABLE_MESSAGE)).toBeTruthy();
    });
    expect(screen.queryByText("Loading meal plan…")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("the overlay's retry runs the shell's plan load, and the loaded plan reaches the overlay", async () => {
    planFetch = async () => {
      throw new Error("Request failed");
    };
    render(<TraineeShell relationship={relationship} />);
    await openMealPlan();
    await waitFor(() => {
      expect(screen.getByText(PLAN_UNAVAILABLE_MESSAGE)).toBeTruthy();
    });
    const callsBefore = getEffectivePlan.mock.calls.length;

    planFetch = async () => livePlan;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(getEffectivePlan.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    // The shell's new `loaded` state reaches the still-open overlay: the
    // eyebrow carries the plan's own title, which only a loaded plan has.
    await waitFor(() => {
      expect(screen.getByText("Strength block · from Rahul")).toBeTruthy();
    });
    expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
  });

  it("shows the published plan when the shell's plan load succeeded", async () => {
    planFetch = async () => livePlan;
    render(<TraineeShell relationship={relationship} />);
    await waitFor(() => expect(getEffectivePlan).toHaveBeenCalled());
    await openMealPlan();

    await waitFor(() => {
      expect(screen.getByText("Strength block · from Rahul")).toBeTruthy();
    });
    expect(screen.queryByText("Loading meal plan…")).toBeNull();
    expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
  });
});
