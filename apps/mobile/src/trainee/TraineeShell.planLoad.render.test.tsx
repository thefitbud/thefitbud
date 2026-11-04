/**
 * The effective-plan load (CU22, D-W3b-24).
 *
 * `loadEffectivePlanState` is the shell's plan load with its four effects as
 * injected dependencies, so the orderings that were wrong can be tested
 * without a device: the plan is set from the value the loader returns, after
 * the cache write, and a cache-write failure comes back as a message instead
 * of being swallowed or turning into "no plan".
 *
 * It lives in a `.test.tsx` rather than a `.test.ts` because `TraineeShell`
 * imports `react-native`, which only resolves in vitest's `render` project
 * (aliased to `react-native-web`, CU6). The last describe block renders the
 * real shell; everything above it is the loader on its own.
 */
import { describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  type CoachingRelationship,
  type EffectivePlanResponse,
} from "@fitbud/contracts";
/*
 * `TraineeShell` reaches `modules/live-activity` (LA2) through the Live
 * Activity outbox drain, and that module calls into `expo-modules-core`,
 * which has no JS implementation off-device: importing it throws on
 * `globalThis.expo.EventEmitter`. The shared harness (`src/test/render.tsx`)
 * is CU6's file and outside CU22's `files_owned`, so this is mocked here, the
 * same way `src/notifications/liveActivityNative.test.ts` already does it.
 * Nothing in this file exercises a Live Activity.
 */
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

/*
 * The relationship the rendered shell is given, parsed by the same contract
 * the API answers with so the fixture cannot drift from a real response.
 */
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

/**
 * A promise that never settles: the plan fetch the rendered shell is given,
 * so the screen stays in whatever state the shell initialised the plan to.
 * This is the cold start the defect lived in.
 */
const neverSettles = new Promise<never>(() => undefined);

const shellApi = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "getEffectivePlan") return () => neverSettles;
      // `getMeWeek` / `getMeDay` answer with a whole read model or nothing;
      // an empty list would be a shape the API never returns.
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
      // The shell awaits this before it fetches the plan; on a device it is a
      // page pull plus up to 50 serial SQLite writes, which is why the plan
      // always settles after the day does.
      pullAndApply: async () => undefined,
      store: {
        upsertLocal: async () => undefined,
        listLocal: async () => [],
        // Read by `SyncIndicator`, which the shell's chrome renders.
        listOutbox: async () => [],
        // `SyncMeta`, the real shape: nothing synced yet on a cold start.
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
    useConfig: () => ({
      config: null,
      loading: false,
      refresh: async () => undefined,
    }),
  };
});

vi.mock("../realtime/useRealtimeHints", () => ({
  useRealtimeHints: () => undefined,
}));

const { loadEffectivePlanState, planCacheWriteMessage } = await import(
  "./TraineeShell"
);

const livePlan: EffectivePlanResponse = effectivePlanResponseSchema.parse({
  plan: {
    id: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    coachingRelationshipId: "1b65e3ad-84cf-4fe1-a546-0d62656c2c79",
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

const noPlan: EffectivePlanResponse = effectivePlanResponseSchema.parse({
  plan: null,
  version: null,
});

function deps(overrides: Partial<Parameters<typeof loadEffectivePlanState>[0]> = {}) {
  return {
    pull: vi.fn(async () => undefined),
    fetchPlan: vi.fn(async () => livePlan),
    // Typed through `vi.fn`'s signature rather than named parameters, so the
    // two arguments are pinned without declaring anything unused.
    cachePlan: vi.fn<
      (
        plan: EffectivePlanResponse,
        version: NonNullable<EffectivePlanResponse["version"]>,
      ) => Promise<undefined>
    >(async () => undefined),
    readCached: vi.fn(async () => null),
    ...overrides,
  };
}

describe("loadEffectivePlanState", () => {
  it("loads the published plan and caches it", async () => {
    const d = deps();
    const outcome = await loadEffectivePlanState(d);

    expect(outcome).toEqual({ state: { status: "loaded", plan: livePlan }, cacheError: null });
    // The version is handed over narrowed, so the cache write needs no
    // non-null assertion on a nullable field.
    expect(d.cachePlan).toHaveBeenCalledWith(livePlan, livePlan.version);
  });

  it("keeps the fetched plan when the cache write fails, and says what failed", async () => {
    const d = deps({
      cachePlan: vi.fn(async () => {
        throw Object.assign(new Error("database disk image is malformed"), {
          name: "SQLiteError",
        });
      }),
    });

    const outcome = await loadEffectivePlanState(d);

    // The plan is NOT discarded. Before CU22 the plan was set before the
    // write and the surrounding catch then reset it to null for the rest of
    // the session, which also read on screen as "no plan published".
    expect(outcome.state).toEqual({ status: "loaded", plan: livePlan });
    // And the failure is surfaced, naming the operation and the error type.
    expect(outcome.cacheError).toBe(
      "Your plan loaded, but saving it on this phone failed (SQLiteError). Your plan still shows while you're online — pull down to try saving it again.",
    );
  });

  it("does not try to cache a relationship with no published plan", async () => {
    const d = deps({ fetchPlan: vi.fn(async () => noPlan) });

    const outcome = await loadEffectivePlanState(d);

    expect(outcome).toEqual({ state: { status: "none" }, cacheError: null });
    expect(d.cachePlan).not.toHaveBeenCalled();
  });

  it("falls back to the newest cached plan when the fetch fails", async () => {
    const d = deps({
      fetchPlan: vi.fn(async () => {
        throw new Error("Request failed");
      }),
      readCached: vi.fn(async () => livePlan),
    });

    const outcome = await loadEffectivePlanState(d);

    expect(outcome.state).toEqual({ status: "loaded", plan: livePlan });
    expect(outcome.cacheError).toBeNull();
  });

  it("still fetches the plan when the sync pull fails", async () => {
    const d = deps({
      pull: vi.fn(async () => {
        throw new Error("pull failed");
      }),
    });

    // The caller swallows a pull failure before handing `pull` over, which is
    // unchanged behaviour; this pins that a throwing pull does not cost the
    // trainee their plan if that call site ever changes.
    const outcome = await loadEffectivePlanState(d);

    expect(outcome.state.status === "loaded" || outcome.state.status === "none").toBe(true);
  });

  it("reads as no plan only when the fetch fails with nothing cached", async () => {
    const d = deps({
      fetchPlan: vi.fn(async () => {
        throw new Error("Request failed");
      }),
    });

    const outcome = await loadEffectivePlanState(d);

    // An offline first run cannot tell "no plan published" from "could not
    // ask", so it reads as `none`. That is now **CU24** (D-W3b-27): a fourth
    // `unavailable` state, approved by Firoz and built after CU22 merges.
    // Pinned here so the change is deliberate when CU24 lands, rather than
    // this line quietly becoming wrong.
    expect(outcome.state).toEqual({ status: "none" });
  });
});

describe("planCacheWriteMessage", () => {
  it("names the operation and the error type", () => {
    expect(planCacheWriteMessage(new TypeError("x"))).toContain("(TypeError)");
    expect(planCacheWriteMessage(new TypeError("x"))).toContain(
      "saving it on this phone failed",
    );
  });

  it("carries no raw error text, however long or internal it is", () => {
    const err = Object.assign(
      new Error(
        "SQLITE_CONSTRAINT: UNIQUE constraint failed: sync_record.entity_type, sync_record.record_id",
      ),
      { name: "SQLiteError" },
    );

    const message = planCacheWriteMessage(err);

    // CU20's `safeZoneLabel` precedent (D-W3b-19): identify the fault without
    // pasting storage internals onto a trainee's screen. A raw message would
    // also put a raw enum-shaped string in the UI, which the content rules
    // forbid.
    expect(message).not.toContain("sync_record");
    expect(message).not.toContain("SQLITE_CONSTRAINT");
    expect(message).toContain("(SQLiteError)");
  });

  it("still says what failed when the value thrown is not an Error", () => {
    expect(planCacheWriteMessage("nope")).toBe(
      "Your plan loaded, but saving it on this phone failed. Your plan still shows while you're online — pull down to try saving it again.",
    );
  });
});

/**
 * The shell's initial plan state (CU22, D-W3b-24).
 *
 * This renders the real `TraineeShell` with a plan fetch that never settles,
 * which is the cold start the defect lived in. It exists because the reviewer
 * mutated `useState<EffectivePlanState>(EFFECTIVE_PLAN_LOADING)` to
 * `{ status: "none" }` and every other test still passed — and that one line
 * is what makes the three-state real. Reverted, every trainee with a
 * published plan is told their coach is preparing one on every cold start,
 * which is the whole defect back.
 */
describe("TraineeShell initial plan state", () => {
  it("says nothing about a plan before the plan load settles", async () => {
    const { render, screen, waitFor } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");

    render(<TraineeShell relationship={shellRelationship} />);

    // The shell has mounted and its effects have run; the plan fetch is still
    // pending on purpose (`neverSettles` below), so the plan state is whatever
    // the shell initialised it to.
    // "Today" is both the tab and the screen title, so this only asserts the
    // shell is mounted and past its first effects.
    await waitFor(() => {
      expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    });

    expect(screen.queryAllByText(/is preparing your plan/)).toEqual([]);
    expect(
      screen.queryByLabelText("Your coach is preparing your plan"),
    ).toBeNull();
  });
});
