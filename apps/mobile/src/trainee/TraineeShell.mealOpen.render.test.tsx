/**
 * The meal notification's Open button goes through the same check as a body
 * tap (Z12-47 review fix 1): the id must be one of this relationship's meals.
 * An id that is not (another trainee's, or a meal that was removed) shows
 * "This meal isn't available anymore", never the meal sheet.
 *
 * Harness (CU6): happy-dom plus react-native-web. It proves text, roles and
 * labels, not layout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDayViews } from "./dataCache";
import {
  coachingRelationshipSchema,
  type CoachingRelationship,
} from "@fitbud/contracts";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

type MealListener = (event: {
  kind: "open" | "snooze";
  mealAssignmentId: string | null;
}) => void;
const mealListeners = new Set<MealListener>();
vi.mock("../notifications/nativeActions", () => ({
  subscribeMealNotificationResponses: (listener: MealListener) => {
    mealListeners.add(listener);
    return () => mealListeners.delete(listener);
  },
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

/** This trainee's meals hold no row with the tapped id. */
const listMealAssignments = vi.fn(async () => ({ items: [], nextCursor: null }));

const shellApi = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "listMealAssignments") return listMealAssignments;
      if (key === "getEffectivePlan") return () => new Promise<never>(() => undefined);
      if (key === "getMeWeek" || key === "getMeDay") return async () => null;
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

const { act, render, screen, waitFor } = await import("../test/render");
const { TraineeShell } = await import("./TraineeShell");

const FOREIGN_MEAL_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  clearDayViews();
  listMealAssignments.mockClear();
});

describe("the meal notification's Open button (Z12-47)", () => {
  it("checks the id against this relationship's meals before opening", async () => {
    render(<TraineeShell relationship={relationship} />);
    await waitFor(() => expect(mealListeners.size).toBeGreaterThan(0));

    act(() => {
      for (const listener of mealListeners) {
        listener({ kind: "open", mealAssignmentId: FOREIGN_MEAL_ID });
      }
    });

    await waitFor(() => {
      expect(screen.getByText("This meal isn't available anymore.")).toBeTruthy();
    });
    expect(listMealAssignments).toHaveBeenCalledWith(
      relationship.id,
      expect.objectContaining({ fromDate: expect.any(String), toDate: expect.any(String) }),
    );
  });
});
