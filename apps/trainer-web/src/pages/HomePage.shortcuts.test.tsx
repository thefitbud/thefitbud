/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// HM4: the Home "Needs attention" single-key shortcuts (a / n / o) must not
// fire from stray typing after a drawer closes and focus is restored by code.

const ROHAN_REL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FARHAN_REL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROHAN_EXC = "11111111-1111-4111-8111-111111111111";
const FARHAN_EXC = "22222222-2222-4222-8222-222222222222";
const PRIYA_REL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PRIYA_EXC = "33333333-3333-4333-8333-333333333333";
const SANA_REL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SANA_EXC = "44444444-4444-4444-8444-444444444444";

const AARAV_REL = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const AARAV_EXC = "55555555-5555-4555-8555-555555555555";

// HM5: the realtime hint callback triggers the same quiet refetch as the poll.
const hints = vi.hoisted(() => ({ refresh: null as null | (() => void) }));

const api = vi.hoisted(() => ({
  getAttentionGroups: vi.fn(),
  listCoachAsks: vi.fn(),
  getReengagementCandidates: vi.fn(),
  getActivityFeed: vi.fn(),
  listSubscriptionAttention: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listClients: vi.fn(),
  listInvitations: vi.fn(),
  acknowledgeException: vi.fn(),
  getException: vi.fn(),
  nudgeActivity: vi.fn(),
}));

vi.mock("../lib/stage1-api", () => ({
  stage1Api: {
    getAttentionGroups: api.getAttentionGroups,
    listCoachAsks: api.listCoachAsks,
    getReengagementCandidates: api.getReengagementCandidates,
    getActivityFeed: api.getActivityFeed,
  },
}));
vi.mock("../lib/api", () => ({
  apiClient: {
    listSubscriptionAttention: api.listSubscriptionAttention,
    listTrainerCheckinInbox: api.listTrainerCheckinInbox,
    listClients: api.listClients,
    listInvitations: api.listInvitations,
    acknowledgeException: api.acknowledgeException,
    getException: api.getException,
    nudgeActivity: api.nudgeActivity,
  },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));
vi.mock("../components/OfflineBanner", () => ({
  useOnlineStatus: () => true,
}));
vi.mock("../realtime/useRealtimeHints", () => ({
  useRealtimeHints: (_client: unknown, _ids: unknown, onHint: () => void) => {
    hints.refresh = onHint;
  },
}));
// Stub drawers: only the close path matters here.
vi.mock("../components/ExceptionDrawer", () => ({
  ExceptionDrawer: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Exception">
      <button type="button" onClick={onClose}>
        Close exception drawer
      </button>
    </div>
  ),
}));
vi.mock("../components/CoachAskDrawer", () => ({
  CoachAskDrawer: () => null,
}));

import { HomePage } from "./HomePage";

function group(rel: string, name: string, exc: string, severity: "critical" | "attention") {
  return {
    relationshipId: rel,
    traineeDisplayName: name,
    clientWhatsappE164: null,
    items: [
      {
        id: exc,
        type: "missed_workout",
        severity,
        status: "active",
        ageMinutes: 120,
        summary: "Missed workout",
        details: null,
      },
    ],
  };
}

let assignSpy: ReturnType<typeof vi.fn>;
let realLocation: Location;

async function renderHome(initialUrl: string) {
  render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <HomePage />
    </MemoryRouter>,
  );
  const grid = await screen.findByRole("grid", { name: "Needs attention" });
  await screen.findByText("Rohan Mehta");
  // From here on control the clock: the 5 s undo delay and the quiet window.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  return grid;
}

function rows() {
  return screen.getAllByRole("row");
}

function type(keys: string, init: Partial<KeyboardEventInit> = {}) {
  for (const key of keys) {
    fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
  }
}

/** Real Tab navigation into the grid (keydown Tab, then focus moves). */
function tabInto(grid: HTMLElement) {
  fireEvent.keyDown(document.body, { key: "Tab" });
  act(() => grid.focus());
}

async function closeExceptionDrawer() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Close exception drawer" }));
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function noActionTaken() {
  expect(screen.queryByText("Marked reviewed")).toBeNull();
  expect(api.getException).not.toHaveBeenCalled();
  expect(api.nudgeActivity).not.toHaveBeenCalled();
  expect(assignSpy).not.toHaveBeenCalled();
  advance(6000);
  expect(api.acknowledgeException).not.toHaveBeenCalled();
}

describe("HomePage row shortcuts guard (HM4)", () => {
  beforeEach(() => {
    api.getAttentionGroups.mockResolvedValue({
      groups: [
        group(ROHAN_REL, "Rohan Mehta", ROHAN_EXC, "critical"),
        group(FARHAN_REL, "Farhan Ali", FARHAN_EXC, "attention"),
        group(PRIYA_REL, "Priya Nair", PRIYA_EXC, "attention"),
        group(SANA_REL, "Sana Khan", SANA_EXC, "attention"),
      ],
    });
    api.listCoachAsks.mockResolvedValue({ items: [] });
    api.getReengagementCandidates.mockResolvedValue({ items: [] });
    api.getActivityFeed.mockResolvedValue({ events: [] });
    api.listSubscriptionAttention.mockResolvedValue({ items: [] });
    api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
    api.listClients.mockResolvedValue({ items: [] });
    api.listInvitations.mockResolvedValue({ items: [] });
    api.acknowledgeException.mockResolvedValue({});
    api.getException.mockResolvedValue({
      sourceEntityType: "workout_assignment",
      sourceEntityId: "x",
    });
    api.nudgeActivity.mockResolvedValue({});
    realLocation = window.location;
    assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, assign: assignSpy },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("restored focus after the exception drawer closes: immediate 'ano' does nothing", async () => {
    await renderHome(`/?exception=${ROHAN_EXC}`);
    await closeExceptionDrawer();
    expect(document.activeElement).toBe(rows()[0]);
    type("ano");
    noActionTaken();
  });

  it("restored focus stays unarmed after the quiet window; stray j/k don't arm it", async () => {
    await renderHome(`/?exception=${ROHAN_EXC}`);
    await closeExceptionDrawer();
    advance(1000);
    type("jkano");
    noActionTaken();
  });

  it("ignores shortcuts in the quiet window even if the trainer tabs straight back", async () => {
    const grid = await renderHome(`/?exception=${ROHAN_EXC}`);
    await closeExceptionDrawer();
    tabInto(grid);
    type("a");
    noActionTaken();
  });

  it("deliberate Tab to the grid then 'a' acknowledges after 5 s", async () => {
    const grid = await renderHome("/");
    tabInto(grid);
    type("a");
    expect(screen.getByText("Marked reviewed")).toBeTruthy();
    expect(api.acknowledgeException).not.toHaveBeenCalled();
    advance(5000);
    expect(api.acknowledgeException).toHaveBeenCalledTimes(1);
    expect(api.acknowledgeException.mock.calls[0]?.[0]).toBe(ROHAN_EXC);
  });

  it("deliberate Tab then 'a' keeps Undo: undo cancels the acknowledge", async () => {
    const grid = await renderHome(`/?exception=${ROHAN_EXC}`);
    await closeExceptionDrawer();
    advance(1000);
    tabInto(grid);
    type("a");
    expect(screen.getByText("Marked reviewed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    advance(6000);
    expect(api.acknowledgeException).not.toHaveBeenCalled();
  });

  it("arrow-key navigation arms the shortcuts", async () => {
    await renderHome(`/?exception=${ROHAN_EXC}`);
    await closeExceptionDrawer();
    advance(1000);
    type("o");
    expect(assignSpy).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    type("o");
    expect(assignSpy).toHaveBeenCalledWith(`/clients/${FARHAN_REL}`);
  });

  it("a pointer click on a row arms the shortcuts", async () => {
    await renderHome("/");
    const row = rows()[0]!;
    fireEvent.pointerDown(row);
    act(() => row.focus());
    type("o");
    expect(assignSpy).toHaveBeenCalledWith(`/clients/${ROHAN_REL}`);
  });

  it("click on row 3 then 'a' acknowledges row 3, not the last keyboard row", async () => {
    await renderHome("/");
    expect(rows()[2]!.textContent).toContain("Priya Nair");
    const name = screen.getByText("Priya Nair");
    fireEvent.pointerDown(name);
    act(() => rows()[2]!.focus());
    expect(rows()[2]!.className).toContain("is-focused");
    expect(document.activeElement).toBe(rows()[2]);
    type("a");
    advance(5000);
    expect(api.acknowledgeException).toHaveBeenCalledTimes(1);
    expect(api.acknowledgeException.mock.calls[0]?.[0]).toBe(PRIYA_EXC);
  });

  it("Shift+Tab onto row 3's More actions button then 'a' acknowledges row 3", async () => {
    await renderHome("/");
    const more = screen.getByRole("button", { name: "More actions for Priya Nair" });
    fireEvent.keyDown(document.body, { key: "Tab", shiftKey: true });
    act(() => more.focus());
    // Selection follows focus without pulling focus off the button.
    expect(document.activeElement).toBe(more);
    expect(rows()[2]!.className).toContain("is-focused");
    type("a");
    advance(5000);
    expect(api.acknowledgeException).toHaveBeenCalledTimes(1);
    expect(api.acknowledgeException.mock.calls[0]?.[0]).toBe(PRIYA_EXC);
  });

  it("j/k still move the selection and focus from a clicked row", async () => {
    await renderHome("/");
    fireEvent.pointerDown(screen.getByText("Farhan Ali"));
    act(() => rows()[1]!.focus());
    type("j");
    expect(document.activeElement).toBe(rows()[2]);
    type("j");
    expect(document.activeElement).toBe(rows()[3]);
    type("k");
    expect(document.activeElement).toBe(rows()[2]);
    type("o");
    expect(assignSpy).toHaveBeenCalledWith(`/clients/${PRIYA_REL}`);
  });

  it("closing a drawer opened from row 3 restores focus to row 3, unarmed", async () => {
    await renderHome("/");
    const review = rows()[2]!.querySelector("button")!;
    fireEvent.pointerDown(review);
    act(() => review.focus());
    await act(async () => {
      fireEvent.click(review);
    });
    await closeExceptionDrawer();
    expect(document.activeElement).toBe(rows()[2]);
    advance(1000);
    type("ano");
    noActionTaken();
  });

  it("restored focus never arms, even right after a Tab keydown", async () => {
    await renderHome(`/?exception=${ROHAN_EXC}`);
    // A Tab keydown just before the drawer closes (well within 250 ms).
    fireEvent.keyDown(document.body, { key: "Tab" });
    advance(100);
    await closeExceptionDrawer();
    expect(document.activeElement).toBe(rows()[0]);
    advance(1000);
    type("a");
    noActionTaken();
  });

  it("the quiet window lasts 1000 ms after a drawer closes", async () => {
    const grid = await renderHome(`/?exception=${ROHAN_EXC}`);
    await closeExceptionDrawer();
    advance(900);
    tabInto(grid);
    type("o");
    expect(assignSpy).not.toHaveBeenCalled();
    advance(150);
    type("o");
    expect(assignSpy).toHaveBeenCalledWith(`/clients/${ROHAN_REL}`);
  });

  it("ignores Safari IME keydowns (keyCode 229, isComposing false)", async () => {
    const grid = await renderHome("/");
    tabInto(grid);
    type("a", { keyCode: 229 });
    type("o", { keyCode: 229 });
    noActionTaken();
  });

  it("ignores keys typed in a textarea inside the grid", async () => {
    const grid = await renderHome("/");
    tabInto(grid);
    const textarea = document.createElement("textarea");
    grid.appendChild(textarea);
    fireEvent.keyDown(textarea, { key: "a" });
    fireEvent.keyDown(textarea, { key: "o" });
    grid.removeChild(textarea);
    noActionTaken();
  });

  it("ignores auto-repeat, modifiers and IME composition", async () => {
    const grid = await renderHome("/");
    tabInto(grid);
    type("a", { repeat: true });
    type("a", { ctrlKey: true });
    type("a", { metaKey: true });
    type("o", { altKey: true });
    type("A", { shiftKey: true });
    type("a", { isComposing: true });
    noActionTaken();
  });
});

// HM5: selection follows the client (relationshipId), not the row index.
describe("HomePage row selection follows the client (HM5)", () => {
  const ROHAN = () => group(ROHAN_REL, "Rohan Mehta", ROHAN_EXC, "critical");
  const FARHAN = () => group(FARHAN_REL, "Farhan Ali", FARHAN_EXC, "attention");
  const PRIYA = () => group(PRIYA_REL, "Priya Nair", PRIYA_EXC, "attention");
  const SANA = () => group(SANA_REL, "Sana Khan", SANA_EXC, "attention");

  beforeEach(() => {
    api.getAttentionGroups.mockResolvedValue({
      groups: [ROHAN(), FARHAN(), PRIYA(), SANA()],
    });
    api.listCoachAsks.mockResolvedValue({ items: [] });
    api.getReengagementCandidates.mockResolvedValue({ items: [] });
    api.getActivityFeed.mockResolvedValue({ events: [] });
    api.listSubscriptionAttention.mockResolvedValue({ items: [] });
    api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
    api.listClients.mockResolvedValue({ items: [] });
    api.listInvitations.mockResolvedValue({ items: [] });
    api.acknowledgeException.mockResolvedValue({});
    api.getException.mockResolvedValue({
      sourceEntityType: "workout_assignment",
      sourceEntityId: "x",
    });
    api.nudgeActivity.mockResolvedValue({});
    realLocation = window.location;
    assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, assign: assignSpy },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  function rowOf(name: string) {
    const row = rows().find((r) => r.textContent?.includes(name));
    if (!row) throw new Error(`no row for ${name}`);
    return row;
  }

  function ringedNames() {
    return rows()
      .filter((r) => r.className.includes("is-focused"))
      .map((r) => r.querySelector("b")?.textContent);
  }

  /** Mouse click on a row's name cell: pointerdown, then focus lands on the row. */
  function clickRow(name: string) {
    fireEvent.pointerDown(screen.getByText(name), { pointerType: "mouse", button: 0 });
    act(() => rowOf(name).focus());
  }

  /** A quiet refetch (same path as the 4 s poll) returning these groups. */
  async function serverNow(groups: ReturnType<typeof group>[]) {
    api.getAttentionGroups.mockResolvedValue({ groups });
    await act(async () => {
      hints.refresh?.();
    });
    await act(async () => {});
  }

  function expectAcked(exc: string) {
    advance(5000);
    expect(api.acknowledgeException).toHaveBeenCalledTimes(1);
    expect(api.acknowledgeException.mock.calls[0]?.[0]).toBe(exc);
  }

  it("R2-1: a refetch that reorders rows keeps the focused client selected", async () => {
    await renderHome("/");
    clickRow("Priya Nair");
    expect(rows().indexOf(rowOf("Priya Nair"))).toBe(2);
    // Priya becomes critical and sorts first; Rohan moves to row 2.
    await serverNow([
      ROHAN(),
      FARHAN(),
      group(PRIYA_REL, "Priya Nair", PRIYA_EXC, "critical"),
      SANA(),
    ]);
    expect(rows().indexOf(rowOf("Priya Nair"))).toBe(0);
    expect(document.activeElement).toBe(rowOf("Priya Nair"));
    expect(ringedNames()).toEqual(["Priya Nair"]);
    type("a");
    expectAcked(PRIYA_EXC);
  });

  it("R2-1: a refetch that inserts a row above keeps the focused client selected", async () => {
    await renderHome("/");
    clickRow("Priya Nair");
    await serverNow([
      group(AARAV_REL, "Aarav Shah", AARAV_EXC, "critical"),
      ROHAN(),
      FARHAN(),
      PRIYA(),
      SANA(),
    ]);
    expect(rows().indexOf(rowOf("Priya Nair"))).toBe(3);
    expect(document.activeElement).toBe(rowOf("Priya Nair"));
    expect(ringedNames()).toEqual(["Priya Nair"]);
    type("n");
    await act(async () => {});
    expect(api.nudgeActivity).toHaveBeenCalledTimes(1);
    expect(api.nudgeActivity.mock.calls[0]?.[0]).toBe(PRIYA_REL);
  });

  it("R2-1: another client acked elsewhere (row removed above) keeps the focused client", async () => {
    await renderHome("/");
    clickRow("Priya Nair");
    // QA repro: Rohan acked from another session; the poll drops his row.
    await serverNow([FARHAN(), PRIYA(), SANA()]);
    expect(rows().indexOf(rowOf("Priya Nair"))).toBe(1);
    expect(document.activeElement).toBe(rowOf("Priya Nair"));
    expect(ringedNames()).toEqual(["Priya Nair"]);
    type("a");
    expectAcked(PRIYA_EXC);
  });

  it("R2-1: arrows move from the focused client's new position", async () => {
    await renderHome("/");
    clickRow("Priya Nair");
    await serverNow([FARHAN(), PRIYA(), SANA()]);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rowOf("Sana Khan"));
    type("o");
    expect(assignSpy).toHaveBeenCalledWith(`/clients/${SANA_REL}`);
  });

  it("R2-2: acking the focused middle row hands focus to the next row", async () => {
    await renderHome("/");
    clickRow("Farhan Ali");
    type("a");
    expect(screen.queryByText("Farhan Ali")).toBeNull();
    expect(document.activeElement).toBe(rowOf("Priya Nair"));
    expect(ringedNames()).toEqual(["Priya Nair"]);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(rowOf("Rohan Mehta"));
  });

  it("R2-2: acking the focused last row hands focus to the previous row; arrows still work", async () => {
    await renderHome("/");
    clickRow("Sana Khan");
    type("a");
    expect(screen.queryByText("Sana Khan")).toBeNull();
    expect(document.activeElement).toBe(rowOf("Priya Nair"));
    expect(ringedNames()).toEqual(["Priya Nair"]);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(rowOf("Farhan Ali"));
    type("j");
    expect(document.activeElement).toBe(rowOf("Priya Nair"));
  });

  it("R2-2: acking the only row moves focus to the page title, not <body>", async () => {
    api.getAttentionGroups.mockResolvedValue({ groups: [ROHAN()] });
    await renderHome("/");
    clickRow("Rohan Mehta");
    type("a");
    expect(screen.queryByRole("grid")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.tagName).toBe("H1");
  });

  it("R2-2: a removed selected row doesn't steal focus from outside the grid", async () => {
    await renderHome("/");
    clickRow("Priya Nair");
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    act(() => outside.focus());
    await serverNow([ROHAN(), FARHAN(), SANA()]);
    expect(document.activeElement).toBe(outside);
    expect(ringedNames()).toEqual(["Sana Khan"]);
    outside.remove();
  });

  it("R2-2: a removed selected row doesn't pull focus back after the trainer left the grid", async () => {
    await renderHome("/");
    clickRow("Priya Nair");
    // Click on blank page: focus goes to <body>. Focusing a row now would
    // scroll the page to it.
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);
    await serverNow([ROHAN(), FARHAN(), SANA()]);
    expect(document.activeElement).toBe(document.body);
    expect(ringedNames()).toEqual(["Sana Khan"]);
  });

  it("R2-3: right-click, middle-click and macOS Ctrl+click don't select or arm", async () => {
    await renderHome("/");
    fireEvent.pointerDown(screen.getByText("Priya Nair"), { pointerType: "mouse", button: 2 });
    fireEvent.pointerDown(screen.getByText("Sana Khan"), { pointerType: "mouse", button: 1 });
    fireEvent.pointerDown(screen.getByText("Farhan Ali"), {
      pointerType: "mouse",
      button: 0,
      ctrlKey: true,
    });
    expect(ringedNames()).toEqual(["Rohan Mehta"]);
    type("a");
    noActionTaken();
  });

  it("R2-3: right-click doesn't move the selection of an armed grid", async () => {
    const grid = await renderHome("/");
    tabInto(grid);
    fireEvent.pointerDown(screen.getByText("Priya Nair"), { pointerType: "mouse", button: 2 });
    expect(ringedNames()).toEqual(["Rohan Mehta"]);
    type("a");
    expectAcked(ROHAN_EXC);
  });

  it("R2-3: a touch that may start a scroll doesn't select or arm", async () => {
    await renderHome("/");
    fireEvent.pointerDown(screen.getByText("Priya Nair"), { pointerType: "touch", button: 0 });
    expect(ringedNames()).toEqual(["Rohan Mehta"]);
    type("a");
    noActionTaken();
  });

  it("R2-3: a touch tap that ends as a click selects and arms", async () => {
    await renderHome("/");
    const name = screen.getByText("Priya Nair");
    // Real tap order: pointerdown (touch), focus on the row, then click.
    fireEvent.pointerDown(name, { pointerType: "touch", button: 0 });
    act(() => rowOf("Priya Nair").focus());
    fireEvent.click(name, { button: 0, detail: 1 });
    expect(ringedNames()).toEqual(["Priya Nair"]);
    type("a");
    expectAcked(PRIYA_EXC);
  });

  it("R2-4: pointerdown alone (no focus event, as in Safari) selects the pressed row", async () => {
    const grid = await renderHome("/");
    tabInto(grid);
    expect(document.activeElement).toBe(grid);
    fireEvent.pointerDown(screen.getByText("Priya Nair"), { pointerType: "mouse", button: 0 });
    // No focus moved: the grid itself still has focus.
    expect(document.activeElement).toBe(grid);
    expect(ringedNames()).toEqual(["Priya Nair"]);
    type("a");
    expectAcked(PRIYA_EXC);
  });

  // HM5 QA F2 (fixed with DR1): drawer close with an empty list.
  it("F2: closing the drawer after the list empties focuses the page title, not <body>", async () => {
    api.getAttentionGroups.mockResolvedValue({ groups: [ROHAN()] });
    await renderHome(`/?exception=${ROHAN_EXC}`);
    await serverNow([]);
    expect(screen.queryByRole("grid")).toBeNull();
    await closeExceptionDrawer();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.tagName).toBe("H1");
    advance(1000);
    type("ano");
    noActionTaken();
  });

  // HM5 QA F1: pin the four guards no test covered.
  it("F1/Q1: a focusout from the focused row as it is removed keeps it for the hand-off", async () => {
    await renderHome("/");
    clickRow("Priya Nair");
    const priya = rowOf("Priya Nair");
    // Chrome fires blur/focusout for a focused node that is being removed;
    // by then the node is no longer connected and there is no relatedTarget.
    Object.defineProperty(priya, "isConnected", { configurable: true, get: () => false });
    fireEvent.focusOut(priya, { relatedTarget: null });
    await serverNow([ROHAN(), FARHAN(), SANA()]);
    expect(document.activeElement).toBe(rowOf("Sana Khan"));
    expect(ringedNames()).toEqual(["Sana Khan"]);
  });

  it("F1/Q3: a keyboard-made click (detail 0) after a touch doesn't select or arm", async () => {
    await renderHome("/");
    const name = screen.getByText("Priya Nair");
    // A touch that started a scroll, then a click the keyboard generated.
    fireEvent.pointerDown(name, { pointerType: "touch", button: 0 });
    fireEvent.click(name, { button: 0, detail: 0 });
    expect(ringedNames()).toEqual(["Rohan Mehta"]);
    type("a");
    noActionTaken();
  });

  it("F1/Q4: a removed row doesn't steal focus from an outside button even if its focus record is stale", async () => {
    await renderHome("/");
    clickRow("Priya Nair");
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    act(() => outside.focus());
    // A focusin that wasn't followed by a real focus move (e.g. focus went
    // to another frame): the grid still records Priya as focused.
    fireEvent.focusIn(rowOf("Priya Nair"));
    expect(document.activeElement).toBe(outside);
    await serverNow([ROHAN(), FARHAN(), SANA()]);
    expect(document.activeElement).toBe(outside);
    expect(ringedNames()).toEqual(["Sana Khan"]);
    outside.remove();
  });

  it("F1/Q6: a pen press selects the row and arms the shortcuts", async () => {
    await renderHome("/");
    fireEvent.pointerDown(screen.getByText("Priya Nair"), { pointerType: "pen", button: 0 });
    act(() => rowOf("Priya Nair").focus());
    expect(ringedNames()).toEqual(["Priya Nair"]);
    type("a");
    expectAcked(PRIYA_EXC);
  });
});
