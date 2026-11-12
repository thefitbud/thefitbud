import { describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  mealAssignmentSchema,
  type MealAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";
import { localDateInTimezone } from "../lib/dates";
import { enqueueAndPush } from "../sync/actions";
import { createMemorySyncStore, createSyncEngine } from "../sync/engine";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const TZ = "Asia/Kolkata";
const DATE = localDateInTimezone(TZ);
const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const USER = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";

function meal(id: string, name: string, status: "confirmed" | "pending", hour: number): MealAssignment {
  const hh = String(hour).padStart(2, "0");
  return mealAssignmentSchema.parse({
    id,
    coachingRelationshipId: REL,
    planId: "3c1e4f2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
    planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
    mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    mealName: name,
    localDate: DATE,
    windowStartsAt: `${DATE}T${hh}:00:00.000Z`,
    windowEndsAt: `${DATE}T${hh}:59:00.000Z`,
    photoRequired: false,
    status,
    scheduleStatus: "scheduled",
    prescription: {
      id: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
      order: 1,
      name,
      localTime: `${hh}:00`,
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
    },
    compliance: null,
    createdAt: `${DATE}T00:00:00.000Z`,
    updatedAt: `${DATE}T00:00:00.000Z`,
  });
}

const LUNCH_ID = "b2222222-2222-4222-8222-222222222222";
const items = [
  meal("a1111111-1111-4111-8111-111111111111", "Breakfast", "confirmed", 3),
  meal(LUNCH_ID, "Lunch", "confirmed", 8),
  meal("c3333333-3333-4333-8333-333333333333", "Dinner", "pending", 15),
];

const api = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "then") return undefined;
      if (key === "listMealAssignments") return async () => ({ items, nextCursor: null });
      if (key === "getMeDay") return async () => null;
      if (key === "getMeWeek") return async () => null;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);
const auth = mockAuth({ api, me: { id: USER, email: "aarav.ontrack@demo.fitbud.test", timezone: TZ } });

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
// A real engine and store; the push fails like airplane mode, so a queued
// confirm stays in the outbox.
const syncEngine = createSyncEngine(createMemorySyncStore(), {
  pushSync: async () => {
    throw new Error("offline");
  },
  pullSync: async () => {
    throw new Error("offline");
  },
});
vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  return { ...actual, useSyncEngine: () => syncEngine };
});
vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return { ...actual, useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }) };
});

const { DietTab } = await import("./DietTab");

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

describe("DietTab meal logged offline (frame 86)", () => {
  it("shows Waiting to send, the header chip and the planned-until-sent note", async () => {
    await enqueueAndPush(syncEngine, {
      recordId: LUNCH_ID,
      operation: "meal.confirm",
      payload: { assignmentId: LUNCH_ID, body: { photoIntent: null } },
    });
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("Waiting to send 1")).toBeTruthy());
    // Row pill (the header chip text is "Waiting to send 1").
    expect(screen.getByText("Waiting to send")).toBeTruthy();
    expect(screen.getByText("Logged")).toBeTruthy();
    expect(
      screen.getByText("2 of 3 meals logged · Lunch is counted as planned until it's sent"),
    ).toBeTruthy();
  });
});
