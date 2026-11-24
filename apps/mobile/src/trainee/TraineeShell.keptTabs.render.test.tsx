/**
 * Z14-2: the trainee shell keeps visited tabs mounted (hidden, not
 * unmounted), so a switch back paints at once and does not refetch data
 * younger than 30 s.
 */
import { describe, expect, it, vi } from "vitest";
import { coachingRelationshipSchema, type CoachingRelationship } from "@fitbud/contracts";

// The shell reaches `modules/live-activity` (no JS implementation off-device);
// as in the other shell render tests.
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

const calls = vi.hoisted(() => ({ progress: 0, mealLists: 0 }));

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
      if (key === "listMealAssignments") {
        return async () => {
          calls.mealLists += 1;
          return { items: [], nextCursor: null };
        };
      }
      if (key === "getMeWeek" || key === "getMeDay") return async () => null;
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
    },
  });
  return { ...actual, useAuth: () => auth };
});

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  // One engine for the life of the provider, as in the app (`useMemo`).
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

describe("TraineeShell kept tabs (Z14-2)", () => {
  it("a tab left stays mounted and hidden, and a switch back does not refetch", async () => {
    const { render, screen, waitFor, fireEvent, act } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");
    render(<TraineeShell relationship={shellRelationship} />);
    await waitFor(() => expect(screen.getByTestId("tab-progress")).toBeTruthy());

    fireEvent.click(screen.getByTestId("tab-progress"));
    await waitFor(() => expect(calls.progress).toBe(1));
    const progressPane = screen.getByTestId("trainee-pane-progress");
    expect(progressPane.getAttribute("aria-hidden")).not.toBe("true");

    fireEvent.click(screen.getByTestId("tab-diet"));
    await waitFor(() => expect(calls.mealLists).toBeGreaterThan(0));
    const dietLoads = calls.mealLists;
    // Progress is hidden, not gone: the same element is still in the tree.
    expect(screen.getByTestId("trainee-pane-progress")).toBe(progressPane);
    expect(progressPane.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(screen.getByTestId("tab-progress"));
    fireEvent.click(screen.getByTestId("tab-diet"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    // Back and forth within 30 s: no remount, no new request.
    expect(calls.progress).toBe(1);
    expect(calls.mealLists).toBe(dietLoads);
    expect(screen.getByTestId("trainee-pane-progress")).toBe(progressPane);
    // Today was the first tab and is still mounted too.
    expect(screen.getByTestId("trainee-pane-today")).toBeTruthy();
  });
});
