/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { MealAssignment, WorkspaceActivityItem } from "@fitbud/contracts";
import { ActivityRemovedRow, ActivityRow } from "./ActivityRow";
import { UnreadLogEditsContext } from "./unreadLogEdits";

const ENTRY = "33333333-3333-4333-8333-333333333333";

const item = {
  id: "22222222-2222-4222-8222-222222222222",
  type: "meal",
  state: "modified",
  title: "Lunch",
  localDate: "2026-11-14",
  occurredAt: "2026-11-14T08:00:00.000Z",
} as unknown as WorkspaceActivityItem;

function assignment(patch: Record<string, unknown>): MealAssignment {
  return {
    id: item.id,
    mealName: "Lunch",
    status: "modified",
    prescription: { items: [] },
    compliance: { id: ENTRY, notes: null, loggedItems: [], ...patch },
  } as unknown as MealAssignment;
}

function renderRow(row: MealAssignment, unread: string[] = []) {
  return render(
    <UnreadLogEditsContext.Provider value={new Set(unread)}>
      <ul>
        <ActivityRow
          item={item}
          clientTimezone="Asia/Kolkata"
          trainerTimezone="Asia/Kolkata"
          mealAssignment={row}
          online
          onNudge={() => undefined}
          onView={() => undefined}
        />
      </ul>
    </UnreadLogEditsContext.Provider>,
  );
}

describe("Activity rows for client log edits (Z14-16, TM-09e)", () => {
  afterEach(cleanup);

  it("tags a client edit with Edited and an unread dot while unread", () => {
    renderRow(assignment({ lastEditedByRole: "trainee" }), [ENTRY]);
    expect(screen.getByTestId("edited-tag").textContent).toBe("Edited");
    expect(screen.getByTestId("edited-unread-dot")).toBeTruthy();
  });

  it("drops the dot once read, and shows no tag for an unedited entry or a coach edit", () => {
    renderRow(assignment({ lastEditedByRole: "trainee" }));
    expect(screen.getByTestId("edited-tag")).toBeTruthy();
    expect(screen.queryByTestId("edited-unread-dot")).toBeNull();
    cleanup();
    renderRow(assignment({ lastEditedByRole: null }), [ENTRY]);
    expect(screen.queryByTestId("edited-tag")).toBeNull();
    cleanup();
    renderRow(assignment({ lastEditedByRole: "coach" }), [ENTRY]);
    expect(screen.queryByTestId("edited-tag")).toBeNull();
  });

  it("writes the removal row with a Removed tag", () => {
    render(
      <ul>
        <ActivityRemovedRow
          clientName="Priya Nair"
          summary="Removed the dinner log"
          mealDate="2026-11-13"
          previousKcal={1120}
          occurredAt="2026-11-14T07:00:00.000Z"
          clientTimezone="Asia/Kolkata"
          trainerTimezone="Asia/Kolkata"
        />
      </ul>,
    );
    expect(screen.getByText(/Priya removed their dinner log \(Fri 13 Nov\) · was 1,120 kcal/)).toBeTruthy();
    expect(screen.getByTestId("removed-tag").textContent).toBe("Removed");
  });
});
