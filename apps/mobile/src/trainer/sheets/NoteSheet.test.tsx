import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../../test/render";
import { MoreSheet } from "./MoreSheet";
import { NoteSheet } from "./NoteSheet";
import { noteCounterLabel } from "./exceptionSheetContent";

describe("NoteSheet", () => {
  it("shows the frame 36 title, counter, visible toggle and preview chip", () => {
    render(
      <NoteSheet
        visible
        traineeDisplayName="Rohan Mehta"
        trainerDisplayName="Rahul Sharma"
        onDismiss={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByText("Note about Rohan")).toBeTruthy();
    expect(screen.getByText("Private unless you share it")).toBeTruthy();
    expect(screen.getByText(noteCounterLabel(0))).toBeTruthy();
    expect(screen.getByText("Visible to Rohan")).toBeTruthy();
    expect(screen.getByText(/Rohan will see this on their Today screen/)).toBeTruthy();
    expect(screen.getByText("From Rahul · just now")).toBeTruthy();
  });

  it("saves a shared note by default with the trimmed body", () => {
    const onSave = vi.fn();
    render(
      <NoteSheet
        visible
        traineeDisplayName="Rohan Mehta"
        onDismiss={() => {}}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "  Move leg day  " },
    });
    fireEvent.click(screen.getByText("Save note"));
    expect(onSave).toHaveBeenCalledWith({
      body: "Move leg day",
      visibility: "client",
    });
  });

  it("saves a private note when the toggle is off", () => {
    const onSave = vi.fn();
    render(
      <NoteSheet
        visible
        traineeDisplayName="Rohan Mehta"
        onDismiss={() => {}}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByLabelText("Visible to Rohan"));
    expect(screen.queryByText(/just now/)).toBeNull();
    fireEvent.click(screen.getByText("Save note"));
    expect(onSave).toHaveBeenCalledWith({ body: "Hi", visibility: "private" });
  });

  it("does not save an empty note", () => {
    const onSave = vi.fn();
    render(
      <NoteSheet
        visible
        traineeDisplayName="Rohan Mehta"
        onDismiss={() => {}}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Save note"));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("MoreSheet", () => {
  const detail = {
    type: "missed_workout" as const,
    details: { localDate: "2026-10-13", workoutDayName: "Lower body A" },
  };

  it("offers Add note, Message on WhatsApp and Cancel", () => {
    const onAddNote = vi.fn();
    const onWhatsApp = vi.fn();
    const onDismiss = vi.fn();
    render(
      <MoreSheet
        visible
        detail={detail}
        traineeDisplayName="Rohan Mehta"
        onAddNote={onAddNote}
        onMessageOnWhatsApp={onWhatsApp}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText("Rohan Mehta")).toBeTruthy();
    expect(
      screen.getByText("Missed workout · Lower body A · Tue 13 Oct"),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Add note"));
    fireEvent.click(screen.getByText("Message on WhatsApp"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onAddNote).toHaveBeenCalledTimes(1);
    expect(onWhatsApp).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
