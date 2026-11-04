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
