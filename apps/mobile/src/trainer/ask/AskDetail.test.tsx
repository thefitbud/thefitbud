import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";
import { AskDetailScreen } from "./AskDetailScreen";

const ASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ask = {
  id: ASK_ID,
  relationshipId: REL,
  itemType: "workout_assignment" as const,
  itemId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  topic: "pain",
  status: "open" as const,
  askCount: 1,
  askedAt: "2026-11-17T04:00:00.000Z",
  lastAskedAt: "2026-11-17T04:12:00.000Z",
  itemLabel: "Lower back feels tight. Should I drop weight?",
  itemDate: "2026-11-17",
};

const api = {
  listCoachAsks: vi.fn(),
  answerCoachAsk: vi.fn(),
  getClientWorkspace: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getWorkoutExecution: vi.fn(),
  listWorkoutAssignments: vi.fn(),
  getMealAssignment: vi.fn(),
};

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => mockAuth({ api }),
}));
vi.mock("../../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("../whatsapp", () => ({
  openContextualWhatsApp: vi.fn(async () => true),
}));

describe("AskDetailScreen TM-10", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listCoachAsks.mockResolvedValue({ items: [ask] });
    api.getClientWorkspace.mockResolvedValue({
      header: {
        traineeDisplayName: "Aarav Sharma",
        goalShort: "Fat loss",
        startedAt: "2026-10-27T00:00:00.000Z",
        clientWhatsappE164: "+919876543210",
        traineeTimezone: "Asia/Kolkata",
      },
    });
    api.getWorkoutAssignment.mockRejectedValue(new Error("skip"));
  });

  it("shows Asked you chrome, pain chip, and Mark answered", async () => {
    const onAnswered = vi.fn();
    render(
      <AskDetailScreen
        askId={ASK_ID}
        initialAsk={ask}
        displayName="Aarav Sharma"
        onBack={vi.fn()}
        onAnswered={onAnswered}
      />,
    );
    expect(await screen.findByText("Aarav Sharma")).toBeTruthy();
    expect(screen.getAllByText("Asked you").length).toBeGreaterThan(0);
    expect(screen.getByText("Mentions pain")).toBeTruthy();
    expect(
      screen.getAllByText(/Lower back feels tight/).length,
    ).toBeGreaterThan(0);
    api.answerCoachAsk.mockResolvedValue({ ...ask, status: "answered" });
    fireEvent.click(screen.getByRole("button", { name: "Mark answered" }));
    await waitFor(() => expect(api.answerCoachAsk).toHaveBeenCalled());
    await waitFor(() => expect(onAnswered).toHaveBeenCalled());
  });
});
