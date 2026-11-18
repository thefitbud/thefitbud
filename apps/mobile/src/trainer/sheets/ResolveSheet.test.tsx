import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../../test/render";
import { ResolveSheet } from "./ResolveSheet";
import {
  nudgeDraftText,
  resolveLockLine,
  resolveSheetSubtitle,
} from "./exceptionSheetContent";

const detail = {
  type: "overdue_meal" as const,
  details: { localDate: "2026-10-15", mealName: "Lunch" },
};

function mount(onConfirm = vi.fn()) {
  render(
    <ResolveSheet
      visible
      detail={detail}
      traineeDisplayName="Meera Iyer"
      onDismiss={() => {}}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("ResolveSheet (TM-04d)", () => {
  it("shows the title, subtitle, outcome chips, private note and lock helper", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Resolve" })).toBeTruthy();
    expect(screen.getByText("Lunch not logged · Thu 15 Oct · Meera")).toBeTruthy();
    expect(screen.getByText("Outcome")).toBeTruthy();
    expect(screen.getByText("Talked to Meera")).toBeTruthy();
    expect(screen.getByText("Plan adjusted")).toBeTruthy();
    expect(screen.getByText("No action needed")).toBeTruthy();
    expect(screen.getByText("Note (only you)")).toBeTruthy();
    expect(screen.getByText(resolveLockLine("Meera Iyer"))).toBeTruthy();
    expect(resolveLockLine("Meera Iyer")).toBe(
      "Resolving locks this item, so Meera can't log it late any more.",
    );
  });

  it("sends the trainer's chosen outcome and trimmed note", () => {
    const onConfirm = mount();
    fireEvent.click(screen.getByText("Talked to Meera"));
    fireEvent.change(screen.getByLabelText("Note (only you)"), {
      target: { value: "  Office lunch  " },
    });
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({
      outcome: "talked",
      note: "Office lunch",
    });
  });

  it("confirms with no outcome and no note when nothing is entered", () => {
    const onConfirm = mount();
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({ outcome: null, note: null });
  });

  it("deselects an outcome chip on a second press", () => {
    const onConfirm = mount();
    fireEvent.click(screen.getByText("Plan adjusted"));
    fireEvent.click(screen.getByText("Plan adjusted"));
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({ outcome: null, note: null });
  });
});

describe("exception sheet copy", () => {
  it("builds the workout subtitle and never says sent", () => {
    const workout = {
      type: "missed_workout" as const,
      details: { localDate: "2026-10-13", workoutDayName: "Lower body A" },
    };
    expect(resolveSheetSubtitle(workout, "Rohan Mehta")).toBe(
      "Missed workout · Tue 13 Oct · Rohan",
    );
    const draft = nudgeDraftText(workout, "Rohan Mehta");
    expect(draft).toBe(
      "Hi Rohan, quick reminder about Lower body A from Tue 13 Oct. Log it when you can, or tell me if this week needs a change.",
    );
    expect(draft.toLowerCase()).not.toContain("sent");
  });
});
