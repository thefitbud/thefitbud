import { describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  mealAssignmentSchema,
  type MealAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";
import { localDateInTimezone } from "../lib/dates";
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

function meal(
  id: string,
  name: string,
  status: "confirmed" | "pending",
  hour: number,
  localDate: string = DATE,
): MealAssignment {
  const hh = String(hour).padStart(2, "0");
  return mealAssignmentSchema.parse({
    id,
    coachingRelationshipId: REL,
    planId: "3c1e4f2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
    planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
    mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    mealName: name,
    localDate,
    windowStartsAt: `${localDate}T${hh}:00:00.000Z`,
    windowEndsAt: `${localDate}T${hh}:59:00.000Z`,
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
    createdAt: `${localDate}T00:00:00.000Z`,
    updatedAt: `${localDate}T00:00:00.000Z`,
  });
}

/** A civil date `days` before the selected day. */
function daysBefore(days: number): string {
  const d = new Date(`${DATE}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const today = [
  meal("a1111111-1111-4111-8111-111111111111", "Breakfast", "confirmed", 3),
  meal("b2222222-2222-4222-8222-222222222222", "Lunch", "confirmed", 8),
  meal("c3333333-3333-4333-8333-333333333333", "Snack", "pending", 11),
  meal("d4444444-4444-4444-8444-444444444444", "Dinner", "pending", 15),
];
// Z11b-1: what the device got when the query string was dropped: every meal
// since the plan started, not just the selected day's.
const otherDays = Array.from({ length: 20 }, (_, day) =>
  ["Breakfast", "Lunch", "Snack", "Dinner"].map((name, n) =>
    meal(
      `e${String(day).padStart(7, "0")}-5555-4555-8555-${String(n).padStart(12, "0")}`,
      name,
      "confirmed",
      3 + n * 4,
      daysBefore(day + 1),
    ),
  ),
).flat();
const items = [...otherDays.slice(0, 40), ...today, ...otherDays.slice(40)];

let network: "online" | "offline" = "online";

const api = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "then") return undefined;
      if (key === "listMealAssignments") {
        return async () => {
          // The phone lost its connection (offline day switch test).
          if (network === "offline") throw new TypeError("Network request failed");
          // Ignores its fromDate/toDate on purpose, like the API did without a query string.
          return { items, nextCursor: null };
        };
      }
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

describe("DietTab counts the selected day only (Z11b-1)", () => {
  it("a list holding other days' meals still reads 2 of 4 meals", async () => {
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("2 of 4 meals logged today")).toBeTruthy());
    expect(screen.queryByText(/of 84 meals/)).toBeNull();
  });

  it("an offline switch to another day drops the previous day's meals", async () => {
    network = "online";
    const view = render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("2 of 4 meals logged today")).toBeTruthy());
    network = "offline";
    view.rerender(
      <DietTab
        relationship={relationship}
        selectedDate={daysBefore(-1)}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("No meals planned today.")).toBeTruthy());
    expect(screen.queryByText(/of 4 meals/)).toBeNull();
    expect(screen.queryByText("Breakfast")).toBeNull();
    network = "online";
  });
});
