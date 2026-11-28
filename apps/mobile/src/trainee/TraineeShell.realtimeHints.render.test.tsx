/**
 * The shell's realtime hint wiring (Z14-44).
 *
 * `realtimeDayUpdate.test.ts` tests the mapping with injected spies. This
 * renders the real `TraineeShell`, captures the callback it hands to
 * `useRealtimeHints` and fires events at it, so a shell that went back to
 * reloading the plan (and pulling sync) on every hint fails here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  realtimeEventSchema,
  type CoachingRelationship,
  type RealtimeEvent,
} from "@fitbud/contracts";
import { clearDayViews, getCacheEntry, setCached } from "./dataCache";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const relationshipId = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";

const shellRelationship: CoachingRelationship = coachingRelationshipSchema.parse({
  id: relationshipId,
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

const noPlan = effectivePlanResponseSchema.parse({ plan: null, version: null });

const mocks = vi.hoisted(() => ({
  getEffectivePlan: vi.fn(),
  pullAndApply: vi.fn(),
  hint: { current: null as null | ((event: RealtimeEvent) => void) },
}));

const shellApi = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "getEffectivePlan") return mocks.getEffectivePlan;
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
  const sync = {
    pullAndApply: mocks.pullAndApply,
    store: {
      upsertLocal: async () => undefined,
      listLocal: async () => [],
      listOutbox: async () => [],
      getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
    },
    enqueue: async () => undefined,
  };
  return { ...actual, useSyncEngine: () => sync };
});

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../providers/ConfigProvider",
  );
  return {
    ...actual,
    useConfig: () => ({
      config: null,
      loading: false,
      refresh: async () => undefined,
    }),
  };
});

vi.mock("../realtime/useRealtimeHints", () => ({
  useRealtimeHints: (
    _api: unknown,
    _ids: unknown,
    onHint: (event: RealtimeEvent) => void,
  ) => {
    mocks.hint.current = onHint;
  },
}));

function event(
  eventType: "effective_plan_changed" | "meal_compliance_changed",
): RealtimeEvent {
  return realtimeEventSchema.parse({
    eventId: "11111111-1111-4111-8111-111111111111",
    eventType,
    entityType:
      eventType === "effective_plan_changed" ? "plan_version" : "meal_compliance",
    entityId: "22222222-2222-4222-8222-222222222222",
    coachingRelationshipId: relationshipId,
    serverVersion: 2,
    occurredAt: "2026-11-25T06:00:00.000Z",
  });
}

// A day well away from the one on screen, so the shell never refetches it.
const seededKey = `dayview:${relationshipId}:2026-11-20`;

async function mountShell() {
  const { render, screen, waitFor, act } = await import("../test/render");
  const { TraineeShell } = await import("./TraineeShell");
  render(<TraineeShell relationship={shellRelationship} />);
  await waitFor(() => {
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(mocks.getEffectivePlan).toHaveBeenCalled();
    expect(mocks.hint.current).not.toBeNull();
  });
  // Let the mount-time loads settle before counting calls.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return { act };
}

beforeEach(() => {
  clearDayViews();
  mocks.hint.current = null;
  mocks.getEffectivePlan.mockReset().mockResolvedValue(noPlan);
  mocks.pullAndApply.mockReset().mockResolvedValue(undefined);
});

describe("TraineeShell realtime hints", () => {
  it("a meal hint marks cached days stale and does not reload the plan or pull sync", async () => {
    const { act } = await mountShell();
    setCached(seededKey, { marker: "kept" });
    expect(getCacheEntry(seededKey)?.stale).toBe(false);
    const planCalls = mocks.getEffectivePlan.mock.calls.length;
    const pullCalls = mocks.pullAndApply.mock.calls.length;

    await act(async () => {
      mocks.hint.current?.(event("meal_compliance_changed"));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getCacheEntry(seededKey)?.stale).toBe(true);
    // Kept on screen: marked, not dropped.
    expect(getCacheEntry(seededKey)?.value).toEqual({ marker: "kept" });
    expect(mocks.getEffectivePlan).toHaveBeenCalledTimes(planCalls);
    expect(mocks.pullAndApply).toHaveBeenCalledTimes(pullCalls);
  });

  it("a plan hint reloads the plan", async () => {
    const { act } = await mountShell();
    setCached(seededKey, { marker: "kept" });
    const planCalls = mocks.getEffectivePlan.mock.calls.length;

    await act(async () => {
      mocks.hint.current?.(event("effective_plan_changed"));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mocks.getEffectivePlan.mock.calls.length).toBeGreaterThan(planCalls);
    expect(getCacheEntry(seededKey)?.stale).toBe(true);
  });
});
