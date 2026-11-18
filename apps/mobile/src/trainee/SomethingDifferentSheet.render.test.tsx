import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { mealAssignmentSchema, type MealAssignment } from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));
vi.mock("../sync/SyncProvider", () => ({ useSyncEngine: () => ({}) }));
const auth = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth.current }));

const deviate = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./mealActions", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./mealActions");
  return { ...actual, deviateMealAssignment: deviate };
});

import { SomethingDifferentSheet } from "./SomethingDifferentSheet";
import { peekMealSaved, resetMealSavedNotice } from "./food/mealSavedNotice";

const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const DATE = "2026-11-13";

const assignment: MealAssignment = mealAssignmentSchema.parse({
  id: "b2222222-2222-4222-8222-222222222222",
  coachingRelationshipId: REL,
  planId: "3c1e4f2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
  planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
  mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
  mealName: "Lunch",
  localDate: DATE,
  windowStartsAt: `${DATE}T07:00:00.000Z`,
  windowEndsAt: `${DATE}T08:59:00.000Z`,
  photoRequired: false,
  status: "pending",
  scheduleStatus: "scheduled",
  prescription: {
    id: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    order: 1,
    name: "Lunch",
    scheduleHint: null,
    instructions: null,
    photoRequired: false,
    mealType: "lunch",
    items: [
      { name: "Vegetable poha", portionLabel: "1 bowl", calories: 400, proteinGrams: 20, carbsGrams: 60, fatGrams: 10 },
    ],
  },
  compliance: null,
  createdAt: `${DATE}T00:00:00.000Z`,
  updatedAt: `${DATE}T00:00:00.000Z`,
});

function renderSheet(onDone = vi.fn()) {
  render(
    <SomethingDifferentSheet
      assignment={assignment}
      relationshipId={REL}
      variant="sheet"
      onDone={onDone}
      onCancel={vi.fn()}
    />,
  );
  return onDone;
}

function expectRealHeight() {
  const sub = screen.getByTestId("something-different-subscreen");
  const px = parseFloat(sub.style.height);
  expect(Number.isFinite(px)).toBe(true);
  expect(px).toBeGreaterThan(0);
  expect(px).toBeLessThanOrEqual(520);
}

describe("SomethingDifferentSheet sheet variant sub-screens", () => {
  beforeEach(() => {
    deviate.mockClear();
    resetMealSavedNotice();
    auth.current = mockAuth();
  });

  it("lists the three ways in the v3 order (TR-08a)", () => {
    renderSheet();
    const titles = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
      .filter((label) =>
        ["Changed the portion", "Log it myself", "Ate out"].includes(label ?? ""),
      );
    expect(titles).toEqual(["Changed the portion", "Log it myself", "Ate out"]);
    expect(screen.getByText("Enter the kcal from the menu or label")).toBeTruthy();
  });

  it("Ate out takes the exact kcal, counts it and announces the save (TR-08c)", async () => {
    const onDone = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    expect(screen.getByText(/How many kcal\? Check the menu, the bill or the label\./)).toBeTruthy();
    expectRealHeight();
    fireEvent.change(screen.getByLabelText("Kcal"), { target: { value: "1120" } });
    expect((screen.getByLabelText("Kcal") as HTMLInputElement).value).toBe("1,120");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    const body = (deviate.mock.calls[0] as unknown[])[2];
    expect(body).toEqual({
      deviationKind: "restaurant",
      notes: null,
      photoIntent: null,
      items: [{ customFood: { name: "Ate out", kcal: 1120 } }],
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(peekMealSaved(REL)).toMatchObject({ mealName: "Lunch", kcal: 1120, kind: "restaurant" });
  });

  it("Ate out needs the kcal or a note", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter the kcal, or a short note about what you had.")).toBeTruthy();
    expect(deviate).not.toHaveBeenCalled();
  });

  it("Changed the portion steps by ½, shows the difference and saves (TR-08b)", async () => {
    const onDone = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Changed the portion" }));
    expect(screen.getByText("Change how much you had. Steps are ½.")).toBeTruthy();
    expectRealHeight();
    fireEvent.click(screen.getByRole("button", { name: "More Vegetable poha" }));
    expect(screen.getByLabelText("Vegetable poha: 1½ bowl")).toBeTruthy();
    expect(screen.getByText("+200 vs plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save portion" }));
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    const body = (deviate.mock.calls[0] as unknown[])[2] as { deviationKind: string; items: unknown[] };
    expect(body.deviationKind).toBe("portion_adjustment");
    expect(body.items).toEqual([
      {
        customFood: { name: "Vegetable poha", kcal: 600, servingLabel: "1½ bowl" },
        saveToMyFoods: false,
      },
    ]);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
