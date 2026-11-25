/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { MealAssignment, WorkspaceActivityItem } from "@fitbud/contracts";
import { ActivityDayGroup } from "./ActivityDayGroup";
import { ActivityRemovedRow } from "./ActivityRow";
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

const assignment = {
  id: item.id,
  mealName: "Lunch",
  status: "modified",
  prescription: { items: [] },
  compliance: { id: ENTRY, notes: null, loggedItems: [], lastEditedByRole: "trainee" },
} as unknown as MealAssignment;

describe("ActivityDayGroup (W13-8)", () => {
  afterEach(cleanup);

  it("heads the day with Today and its date, and shows the day summary beside it", () => {
    render(
      <ActivityDayGroup
        date="2026-11-14"
        today="2026-11-14"
        headerSuffix="1 of 1 meals logged"
        items={[item]}
        clientTimezone="Asia/Kolkata"
        trainerTimezone="Asia/Kolkata"
        mealAssignments={new Map([[item.id, assignment]])}
        nudgeState={{}}
        nudgingId={null}
        online
        onNudge={() => undefined}
        onView={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Today · Sat 14 Nov" })).toBeTruthy();
    expect(screen.getByText("1 of 1 meals logged")).toBeTruthy();
  });

  it("keeps the Edited tag and unread dot of an edited row, and a removed row, in the day group", () => {
    render(
      <UnreadLogEditsContext.Provider value={new Set([ENTRY])}>
        <ActivityDayGroup
          date="2026-11-14"
          headerSuffix={null}
          items={[item]}
          clientTimezone="Asia/Kolkata"
          trainerTimezone="Asia/Kolkata"
          mealAssignments={new Map([[item.id, assignment]])}
          nudgeState={{}}
          nudgingId={null}
          online
          onNudge={() => undefined}
          onView={() => undefined}
        />
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
        </ul>
      </UnreadLogEditsContext.Provider>,
    );
    const group = screen.getByTestId("activity-day-group");
    expect(within(group).getByRole("heading", { name: "Sat 14 Nov" })).toBeTruthy();
    expect(within(group).getByTestId("edited-tag").textContent).toBe("Edited");
    expect(within(group).getByTestId("edited-unread-dot").getAttribute("aria-label")).toBe("Unread");
    expect(screen.getByTestId("activity-removed-row")).toBeTruthy();
    expect(screen.getByTestId("removed-tag").textContent).toBe("Removed");
  });

  it("reads Planned with no Remind for a meal whose window has not started", () => {
    const later = {
      ...item,
      state: "pending",
      localDate: "2099-01-01",
      occurredAt: "2099-01-01T08:00:00.000Z",
    } as unknown as WorkspaceActivityItem;
    render(
      <ActivityDayGroup
        date="2099-01-01"
        headerSuffix={null}
        items={[later]}
        clientTimezone="Asia/Kolkata"
        trainerTimezone="Asia/Kolkata"
        mealAssignments={new Map()}
        nudgeState={{}}
        nudgingId={null}
        online
        onNudge={() => undefined}
        onView={() => undefined}
      />,
    );
    expect(screen.getByText("Planned")).toBeTruthy();
    expect(screen.queryByText("Not logged yet")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remind" })).toBeNull();
  });
});
