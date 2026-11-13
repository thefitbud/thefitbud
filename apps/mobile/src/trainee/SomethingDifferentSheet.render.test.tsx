import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { mealAssignmentSchema, type MealAssignment } from "@fitbud/contracts";
import { render, screen, waitFor } from "../test/render";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));
vi.mock("../sync/SyncProvider", () => ({ useSyncEngine: () => ({}) }));

const deviate = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./mealActions", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./mealActions");
  return { ...actual, deviateMealAssignment: deviate };
});

import { SomethingDifferentSheet } from "./SomethingDifferentSheet";

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
  beforeEach(() => deviate.mockClear());

  it("Ate out opens with a real height, its input and a working Save", async () => {
    const onDone = renderSheet();
    fireEvent.click(screen.getByText("Ate out"));
    expect(screen.getByText(/what did you have, and where/)).toBeTruthy();
    expect(screen.getByPlaceholderText("What did you eat?")).toBeTruthy();
    expectRealHeight();
    fireEvent.change(screen.getByPlaceholderText("What did you eat?"), {
      target: { value: "Thali at the canteen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("Changed the portion opens with a real height and a working Save", async () => {
    const onDone = renderSheet();
    fireEvent.click(screen.getByText("Changed the portion"));
    expect(screen.getByText(/set how much you had of each/)).toBeTruthy();
    expectRealHeight();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
