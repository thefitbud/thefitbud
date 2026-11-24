import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { clearDayViews } from "./dataCache";
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
const MEAL_ID = "b2222222-2222-4222-8222-222222222222";
const ENTRY_ID = "e5555555-5555-4555-8555-555555555555";

type Opts = {
  outcome?: "confirmed" | "modified";
  deviationKind?: "restaurant" | null;
  kcal?: number;
  editableUntil?: string | null;
  canRemove?: boolean;
  lastEditedByRole?: "trainee" | "coach" | null;
};

function meal(opts: Opts = {}): MealAssignment {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const outcome = opts.outcome ?? "confirmed";
  return mealAssignmentSchema.parse({
    id: MEAL_ID,
    coachingRelationshipId: REL,
    planId: "3c1e4f2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
    planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
    mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    mealName: "Lunch",
    localDate: DATE,
    windowStartsAt: iso(now - 30 * 60_000),
    windowEndsAt: iso(now + 30 * 60_000),
    photoRequired: false,
    status: outcome,
    scheduleStatus: "scheduled",
    prescription: {
      id: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
      order: 1,
      name: "Lunch",
      localTime: "13:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
    },
    compliance: {
      id: ENTRY_ID,
      assignmentId: MEAL_ID,
      coachingRelationshipId: REL,
      planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
      traineeUserId: USER,
      outcome,
      recordVersion: 3,
      loggedAt: iso(now - 60_000),
      deviationKind: opts.deviationKind ?? null,
      notes: null,
      photoRequired: false,
      photoIntent: null,
      mediaAssetId: null,
      ...(outcome === "modified"
        ? {
            loggedTotals: {
              energyKcal: opts.kcal ?? 1120,
              proteinG: null,
              carbsG: null,
              fatG: null,
            },
          }
        : {}),
      lastEditedByRole: opts.lastEditedByRole ?? null,
      editableUntil:
        opts.editableUntil === undefined ? iso(now + 23 * 3_600_000) : opts.editableUntil,
      canRemove: opts.canRemove ?? true,
      createdAt: iso(now - 60_000),
      updatedAt: iso(now - 60_000),
    },
    createdAt: `${DATE}T00:00:00.000Z`,
    updatedAt: `${DATE}T00:00:00.000Z`,
  });
}

const server = vi.hoisted(() => ({ items: [] as MealAssignment[] }));
const overlayCalls = vi.hoisted(() => ({ opened: [] as unknown[] }));

const api = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "then") return undefined;
      if (key === "listMealAssignments")
        return async () => ({ items: server.items, nextCursor: null });
      if (key === "getMeDay") return async () => null;
      if (key === "getMeWeek") return async () => null;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);
const auth = mockAuth({
  api,
  me: { id: USER, userId: USER, email: "aarav.ontrack@demo.fitbud.test", timezone: TZ },
});

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
const { resetMealPhotoJobsForTests } = await import("./food/mealPhotoJobs");
const { resetMealSavedNotice } = await import("./food/mealSavedNotice");
const { resetDeviceStorageForTests } = await import("../sync/storage");

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

function renderDiet() {
  return render(
    <DietTab
      relationship={relationship}
      selectedDate={DATE}
      onSelectDate={() => undefined}
      onOpenOverlay={(overlay) => {
        overlayCalls.opened.push(overlay);
      }}
    />,
  );
}

async function outbox() {
  return syncEngine.store.listOutbox();
}

function goOffline(offline: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: !offline });
  act(() => {
    window.dispatchEvent(new Event(offline ? "offline" : "online"));
  });
}

beforeEach(async () => {
  clearDayViews();
  resetMealPhotoJobsForTests();
  resetMealSavedNotice();
  resetDeviceStorageForTests();
  window.localStorage.clear();
  await syncEngine.store.clear();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  overlayCalls.opened = [];
});

describe("DietTab edit a logged meal for 24 hours (Z14-13b, D-W14-22)", () => {
  it("shows Add photo, Edit and the server's window on the just-logged card (TR-07m4)", async () => {
    server.items = [meal()];
    renderDiet();
    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
    expect(screen.getByText(/^Editable until tomorrow, /)).toBeTruthy();
  });

  it("offers nothing when the server sends no window (locked, coach-logged or coach-edited)", async () => {
    server.items = [meal({ editableUntil: null })];
    renderDiet();
    await waitFor(() => expect(screen.getByText("1 of 1 logged")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add photo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lunch, logged" }));
    expect(await screen.findByText("Logged entries can be changed for 24 hours.")).toBeTruthy();
    expect(screen.queryByTestId("logged-meal-edit")).toBeNull();
    expect(screen.queryByTestId("logged-meal-remove")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ask Rahul to fix it" }));
    await waitFor(() =>
      expect(overlayCalls.opened).toEqual([
        expect.objectContaining({ screen: "ask_coach", itemType: "meal_assignment", itemId: MEAL_ID }),
      ]),
    );
  });

  it("Edit goes away on an open screen when the server's window passes", async () => {
    server.items = [meal({ editableUntil: new Date(Date.now() + 1_200).toISOString() })];
    renderDiet();
    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Edit" })).toBeNull(), {
      timeout: 4000,
    });
  });

  it("the logged sheet hides Remove when the meal can no longer be logged (canRemove false)", async () => {
    server.items = [meal({ canRemove: false })];
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Lunch, logged" }));
    expect(await screen.findByTestId("logged-meal-edit")).toBeTruthy();
    expect(screen.getByTestId("logged-meal-add-photo")).toBeTruthy();
    expect(screen.queryByTestId("logged-meal-remove")).toBeNull();
    expect(screen.getByTestId("logged-meal-editable").textContent).toMatch(
      /^Editable until tomorrow, .* · Rahul sees any change$/,
    );
  });

  it("an as-planned entry opens Change this log; Ate out saves as an edit with the entry's version", async () => {
    server.items = [meal()];
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Change this log")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Changed the portion" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log it myself" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove this log" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    fireEvent.change(await screen.findByTestId("ate-out-kcal"), { target: { value: "900" } });
    fireEvent.click(screen.getByTestId("ate-out-save"));
    await waitFor(async () => expect((await outbox()).length).toBe(1));
    const [row] = await outbox();
    expect(row?.operation).toBe("meal.edit");
    expect(row?.recordId).toBe(ENTRY_ID);
    const payload = JSON.parse(row!.payloadJson) as {
      entryId: string;
      body: { outcome: string; deviationKind: string; recordVersion: number };
    };
    expect(payload.entryId).toBe(ENTRY_ID);
    expect(payload.body).toMatchObject({ outcome: "modified", deviationKind: "restaurant", recordVersion: 3 });
    // TR-07n6: the toast and the Edited tag, from the outbox, before any server answer.
    expect(await screen.findByText("Lunch updated · Rahul sees the change")).toBeTruthy();
    expect(await screen.findByTestId("meal-edited-tag")).toBeTruthy();
    expect(screen.getAllByText("900").length).toBeGreaterThan(0);
  });

  it("hides Add photo while an edit of the entry is queued (the attach would bump its version)", async () => {
    server.items = [meal()];
    renderDiet();
    expect(await screen.findByRole("button", { name: "Add photo" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    fireEvent.change(await screen.findByTestId("ate-out-kcal"), { target: { value: "900" } });
    fireEvent.click(screen.getByTestId("ate-out-save"));
    await waitFor(async () => expect((await outbox()).length).toBe(1));
    await screen.findByText("Lunch updated · Rahul sees the change");
    expect(screen.queryByRole("button", { name: "Add photo" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Lunch, logged" }));
    await screen.findByTestId("logged-meal-editable");
    expect(screen.queryByTestId("logged-meal-add-photo")).toBeNull();
  });

  it("an ate-out entry opens Edit ate out prefilled, with Was N kcal and Remove this log (TR-07n5)", async () => {
    server.items = [meal({ outcome: "modified", deviationKind: "restaurant", kcal: 1120 })];
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Edit ate out")).toBeTruthy();
    expect((screen.getByTestId("ate-out-kcal") as HTMLInputElement).value).toBe("1,120");
    expect(screen.getByText("Was 1,120 kcal")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove this log" })).toBeTruthy();
    // Save changes top right and at the bottom (TR-07n4 / TR-07n5).
    expect(screen.getAllByRole("button", { name: "Save changes" })).toHaveLength(2);
  });

  it("two edits queued offline use consecutive versions", async () => {
    server.items = [meal({ outcome: "modified", deviationKind: "restaurant", kcal: 500 })];
    renderDiet();
    for (const kcal of ["600", "700"]) {
      fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
      fireEvent.change(await screen.findByTestId("ate-out-kcal"), { target: { value: kcal } });
      fireEvent.click(screen.getByTestId("ate-out-save"));
      await screen.findByText("Lunch updated · Rahul sees the change");
      await waitFor(() => expect(screen.queryByTestId("ate-out-kcal")).toBeNull());
    }
    const versions = (await outbox()).map(
      (row) => (JSON.parse(row.payloadJson) as { body: { recordVersion: number } }).body.recordVersion,
    );
    expect(versions).toEqual([3, 4]);
  });

  it("the edit screen says the change saves on the phone while offline (TR-07n8)", async () => {
    server.items = [meal({ outcome: "modified", deviationKind: "restaurant" })];
    renderDiet();
    const edit = await screen.findByRole("button", { name: "Edit" });
    goOffline(true);
    fireEvent.click(edit);
    expect(
      await screen.findAllByText(
        "You’re offline. Your change saves on your phone and sends when you’re back.",
      ),
    ).not.toHaveLength(0);
  });

  it("Remove asks first (TR-07n3), then the meal goes back to not logged", async () => {
    server.items = [meal()];
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Lunch, logged" }));
    fireEvent.click(await screen.findByTestId("logged-meal-remove"));
    expect(await screen.findByText("Remove the lunch log?")).toBeTruthy();
    expect(
      screen.getByText(
        "It goes back to not logged, so you can log it again. Rahul sees that you removed it.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("remove-log-confirm-keep"));
    expect(await outbox()).toHaveLength(0);

    fireEvent.click(await screen.findByRole("button", { name: "Lunch, logged" }));
    fireEvent.click(await screen.findByTestId("logged-meal-remove"));
    fireEvent.click(await screen.findByTestId("remove-log-confirm-yes"));
    await waitFor(async () => expect((await outbox()).length).toBe(1));
    const [row] = await outbox();
    expect(row?.operation).toBe("meal.remove");
    expect(JSON.parse(row!.payloadJson)).toMatchObject({ entryId: ENTRY_ID, body: { recordVersion: 3 } });
    await waitFor(() => expect(screen.getByText("0 of 1 logged")).toBeTruthy());
  });

  it("a refused edit reverts to the server's version", async () => {
    server.items = [meal()];
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ate out" }));
    fireEvent.change(await screen.findByTestId("ate-out-kcal"), { target: { value: "900" } });
    fireEvent.click(screen.getByTestId("ate-out-save"));
    await screen.findByTestId("meal-edited-tag");
    const [row] = await outbox();
    // The server said the 24 hours had passed: the row is refused, not applied.
    await syncEngine.store.updateOutboxStatus(row!.mutationId, "rejected");
    await waitFor(() => expect(screen.queryByTestId("meal-edited-tag")).toBeNull());
  });
});
