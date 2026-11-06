/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlanContent } from "@fitbud/contracts";

const api = vi.hoisted(() => ({
  assignPlanVersion: vi.fn(),
}));

vi.mock("../../lib/stage1-api", () => ({
  stage1Api: {
    assignPlanVersion: api.assignPlanVersion,
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

const START_DATE = "2099-01-15";

function modal(onClose: () => void) {
  return (
    <AssignPlanModal
      relationshipId="22222222-2222-4222-8222-222222222222"
      planId="33333333-3333-4333-8333-333333333333"
      versionId="44444444-4444-4444-8444-444444444444"
      content={content}
      traineeName="Rohan Mehta"
      traineeTimezone="Asia/Kolkata"
      activePlan={null}
      issues={{ blocking: [], notes: [] }}
      onClose={onClose}
      onAssigned={() => undefined}
    />
  );
}

function startDateInput(): HTMLInputElement {
  return screen.getByLabelText("Effective from") as HTMLInputElement;
}

describe("AssignPlanModal focus (AP1)", () => {
  beforeEach(() => {
    api.assignPlanVersion.mockResolvedValue({
      dates: [],
      replaced: { workouts: 0, meals: 0 },
      created: { workouts: 0, meals: 0 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("focuses the dialog when it opens", () => {
    render(modal(() => undefined));
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("keeps focus in the start date when the parent re-renders with a new onClose", async () => {
    const { rerender } = render(modal(() => undefined));
    const input = startDateInput();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: START_DATE } });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe(START_DATE);

    // A parent re-render (poll, workspace refresh) passes a fresh onClose.
    for (let i = 0; i < 3; i += 1) {
      rerender(modal(() => undefined));
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(input);
    }
    expect(input.value).toBe(START_DATE);
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
});
