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
  useRealtimeHints: () => undefined,
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
