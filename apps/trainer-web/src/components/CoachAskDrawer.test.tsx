/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CoachAsk } from "@fitbud/contracts";

const ASK_ID = "11111111-1111-4111-8111-111111111111";
const REL_ID = "22222222-2222-4222-8222-222222222222";

const api = vi.hoisted(() => ({
  listCoachAsks: vi.fn(),
  answerCoachAsk: vi.fn(),
  getClientWorkspace: vi.fn(),
}));

vi.mock("../lib/stage1-api", () => ({
  stage1Api: {
    listCoachAsks: api.listCoachAsks,
    answerCoachAsk: api.answerCoachAsk,
  },
}));
vi.mock("../lib/api", () => ({
  apiClient: { getClientWorkspace: api.getClientWorkspace },
}));

import { CoachAskDrawer } from "./CoachAskDrawer";

const openAsk: CoachAsk = {
  id: ASK_ID,
  relationshipId: REL_ID,
  itemType: "meal_assignment",
  itemId: "33333333-3333-4333-8333-333333333333",
  topic: "swap",
  status: "open",
  askCount: 1,
  askedAt: "2026-10-22T08:00:00.000Z",
  lastAskedAt: "2026-10-22T08:00:00.000Z",
  itemLabel: "Lunch",
  itemDate: "2026-10-22",
};

async function renderDrawer(onClose: () => void) {
  const utils = render(
    <CoachAskDrawer askId={ASK_ID} clientName="Rohan" onClose={onClose} />,
  );
  // Wait for the ask to load and the note field to appear.
  const note = await screen.findByRole("textbox");
  return { ...utils, note: note as HTMLTextAreaElement };
}

describe("CoachAskDrawer focus (HM1)", () => {
  beforeEach(() => {
    api.listCoachAsks.mockResolvedValue({ items: [openAsk] });
    api.answerCoachAsk.mockResolvedValue({});
    api.getClientWorkspace.mockResolvedValue({
      header: { traineeDisplayName: "Rohan Mehta", clientWhatsappE164: null },
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("focuses the Close (X) button when it opens", async () => {
    await renderDrawer(() => undefined);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );
  });

  it("keeps focus in the note when the parent re-renders with a new onClose", async () => {
    const { note, rerender } = await renderDrawer(() => undefined);
    act(() => note.focus());
    fireEvent.change(note, { target: { value: "Swap rice for roti" } });
    expect(document.activeElement).toBe(note);

    // Simulate three 4 s Home polls, each passing a fresh onClose.
    for (let i = 0; i < 3; i += 1) {
      rerender(
        <CoachAskDrawer askId={ASK_ID} clientName="Rohan" onClose={() => undefined} />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(note);
    }
    expect(note.value).toBe("Swap rice for roti");
  });

  it("calls the latest onClose on Escape", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = await renderDrawer(first);
    rerender(<CoachAskDrawer askId={ASK_ID} clientName="Rohan" onClose={latest} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("calls onClose from the X and after Mark answered saves", async () => {
    const onClose = vi.fn();
    await renderDrawer(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Mark answered" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(api.answerCoachAsk).toHaveBeenCalledWith(
      ASK_ID,
      { note: null, visibleToClient: false },
      expect.any(String),
    );
  });
});
