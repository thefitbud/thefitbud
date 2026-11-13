/**
 * Z11b-6: the Progress tab draws its own title, so the shell must not add an
 * AppTopBar above it (it landed under the status bar as a second "Progress").
 */
import { describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  type CoachingRelationship,
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
      if (key === "getProgressSummary") return async () => ({ measurements: [], entries: [], media: [] });
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


describe("TraineeShell on the Progress tab", () => {
  it("shows one Progress heading and no shell top bar", async () => {
    const { render, screen, waitFor, fireEvent } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");
    render(<TraineeShell relationship={shellRelationship} />);
    await waitFor(() => {
      expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByText("Progress"));
    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: "Progress" }).length).toBe(1);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByRole("heading", { name: "Progress" }).length).toBe(1);
  });
});
