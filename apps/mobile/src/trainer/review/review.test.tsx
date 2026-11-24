import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../../test/render";
import { ReviewActions, type ReviewActionsState } from "./ReviewActions";
import { ReviewCard, reviewCardRows } from "./ReviewCard";

function actions(
  state: ReviewActionsState,
  over: Partial<Parameters<typeof ReviewActions>[0]> = {},
) {
  const handlers = {
    onRemind: vi.fn(),
    onNoted: vi.fn(),
    onResolve: vi.fn(),
    onUndo: vi.fn(),
    onAddNote: vi.fn(),
    onWhatsApp: vi.fn(),
  };
  render(
    <ReviewActions
      state={state}
      firstName="Rohan"
      remindable
      stateLine={state === "noted" ? "Noted · still open" : null}
      testIdPrefix="t"
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

const name = (label: string) => screen.queryByRole("button", { name: label });

describe("ReviewActions", () => {
  it("open: Remind, Noted keep open, Resolve…, Add note, WhatsApp; no caption, no ⋯", () => {
    const h = actions("open");
    expect(name("Remind Rohan")).toBeTruthy();
    expect(name("Noted, keep open")).toBeTruthy();
    expect(name("Resolve…")).toBeTruthy();
    expect(name("Add note")).toBeTruthy();
    expect(name("WhatsApp")).toBeTruthy();
    expect(name("Undo")).toBeNull();
    expect(screen.queryByLabelText("More actions")).toBeNull();
    expect(screen.queryByText(/keeps .* in/i)).toBeNull();
    fireEvent.click(name("Noted, keep open")!);
    fireEvent.click(name("Resolve…")!);
    fireEvent.click(name("Remind Rohan")!);
    expect(h.onNoted).toHaveBeenCalledTimes(1);
    expect(h.onResolve).toHaveBeenCalledTimes(1);
    expect(h.onRemind).toHaveBeenCalledTimes(1);
  });

  it("open, not remindable: no Remind button", () => {
    actions("open", { remindable: false });
    expect(name("Remind Rohan")).toBeNull();
    expect(name("Noted, keep open")).toBeTruthy();
    expect(name("Resolve…")).toBeTruthy();
  });

  it("noted: state line with Undo, Remind and Resolve…, no second Noted", () => {
    const h = actions("noted");
    expect(screen.getByText("Noted · still open")).toBeTruthy();
    expect(name("Noted, keep open")).toBeNull();
    expect(name("Remind Rohan")).toBeTruthy();
    expect(name("Resolve…")).toBeTruthy();
    fireEvent.click(name("Undo")!);
    expect(h.onUndo).toHaveBeenCalledTimes(1);
  });

  it("resolved and ended are read only", () => {
    for (const state of ["resolved", "ended"] as const) {
      const view = render(
        <ReviewActions
          state={state}
          firstName="Rohan"
          remindable
          stateLine="Resolved by you"
          testIdPrefix="t"
          onRemind={vi.fn()}
          onNoted={vi.fn()}
          onResolve={vi.fn()}
          onAddNote={vi.fn()}
          onWhatsApp={vi.fn()}
        />,
      );
      for (const label of [
        "Remind Rohan",
        "Noted, keep open",
        "Resolve…",
        "Add note",
        "WhatsApp",
      ]) {
        expect(name(label)).toBeNull();
      }
      view.unmount();
    }
  });

  it("offline disables the actions that need a connection", () => {
    actions("open", { disabled: true });
    expect(name("Noted, keep open")!.getAttribute("aria-disabled")).toBe("true");
    expect(name("Resolve…")!.getAttribute("aria-disabled")).toBe("true");
    expect(name("Remind Rohan")!.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("ReviewCard", () => {
  const base = {
    title: "Missed 2 workouts",
    body: "Lower body A was planned and not logged.",
    planned: "5 exercises · 16 sets",
    logged: "Nothing logged",
    reminder: null,
    localDate: null,
    severity: "critical" as const,
    ageMinutes: 7200,
  };

  it("hides empty rows and never shows a dash", () => {
    expect(reviewCardRows(base)).toEqual([
      { label: "Planned", value: "5 exercises · 16 sets" },
    ]);
    render(<ReviewCard card={base} />);
    expect(screen.getByText("Planned")).toBeTruthy();
    expect(screen.queryByText("Logged")).toBeNull();
    expect(screen.queryByText("Reminder")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("shows Logged and Reminder when they have a value", () => {
    expect(
      reviewCardRows({
        planned: null,
        logged: "Logged 7:40 pm",
        reminder: "Sent 6:00 pm · not opened",
      }),
    ).toEqual([
      { label: "Logged", value: "Logged 7:40 pm" },
      { label: "Reminder", value: "Sent 6:00 pm · not opened" },
    ]);
  });
});
