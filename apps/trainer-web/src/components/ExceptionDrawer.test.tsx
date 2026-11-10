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
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    getException: api.getException,
    getWorkoutAssignment: api.getWorkoutAssignment,
    getClientWorkspace: api.getClientWorkspace,
    acknowledgeException: api.acknowledgeException,
    resolveException: api.resolveException,
    listExceptions: api.listExceptions,
  },
}));
vi.mock("../lib/stage1-api", () => ({
  stage1Api: { getResponsiveness: api.getResponsiveness },
}));

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
    await renderDrawer(() => undefined);
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
    expect(await screen.findByRole("textbox")).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

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
    expect(await screen.findByRole("textbox")).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    vi.useRealTimers();
    await act(async () => {
      await Promise.resolve();
    });
    expect(await screen.findByRole("textbox")).toBeTruthy();

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
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
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
    expect(await screen.findByRole("textbox")).toBeTruthy();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
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
