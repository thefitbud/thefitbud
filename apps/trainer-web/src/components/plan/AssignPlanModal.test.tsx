/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlanContent } from "@fitbud/contracts";
import { formatLocalDate, nextCalendarWeekRange } from "@fitbud/core";

const api = vi.hoisted(() => ({
  assignPlanVersion: vi.fn(),
  listMealAssignments: vi.fn(),
}));

vi.mock("../../lib/stage1-api", () => ({
  stage1Api: {
    assignPlanVersion: api.assignPlanVersion,
    listMealAssignments: api.listMealAssignments,
  },
}));

import { AssignPlanModal } from "./AssignPlanModal";

const content: PlanContent = {
  workoutDays: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      order: 1,
      name: "Push",
      weekday: 1,
      required: true,
      exercises: [],
    },
  ],
  mealPrescriptions: [],
};

function modal(onClose: () => void, over: Partial<Parameters<typeof AssignPlanModal>[0]> = {}) {
  return (
    <AssignPlanModal
      relationshipId="22222222-2222-4222-8222-222222222222"
      planId="33333333-3333-4333-8333-333333333333"
      versionId="44444444-4444-4444-8444-444444444444"
      content={content}
      planTitle="Marathon strength"
      traineeName="Rohan Mehta"
      traineeTimezone="Asia/Kolkata"
      activePlan={null}
      issues={{ blocking: [], notes: [] }}
      onClose={onClose}
      onAssigned={() => undefined}
      {...over}
    />
  );
}

describe("AssignPlanModal (Z12-10 / frame 155)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Wed 15 Oct 2026, 10:00 IST → next Monday is 19 Oct.
    vi.setSystemTime(new Date("2026-10-15T04:30:00.000Z"));
    api.assignPlanVersion.mockResolvedValue({
      dates: [],
      replaced: { workouts: 0, meals: 0 },
      created: { workouts: 0, meals: 0 },
    });
    api.listMealAssignments.mockResolvedValue({ items: [], nextCursor: null });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("focuses the dialog when it opens", () => {
    render(modal(() => undefined));
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("shows Publish & schedule with Start Mon / today / pick and Ends", () => {
    render(modal(() => undefined));
    expect(screen.getByRole("heading", { name: "Publish & schedule" })).toBeTruthy();
    expect(screen.getByText(/Marathon strength · Workout plan for Rohan Mehta/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Start Mon 19 Oct/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Start today/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Pick a date/ })).toBeTruthy();
    expect(screen.getByTestId("assign-ends").textContent).toMatch(/After 8 weeks · Sun 13 Dec/);
    expect(screen.queryByLabelText("Effective from")).toBeNull();
    expect(screen.queryByText("Ongoing")).toBeNull();
  });

  it("shows a civil date field when Pick a date is selected", () => {
    render(modal(() => undefined));
    fireEvent.click(screen.getByRole("radio", { name: /Pick a date/ }));
    const input = document.querySelector("#assign-pick-date") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute("type")).toBe("date");
    // Visible label is civil, never the raw ISO value alone.
    expect(screen.getByText("Choose a date")).toBeTruthy();
    fireEvent.change(input, { target: { value: "2026-10-20" } });
    expect(screen.getByText("Tue 20 Oct")).toBeTruthy();
  });

  it("keeps focus in the pick-date field when the parent re-renders with a new onClose", async () => {
    const { rerender } = render(modal(() => undefined));
    fireEvent.click(screen.getByRole("radio", { name: /Pick a date/ }));
    const input = document.querySelector("#assign-pick-date") as HTMLInputElement;
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "2026-10-20" } });
    expect(document.activeElement).toBe(input);

    for (let i = 0; i < 3; i += 1) {
      rerender(modal(() => undefined));
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(input);
    }
    expect(input.value).toBe("2026-10-20");
  });

  it("calls the latest onClose on Escape", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(modal(first));
    rerender(modal(latest));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("publishes with next Monday as effectiveFrom by default", async () => {
    const onAssigned = vi.fn();
    render(modal(() => undefined, { onAssigned }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.assignPlanVersion).toHaveBeenCalled();
    const body = api.assignPlanVersion.mock.calls[0]![2] as {
      effectiveFrom: string;
      windowFrom: string;
    };
    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    expect(body.windowFrom).toBe(nextCalendarWeekRange(today).fromDate);
    expect(onAssigned).toHaveBeenCalled();
  });

  it("opens diet scope as Apply this change to… when nutritionOnly", async () => {
    const nutrition: PlanContent = {
      workoutDays: [],
      mealPrescriptions: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          order: 1,
          name: "Lunch",
          mealType: null,
          applicableWeekdays: [1, 2, 3, 4, 5],
          localTime: "13:30",
          required: true,
          scheduleHint: null,
          instructions: null,
          photoRequired: false,
          items: [],
        },
      ],
    };
    render(
      modal(() => undefined, {
        content: nutrition,
        nutritionOnly: true,
        planTitle: "PCOS-friendly",
      }),
    );
    expect(screen.getByRole("heading", { name: "Apply this change to…" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /From today/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Today only/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply change" })).toBeTruthy();
  });
});
