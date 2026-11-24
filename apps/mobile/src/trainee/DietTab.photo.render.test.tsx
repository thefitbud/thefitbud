import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
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

function meal(opts: {
  logged: boolean;
  photoRequired?: boolean;
  editableUntil?: string | null;
  mediaAssetId?: string | null;
}): MealAssignment {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  return mealAssignmentSchema.parse({
    id: MEAL_ID,
    coachingRelationshipId: REL,
    planId: "3c1e4f2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
    planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
    mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    mealName: "Evening snack",
    localDate: DATE,
    windowStartsAt: iso(now - 30 * 60_000),
    windowEndsAt: iso(now + 30 * 60_000),
    photoRequired: opts.photoRequired ?? false,
    status: opts.logged ? "confirmed" : "pending",
    scheduleStatus: "scheduled",
    prescription: {
      id: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
      order: 1,
      name: "Evening snack",
      localTime: "17:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: opts.photoRequired ?? false,
      items: [],
    },
    compliance: opts.logged
      ? {
          id: ENTRY_ID,
          assignmentId: MEAL_ID,
          coachingRelationshipId: REL,
          planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
          traineeUserId: USER,
          outcome: "confirmed",
          recordVersion: 1,
          loggedAt: iso(now - 60_000),
          deviationKind: null,
          notes: null,
          photoRequired: opts.photoRequired ?? false,
          photoIntent: null,
          mediaAssetId: opts.mediaAssetId ?? null,
          editableUntil:
            opts.editableUntil === undefined ? iso(now + 23 * 3_600_000) : opts.editableUntil,
          createdAt: iso(now - 60_000),
          updatedAt: iso(now - 60_000),
        }
      : null,
    createdAt: `${DATE}T00:00:00.000Z`,
    updatedAt: `${DATE}T00:00:00.000Z`,
  });
}

const server = vi.hoisted(() => ({ items: [] as MealAssignment[] }));

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

const photo = vi.hoisted(() => ({
  pick: vi.fn(),
  prepare: vi.fn(),
  send: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("./mealActions", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./mealActions");
  return {
    ...actual,
    pickMealPhoto: photo.pick,
    prepareMealPhoto: photo.prepare,
    uploadAndAttachMealPhoto: photo.send,
    confirmMealAssignment: photo.confirm,
  };
});

const { DietTab } = await import("./DietTab");
const { MealPhotoError } = await import("./mealActions");

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
      onOpenOverlay={() => undefined}
    />,
  );
}

beforeEach(() => {
  clearDayViews();
  photo.pick.mockReset();
  photo.prepare.mockReset();
  photo.send.mockReset();
  photo.confirm.mockReset();
  photo.pick.mockResolvedValue({ uri: "file:///cache/p.jpg", width: 4032, height: 3024 });
  photo.prepare.mockResolvedValue({ uri: "file:///cache/p-small.jpg", bytes: new Uint8Array([1, 2]) });
  photo.send.mockResolvedValue({ mediaAssetId: "00000000-0000-4000-8000-0000000000d1" });
});

describe("DietTab meal actions (TR-07a2 / TR-07a3)", () => {
  it("shows both labels in full, with no line clamp", async () => {
    server.items = [meal({ logged: false })];
    renderDiet();
    const eaten = await screen.findByText("Eaten as planned");
    const different = await screen.findByText("Something different");
    for (const el of [eaten, different]) {
      // numberOfLines={1} renders as a text-overflow ellipsis class on web.
      expect(el.className).not.toMatch(/textOverflow|lineClamp/);
    }
  });
});

describe("DietTab meal photo (D-W14-11, D-W14-19)", () => {
  it("opens the photo sheet after the log only when the plan asks for a photo", async () => {
    server.items = [meal({ logged: false, photoRequired: true })];
    photo.confirm.mockImplementation(async () => {
      server.items = [meal({ logged: true, photoRequired: true })];
    });
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Eaten as planned" }));
    expect(await screen.findByText("Rahul asks for a photo of this meal.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose from gallery" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByTestId("meal-photo-sheet")).toBeNull());
    expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
  });

  it("asks nothing when the plan does not want a photo, and offers Add photo", async () => {
    server.items = [meal({ logged: false, photoRequired: false })];
    photo.confirm.mockImplementation(async () => {
      server.items = [meal({ logged: true, photoRequired: false })];
    });
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Eaten as planned" }));
    expect(await screen.findByRole("button", { name: "Add photo" })).toBeTruthy();
    expect(screen.queryByTestId("meal-photo-sheet")).toBeNull();
    expect(screen.queryByText(/asks for a photo/)).toBeNull();
  });

  it("Add photo opens the same choice without the prompt text, then uploads and attaches", async () => {
    server.items = [meal({ logged: true })];
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Add photo" }));
    expect(screen.getByTestId("meal-photo-sheet")).toBeTruthy();
    expect(screen.queryByText(/asks for a photo/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose from gallery" }));
    await waitFor(() => expect(photo.send).toHaveBeenCalledTimes(1));
    expect(photo.pick).toHaveBeenCalledWith("gallery");
    const input = photo.send.mock.calls[0]?.[1] as { entryId: string; assignmentId: string };
    expect(input.entryId).toBe(ENTRY_ID);
    expect(input.assignmentId).toBe(MEAL_ID);
    expect(await screen.findByText("Photo added for Rahul")).toBeTruthy();
  });

  it("a failed upload says so, keeps the meal logged and offers Try again and Remove photo", async () => {
    server.items = [meal({ logged: true })];
    photo.send
      .mockRejectedValueOnce(
        new MealPhotoError("upload", "Photo didn't upload. Your meal is still logged."),
      )
      .mockResolvedValueOnce({ mediaAssetId: "00000000-0000-4000-8000-0000000000d1" });
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Add photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(await screen.findByText("Photo didn't upload. Your meal is still logged.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Photo added for Rahul")).toBeTruthy();
    expect(photo.send).toHaveBeenCalledTimes(2);
    // Both tries carry the same idempotency key.
    const keys = photo.send.mock.calls.map((c) => (c[1] as { attachKey: string }).attachKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("Remove photo drops the failed attempt and brings Add photo back", async () => {
    server.items = [meal({ logged: true })];
    photo.send.mockRejectedValueOnce(new MealPhotoError("upload", "Photo didn't upload. Your meal is still logged."));
    renderDiet();
    fireEvent.click(await screen.findByRole("button", { name: "Add photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose from gallery" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove photo" }));
    expect(await screen.findByRole("button", { name: "Add photo" })).toBeTruthy();
  });

  it("offers no Add photo once the 24 hour window has closed", async () => {
    server.items = [meal({ logged: true, editableUntil: null })];
    renderDiet();
    await waitFor(() => expect(screen.getByText("1 of 1 logged")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Add photo" })).toBeNull();
  });
});

describe("DietTab bell (TR-15a)", () => {
  it("uses the shared bell with the ringed unread dot", async () => {
    server.items = [meal({ logged: true })];
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
        unreadNotifications={3}
      />,
    );
    expect(await screen.findByRole("button", { name: "Notifications, 3 unread" })).toBeTruthy();
    expect(screen.getByTestId("bell-unread-dot")).toBeTruthy();
  });
});
