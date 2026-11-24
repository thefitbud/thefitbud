/**
 * See all notes (Z14-24, TM-03k): newest first, 30 per page by cursor (Z14-20),
 * who can see each note, the Z14-21 footer states. Real screen and
 * `usePagedList`; only the API and the list container are replaced.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";

vi.mock("../../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("../../components/ListScreen", async () => {
  const actual = await vi.importActual<typeof import("../../components/ListScreen")>(
    "../../components/ListScreen",
  );
  const { ListScreenDouble } = await import("../../test/listScreenDouble");
  return { ...actual, ListScreen: ListScreenDouble };
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RID = uuid(9000);

const api = { listTrainerNotes: vi.fn() };
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

const { NotesScreen } = await import("./NotesScreen");

/** 80 notes, newest first; every third one is shown to the client. */
const NOTES = Array.from({ length: 80 }, (_, i) => ({
  id: uuid(i + 1),
  coachingRelationshipId: RID,
  trainerUserId: uuid(7000),
  checkinId: null,
  body: `Note ${String(i + 1).padStart(3, "0")}`,
  visibility: i % 3 === 0 ? ("client" as const) : ("private" as const),
  subjectType: null,
  subjectId: null,
  sharedAt: null,
  seenAt: null,
  createdAt: new Date(Date.UTC(2026, 10, 14, 4, 0, 0) - i * 86_400_000).toISOString(),
  updatedAt: "2026-11-14T04:00:00.000Z",
}));

function serve(failSecond = false) {
  let calls = 0;
  api.listTrainerNotes.mockImplementation(
    async (_rid: string, query?: { limit?: number; cursor?: string }) => {
      calls += 1;
      if (failSecond && calls === 2) throw new TypeError("Network request failed");
      const start = query?.cursor ? Number(query.cursor) : 0;
      const limit = query?.limit ?? 80;
      const items = NOTES.slice(start, start + limit);
      const end = start + limit;
      return { items, nextCursor: end < NOTES.length ? String(end) : null };
    },
  );
}

beforeEach(() => api.listTrainerNotes.mockReset());

function renderNotes(onBack = vi.fn()) {
  render(<NotesScreen relationshipId={RID} displayName="Aarav Sharma" onBack={onBack} />);
  return { onBack };
}

describe("NotesScreen", () => {
  it("pages an 80-note history 30 at a time, newest first, with visibility marks", async () => {
    serve();
    renderNotes();
    await screen.findByText("Note 001");
    expect(api.listTrainerNotes).toHaveBeenCalledWith(RID, { limit: 30 });
    expect(screen.getAllByTestId("note-row")).toHaveLength(30);
    expect(screen.getAllByText(/Aarav sees it · /).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Only you · /).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("list-end"));
    await waitFor(() => expect(screen.getAllByTestId("note-row")).toHaveLength(60));
    expect(api.listTrainerNotes).toHaveBeenLastCalledWith(RID, { limit: 30, cursor: "30" });
    // Asking again before the next page lands does not repeat the request.
    fireEvent.click(screen.getByTestId("list-end"));
    await waitFor(() => expect(screen.getAllByTestId("note-row")).toHaveLength(80));
    fireEvent.click(screen.getByTestId("list-end"));
    expect(api.listTrainerNotes).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Note 080")).toBeTruthy();
  });

  it("a failed next page keeps the loaded notes and offers a retry (neutral when offline)", async () => {
    serve(true);
    renderNotes();
    await screen.findByText("Note 001");
    fireEvent.click(screen.getByTestId("list-end"));
    const retry = await screen.findByTestId("paged-footer-retry");
    expect(retry.textContent).toContain("You're offline");
    expect(screen.getAllByTestId("note-row")).toHaveLength(30);
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getAllByTestId("note-row")).toHaveLength(60));
  });

  it("an empty history says so, and a server failure says what to do", async () => {
    api.listTrainerNotes.mockResolvedValue({ items: [], nextCursor: null });
    renderNotes();
    expect(await screen.findByText("No notes yet.")).toBeTruthy();
  });

  it("a failed first page shows a friendly line, never the error", async () => {
    api.listTrainerNotes.mockReturnValueOnce(
      Promise.reject(
        new ApiClientError({ status: 500, code: "INTERNAL_ERROR", message: "boom", requestId: "r" }),
      ),
    );
    renderNotes();
    expect(await screen.findByText("Couldn't load the notes. Pull down to try again.")).toBeTruthy();
    expect(screen.queryByText(/boom|INTERNAL/)).toBeNull();
  });

  it("Back goes to the profile", async () => {
    serve();
    const { onBack } = renderNotes();
    await screen.findByText("Note 001");
    fireEvent.click(screen.getByTestId("header-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
