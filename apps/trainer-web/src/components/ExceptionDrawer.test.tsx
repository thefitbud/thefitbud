/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactElement } from "react";
import type { ExceptionDetail } from "@fitbud/contracts";

const EXC_ID = "44444444-4444-4444-8444-444444444444";
const REL_ID = "55555555-5555-4555-8555-555555555555";

const api = vi.hoisted(() => ({
  getException: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getClientWorkspace: vi.fn(),
  getResponsiveness: vi.fn(),
  acknowledgeException: vi.fn(),
  resolveException: vi.fn(),
  listExceptions: vi.fn(),
  nudgeActivity: vi.fn(),
  bulkResolveExceptions: vi.fn(),
  undoBulkResolveExceptions: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    getException: api.getException,
    getWorkoutAssignment: api.getWorkoutAssignment,
    getClientWorkspace: api.getClientWorkspace,
    acknowledgeException: api.acknowledgeException,
    resolveException: api.resolveException,
    listExceptions: api.listExceptions,
    nudgeActivity: api.nudgeActivity,
    bulkResolveExceptions: api.bulkResolveExceptions,
    undoBulkResolveExceptions: api.undoBulkResolveExceptions,
  },
}));
vi.mock("../lib/stage1-api", () => ({
  stage1Api: { getResponsiveness: api.getResponsiveness },
}));

import { ApiClientError } from "@fitbud/api-client";
import { formatCivilDate, formatLocalDate } from "@fitbud/core";
import {
  ExceptionDrawer,
  formatTimelineDateTime,
  resolvedCloseLabel,
  trainerResolveBannerText,
  trainerResolveTimelineText,
} from "./ExceptionDrawer";

const baseDetail: ExceptionDetail = {
  id: EXC_ID,
  coachingRelationshipId: REL_ID,
  type: "missed_workout",
  severity: "attention",
  status: "acknowledged",
  ruleVersion: "v1",
  sourceEntityType: "workout_assignment",
  sourceEntityId: "66666666-6666-4666-8666-666666666666",
  summary: "Missed Upper body A",
  details: null,
  detectedAt: "2026-10-22T06:00:00.000Z",
  activatedAt: "2026-10-22T06:00:00.000Z",
  acknowledgedAt: "2026-10-22T07:00:00.000Z",
  resolvedAt: null,
  closedReason: null,
  createdAt: "2026-10-22T06:00:00.000Z",
  updatedAt: "2026-10-22T07:00:00.000Z",
  actions: [],
};

// Acknowledged items show the outcome + note form straight away.
const detail: ExceptionDetail = { ...baseDetail };

const activeDetail: ExceptionDetail = {
  ...baseDetail,
  status: "active",
  acknowledgedAt: null,
  updatedAt: "2026-10-22T06:00:00.000Z",
};

const RESOLVED_AT = "2026-10-22T08:00:00.000Z";

function resolvedDetail(
  closedReason: ExceptionDetail["closedReason"],
): ExceptionDetail {
  return {
    ...detail,
    status: "resolved",
    resolvedAt: RESOLVED_AT,
    closedReason,
    updatedAt: RESOLVED_AT,
  };
}

function inRouter(ui: ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

function stubWorkspaceApis() {
  api.getWorkoutAssignment.mockResolvedValue({
    workoutDayName: "Upper body A",
    windowEndsAt: "2026-10-22T12:00:00.000Z",
    workoutDay: { exercises: [] },
  });
  api.getClientWorkspace.mockResolvedValue({
    header: { traineeDisplayName: "Rohan Mehta", clientWhatsappE164: null },
  });
  api.getResponsiveness.mockRejectedValue(new Error("not needed"));
}

async function renderDrawer(onClose: () => void) {
  const utils = render(
    inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={onClose} />),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Resolve…" }));
  const note = await screen.findByRole("textbox");
  return { ...utils, note: note as HTMLTextAreaElement };
}

function mockSourceApis() {
  api.getWorkoutAssignment.mockResolvedValue({
    workoutDayName: "Upper body A",
    windowEndsAt: "2026-10-22T12:00:00.000Z",
    workoutDay: { exercises: [] },
  });
  api.getClientWorkspace.mockResolvedValue({
    header: { traineeDisplayName: "Rohan Mehta", clientWhatsappE164: null },
  });
  api.getResponsiveness.mockRejectedValue(new Error("not needed"));
}

describe("ExceptionDrawer focus (HM1)", () => {
  beforeEach(() => {
    api.getException.mockResolvedValue(detail);
    stubWorkspaceApis();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("focuses the Close (X) button when it opens", async () => {
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    await screen.findByRole("button", { name: "Resolve…" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );
  });

  it("keeps focus in the note when the parent re-renders with a new onClose", async () => {
    const { note, rerender } = await renderDrawer(() => undefined);
    act(() => note.focus());
    fireEvent.change(note, { target: { value: "Talked, moving it to Sat" } });
    expect(document.activeElement).toBe(note);

    for (let i = 0; i < 3; i += 1) {
      rerender(
        inRouter(
          <ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />,
        ),
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(note);
    }
    expect(note.value).toBe("Talked, moving it to Sat");
  });

  it("calls the latest onClose on Escape and from the X", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = await renderDrawer(first);
    rerender(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={latest} />),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(latest).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(latest).toHaveBeenCalledTimes(2);
    expect(first).not.toHaveBeenCalled();
  });
});

describe("ExceptionDrawer Mark reviewed focus (ED1)", () => {
  beforeEach(() => {
    stubWorkspaceApis();
    api.getException.mockResolvedValue(activeDetail);
    api.acknowledgeException.mockResolvedValue({
      ...activeDetail,
      status: "acknowledged",
      acknowledgedAt: "2026-10-22T07:00:00.000Z",
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps activeElement inside the drawer after Mark reviewed", async () => {
    render(
      inRouter(
        <ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />,
      ),
    );
    const markReviewed = await screen.findByRole("button", {
      name: "Mark reviewed",
    });

    api.getException.mockResolvedValue({
      ...activeDetail,
      status: "acknowledged",
      acknowledgedAt: "2026-10-22T07:00:00.000Z",
      updatedAt: "2026-10-22T07:00:00.000Z",
    });

    await act(async () => {
      markReviewed.focus();
      fireEvent.click(markReviewed);
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Mark reviewed" }),
      ).toBeNull();
    });
    await waitFor(() => {
      const drawer = screen.getByRole("dialog", {
        name: "Needs attention detail",
      });
      expect(document.activeElement).not.toBe(document.body);
      expect(drawer.contains(document.activeElement)).toBe(true);
    });
    expect(api.acknowledgeException).toHaveBeenCalled();
  });
});

describe("ExceptionDrawer closedReason label (RL1b)", () => {
  beforeEach(() => {
    mockSourceApis();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("maps each closedReason to the trainer-facing prefix", () => {
    expect(resolvedCloseLabel("trainer")).toBe("Resolved by you");
    expect(resolvedCloseLabel(null)).toBe("Resolved by you");
    expect(resolvedCloseLabel("coaching_ended")).toBe(
      "Closed when coaching ended",
    );
  });

  it("builds trainer banner/timeline structure like frames 02 / 132", () => {
    expect(
      trainerResolveBannerText({
        resolvedAt: RESOLVED_AT,
        outcomeLabel: "Talked to client",
        justResolved: true,
        timeZone: "UTC",
      }),
    ).toBe("Resolved by you · just now · Talked to client");
    expect(
      trainerResolveBannerText({
        resolvedAt: RESOLVED_AT,
        outcomeLabel: "Talked to client",
        justResolved: false,
        timeZone: "UTC",
      }),
    ).toBe(
      `Resolved by you · ${formatCivilDate(formatLocalDate(new Date(RESOLVED_AT), "UTC"))} · Talked to client`,
    );
    expect(
      trainerResolveTimelineText({
        resolvedAt: RESOLVED_AT,
        outcomeLabel: "Talked to client",
        timeZone: "UTC",
      }),
    ).toBe(
      `Resolved by you · Talked to client · ${formatTimelineDateTime(RESOLVED_AT, "UTC")}`,
    );
  });

  it("shows Closed when coaching ended on the timeline", async () => {
    api.getException.mockResolvedValue(resolvedDetail("coaching_ended"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect(
      await screen.findByText(/Closed when coaching ended ·/),
    ).toBeTruthy();
    expect(screen.queryByText(/Resolved by you/)).toBeNull();
    expect(screen.queryByTestId("exception-resolve-banner")).toBeNull();
  });

  it("shows a read-only trainer resolve banner without Undo", async () => {
    api.getException.mockResolvedValue(resolvedDetail("trainer"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    const banner = await screen.findByTestId("exception-resolve-banner");
    expect(banner.textContent).toMatch(/Resolved by you ·/);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    const timeline = screen.getByTestId("exception-resolve-timeline");
    expect(timeline.textContent).toMatch(/Resolved by you ·/);
    // Datetime includes a clock, not civil date alone.
    expect(timeline.textContent).toMatch(/\d{1,2}:\d{2}\s?(am|pm)/i);
  });

  it("after Resolve shows just-now banner with outcome + Undo, then commits", async () => {
    api.getException.mockResolvedValue(detail);
    api.resolveException.mockResolvedValue(resolvedDetail("trainer"));
    api.acknowledgeException.mockResolvedValue(detail);

    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Resolve…" }));
    expect(await screen.findByRole("textbox")).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));

    const banner = screen.getByTestId("exception-resolve-banner");
    expect(banner.textContent).toContain(
      "Resolved by you · just now · Talked to client",
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    const timeline = screen.getByTestId("exception-resolve-timeline");
    expect(timeline.textContent).toContain("Talked to client");
    expect(api.resolveException).not.toHaveBeenCalled();

    api.getException.mockResolvedValue(resolvedDetail("trainer"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(api.resolveException).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByTestId("exception-resolve-banner").textContent).toMatch(
      /Resolved by you ·/,
    );
  });

  it("Undo cancels a pending Resolve before the POST", async () => {
    api.getException.mockResolvedValue(detail);

    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Resolve…" }));
    expect(await screen.findByRole("textbox")).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    vi.useRealTimers();
    await act(async () => {
      await Promise.resolve();
    });
    expect(await screen.findByRole("button", { name: "Resolve…" })).toBeTruthy();

    expect(api.resolveException).not.toHaveBeenCalled();
    expect(screen.queryByTestId("exception-resolve-banner")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Z7-5 side panel v3: one client's open items, arrows, n of m, Undo and Next.
// ---------------------------------------------------------------------------

const OTHER_REL = "77777777-7777-4777-8777-777777777777";

function itemId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** Open item n of the client, detected n hours before a fixed instant. */
function openItem(n: number, overrides: Partial<ExceptionDetail> = {}): ExceptionDetail {
  const detectedAt = new Date(Date.UTC(2026, 9, 22, 12) - n * 3_600_000).toISOString();
  return {
    ...activeDetail,
    id: itemId(n),
    summary: `Missed workout ${n}`,
    details: { localDate: "2026-10-21" },
    detectedAt,
    activatedAt: detectedAt,
    createdAt: detectedAt,
    updatedAt: detectedAt,
    ...overrides,
  };
}

let lastSearch = "";
function SearchProbe() {
  lastSearch = useLocation().search;
  return null;
}

function renderPanel(
  items: ExceptionDetail[],
  opts: { exceptionId?: string; onClose?: () => void; onChanged?: () => void } = {},
) {
  api.listExceptions.mockResolvedValue({ items, nextCursor: null });
  const byId = new Map(items.map((item) => [item.id, item]));
  api.getException.mockImplementation(async (id: string) => {
    const found = byId.get(id);
    if (!found) throw new Error("not found");
    return found;
  });
  const query = opts.exceptionId
    ? `/?client=${REL_ID}&exception=${opts.exceptionId}`
    : `/?client=${REL_ID}`;
  return render(
    <MemoryRouter initialEntries={[query]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <SearchProbe />
              <ExceptionDrawer
                exceptionId={opts.exceptionId ?? null}
                onClose={opts.onClose ?? (() => undefined)}
                onChanged={opts.onChanged}
              />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function findTitle(text: RegExp) {
  return screen.findByRole("heading", { level: 3, name: text });
}

describe("Side panel v3 list (Z7-5)", () => {
  beforeEach(() => {
    stubWorkspaceApis();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("lists only this client's open items, newest first", async () => {
    // API order is not trusted: oldest first, plus a reviewed and a resolved row.
    const rows = [
      openItem(3),
      openItem(1),
      openItem(4, { status: "acknowledged", acknowledgedAt: "2026-10-22T09:00:00.000Z" }),
      openItem(5, { status: "resolved", resolvedAt: "2026-10-22T09:00:00.000Z" }),
      openItem(2),
    ];
    renderPanel(rows);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    expect(api.listExceptions).toHaveBeenCalledWith(REL_ID);
    expect(screen.getByText("1 of 3")).toBeTruthy();
    const also = screen.getByRole("region", { name: "Also open for Rohan" });
    expect(also.textContent).toContain("2 · Missed workout");
    expect(also.textContent).toContain("3 · Missed workout");
    expect(also.textContent).not.toContain("4 ·");
    expect(screen.getByText(/Rohan Mehta/)).toBeTruthy();
  });

  it("walks at most 10 items and says how many more", async () => {
    const rows = Array.from({ length: 13 }, (_, i) => openItem(i + 1));
    renderPanel(rows);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    expect(screen.getByText("1 of 10")).toBeTruthy();
    expect(screen.getByText(/3 more open items/)).toBeTruthy();
    expect(screen.getByText(/13 open items/)).toBeTruthy();
  });

  it("preselects &exception= and steps with arrows and the ←/→ keys", async () => {
    renderPanel([openItem(1), openItem(2), openItem(3)], {
      exceptionId: itemId(2),
    });
    expect(await findTitle(/Missed workout 2/)).toBeTruthy();
    expect(screen.getByText("2 of 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next item" }));
    expect(await findTitle(/Missed workout 3/)).toBeTruthy();
    expect(screen.getByText("3 of 3")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Next item" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(await findTitle(/Missed workout 2/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    expect(screen.getByText("1 of 3")).toBeTruthy();
    // At the first item ← does nothing.
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("1 of 3")).toBeTruthy();

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(await findTitle(/Missed workout 2/)).toBeTruthy();

    // Focus never leaves the dialog while stepping.
    const dialog = screen.getByRole("dialog", { name: "Needs attention detail" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("ignores ←/→ while typing in the note", async () => {
    renderPanel([
      openItem(1, { status: "acknowledged", acknowledgedAt: null }),
      openItem(2),
    ]);
    // Acknowledged rows are not open: the client has one walkable item.
    expect(await findTitle(/Missed workout 2/)).toBeTruthy();
    cleanup();
    renderPanel([openItem(1), openItem(2)]);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    const note = screen.getByRole("textbox");
    fireEvent.keyDown(note, { key: "ArrowRight" });
    expect(screen.getByText("1 of 2")).toBeTruthy();
  });

  it("an Also open row jumps to that item", async () => {
    renderPanel([openItem(1), openItem(2), openItem(3)]);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^3 · Missed workout/ }));
    expect(await findTitle(/Missed workout 3/)).toBeTruthy();
    expect(screen.getByText("3 of 3")).toBeTruthy();
  });

  it("Resolve shows the resolved state with Undo and Next; Next commits and moves", async () => {
    const onChanged = vi.fn();
    renderPanel([openItem(1), openItem(2), openItem(3)], { onChanged });
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    api.acknowledgeException.mockResolvedValue(openItem(1, { status: "acknowledged" }));
    api.resolveException.mockResolvedValue(openItem(1, { status: "resolved" }));

    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));

    expect(screen.getByTestId("exception-resolve-banner").textContent).toContain(
      "Resolved by you · just now · Talked to client",
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.getByText("Resolved just now")).toBeTruthy();
    expect(screen.getByText("1 of 3 resolved · 2 still open")).toBeTruthy();
    expect(screen.getByText("1 of 3 resolved")).toBeTruthy();
    expect(api.resolveException).not.toHaveBeenCalled();
    const next = screen.getByRole("button", { name: /Next item · 2 of 3/ });

    fireEvent.click(next);
    expect(await findTitle(/Missed workout 2/)).toBeTruthy();
    // Moving on keeps the resolve: it commits now, not after the Undo window.
    await waitFor(() => expect(api.resolveException).toHaveBeenCalledTimes(1));
    expect(api.resolveException.mock.calls[0]![0]).toBe(itemId(1));
    expect(api.acknowledgeException.mock.calls[0]![0]).toBe(itemId(1));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const also = screen.getByRole("region", { name: "Also open for Rohan" });
    expect(also.textContent).not.toContain("1 · ");
    expect(also.textContent).toContain("3 · ");
  });

  it("Undo within 5 s keeps the item open and never POSTs", async () => {
    renderPanel([openItem(1), openItem(2)]);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    expect(screen.getByText("1 of 2 resolved · 1 still open")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    vi.useRealTimers();
    expect(api.resolveException).not.toHaveBeenCalled();
    expect(api.acknowledgeException).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Resolve…" })).toBeTruthy();
    expect(screen.queryByText(/resolved · /)).toBeNull();
  });

  it("after the last item is resolved the footer offers Close", async () => {
    renderPanel([openItem(1)]);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    expect(screen.getByText("All 1 resolved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Next item ·/ })).toBeNull();
    const closes = screen.getAllByRole("button", { name: "Close" });
    expect(closes.length).toBe(2);
    // Undo so no resolve is left to commit after this test unmounts.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(api.resolveException).not.toHaveBeenCalled();
  });

  it("Escape closes, clears ?client= and keeps a pending resolve", async () => {
    const onClose = vi.fn();
    api.acknowledgeException.mockResolvedValue(openItem(1, { status: "acknowledged" }));
    api.resolveException.mockResolvedValue(openItem(1, { status: "resolved" }));
    renderPanel([openItem(1), openItem(2)], { onClose });
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    expect(lastSearch).toContain(`client=${REL_ID}`);
    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(lastSearch).not.toContain("client="));
    await waitFor(() => expect(api.resolveException).toHaveBeenCalledTimes(1));
  });

  it("without ?client= it shows the single item and no list", async () => {
    api.getException.mockResolvedValue(activeDetail);
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect(await screen.findByRole("button", { name: "Mark reviewed" })).toBeTruthy();
    expect(api.listExceptions).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Next item" })).toBeNull();
    expect(screen.queryByText(/Also open/)).toBeNull();
  });

  it("does not list another client's items", async () => {
    renderPanel([openItem(1), openItem(2, { coachingRelationshipId: OTHER_REL })]);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    // The API scopes the list by relationship; the panel asks for this one only.
    expect(api.listExceptions).toHaveBeenCalledTimes(1);
    expect(api.listExceptions).toHaveBeenCalledWith(REL_ID);
  });
});

// ---------------------------------------------------------------------------
// Z7-5 review fix round: focus on Resolve / Undo / commit, popstate in
// ?client=-only mode, and a failed commit after stepping away.
// ---------------------------------------------------------------------------

describe("Side panel v3 focus and recovery (Z7-5 fix round)", () => {
  beforeEach(() => {
    stubWorkspaceApis();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("Resolve focuses Undo; Undo focuses Resolve again", async () => {
    renderPanel([openItem(1), openItem(2)]);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(document.activeElement).toBe(undo);

    fireEvent.click(undo);
    const resolveBtn = screen.getByRole("button", { name: "Resolve…" });
    expect(document.activeElement).toBe(resolveBtn);
    expect(screen.queryByTestId("exception-resolve-banner")).toBeNull();
    expect(api.resolveException).not.toHaveBeenCalled();
  });

  it("the 5 s timer commits and moves focus from Undo to Next item", async () => {
    api.acknowledgeException.mockResolvedValue(openItem(1, { status: "acknowledged" }));
    api.resolveException.mockResolvedValue(openItem(1, { status: "resolved" }));
    renderPanel([openItem(1), openItem(2)]);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Undo" }));

    // After the commit the server returns the item resolved.
    const committed = openItem(1, {
      status: "resolved",
      resolvedAt: "2026-10-22T12:30:00.000Z",
      closedReason: "trainer",
    });
    const second = openItem(2);
    api.getException.mockImplementation(async (id: string) =>
      id === committed.id ? committed : second,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(api.resolveException).toHaveBeenCalledTimes(1);
    expect(api.resolveException.mock.calls[0]![0]).toBe(itemId(1));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /Next item · 2 of 2/ }),
    );
  });

  it("without a list the commit moves focus to Close", async () => {
    api.getException.mockResolvedValue(detail);
    api.resolveException.mockResolvedValue(resolvedDetail("trainer"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Resolve…" }));
    expect(await screen.findByRole("textbox")).toBeTruthy();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Undo" }));
    api.getException.mockResolvedValue(resolvedDetail("trainer"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.resolveException).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("a failed commit after stepping away names that item, not the one on screen", async () => {
    api.acknowledgeException.mockResolvedValue(openItem(1, { status: "acknowledged" }));
    api.resolveException.mockRejectedValue(new Error("network down"));
    renderPanel([openItem(1), openItem(2), openItem(3)]);
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    fireEvent.click(screen.getByRole("button", { name: /Next item · 2 of 3/ }));
    expect(await findTitle(/Missed workout 2/)).toBeTruthy();
    expect(
      await screen.findByText("Could not resolve item 1. It is still open."),
    ).toBeTruthy();
    // Item 1 is open again: back in Also open, and nothing reads resolved.
    const also = screen.getByRole("region", { name: "Also open for Rohan" });
    expect(also.textContent).toContain("1 · Missed workout");
    expect(screen.queryByText(/resolved · /)).toBeNull();
  });

  it("Esc then Back in ?client=-only mode makes the shortcuts work again", async () => {
    const items = [openItem(1), openItem(2)];
    api.listExceptions.mockResolvedValue({ items, nextCursor: null });
    const byId = new Map(items.map((item) => [item.id, item]));
    api.getException.mockImplementation(async (id: string) => byId.get(id)!);
    const onClose = vi.fn();
    // The parent's close is a pending transition, so the panel stays mounted
    // for the same client (relationshipId prop) while the URL moves.
    render(
      <MemoryRouter initialEntries={[`/?client=${REL_ID}`]}>
        <ExceptionDrawer relationshipId={REL_ID} onClose={onClose} />
      </MemoryRouter>,
    );
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    // Closing: keys are inert.
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText("1 of 2")).toBeTruthy();

    // Back to a URL without this client: still inert.
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText("1 of 2")).toBeTruthy();

    // Back to ?client=<this client>: a fresh open, keys work again.
    window.history.pushState(null, "", `/?client=${REL_ID}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(await findTitle(/Missed workout 2/)).toBeTruthy();
    expect(screen.getByText("2 of 2")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Z7-6: resolve form (frame 02), nudge limited (131), quiet hours (199).
// ---------------------------------------------------------------------------

describe("Side panel resolve form (Z7-6)", () => {
  beforeEach(() => {
    stubWorkspaceApis();
    api.getException.mockResolvedValue({
      ...detail,
      details: { localDate: "2026-10-13" },
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("Resolve… opens outcome chips and a private, optional note", async () => {
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    const resolveBtn = await screen.findByRole("button", { name: "Resolve…" });
    // The helper names the client from the workspace header.
    await screen.findByText("Rohan Mehta");
    fireEvent.click(resolveBtn);

    const chips = screen.getByRole("group", { name: "Resolve · Outcome" });
    const labels = Array.from(chips.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(labels).toEqual([
      "Talked to client",
      "Plan adjusted",
      "No action needed",
    ]);
    const talked = screen.getByRole("button", { name: "Talked to client" });
    expect(talked.getAttribute("aria-pressed")).toBe("true");
    // Keyboard lands on the chosen chip.
    expect(document.activeElement).toBe(talked);
    expect(
      screen.getByRole("textbox", { name: "Note · optional · only you see this" }),
    ).toBeTruthy();
    // Frame 02 footer: Cancel / Resolve item with the lock helper.
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resolve item" })).toBeTruthy();
    expect(
      screen.getByText(
        "Resolving locks this item, so Rohan can't log Tue 13 Oct late anymore.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nudge" })).toBeNull();
  });

  it("Save sends the chosen outcome and note to the existing resolve endpoint", async () => {
    api.resolveException.mockResolvedValue(resolvedDetail("trainer"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Resolve…" }));
    fireEvent.click(screen.getByRole("button", { name: "Plan adjusted" }));
    expect(
      screen
        .getByRole("button", { name: "Plan adjusted" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Talked to client" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Moved Lower body A to Sat  " },
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    expect(screen.getByTestId("exception-resolve-banner").textContent).toContain(
      "Resolved by you · just now · Plan adjusted",
    );
    api.getException.mockResolvedValue(resolvedDetail("trainer"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.resolveException).toHaveBeenCalledTimes(1);
    expect(api.resolveException.mock.calls[0]![0]).toBe(EXC_ID);
    expect(api.resolveException.mock.calls[0]![1]).toEqual({
      note: "Moved Lower body A to Sat",
      outcome: "plan_adjusted",
    });
  });

  it("an empty note resolves with note null (note is optional)", async () => {
    api.resolveException.mockResolvedValue(resolvedDetail("trainer"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Resolve…" }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    api.getException.mockResolvedValue(resolvedDetail("trainer"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.resolveException.mock.calls[0]![1]).toEqual({
      note: null,
      outcome: "talked",
    });
  });

  it("Cancel closes the form without resolving and returns focus to Resolve…", async () => {
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Resolve…" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const resolveBtn = screen.getByRole("button", { name: "Resolve…" });
    expect(document.activeElement).toBe(resolveBtn);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(api.resolveException).not.toHaveBeenCalled();
    // Reopening starts clean.
    fireEvent.click(resolveBtn);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("a failed resolve shows the API message and keeps the outcome and note", async () => {
    api.resolveException.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: "EXCEPTION_STATE_CONFLICT",
        message: "This item changed. Reload and try again.",
        requestId: "req-2",
      }),
    );
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Resolve…" }));
    fireEvent.click(screen.getByRole("button", { name: "No action needed" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Rest week" } });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve item" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    vi.useRealTimers();
    expect(
      await screen.findByText("This item changed. Reload and try again."),
    ).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Rest week",
    );
    expect(
      screen
        .getByRole("button", { name: "No action needed" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByTestId("exception-resolve-banner")).toBeNull();
  });

  it("the ⋯ menu holds the secondary actions", async () => {
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
    const names = screen
      .getAllByRole("menuitem")
      .map((el) => el.textContent?.trim());
    expect(names).toEqual([
      "Add note",
      "Adjust plan",
      "Message on WhatsApp",
      "Open client",
      "Client settings",
    ]);
  });
});

describe("Side panel nudge limited and quiet hours (Z7-6)", () => {
  beforeEach(() => {
    api.getException.mockResolvedValue(detail);
    api.getWorkoutAssignment.mockResolvedValue({
      workoutDayName: "Upper body A",
      windowEndsAt: "2026-10-22T12:00:00.000Z",
      workoutDay: { exercises: [] },
    });
    api.getClientWorkspace.mockResolvedValue({
      header: {
        traineeDisplayName: "Rohan Mehta",
        clientWhatsappE164: null,
        traineeTimezone: "Asia/Kolkata",
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("limited: shows the wait from retryAfter and disables Nudge (frame 131)", async () => {
    api.getResponsiveness.mockRejectedValue(new Error("not needed"));
    api.nudgeActivity.mockRejectedValue(
      new ApiClientError({
        status: 429,
        code: "NUDGE_LIMIT",
        message: "You can nudge again in 40 min",
        requestId: "req-1",
        details: { retryAfter: 2400 },
      }),
    );
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    const nudgeBtn = await screen.findByRole("button", { name: "Nudge" });
    fireEvent.click(nudgeBtn);
    const notice = await screen.findByTestId("panel-nudge-limit");
    expect(notice.textContent).toBe(
      "Nudge limit reached. You can nudge again in 40 min.",
    );
    // Disabled, not hidden, and says why.
    const after = screen.getByRole("button", { name: "Nudge" }) as HTMLButtonElement;
    expect(after.disabled).toBe(true);
    expect(after.getAttribute("aria-describedby")).toBe("sp-nudge-why");
    expect(api.nudgeActivity).toHaveBeenCalledTimes(1);
  });

  it("quiet hours: says when a nudge arrives, in the client's time with a zone", async () => {
    // 17:10 UTC = 10:40 pm IST, inside 22:00–07:00.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T17:10:00.000Z"));
    api.getResponsiveness.mockResolvedValue({
      label: "reminders_working",
      counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    const notice = await screen.findByTestId("panel-quiet-hours");
    expect(notice.textContent).toBe(
      "It's 10:40 pm for Rohan and quiet hours are on. A nudge now arrives after 7:00 am (client's time, IST).",
    );
    // Nudge stays available: the server holds it until quiet hours end.
    const nudgeBtn = screen.getByRole("button", { name: "Nudge" }) as HTMLButtonElement;
    expect(nudgeBtn.disabled).toBe(false);
  });

  it("outside quiet hours there is no quiet-hours notice", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T06:30:00.000Z")); // 12:00 pm IST
    api.getResponsiveness.mockResolvedValue({
      label: "reminders_working",
      counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    await screen.findByRole("button", { name: "Nudge" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("panel-quiet-hours")).toBeNull();
  });

  it("a nudge deferred for quiet hours says when it arrives", async () => {
    api.getResponsiveness.mockRejectedValue(new Error("not needed"));
    api.nudgeActivity.mockResolvedValue({
      notification: {},
      deduped: false,
      deferredForQuietHours: true,
      quietHoursEnd: "07:00",
    });
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    const nudgeBtn = await screen.findByRole("button", { name: "Nudge" });
    // The client's timezone comes with the workspace header.
    await screen.findByText("Rohan Mehta");
    fireEvent.click(nudgeBtn);
    expect(
      await screen.findByText(
        "Nudge sent. It arrives after 7:00 am (client's time, IST).",
      ),
    ).toBeTruthy();
  });
});

describe("Side panel read-only, gone and ended (Z7-7)", () => {
  const WRITE_NAMES = ["Mark reviewed", "Resolve…", "Nudge", "More actions"];
  function expectNoWriteActions() {
    for (const name of WRITE_NAMES) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: /Resolve item/ })).toBeNull();
  }
  function stubWorkspace(endedAt: string | null) {
    api.getClientWorkspace.mockResolvedValue({
      header: {
        traineeDisplayName: "Kavya Nair",
        clientWhatsappE164: null,
        endedAt,
      },
    });
  }
  beforeEach(() => {
    api.getWorkoutAssignment.mockResolvedValue({
      workoutDayName: "Upper body A",
      windowEndsAt: "2026-10-22T12:00:00.000Z",
      workoutDay: { exercises: [] },
    });
    api.getResponsiveness.mockRejectedValue(new Error("not needed"));
    stubWorkspace(null);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("a resolved item opens read-only with the note, who and when (frame 132)", async () => {
    api.getException.mockResolvedValue({
      ...resolvedDetail("trainer"),
      actions: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          exceptionId: EXC_ID,
          trainerUserId: "88888888-8888-4888-8888-888888888888",
          action: "resolve",
          note: "Family dinner out.",
          createdAt: RESOLVED_AT,
        },
      ],
    });
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect((await screen.findByTestId("panel-readonly-line")).textContent).toMatch(
      /Read-only · a resolved item can't be changed/,
    );
    expect(screen.getByTestId("exception-resolve-banner").textContent).toMatch(
      /Resolved by you ·/,
    );
    expect(screen.getByTestId("panel-resolved-note").textContent).toMatch(
      /Your note · private.*Family dinner out\./,
    );
    expectNoWriteActions();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("a deleted item shows the gone state with a way back (frame 133)", async () => {
    const rows = [openItem(1), openItem(2)];
    api.listExceptions.mockResolvedValue({ items: rows, nextCursor: null });
    api.getException.mockImplementation(async (id: string) => {
      if (id === itemId(2)) {
        throw new ApiClientError({
          status: 404,
          code: "EXCEPTION_NOT_FOUND",
          message: "Exception not found.",
        requestId: "req-1",
        });
      }
      return rows[0];
    });
    render(
      <MemoryRouter initialEntries={[`/?client=${REL_ID}&exception=${itemId(2)}`]}>
        <ExceptionDrawer exceptionId={itemId(2)} onClose={() => undefined} />
      </MemoryRouter>,
    );
    const gone = await screen.findByTestId("panel-item-gone");
    expect(gone.textContent).toMatch(/This item no longer exists/);
    expectNoWriteActions();
    fireEvent.click(screen.getByRole("button", { name: /Back to item 1 of 2/ }));
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
  });

  it("a load failure that is not a 404 does not claim the item is gone", async () => {
    api.getException.mockRejectedValue(new Error("boom"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not load this item.",
    );
    expect(screen.queryByTestId("panel-item-gone")).toBeNull();
  });

  it("an ended client's open item shows no write actions, and n does not nudge", async () => {
    stubWorkspace("2026-10-03T12:00:00.000Z");
    api.getException.mockResolvedValue(activeDetail);
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect((await screen.findByTestId("panel-readonly-line")).textContent).toMatch(
      /coaching has ended/,
    );
    expectNoWriteActions();
    fireEvent.keyDown(document, { key: "n" });
    expect(api.nudgeActivity).not.toHaveBeenCalled();
    // Viewing still works.
    expect(screen.getByText("Timeline")).toBeTruthy();
  });

  it("an item closed when coaching ended is read-only with the system label", async () => {
    api.getException.mockResolvedValue(resolvedDetail("coaching_ended"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect(await screen.findByText(/Closed when coaching ended ·/)).toBeTruthy();
    expectNoWriteActions();
  });

  it("a write that returns RELATIONSHIP_ENDED turns the panel read-only", async () => {
    api.getException.mockResolvedValue(activeDetail);
    api.acknowledgeException.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: "RELATIONSHIP_ENDED",
        message: "Coaching relationship has ended.",
      requestId: "req-1",
      }),
    );
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Mark reviewed" }));
    expect(await screen.findByTestId("panel-readonly-line")).toBeTruthy();
    expectNoWriteActions();
  });

  it("INVALID_TRANSITION on a resolved-elsewhere item reloads it read-only", async () => {
    api.getException
      .mockResolvedValueOnce(activeDetail)
      .mockResolvedValue(resolvedDetail("trainer"));
    api.acknowledgeException.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: "INVALID_TRANSITION",
        message: "Invalid transition.",
      requestId: "req-1",
      }),
    );
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Mark reviewed" }));
    expect(await screen.findByTestId("panel-resolved-elsewhere")).toBeTruthy();
    expectNoWriteActions();
  });

  it("the resolved-elsewhere notice does not follow the panel to the next item", async () => {
    const rows = [openItem(1), openItem(2)];
    const resolvedTwo = {
      ...openItem(2),
      status: "resolved" as const,
      resolvedAt: RESOLVED_AT,
      closedReason: "trainer" as const,
    };
    let firstCalls = 0;
    api.listExceptions.mockResolvedValue({ items: rows, nextCursor: null });
    api.getException.mockImplementation(async (id: string) => {
      if (id === itemId(2)) return resolvedTwo;
      firstCalls += 1;
      return firstCalls === 1
        ? rows[0]
        : { ...rows[0], status: "resolved", resolvedAt: RESOLVED_AT, closedReason: "trainer" };
    });
    api.acknowledgeException.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: "INVALID_TRANSITION",
        message: "Invalid transition.",
        requestId: "req-1",
      }),
    );
    render(
      <MemoryRouter initialEntries={[`/?client=${REL_ID}`]}>
        <ExceptionDrawer onClose={() => undefined} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Mark reviewed" }));
    expect(await screen.findByTestId("panel-resolved-elsewhere")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Next item/ }).at(-1)!);
    expect(await findTitle(/Missed workout 2/)).toBeTruthy();
    expect(screen.queryByTestId("panel-resolved-elsewhere")).toBeNull();
  });

  it("a resolved item shows no age line and a gone item keeps its severity pill", async () => {
    api.getException.mockResolvedValue(resolvedDetail("trainer"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    await screen.findByTestId("panel-readonly-line");
    expect(screen.queryByText(/^Resolved (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)).toBeNull();
    cleanup();

    const rows = [openItem(1, { severity: "critical" }), openItem(2)];
    api.listExceptions.mockResolvedValue({ items: rows, nextCursor: null });
    api.getException.mockRejectedValue(
      new ApiClientError({
        status: 404,
        code: "EXCEPTION_NOT_FOUND",
        message: "Exception not found.",
        requestId: "req-1",
      }),
    );
    render(
      <MemoryRouter initialEntries={[`/?client=${REL_ID}`]}>
        <ExceptionDrawer exceptionId={itemId(1)} onClose={() => undefined} />
      </MemoryRouter>,
    );
    await screen.findByTestId("panel-item-gone");
    expect(screen.getByText("Critical")).toBeTruthy();
  });
});

describe("Side panel bulk select, confirm, partial and Undo (Z7-8)", () => {
  const BULK_ID = "99999999-9999-4999-8999-999999999990";

  /** Five compatible items and one meal change (individual only). */
  function bulkRows(): ExceptionDetail[] {
    return [
      openItem(1),
      openItem(2),
      openItem(3, {
        type: "overdue_meal",
        sourceEntityType: "meal_assignment",
        details: { localDate: "2026-10-21", mealName: "Dinner" },
      }),
      openItem(4),
      openItem(5),
      openItem(6, {
        type: "meal_deviation",
        severity: "critical",
        sourceEntityType: "meal_assignment",
        details: { localDate: "2026-10-20" },
      }),
    ];
  }

  function resolvedBody(ids: string[], skipped: Record<string, "already_resolved" | "not_found"> = {}) {
    const items = ids.map((id) =>
      skipped[id]
        ? { id, status: "skipped" as const, reason: skipped[id]! }
        : { id, status: "resolved" as const },
    );
    const resolvedCount = items.filter((i) => i.status === "resolved").length;
    return {
      bulkId: resolvedCount > 0 ? BULK_ID : null,
      relationshipId: REL_ID,
      resolvedCount,
      skippedCount: items.length - resolvedCount,
      items,
      resolvedAt: resolvedCount > 0 ? "2026-10-22T12:00:00.000Z" : null,
      undoExpiresAt: resolvedCount > 0 ? "2026-10-22T12:00:05.000Z" : null,
    };
  }

  async function openBulk(rows: ExceptionDetail[] = bulkRows()) {
    renderPanel(rows);
    await findTitle(/Missed workout 1/);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Resolve several…" }));
    return screen.findByTestId("bulk-select-list");
  }

  beforeEach(() => {
    stubWorkspaceApis();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("checkboxes only on compatible items; select all selects compatible only", async () => {
    const list = await openBulk();
    const boxes = list.querySelectorAll('input[type="checkbox"]');
    // Five compatible rows have boxes; the meal change has none.
    expect(boxes).toHaveLength(5);
    const mealChange = Array.from(list.querySelectorAll("li")).find((li) =>
      /Meal change/.test(li.textContent ?? ""),
    )!;
    expect(mealChange.querySelector("input")).toBeNull();
    expect(mealChange.textContent).toMatch(/resolve on its own/);
    expect(screen.getByText("Meal change is resolved on its own")).toBeTruthy();
    // The item on screen starts selected.
    expect(screen.getByTestId("bulk-count").textContent).toBe("1 of 5 selected");
    // No arrows, no item nav while selecting.
    expect(screen.queryByRole("button", { name: "Next item" })).toBeNull();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select all items that can be resolved together",
      }),
    );
    expect(screen.getByTestId("bulk-count").textContent).toBe("5 of 5 selected");
    expect(screen.getByRole("button", { name: "Resolve 5 items…" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByTestId("bulk-count").textContent).toBe("0 of 5 selected");
    expect(
      (screen.getByRole("button", { name: "Resolve 0 items…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // Back leaves bulk mode to the item view.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await findTitle(/Missed workout 1/)).toBeTruthy();
    expect(screen.queryByTestId("bulk-select-list")).toBeNull();
  });

  it("three or fewer resolve inline, one call with one outcome and note", async () => {
    api.bulkResolveExceptions.mockResolvedValue(
      resolvedBody([itemId(1), itemId(2)]),
    );
    const onChanged = vi.fn();
    renderPanel(bulkRows(), { onChanged });
    await findTitle(/Missed workout 1/);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Resolve several…" }));
    await screen.findByTestId("bulk-select-list");
    // Row 1 (on screen) is preselected; add row 2.
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    expect(screen.getByTestId("bulk-count").textContent).toBe("2 of 5 selected");
    fireEvent.click(screen.getByRole("button", { name: /^Resolve 2 items…$/ }));
    expect(screen.queryByTestId("bulk-confirm")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Plan adjusted" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Busy week  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve 2 items" }));
    await screen.findByTestId("bulk-result-list");
    expect(api.bulkResolveExceptions).toHaveBeenCalledTimes(1);
    const [body, key] = api.bulkResolveExceptions.mock.calls[0]!;
    expect(body).toEqual({
      relationshipId: REL_ID,
      exceptionIds: expect.arrayContaining([itemId(1)]),
      outcome: "plan_adjusted",
      note: "Busy week",
    });
    expect(body.exceptionIds).toHaveLength(2);
    expect(typeof key).toBe("string");
    expect(api.resolveException).not.toHaveBeenCalled();
    expect(screen.getByTestId("bulk-undo-toast").textContent).toMatch(
      /2 items resolved · Plan adjusted/,
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("more than three opens the confirm dialog; Escape closes only the dialog", async () => {
    api.bulkResolveExceptions.mockResolvedValue(
      resolvedBody([itemId(1), itemId(2), itemId(3), itemId(4), itemId(5)]),
    );
    const onClose = vi.fn();
    renderPanel(bulkRows(), { onClose });
    await findTitle(/Missed workout 1/);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Resolve several…" }));
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Select all items that can be resolved together",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Resolve 5 items…" }));
    const dialog = await screen.findByRole("dialog", { name: "Resolve 5 items for Rohan?" });
    expect(dialog.textContent).toMatch(/The same outcome and note go on every item/);
    expect(dialog.textContent).toMatch(/You can undo for 5 seconds after/);
    // Focus moves into the dialog on the chosen outcome.
    expect(document.activeElement?.textContent).toBe("Talked to client");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Resolve 5 items/ })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Resolve 5 items…" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Resolve 5 items…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resolve 5 items" }));
    await screen.findByTestId("bulk-result-list");
    expect(api.bulkResolveExceptions).toHaveBeenCalledTimes(1);
    expect(api.bulkResolveExceptions.mock.calls[0]![0].outcome).toBe("talked");
    expect(api.bulkResolveExceptions.mock.calls[0]![0].note).toBeNull();
  });

  it("partial failure shows a per-item result line and chips", async () => {
    const ids = [itemId(1), itemId(2), itemId(3), itemId(4), itemId(5)];
    api.bulkResolveExceptions.mockResolvedValue(
      resolvedBody(ids, { [itemId(3)]: "already_resolved" }),
    );
    await openBulk();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select all items that can be resolved together",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Resolve 5 items…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resolve 5 items" }));
    const summary = await screen.findByTestId("bulk-summary");
    expect(summary.textContent).toMatch(
      /^4 resolved, 1 already resolved elsewhere\. Overdue meal · Wed 21 Oct was left as it was\.$/,
    );
    const result = screen.getByTestId("bulk-result-list");
    expect(result.textContent).toMatch(/Already resolved/);
    expect(result.textContent?.match(/Resolved/g)?.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByTestId("bulk-undo-toast").textContent).toMatch(/4 items resolved/);
  });

  it("Undo within 5 s restores all; after 5 s the button is gone", async () => {
    const ids = [itemId(1), itemId(2), itemId(3), itemId(4), itemId(5)];
    api.bulkResolveExceptions.mockResolvedValue(resolvedBody(ids));
    api.undoBulkResolveExceptions.mockResolvedValue({
      bulkId: BULK_ID,
      relationshipId: REL_ID,
      restoredCount: 5,
      items: ids.map((id) => ({ id, status: "active" })),
    });
    await openBulk();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select all items that can be resolved together",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Resolve 5 items…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resolve 5 items" }));
    const undo = await screen.findByRole("button", { name: "Undo" });
    expect(document.activeElement).toBe(undo);
    fireEvent.click(undo);
    await screen.findByTestId("bulk-select-list");
    expect(api.undoBulkResolveExceptions).toHaveBeenCalledWith(
      BULK_ID,
      expect.any(String),
    );
    expect(screen.getByTestId("bulk-count").textContent).toBe("5 of 5 selected");

    // Second round: let the window pass.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole("button", { name: "Resolve 5 items…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resolve 5 items" }));
    await screen.findByRole("button", { name: "Undo" });
    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(api.undoBulkResolveExceptions).toHaveBeenCalledTimes(1);
    // The footer names what is still open and leads there.
    expect(screen.getByRole("button", { name: /Review meal change item/ })).toBeTruthy();
  });

  it("a retry after a network failure reuses the idempotency key; a new note gets a new one", async () => {
    api.bulkResolveExceptions
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(resolvedBody([itemId(1), itemId(2)]));
    await openBulk();
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    fireEvent.click(screen.getByRole("button", { name: "Resolve 2 items…" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve 2 items" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not resolve these items.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Resolve 2 items" }));
    await waitFor(() => expect(api.bulkResolveExceptions).toHaveBeenCalledTimes(2));
    await screen.findByRole("alert");
    const firstKey = api.bulkResolveExceptions.mock.calls[0]![1];
    expect(api.bulkResolveExceptions.mock.calls[1]![1]).toBe(firstKey);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve 2 items" }));
    await screen.findByTestId("bulk-result-list");
    expect(api.bulkResolveExceptions.mock.calls[2]![1]).not.toBe(firstKey);
  });

  it("undo too late keeps the items resolved and says so", async () => {
    api.bulkResolveExceptions.mockResolvedValue(resolvedBody([itemId(1), itemId(2)]));
    api.undoBulkResolveExceptions.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: "undo_expired",
        message: "Undo window has passed.",
        requestId: "req-1",
      }),
    );
    await openBulk();
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    fireEvent.click(screen.getByRole("button", { name: "Resolve 2 items…" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve 2 items" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too late to undo. These items stay resolved.",
    );
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("an ended client gets no bulk action", async () => {
    api.getClientWorkspace.mockResolvedValue({
      header: {
        traineeDisplayName: "Rohan Mehta",
        clientWhatsappE164: null,
        endedAt: "2026-10-03T12:00:00.000Z",
      },
    });
    renderPanel(bulkRows());
    await screen.findByTestId("panel-readonly-line");
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(screen.queryByText("Resolve several…")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("with fewer than two compatible items there is no bulk action", async () => {
    renderPanel([
      openItem(1),
      openItem(2, { type: "meal_deviation", sourceEntityType: "meal_assignment" }),
    ]);
    await findTitle(/Missed workout 1/);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitem", { name: "Adjust plan" });
    expect(screen.queryByRole("menuitem", { name: "Resolve several…" })).toBeNull();
  });
});
