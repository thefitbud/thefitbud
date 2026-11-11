import { describe, expect, it, vi } from "vitest";
import { coachingRelationshipSchema, measurementSchema } from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../../test/render";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const USER = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";

function m(id: string, type: string, value: number, observedAt: string, extra: object) {
  return measurementSchema.parse({
    id,
    coachingRelationshipId: REL,
    traineeUserId: USER,
    type,
    value,
    unit: type === "body_weight_kg" ? "kg" : "cm",
    observedAt,
    source: "trainee_entry",
    checkinId: null,
    mediaAssetId: null,
    recordVersion: 1,
    createdAt: observedAt,
    updatedAt: observedAt,
    ...extra,
  });
}

const edited = { loggedByRole: "trainee", lastEditedByRole: "coach", updatedAt: "2026-11-02T08:00:00.000Z" };
const measurements = [
  m("a1111111-1111-4111-8111-111111111111", "body_weight_kg", 77.2, "2026-10-25T01:00:00.000Z", {}),
  m("b2222222-2222-4222-8222-222222222222", "body_weight_kg", 76.6, "2026-11-01T01:00:00.000Z", edited),
  m("c3333333-3333-4333-8333-333333333333", "waist_cm", 82.0, "2026-10-25T01:00:00.000Z", {}),
  m("d4444444-4444-4444-8444-444444444444", "waist_cm", 82.6, "2026-11-01T01:00:00.000Z", {
    loggedByRole: "coach",
    lastEditedByRole: null,
  }),
];

const api = {
  getProgressSummary: vi.fn(async () => ({ measurements, entries: [], media: [] })),
  listCheckins: vi.fn(async () => ({ items: [], nextCursor: null })),
};
const auth = mockAuth({ api, me: { id: USER, email: "aarav.ontrack@demo.fitbud.test", timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
const syncEngine = {
  pullAndApply: async () => undefined,
  store: { upsertLocal: async () => undefined, listLocal: async () => [], listOutbox: async () => [], getMeta: async () => ({ cursor: null, lastSyncedAt: null }) },
  enqueue: async () => undefined,
};
vi.mock("../../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../sync/SyncProvider");
  return { ...actual, useSyncEngine: () => syncEngine };
});

const { ProgressTab } = await import("../ProgressTab");

const relationship = coachingRelationshipSchema.parse({
  id: REL,
  trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
  traineeUserId: USER,
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-09-01T06:30:00.000Z",
  endedAt: null,
  createdAt: "2026-09-01T06:30:00.000Z",
  updatedAt: "2026-11-01T06:30:00.000Z",
  trainerDisplayName: "Rahul Verma",
});

describe("ProgressTab coach-log labels", () => {
  it("labels the latest weight and the latest waist entry", async () => {
    render(<ProgressTab relationship={relationship} />);
    await waitFor(() => expect(screen.getByText(/^Edited by your coach · Mon 2 Nov/)).toBeTruthy());
    expect(screen.getByText("Logged by your coach")).toBeTruthy();
  });
});
