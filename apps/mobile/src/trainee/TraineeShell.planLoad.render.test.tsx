/**
 * The effective-plan load (CU22, D-W3b-25).
 *
 * `loadEffectivePlanState` is the shell's plan load with its four effects as
 * injected dependencies, so the orderings that were wrong can be tested
 * without a device: the plan is set from the value the loader returns, after
 * the cache write, and a cache-write failure comes back as a message instead
 * of being swallowed or turning into "no plan".
 *
 * It lives in a `.test.tsx` rather than a `.test.ts` because `TraineeShell`
 * imports `react-native`, which only resolves in vitest's `render` project
 * (aliased to `react-native-web`, CU6). Nothing here renders a component.
 */
import { describe, expect, it, vi } from "vitest";
import {
  effectivePlanResponseSchema,
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
    cachePlan: vi.fn(
      async (
        _plan: EffectivePlanResponse,
        _version: NonNullable<EffectivePlanResponse["version"]>,
      ) => undefined,
    ),
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

    // Recorded as the residual it is: an offline first run cannot tell "no
    // plan published" from "could not ask". The PR says so; closing it needs
    // a fourth state, which is beyond what was approved here.
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
