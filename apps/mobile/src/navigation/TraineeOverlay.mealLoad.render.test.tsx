import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { coachingRelationshipSchema } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";
import { localDateInTimezone } from "../lib/dates";
import { clearDayViews, dayViewKey, setCached } from "../trainee/dataCache";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));
vi.mock("../trainee/SomethingDifferentSheet", () => ({
  SomethingDifferentSheet: () => <div data-testid="sheet-ready">ready</div>,
}));

const load = vi.hoisted(() => ({
  list: null as null | (() => Promise<unknown>),
  get: null as null | (() => Promise<unknown>),
}));
const api = {
  listMealAssignments: () => load.list!(),
  getMealAssignment: () => load.get!(),
};
const auth = mockAuth({ api, me: { id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb", timezone: "Asia/Kolkata" } });
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

const { TraineeOverlayHost } = await import("./TraineeOverlay");
const MEAL_ID = "b2222222-2222-4222-8222-222222222222";

const relationship = coachingRelationshipSchema.parse({
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

function renderOverlay(
  presentation: "sheet" | "fullscreen" = "sheet",
  opened: { mealName?: string; planKcal?: number } = {},
) {
  return render(
    <TraineeOverlayHost
      overlay={{ screen: "something_different", assignmentId: MEAL_ID, ...opened }}
      relationship={relationship}
      effectivePlan={null}
      planState={{ kind: "loading" } as never}
      presentation={presentation}
      onClose={() => undefined}
      onOpen={() => undefined}
      onSignOut={() => undefined}
    />,
  );
}

describe("meal overlay while the meal loads (TR-08a2)", () => {
  it("shows the loading rows, never 'isn't available', until the answer is in", async () => {
    let resolve!: (value: unknown) => void;
    load.list = () => new Promise((r) => (resolve = r));
    load.get = async () => null;
    renderOverlay();
    expect(screen.getByTestId("meal-loading")).toBeTruthy();
    expect(screen.queryByText(/isn.t available/i)).toBeNull();
    expect(screen.queryByText(/isn.t on your plan/i)).toBeNull();
    resolve({
      items: [{ id: "b2222222-2222-4222-8222-222222222222", mealName: "Lunch", localDate: "2026-11-24" }],
      nextCursor: null,
    });
    expect(await screen.findByTestId("sheet-ready")).toBeTruthy();
    expect(screen.queryByTestId("meal-loading")).toBeNull();
  });

  it("says why only after a real not-found", async () => {
    load.list = async () => ({ items: [], nextCursor: null });
    load.get = async () => {
      throw new ApiClientError({ status: 404, code: "NOT_FOUND", message: "Not found" } as never);
    };
    renderOverlay();
    expect(screen.getByTestId("meal-loading")).toBeTruthy();
    expect(await screen.findByText("This meal isn't on your plan any more.")).toBeTruthy();
    expect(screen.queryByTestId("meal-loading")).toBeNull();
  });

  it("an offline load says so in words, with no code on screen", async () => {
    load.list = async () => {
      throw new TypeError("Network request failed");
    };
    load.get = async () => null;
    renderOverlay("fullscreen");
    await waitFor(() => expect(screen.queryByTestId("meal-loading")).toBeNull());
    expect(screen.queryByText(/TypeError|Network request failed|404/)).toBeNull();
    expect(screen.getByText(/offline|connection/i)).toBeTruthy();
  });
});

describe("meal overlay from the phone's copy (offline first)", () => {
  it("opens from the cached Diet day with no answer from the server", async () => {
    clearDayViews();
    const today = localDateInTimezone("Asia/Kolkata");
    setCached(dayViewKey("diet", relationship.id, today), {
      meals: [{ id: MEAL_ID, mealName: "Evening snack", localDate: today }],
      day: null,
    });
    load.list = async () => {
      throw new TypeError("Network request failed");
    };
    load.get = async () => null;
    renderOverlay();
    expect(await screen.findByTestId("sheet-ready")).toBeTruthy();
    // The failed refresh keeps the phone's copy.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("sheet-ready")).toBeTruthy();
    expect(screen.queryByText(/isn.t available|can.t be opened/i)).toBeNull();
    clearDayViews();
  });

  it("shows the meal and plan kcal while it loads (TR-08a2)", () => {
    clearDayViews();
    load.list = () => new Promise(() => undefined);
    load.get = async () => null;
    renderOverlay("sheet", { mealName: "Evening snack", planKcal: 220 });
    expect(screen.getByText("Evening snack \u00b7 plan 220 kcal")).toBeTruthy();
    expect(screen.getByTestId("meal-loading")).toBeTruthy();
  });

  it("with nothing cached and no connection: says so, offers Try again, promises no retry", async () => {
    clearDayViews();
    let calls = 0;
    load.list = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Network request failed");
      return { items: [{ id: MEAL_ID, mealName: "Lunch", localDate: "2026-11-24" }], nextCursor: null };
    };
    load.get = async () => null;
    renderOverlay("sheet", { mealName: "Lunch", planKcal: 610 });
    expect(await screen.findByText(/You're offline, and this meal isn't saved on your phone yet/)).toBeTruthy();
    expect(screen.queryByText(/retry when you're back/i)).toBeNull();
    expect(screen.queryByText(/isn.t available/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("sheet-ready")).toBeTruthy();
    expect(calls).toBe(2);
  });
});
