/**
 * Z14-41: a rating and note held before a force-quit are sent when the
 * trainee shell opens and when the app returns to the foreground, with the
 * Workout tab never opened. Real sync engine, outbox and held-feedback store;
 * only the network is faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppState } from "react-native";
import {
  coachingRelationshipSchema,
  type CoachingRelationship,
  type SyncMutationRequest,
  type WorkoutExecution,
} from "@fitbud/contracts";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const OWNER = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";
const EXECUTION = "00000000-0000-4000-8000-000000000900";
const NOW = Date.parse("2026-11-20T12:00:00.000Z");

const shellRelationship: CoachingRelationship = coachingRelationshipSchema.parse({
  id: "1b65e3ad-84cf-4fe1-a546-0d62656c2c79",
  trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
  traineeUserId: OWNER,
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-09-01T06:30:00.000Z",
  endedAt: null,
  createdAt: "2026-09-01T06:30:00.000Z",
  updatedAt: "2026-11-01T06:30:00.000Z",
  trainerDisplayName: "Rahul Verma",
});

const world = vi.hoisted(() => ({
  pushed: [] as unknown[],
  reads: 0,
  recordVersion: 4,
  failResume: false,
  completedAt: "2026-11-20T11:00:00.000Z",
}));

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  const { mockAuth } = await import("../test/render");
  const api = new Proxy(
    {},
    {
      get(_t, key: string) {
        if (key === "then") return undefined;
        if (key === "getMeWeek" || key === "getMeDay") return async () => null;
        if (key === "listMeCoachNotes") return async () => ({ items: [] });
        if (key === "getEffectivePlan") return () => new Promise<never>(() => undefined);
        if (key === "getWorkoutExecution") {
          return async () => {
            world.reads += 1;
            if (world.failResume) throw new Error("boom");
            return {
              id: EXECUTION,
              recordVersion: world.recordVersion,
              sessionRpe: null,
              sessionNote: null,
              completedAt: world.completedAt,
            } as WorkoutExecution;
          };
        }
        return async () => ({ items: [], nextCursor: null });
      },
    },
  );
  const auth = mockAuth({
    api,
    me: {
      userId: OWNER,
      id: OWNER,
      email: "aarav.ontrack@demo.fitbud.test",
      timezone: "Asia/Kolkata",
    },
  });
  return { ...actual, useAuth: () => auth };
});

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  const { createMemorySyncStore, createSyncEngine } = await import("../sync/engine");
  const engine = createSyncEngine(createMemorySyncStore(), {
    pushSync: async (body: { mutations: SyncMutationRequest[] }) => {
      world.pushed.push(...body.mutations);
      return {
        results: body.mutations.map((m) => ({
          mutationId: m.mutationId,
          status: "applied" as const,
          recordId: m.recordId,
          serverVersion: world.recordVersion + 1,
          entityType: m.entityType,
          error: null,
        })),
      };
    },
    pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
  });
  return { ...actual, useSyncEngine: () => engine };
});

// The device store is a memory one, as in the rpeRating suites.
vi.mock("./workout/pendingFeedbackStore", async () => {
  const actual = await vi.importActual<typeof import("./workout/pendingFeedbackStore")>(
    "./workout/pendingFeedbackStore",
  );
  const { createMemoryKeyValue } = await import("../sync/storage");
  const storage = createMemoryKeyValue(new Map());
  return {
    ...actual,
    pendingFeedbackStore: actual.createPendingFeedbackStore({ storage: () => storage }),
  };
});

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

vi.mock("../realtime/useRealtimeHints", () => ({ useRealtimeHints: () => undefined }));

const feedbackSends = () =>
  world.pushed.filter(
    (m) => (m as SyncMutationRequest).operation === "workout.feedback",
  ) as SyncMutationRequest[];

async function hold(over: { heldAt: number; token?: string; ownerId?: string }) {
  const { pendingFeedbackStore } = await import("./workout/pendingFeedbackStore");
  await pendingFeedbackStore.hold({
    ownerId: over.ownerId ?? OWNER,
    executionId: EXECUTION,
    change: { rpe: 7, note: "Felt strong" },
    heldAt: over.heldAt,
    token: over.token ?? "held-token",
  });
  return pendingFeedbackStore;
}

describe("TraineeShell resumes held feedback (Z14-41)", () => {
  beforeEach(async () => {
    world.pushed = [];
    world.reads = 0;
    world.failResume = false;
    world.completedAt = "2026-11-20T11:00:00.000Z";
    const { resetActiveHoldsForTests } = await import("./workout/rpeRating");
    resetActiveHoldsForTests();
    const { pendingFeedbackStore } = await import("./workout/pendingFeedbackStore");
    for (const owner of [OWNER, "00000000-0000-4000-8000-0000000000b2"]) {
      for (const row of await pendingFeedbackStore.list(owner)) {
        await pendingFeedbackStore.release(owner, row.executionId, row.token);
      }
    }
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("sends a held rating and note when the shell mounts, Workout never opened", async () => {
    const store = await hold({ heldAt: NOW - 60 * 60 * 1000 });
    const { render, screen, waitFor } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");
    render(<TraineeShell relationship={shellRelationship} />);
    await waitFor(() => expect(feedbackSends()).toHaveLength(1));
    expect(screen.queryByTestId("trainee-pane-workout")).toBeNull();
    expect(feedbackSends()[0]).toMatchObject({
      mutationId: "held-token",
      idempotencyKey: "held-token",
    });
    await waitFor(async () => expect(await store.list(OWNER)).toEqual([]));
  });

  it("sends when the app returns to the foreground", async () => {
    // The shell registers more than one AppState listener; keep them all.
    const handlers: Array<(s: string) => void> = [];
    const emit = (s: string) => handlers.forEach((fn) => fn(s));
    vi.spyOn(AppState, "addEventListener").mockImplementation(((
      _t: string,
      fn: (s: string) => void,
    ) => {
      handlers.push(fn);
      return { remove: () => undefined };
    }) as never);
    const { render, waitFor, act } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");
    render(<TraineeShell relationship={shellRelationship} />);
    await waitFor(() => expect(handlers.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(feedbackSends()).toHaveLength(0);

    await hold({ heldAt: NOW - 60 * 60 * 1000 });
    await act(async () => {
      emit("background");
    });
    expect(feedbackSends()).toHaveLength(0);
    await act(async () => {
      emit("active");
    });
    await waitFor(() => expect(feedbackSends()).toHaveLength(1));
  });

  it("the shell and a second resume (Workout tab) together send once", async () => {
    await hold({ heldAt: NOW - 60 * 60 * 1000 });
    const { render, waitFor } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");
    const { resumeHeldWorkoutFeedback } = await import("./workout/rpeRating");
    const { useSyncEngine } = await import("../sync/SyncProvider");
    render(<TraineeShell relationship={shellRelationship} />);
    // What the Workout tab does when it mounts, at the same moment.
    const tabResume = resumeHeldWorkoutFeedback({
      ownerId: OWNER,
      sync: useSyncEngine(),
      api: {
        getWorkoutExecution: async () =>
          ({
            id: EXECUTION,
            recordVersion: 4,
            sessionRpe: null,
            sessionNote: null,
            completedAt: world.completedAt,
          }) as WorkoutExecution,
      },
    });
    await waitFor(() => expect(feedbackSends()).toHaveLength(1));
    await tabResume;
    await new Promise((r) => setTimeout(r, 50));
    expect(feedbackSends()).toHaveLength(1);
  });

  it("does not send a hold past the 48 h edit window", async () => {
    world.completedAt = new Date(NOW - 49 * 60 * 60 * 1000).toISOString();
    const store = await hold({ heldAt: NOW - 48 * 60 * 60 * 1000 });
    const { render, waitFor } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");
    render(<TraineeShell relationship={shellRelationship} />);
    await waitFor(async () => expect(await store.list(OWNER)).toEqual([]));
    expect(feedbackSends()).toHaveLength(0);
  });

  it("leaves another owner's hold alone", async () => {
    const other = "00000000-0000-4000-8000-0000000000b2";
    const store = await hold({ heldAt: NOW - 60 * 60 * 1000, ownerId: other });
    const { render, screen, waitFor } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");
    render(<TraineeShell relationship={shellRelationship} />);
    await waitFor(() => expect(screen.getByTestId("tab-progress")).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));
    expect(feedbackSends()).toHaveLength(0);
    expect(await store.list(other)).toHaveLength(1);
  });

  it("a failing resume does not stop the first screen", async () => {
    world.failResume = true;
    await hold({ heldAt: NOW - 60 * 60 * 1000 });
    const { render, screen, waitFor } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");
    render(<TraineeShell relationship={shellRelationship} />);
    await waitFor(() => expect(screen.getByTestId("tab-progress")).toBeTruthy());
  });
});
