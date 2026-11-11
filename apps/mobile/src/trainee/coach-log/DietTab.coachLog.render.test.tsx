import { describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  mealAssignmentSchema,
  type MealAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../../test/render";
import { localDateInTimezone } from "../../lib/dates";

vi.mock("../../lib/reportError", () => ({ reportError: vi.fn() }));
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

function meal(
  id: string,
  name: string,
  roles: { loggedByRole: "trainee" | "coach"; lastEditedByRole: "coach" | null },
): MealAssignment {
  return mealAssignmentSchema.parse({
    id,
    coachingRelationshipId: REL,
    planId: "3c1e4f2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
    planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
    mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    mealName: name,
    localDate: DATE,
    windowStartsAt: `${DATE}T02:30:00.000Z`,
    windowEndsAt: `${DATE}T04:30:00.000Z`,
    photoRequired: false,
    status: "modified",
    scheduleStatus: "scheduled",
    prescription: {
      id: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
      order: 1,
      name,
      localTime: "08:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
    },
    compliance: {
      id: `9${id.slice(1)}`,
      assignmentId: id,
      coachingRelationshipId: REL,
      planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
      traineeUserId: USER,
      outcome: "modified",
      recordVersion: 1,
      loggedAt: `${DATE}T03:00:00.000Z`,
      deviationKind: "portion_adjustment",
      notes: null,
      photoRequired: false,
      photoIntent: null,
      mediaAssetId: null,
      ...roles,
      createdAt: `${DATE}T03:00:00.000Z`,
      updatedAt: `${DATE}T03:00:00.000Z`,
    },
    createdAt: `${DATE}T00:00:00.000Z`,
    updatedAt: `${DATE}T03:00:00.000Z`,
  });
}

const items = [
  meal("a1111111-1111-4111-8111-111111111111", "Breakfast", {
    loggedByRole: "coach",
    lastEditedByRole: null,
  }),
  meal("b2222222-2222-4222-8222-222222222222", "Lunch", {
    loggedByRole: "trainee",
    lastEditedByRole: "coach",
  }),
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

vi.mock("../../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
const syncEngine = {
  pullAndApply: async () => undefined,
  store: { upsertLocal: async () => undefined, listLocal: async () => [], listOutbox: async () => [] },
  enqueue: async () => undefined,
};
vi.mock("../../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../sync/SyncProvider");
  return { ...actual, useSyncEngine: () => syncEngine };
});
vi.mock("../../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../providers/ConfigProvider");
  return { ...actual, useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }) };
});

const { DietTab } = await import("../DietTab");

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

describe("DietTab coach-logged meals", () => {
  it("labels both entries and hides Change only on the coach-logged one", async () => {
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("Logged by your coach")).toBeTruthy());
    expect(screen.getByText(/^Edited by your coach/)).toBeTruthy();
    // Read-only per R1: the server rejects an edit of a coach-logged entry.
    expect(screen.getAllByText("Change")).toHaveLength(1);
  });
});
