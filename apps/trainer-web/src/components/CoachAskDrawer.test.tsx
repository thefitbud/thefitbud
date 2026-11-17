/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CoachAsk } from "@fitbud/contracts";

const ASK_ID = "11111111-1111-4111-8111-111111111111";
const PAIN_ASK_ID = "11111111-1111-4111-8111-111111111112";
const REL_ID = "22222222-2222-4222-8222-222222222222";
const MEAL_ID = "33333333-3333-4333-8333-333333333333";
const WORKOUT_ID = "44444444-4444-4444-8444-444444444444";

const api = vi.hoisted(() => ({
  listCoachAsks: vi.fn(),
  answerCoachAsk: vi.fn(),
  getClientWorkspace: vi.fn(),
  getMealAssignment: vi.fn(),
  getWorkoutAssignment: vi.fn(),
}));

vi.mock("../lib/stage1-api", () => ({
  stage1Api: {
    listCoachAsks: api.listCoachAsks,
    answerCoachAsk: api.answerCoachAsk,
  },
}));
vi.mock("../lib/api", () => ({
  apiClient: {
    getClientWorkspace: api.getClientWorkspace,
    getMealAssignment: api.getMealAssignment,
    getWorkoutAssignment: api.getWorkoutAssignment,
  },
}));

import { CoachAskDrawer } from "./CoachAskDrawer";

const openAsk: CoachAsk = {
  id: ASK_ID,
  relationshipId: REL_ID,
  itemType: "meal_assignment",
  itemId: MEAL_ID,
  topic: "portion_size",
  status: "open",
  askCount: 1,
  askedAt: "2026-10-22T08:00:00.000Z",
  lastAskedAt: "2026-10-22T08:00:00.000Z",
  itemLabel: "Lunch",
  itemDate: "2026-10-22",
};

const painAsk: CoachAsk = {
  id: PAIN_ASK_ID,
  relationshipId: REL_ID,
  itemType: "workout_assignment",
  itemId: WORKOUT_ID,
  topic: "pain",
  status: "open",
  askCount: 1,
  askedAt: "2026-10-22T08:00:00.000Z",
  lastAskedAt: "2026-10-22T08:00:00.000Z",
  itemLabel: "Lower body A",
  itemDate: "2026-10-22",
};

function workspaceHeader(overrides: Record<string, unknown> = {}) {
  return {
    header: {
      traineeDisplayName: "Ishita Banerjee",
      clientWhatsappE164: "+919820041736",
      traineeTimezone: "Asia/Kolkata",
      traineeProfile: { displayName: "Ishita Banerjee", age: 27, gender: "Female" },
      ...overrides,
    },
  };
}

async function renderDrawer(
  onClose: () => void,
  ask: CoachAsk = openAsk,
  clientName = "Ishita Banerjee",
) {
  const utils = render(
    <CoachAskDrawer askId={ask.id} clientName={clientName} onClose={onClose} />,
  );
  await screen.findByRole("button", { name: "Mark done" });
  return utils;
}

const PAGE_TAB_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function pageTabStops(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(PAGE_TAB_SELECTOR)].filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex >= 0,
  );
}

/**
 * Sequential focus navigation. happy-dom does not move focus on Tab, so this
 * advances it the way the browser does unless the drawer trap calls
 * preventDefault. Past the last stop, focus drops to BODY and the next Tab
 * enters the page at the first control (the nav behind the drawer).
 */
function pressTab(shiftKey = false) {
  const before = document.activeElement;
  act(() => {
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    const target = before instanceof Element ? before : document;
    target.dispatchEvent(event);
    if (event.defaultPrevented) return;
    if (document.activeElement !== before) return;

    const order = pageTabStops();
    const index = before instanceof HTMLElement ? order.indexOf(before) : -1;
    const onBody =
      before === document.body ||
      before === document.documentElement ||
      (before instanceof HTMLElement && before.dataset.tabBody === "true");
    if (onBody) {
      const entering = shiftKey ? order[order.length - 1] : order[0];
      entering?.focus();
      return;
    }
    const next = !shiftKey
      ? index >= 0 && index < order.length - 1
        ? order[index + 1]
        : null
      : index > 0
        ? order[index - 1]
        : null;
    if (next) {
      next.focus();
      return;
    }
    const standIn = document.querySelector<HTMLElement>("[data-tab-body='true']");
    if (standIn) standIn.focus();
    else document.body.focus();
  });
}

function mountAskDrawerOverPage() {
  const bodyStandIn = document.createElement("div");
  bodyStandIn.tabIndex = -1;
  bodyStandIn.dataset.tabBody = "true";
  document.body.appendChild(bodyStandIn);
  const utils = render(
    <>
      <nav aria-label="Primary">
        <a href="/today">Today</a>
        <a href="/clients">Clients</a>
      </nav>
      <button type="button">Page action</button>
      <CoachAskDrawer askId={ASK_ID} clientName="Ishita Banerjee" onClose={() => undefined} />
    </>,
  );
  return { ...utils, bodyStandIn };
}

describe("CoachAskDrawer (Z12-16)", () => {
  beforeEach(() => {
    api.listCoachAsks.mockImplementation(async () => ({ items: [openAsk, painAsk] }));
    api.answerCoachAsk.mockResolvedValue({});
    api.getClientWorkspace.mockResolvedValue(workspaceHeader());
    api.getMealAssignment.mockResolvedValue({
      id: MEAL_ID,
      mealName: "Lunch",
      localDate: "2026-10-22",
      windowStartsAt: "2026-10-22T08:00:00.000Z",
      windowEndsAt: "2026-10-22T10:00:00.000Z",
      prescription: {
        id: MEAL_ID,
        order: 2,
        name: "Lunch",
        scheduleHint: null,
        instructions: null,
        photoRequired: false,
        localTime: "13:30",
        items: [
          {
            snapshotKind: "legacy",
            name: "Rajma",
            classification: null,
            basis: null,
            canonical: null,
            serving: { label: "1 katori", unit: "serving", conversionScaled: null },
            quantityScaled: 1_000_000,
            calculated: { energyKcalScaled: 180_000_000 },
          },
          {
            snapshotKind: "legacy",
            name: "Rice",
            classification: null,
            basis: null,
            canonical: null,
            serving: { label: "1 cup", unit: "serving", conversionScaled: null },
            quantityScaled: 1_000_000,
            calculated: { energyKcalScaled: 200_000_000 },
          },
          {
            snapshotKind: "legacy",
            name: "Salad",
            classification: null,
            basis: null,
            canonical: null,
            serving: { label: "1 bowl", unit: "serving", conversionScaled: null },
            quantityScaled: 1_000_000,
            calculated: { energyKcalScaled: 140_000_000 },
          },
        ],
      },
    });
    api.getWorkoutAssignment.mockResolvedValue({
      id: WORKOUT_ID,
      workoutDayName: "Lower body A",
      localDate: "2026-10-22",
      windowStartsAt: "2026-10-22T03:30:00.000Z",
      windowEndsAt: "2026-10-22T18:29:00.000Z",
      workoutDay: {
        id: WORKOUT_ID,
        order: 1,
        name: "Lower body A",
        exercises: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            order: 1,
            name: "Walking lunge",
            instructions: null,
            primaryMuscles: [],
            secondaryMuscles: [],
            equipment: [],
            difficulty: null,
            setTargets: [
              { id: "66666666-6666-4666-8666-666666666661", order: 1, reps: 10, loadLabel: null, rpe: null },
              { id: "66666666-6666-4666-8666-666666666662", order: 2, reps: 10, loadLabel: null, rpe: null },
              { id: "66666666-6666-4666-8666-666666666663", order: 3, reps: 10, loadLabel: null, rpe: null },
            ],
          },
        ],
      },
    });
  });
  afterEach(() => {
    document.querySelector("[data-tab-body='true']")?.remove();
    cleanup();
    vi.clearAllMocks();
  });

  it("matches frame 182: Reply on WhatsApp, Mark done, Meal/Planned/Topic", async () => {
    await renderDrawer(() => undefined);
    expect(screen.getByRole("heading", { name: "Ishita Banerjee" })).toBeTruthy();
    expect(screen.getByText("Asked coach")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Asked about Lunch/ })).toBeTruthy();
    expect(screen.getByText(/Opened WhatsApp from her log/)).toBeTruthy();
    expect(screen.getByText(/From her meal log/)).toBeTruthy();
    expect(screen.getByText("Meal", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText(/Lunch · Thu 22 Oct/)).toBeTruthy();
    expect(screen.getByText("Planned", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText(/Rajma, 1 katori/)).toBeTruthy();
    expect(screen.getByText("Topic", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText("Portion size")).toBeTruthy();
    expect(
      screen.getByText(/The message itself is in your WhatsApp/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reply on WhatsApp/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark done" })).toBeTruthy();
    expect(
      screen.getByText(/Mark done once you've replied. Nothing is sent from FitBud./),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Visible to client")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("matches frame 183: pain chip + coral callout", async () => {
    render(
      <CoachAskDrawer
        askId={PAIN_ASK_ID}
        clientName="Ishita Banerjee"
        onClose={() => undefined}
      />,
    );
    await screen.findByRole("button", { name: "Mark done" });
    expect(document.querySelector(".cad-chip-pain")?.textContent).toMatch(/Pain/);
    expect(
      screen.getByText(/Pain topic. Reply today. If it sounds serious, ask her to pause/),
    ).toBeTruthy();
    expect(screen.getByText(/From her workout log/)).toBeTruthy();
    expect(screen.getByText("Workout", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText(/Walking lunge · 3 x 10/)).toBeTruthy();
    expect(screen.getByText("Pain", { selector: "dd" })).toBeTruthy();
  });

  it("focuses the Close (X) button when it opens", async () => {
    await renderDrawer(() => undefined);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );
  });

  it("calls the latest onClose on Escape", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = await renderDrawer(first);
    rerender(
      <CoachAskDrawer
        askId={ASK_ID}
        clientName="Ishita Banerjee"
        onClose={latest}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("calls onClose from the X and after Mark done saves", async () => {
    const onClose = vi.fn();
    await renderDrawer(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(api.answerCoachAsk).toHaveBeenCalledWith(
      ASK_ID,
      { note: null, visibleToClient: false },
      expect.any(String),
    );
  });

  it("keeps 30 Tabs inside the open drawer (0 escapes to BODY or the nav)", async () => {
    const { bodyStandIn } = mountAskDrawerOverPage();
    const dialog = await screen.findByRole("dialog", { name: "Asked-coach item" });
    await screen.findByRole("button", { name: "Mark done" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const seen = new Set<Element>();
    let bodyHits = 0;
    let navHits = 0;
    const outside: Array<Element | null> = [];

    for (let i = 0; i < 30; i += 1) {
      pressTab(false);
      const active = document.activeElement;
      if (active instanceof Element) seen.add(active);
      const onBody =
        active === document.body ||
        active === document.documentElement ||
        active === bodyStandIn;
      if (onBody) bodyHits += 1;
      if (active && nav.contains(active)) navHits += 1;
      if (!(active && dialog.contains(active))) outside.push(active);
    }

    expect(bodyHits).toBe(0);
    expect(navHits).toBe(0);
    expect(outside).toEqual([]);
    expect(seen.size).toBeGreaterThan(1);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("Shift+Tab from the first control wraps inside the drawer", async () => {
    const { bodyStandIn } = mountAskDrawerOverPage();
    await screen.findByRole("button", { name: "Mark done" });
    const dialog = screen.getByRole("dialog", { name: "Asked-coach item" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const close = screen.getByRole("button", { name: "Close" });
    act(() => close.focus());
    pressTab(true);
    const active = document.activeElement;
    expect(active).toBe(screen.getByRole("button", { name: "Mark done" }));
    expect(dialog.contains(active)).toBe(true);
    expect(nav.contains(active)).toBe(false);
    expect(active).not.toBe(document.body);
    expect(active).not.toBe(bodyStandIn);
  });
});
