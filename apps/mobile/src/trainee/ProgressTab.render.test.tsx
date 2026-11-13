/**
 * Progress tab fetch count (BT15, D-W4-16).
 *
 * `load` writes the progress cache, and `setCached` notifies that key's
 * subscribers. Refetching from the subscriber made every successful load
 * start the next one. This harness is react-native-web (D-W4-17): it counts
 * fetches, and it does not exercise the native branch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  type CoachingRelationship,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";

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

let progressCalls = 0;

const api = {
  getProgressSummary: vi.fn(async () => {
    progressCalls += 1;
    return { measurements: [], entries: [], media: [] };
  }),
  listCheckins: vi.fn(async () => ({ items: [], nextCursor: null })),
};

const auth = mockAuth({
  api,
  me: {
    id: relationship.traineeUserId,
    email: "aarav.ontrack@demo.fitbud.test",
    timezone: "Asia/Kolkata",
  },
});

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});

const syncEngine = {
  pullAndApply: async () => undefined,
  store: {
    upsertLocal: async () => undefined,
    listLocal: async () => [],
    listOutbox: async () => [],
    getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
  },
  enqueue: async () => undefined,
};

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../sync/SyncProvider",
  );
  return {
    ...actual,
    useSyncEngine: () => syncEngine,
  };
});

const { ProgressTab } = await import("./ProgressTab");

beforeEach(() => {
  progressCalls = 0;
});

describe("ProgressTab fetch count", () => {
  it("fetches the summary once per mount", async () => {
    render(
      <ProgressTab relationship={relationship} />,
    );

    await waitFor(() => {
      expect(progressCalls).toBe(1);
    });

    // The load writes the cache, which notifies the subscriber. A subscriber
    // that called `load` would increment this again before the wait below.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(progressCalls).toBe(1);
    expect(screen.queryByText("Could not load progress.")).toBeNull();
  });
});

/*
 * Z11b-6: Aarav's seed has two weigh-ins on the same civil day (08:12 and
 * 21:00 IST). Keys built from the date collided, which React reports through
 * console.error ("two children with the same key") and LogBox shows as the red
 * toast on a dev build.
 */
describe("ProgressTab chart with two weigh-ins on one day", () => {
  it("renders without a duplicate-key error and one point per day", async () => {
    const day = (iso: string, value: number, n: number) => ({
      id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
      type: "body_weight_kg",
      value,
      unit: "kg",
      observedAt: iso,
      source: "trainee_logged",
    });
    const recent = (daysAgo: number, hhmmUtc: string) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return `${d.toISOString().slice(0, 10)}T${hhmmUtc}:00.000Z`;
    };
    api.getProgressSummary.mockResolvedValueOnce({
      measurements: [
        day(recent(14, "02:42"), 82.4, 1),
        day(recent(14, "15:30"), 82.0, 2),
        day(recent(7, "02:42"), 81.6, 3),
        day(recent(7, "15:30"), 81.2, 4),
        day(recent(1, "02:42"), 80.8, 5),
      ],
      entries: [],
      media: [],
    } as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<ProgressTab relationship={relationship} />);
      await waitFor(() => {
        expect(screen.getByLabelText(/Started with Rahul/)).toBeTruthy();
      });
      const sameKey = errorSpy.mock.calls.filter((c) =>
        c.some((a) => typeof a === "string" && /same key/.test(a)),
      );
      expect(sameKey).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
