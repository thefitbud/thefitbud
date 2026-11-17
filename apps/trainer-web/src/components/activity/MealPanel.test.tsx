/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { NUTRIENT_SCALE, type MealAssignment, type MealFoodItem } from "@fitbud/contracts";
import { formatKcal } from "@fitbud/core";
import { MealPanel } from "./MealPanel";

const PLAN_KCAL = 520;
const REL_ID = "11111111-1111-4111-8111-111111111111";

function scaledItem(name: string, kcal: number): MealFoodItem {
  return {
    snapshotKind: "calculated",
    name,
    classification: "prepared_food",
    basis: "per_100_g",
    canonical: {
      energyKcalScaled: kcal * NUTRIENT_SCALE,
      proteinScaled: NUTRIENT_SCALE,
      carbsScaled: NUTRIENT_SCALE,
      fatScaled: NUTRIENT_SCALE,
    },
    serving: {
      label: "1 serving",
      unit: "g",
      conversionScaled: 100 * NUTRIENT_SCALE,
    },
    quantityScaled: NUTRIENT_SCALE,
    calculated: {
      energyKcalScaled: kcal * NUTRIENT_SCALE,
      proteinScaled: NUTRIENT_SCALE,
      carbsScaled: NUTRIENT_SCALE,
      fatScaled: NUTRIENT_SCALE,
      partial: false,
    },
  } as MealFoodItem;
}

function assignment(items: MealFoodItem[]): MealAssignment {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    coachingRelationshipId: REL_ID,
    mealName: "Lunch",
    localDate: "2026-10-17",
    windowEndsAt: "2026-10-17T08:30:00.000Z",
    status: "modified",
    scheduleStatus: "scheduled",
    prescription: { items },
    compliance: {
      notes: "Ate out, office canteen.",
      mediaAssetId: null,
      loggedAt: "2026-10-17T08:35:00.000Z",
      loggedItems: [
        {
          name: "Rajma",
          quantity: 1,
          servingLabel: "katori",
          energyKcal: 610,
          proteinG: 24,
          carbsG: 80,
          fatG: 12,
        },
      ],
      loggedTotals: {
        energyKcal: 610,
        proteinG: 24,
        carbsG: 80,
        fatG: 12,
      },
    },
  } as MealAssignment;
}

function renderPanel(row: MealAssignment) {
  const outlet = {
    workspace: {
      header: {
        traineeDisplayName: "Rohan Mehta",
        clientWhatsappE164: "+919876543210",
      },
    },
    ended: false,
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/activity`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={outlet} />}>
          <Route path="activity" element={<MealPanel assignment={row} clientTimezone="Asia/Kolkata" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("MealPanel planned vs logged (Z12-8 / 159)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows planned and logged kcal side by side with the difference", () => {
    renderPanel(
      assignment([scaledItem("Roti", 200), scaledItem("Dal", 320)]),
    );

    expect(screen.getByRole("heading", { name: "Planned" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Logged" })).toBeTruthy();
    expect(screen.getByText(formatKcal(PLAN_KCAL))).toBeTruthy();
    expect(screen.getByText(formatKcal(610))).toBeTruthy();
    expect(screen.getByText(/\+90 kcal/)).toBeTruthy();
    expect(screen.getByText("Ate out, office canteen.")).toBeTruthy();
    expect(screen.getByText("Changed")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Message on WhatsApp/i })).toBeTruthy();
  });
});
