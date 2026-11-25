/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const REL_ID = "c422296e-ed7b-4196-a2b4-647096af3002";
const NOTE_A = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  coachingRelationshipId: REL_ID,
  trainerUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  checkinId: null,
  body: "Knee felt sore on walking lunges. Swapped to step-ups until the next check-in.",
  visibility: "private" as const,
  subjectType: null,
  subjectId: null,
  sharedAt: null,
  seenAt: null,
  createdAt: "2026-10-13T10:00:00.000Z",
  updatedAt: "2026-10-13T10:00:00.000Z",
};
const NOTE_B = {
  ...NOTE_A,
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  body: "Breakfasts were spot on last week.",
  visibility: "client" as const,
  createdAt: "2026-10-12T10:00:00.000Z",
  updatedAt: "2026-10-12T10:00:00.000Z",
};

const api = vi.hoisted(() => ({
  listTrainerNotes: vi.fn(),
  createTrainerNote: vi.fn(),
  deleteTrainerNote: vi.fn(),
  getEffectivePlan: vi.fn(),
}));

const stage1 = vi.hoisted(() => ({
  patchTrainerNote: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../lib/stage1-api", () => ({ stage1Api: stage1 }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: {
      timezone: "Asia/Kolkata",
      trainerProfile: { displayName: "Rahul Verma" },
    },
  }),
}));

import { NoteComposer } from "./NoteComposer";

beforeEach(() => {
  api.listTrainerNotes.mockResolvedValue({ items: [NOTE_A, NOTE_B] });
  api.getEffectivePlan.mockResolvedValue({
    plan: { id: "plan-1", title: "Fat loss, phase 2" },
    version: { id: "ver-1" },
  });
  api.createTrainerNote.mockResolvedValue({ ...NOTE_A, id: "new-note" });
  api.deleteTrainerNote.mockResolvedValue({ id: NOTE_A.id, deleted: true });
  stage1.patchTrainerNote.mockResolvedValue(NOTE_A);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NoteComposer wording (D-W14-37)", () => {
  it.each(["female", "male", undefined])("shows Rohan, never a pronoun, for gender %s", async (gender) => {
    render(<NoteComposer relationshipId={REL_ID} traineeName="Rohan Mehta" traineeGender={gender} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Rohan too" }));
    expect(screen.getByText("Rohan sees it on Today and gets one notification.")).toBeTruthy();
    expect(screen.getByText("Rohan will see this on Today.")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/\b(he|she|his|her|hers|him)\b/i);
  });
});

describe("NoteComposer (frames 188 / 189)", () => {
  it("shows About select, Visible switch, Earlier notes, and of-counter", async () => {
    render(
      <NoteComposer
        relationshipId={REL_ID}
        traineeName="Rohan Mehta"
        traineeGender="male"
      />,
    );

    expect(await screen.findByText("About · optional")).toBeTruthy();
    expect(
      await screen.findByRole("option", {
        name: /Workout plan · Fat loss, phase 2/,
      }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("radiogroup", { name: /who can see this note/i }),
    ).toBeTruthy();
    const onlyMe = screen.getByRole("radio", { name: "Only me" });
    const withClient = screen.getByRole("radio", { name: "Rohan too" });
    expect((onlyMe as HTMLInputElement).checked).toBe(true);
    expect((withClient as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("Only you can see this note.")).toBeTruthy();
    fireEvent.click(withClient);
    expect(
      screen.getByText("Rohan sees it on Today and gets one notification."),
    ).toBeTruthy();
    fireEvent.click(onlyMe);
    expect(screen.getByText("Only you can see this note.")).toBeTruthy();
    expect(screen.getByText(/Earlier notes/i)).toBeTruthy();
    expect(screen.getByText(NOTE_A.body)).toBeTruthy();
    expect(screen.getByText(/0 of 1,000|0 of 1000/)).toBeTruthy();
  });

  it("delete confirm quotes the note and uses You can't undo this", async () => {
    render(
      <NoteComposer
        relationshipId={REL_ID}
        traineeName="Rohan Mehta"
        traineeGender="male"
      />,
    );
    await screen.findByText(NOTE_A.body);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[0]!);
    expect(await screen.findByText("Delete this note?")).toBeTruthy();
    expect(
      screen.getByText(/will be deleted\. You can't undo this/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await waitFor(() =>
      expect(api.deleteTrainerNote).toHaveBeenCalledWith(REL_ID, NOTE_A.id),
    );
  });

  it("saves privately by default", async () => {
    const onSaved = vi.fn();
    render(
      <NoteComposer
        relationshipId={REL_ID}
        traineeName="Rohan Mehta"
        traineeGender="male"
        onSaved={onSaved}
      />,
    );
    await screen.findByText("About · optional");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Move Tuesday session" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Saved privately"));
    expect(api.createTrainerNote).toHaveBeenCalled();
    const body = api.createTrainerNote.mock.calls[0]?.[1];
    expect(body.visibility).toBe("private");
  });
});
