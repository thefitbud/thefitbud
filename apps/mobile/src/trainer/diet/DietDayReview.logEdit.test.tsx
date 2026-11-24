/**
 * Z14-16 (D-W14-23 g): the diet day opens on the entry a client changed, shows
 * the neutral Edited tag and the "Edited by / Was" lines (TM-09f).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mealAssignmentSchema } from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../../test/render";
import { DietDayReviewScreen } from "./DietDayReviewScreen";

const ids = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RID = ids(1);
const ENTRY = ids(50);

function meal(id: string, name: string, compliance: Record<string, unknown> | null) {
  return mealAssignmentSchema.parse({
    id,
    coachingRelationshipId: RID,
    planId: ids(2),
    planVersionId: ids(3),
    mealPrescriptionId: ids(4),
    mealName: name,
    localDate: "2026-11-14",
    windowStartsAt: "2026-11-14T06:00:00.000Z",
    windowEndsAt: "2026-11-14T08:00:00.000Z",
    photoRequired: false,
    status: compliance ? "modified" : "pending",
    prescription: {
      id: ids(4),
      order: 1,
      name,
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [
        {
          name: "Roti",
          portionLabel: "3 pc",
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
    compliance: compliance
      ? {
          id: ENTRY,
          assignmentId: id,
          coachingRelationshipId: RID,
          planVersionId: ids(3),
          traineeUserId: ids(5),
          outcome: "modified",
          recordVersion: 2,
          loggedAt: "2026-11-14T07:00:00.000Z",
          deviationKind: "portion_adjustment",
          notes: null,
          photoRequired: false,
          photoIntent: null,
          mediaAssetId: null,
          loggedByRole: "trainee",
          lastEditedByRole: "trainee",
          lastEditedAt: "2026-11-14T08:35:00.000Z",
          previousValue: { outcome: "confirmed", deviationKind: null, notes: null, kcal: 610 },
          createdAt: "2026-11-14T07:00:00.000Z",
          updatedAt: "2026-11-14T08:35:00.000Z",
          loggedTotals: { energyKcal: 690, proteinG: 28, carbsG: 70, fatG: 18 },
          ...compliance,
        }
      : null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  });
}

const listMealAssignments = vi.fn();
const api = { listMealAssignments, createTrainerNote: vi.fn() };
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../whatsapp", () => ({ openContextualWhatsApp: vi.fn(async () => true) }));

function renderDay(props: { initialEntryId?: string | null } = {}) {
  return render(
    <DietDayReviewScreen
      relationshipId={RID}
      displayName="Aarav Mehta"
      clientZone="Asia/Kolkata"
      initialDate="2026-11-14"
      onBack={() => {}}
      {...props}
    />,
  );
}

describe("DietDayReviewScreen client edits (Z14-16)", () => {
  beforeEach(() => {
    listMealAssignments.mockReset();
    listMealAssignments.mockResolvedValue({
      items: [meal(ids(11), "Lunch", {}), meal(ids(12), "Dinner", null)],
      nextCursor: null,
    });
  });

  it("tags the client-edited meal and no other", async () => {
    renderDay();
    await screen.findByText(/Meals · 1 of 2 logged/i);
    expect(screen.getAllByTestId("diet-meal-edited-tag")).toHaveLength(1);
  });

  it("opens the meal sheet on the entry, with who edited it and what it was before", async () => {
    renderDay({ initialEntryId: ENTRY });
    await waitFor(() => screen.getByTestId("diet-sheet-client-edit"));
    expect(screen.getByText("Edited by Aarav · Sat 14 Nov, 2:05 pm")).toBeTruthy();
    expect(screen.getByText("Was 610 kcal · as planned")).toBeTruthy();
  });

  it("opens the day with nothing selected when the entry is gone (a removal)", async () => {
    renderDay({ initialEntryId: ids(99) });
    await screen.findByText(/Meals · 1 of 2 logged/i);
    expect(screen.queryByTestId("diet-sheet-client-edit")).toBeNull();
  });
});
