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

describe("ResolveSheet", () => {
  it("shows the frame 33 title, subtitle and lock line", () => {
    render(
      <ResolveSheet
        visible
        detail={detail}
        traineeDisplayName="Meera Iyer"
        onDismiss={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("Resolve this item?")).toBeTruthy();
    expect(
      screen.getByText(/Lunch not logged · Thu 15 Oct · Meera Iyer/),
    ).toBeTruthy();
    expect(screen.getByText(resolveLockLine("Meera Iyer"))).toBeTruthy();
  });

  it("confirms with the chosen outcome and trimmed note", () => {
    const onConfirm = vi.fn();
    render(
      <ResolveSheet
        visible
        detail={detail}
        traineeDisplayName="Meera Iyer"
        onDismiss={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Talked to client"));
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "  Office lunch  " },
    });
    fireEvent.click(screen.getByText("Resolve"));
    expect(onConfirm).toHaveBeenCalledWith({
      outcome: "talked",
      note: "Office lunch",
    });
  });

  it("confirms with no outcome and no note when nothing is entered", () => {
    const onConfirm = vi.fn();
    render(
      <ResolveSheet
        visible
        detail={detail}
        traineeDisplayName="Meera Iyer"
        onDismiss={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Resolve"));
    expect(onConfirm).toHaveBeenCalledWith({ outcome: null, note: null });
  });

  it("deselects an outcome chip on a second press", () => {
    const onConfirm = vi.fn();
    render(
      <ResolveSheet
        visible
        detail={detail}
        traineeDisplayName="Meera Iyer"
        onDismiss={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Plan adjusted"));
    fireEvent.click(screen.getByText("Plan adjusted"));
    fireEvent.click(screen.getByText("Resolve"));
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
      "Missed workout · Tue 13 Oct · Rohan Mehta",
    );
    const draft = nudgeDraftText(workout, "Rohan Mehta");
    expect(draft).toBe(
      "Hi Rohan, quick reminder about Lower body A from Tue 13 Oct. Log it when you can, or tell me if this week needs a change.",
    );
    expect(draft.toLowerCase()).not.toContain("sent");
  });
});
