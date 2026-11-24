import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../../test/render";
import { MoreSheet } from "./MoreSheet";
import { NoteSheet } from "./NoteSheet";

function mountNote(onSave = vi.fn(), onDismiss = vi.fn()) {
  render(
    <NoteSheet
      visible
      traineeDisplayName="Rohan Mehta"
      onDismiss={onDismiss}
      onSave={onSave}
    />,
  );
  return { onSave, onDismiss };
}

describe("NoteSheet (TM-04k, Z14-24)", () => {
  it("shows Cancel, the title, Save, Only me by default and its consequence", () => {
    mountNote();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Note for Rohan" })).toBeTruthy();
    expect(screen.getByLabelText("Save")).toBeTruthy();
    expect(screen.getByLabelText("Only me")).toBeTruthy();
    expect(screen.getByLabelText("Rohan too")).toBeTruthy();
    expect(screen.getByText("Only you can see this note.")).toBeTruthy();
  });

  it("saves a private note by default, trimmed", () => {
    const { onSave } = mountNote();
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "  Move leg day  " },
    });
    fireEvent.click(screen.getByLabelText("Save"));
    expect(onSave).toHaveBeenCalledWith({
      body: "Move leg day",
      visibility: "private",
    });
  });

  it("maps '{first} too' to client visibility and says what happens", () => {
    const { onSave } = mountNote();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByLabelText("Rohan too"));
    expect(
      screen.getByText("Rohan sees it on Today and gets one notification."),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Save"));
    expect(onSave).toHaveBeenCalledWith({ body: "Hi", visibility: "client" });
  });

  it("does not save an empty note, and Cancel closes without asking", () => {
    const { onSave, onDismiss } = mountNote();
    fireEvent.click(screen.getByLabelText("Save"));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard this note?")).toBeNull();
  });

  it("asks before closing a typed note: Keep writing stays, Discard closes", () => {
    const { onDismiss } = mountNote();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Discard this note?")).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Keep writing"));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByText("Discard"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("tapping outside closes the same way", () => {
    const { onDismiss } = mountNote();
    fireEvent.click(screen.getByLabelText("Dismiss sheet"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("MoreSheet (TM-04j)", () => {
  it("offers Add note, WhatsApp and the profile; each closes the menu first", () => {
    const onAddNote = vi.fn();
    const onWhatsApp = vi.fn();
    const onProfile = vi.fn();
    const onDismiss = vi.fn();
    render(
      <MoreSheet
        visible
        traineeDisplayName="Rohan Mehta"
        onAddNote={onAddNote}
        onMessageOnWhatsApp={onWhatsApp}
        onOpenProfile={onProfile}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText("Private, or shared on Rohan's Today")).toBeTruthy();
    expect(screen.getByText("Opens a chat without a template")).toBeTruthy();
    fireEvent.click(screen.getByText("Add note"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onAddNote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Message on WhatsApp"));
    expect(onWhatsApp).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Open Rohan's profile"));
    expect(onProfile).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onDismiss).toHaveBeenCalledTimes(4);
  });
});
