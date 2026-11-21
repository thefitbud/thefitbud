/**
 * TM-12a/b: diet day review badges and ate-out sheet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mealAssignmentSchema } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";
import { DietDayReviewScreen } from "./DietDayReviewScreen";
import { dietMealBadge } from "./model";

const ids = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RID = ids(1);

function meal(
  over: {
    id?: string;
    name?: string;
    status?: string;
    compliance?: Record<string, unknown> | null;
    starts?: string;
  } = {},
) {
  const status = over.status ?? (over.compliance ? "confirmed" : "pending");
  return mealAssignmentSchema.parse({
    id: over.id ?? ids(10),
    coachingRelationshipId: RID,
    planId: ids(2),
    planVersionId: ids(3),
    mealPrescriptionId: ids(4),
    mealName: over.name ?? "Dinner",
    localDate: "2026-11-13",
    windowStartsAt: over.starts ?? "2026-11-13T15:00:00.000Z",
    windowEndsAt: "2026-11-13T17:00:00.000Z",
    photoRequired: false,
    status,
    prescription: {
      id: ids(4),
      order: 1,
      name: over.name ?? "Dinner",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [
        {
          name: "Paneer bhurji",
          portionLabel: "1 bowl",
          calories: 560,
          proteinGrams: 30,
          carbsGrams: 40,
          fatGrams: 20,
          calculated: {
            energyKcalScaled: 560_000,
            proteinScaled: 30_000,
            carbsScaled: 40_000,
            fatScaled: 20_000,
          },
        },
      ],
    },
    compliance: over.compliance
      ? {
          id: ids(50),
          assignmentId: over.id ?? ids(10),
          coachingRelationshipId: RID,
          planVersionId: ids(3),
          traineeUserId: ids(5),
          outcome: status === "modified" ? "modified" : "confirmed",
          recordVersion: 1,
          loggedAt: "2026-11-13T15:30:00.000Z",
          deviationKind: null,
          notes: null,
          photoRequired: false,
          photoIntent: null,
          mediaAssetId: null,
          loggedByRole: "trainee",
          lastEditedByRole: null,
          createdAt: "2026-11-13T15:30:00.000Z",
          updatedAt: "2026-11-13T15:30:00.000Z",
          ...over.compliance,
        }
      : null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  });
}

const listMealAssignments = vi.fn();
const createTrainerNote = vi.fn();
const api = { listMealAssignments, createTrainerNote };
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../whatsapp", () => ({
  openContextualWhatsApp: vi.fn(async () => true),
}));

describe("dietMealBadge", () => {
  it("maps confirmed, portion, ate-out and future windows", () => {
    expect(dietMealBadge(meal({ compliance: {} })).label).toBe("As planned");
    expect(
      dietMealBadge(
        meal({
          status: "modified",
          compliance: { deviationKind: "portion_adjustment", outcome: "modified" },
        }),
      ).label,
    ).toBe("Changed portion");
    expect(
      dietMealBadge(
        meal({
          status: "modified",
          compliance: { deviationKind: "restaurant", outcome: "modified" },
        }),
      ).label,
    ).toBe("Ate out");
    expect(
      dietMealBadge(
        meal({ starts: "2099-01-01T12:00:00.000Z" }),
        Date.parse("2026-11-13T12:00:00.000Z"),
      ).label,
    ).toBe("Not due yet");
  });
});

describe("DietDayReviewScreen TM-12", () => {
  beforeEach(() => {
    listMealAssignments.mockReset();
    createTrainerNote.mockReset();
    listMealAssignments.mockResolvedValue({
      items: [
        meal({
          id: ids(11),
          name: "Lunch",
          status: "modified",
          compliance: {
            deviationKind: "portion_adjustment",
            outcome: "modified",
            loggedTotals: {
              energyKcal: 610,
              proteinG: 28,
              carbsG: 70,
              fatG: 18,
            },
          },
        }),
        meal({
          id: ids(12),
          name: "Dinner",
          status: "modified",
          compliance: {
            deviationKind: "restaurant",
            outcome: "modified",
            notes: "Office party · biryani and gulab jamun",
            loggedTotals: {
              energyKcal: 1120,
              proteinG: null,
              carbsG: null,
              fatG: null,
            },
          },
        }),
      ],
      nextCursor: null,
    });
  });

  it("lists meals with badges and opens the ate-out sheet", async () => {
    render(
      <DietDayReviewScreen
        relationshipId={RID}
        displayName="Priya Nair"
        clientZone="Asia/Kolkata"
        initialDate="2026-11-13"
        onBack={() => {}}
      />,
    );
    await screen.findByText(/Meals · 2 of 2 logged/i);
    expect(screen.getByText("Changed portion")).toBeTruthy();
    expect(screen.getByText("Ate out")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Dinner, Ate out/ }));
    await waitFor(() => screen.getByText(/Priya · Dinner/));
    expect(screen.getByText(/Office party/)).toBeTruthy();
    expect(screen.getByText(/1,120 kcal only|1120 kcal only/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add note" })).toBeTruthy();
  });
});
