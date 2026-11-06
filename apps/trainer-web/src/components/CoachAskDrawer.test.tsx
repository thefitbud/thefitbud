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
      <CoachAskDrawer askId={ASK_ID} clientName="Rohan" onClose={() => undefined} />
    </>,
  );
  return { ...utils, bodyStandIn };
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
    document.querySelector("[data-tab-body='true']")?.remove();
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

  it("keeps 30 Tabs inside the open drawer (0 escapes to BODY or the nav)", async () => {
    const { bodyStandIn } = mountAskDrawerOverPage();
    const dialog = await screen.findByRole("dialog", { name: "Asked-coach item" });
    await screen.findByRole("textbox");
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
    await screen.findByRole("textbox");
    const dialog = screen.getByRole("dialog", { name: "Asked-coach item" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const close = screen.getByRole("button", { name: "Close" });
    act(() => close.focus());
    pressTab(true);
    const active = document.activeElement;
    expect(active).toBe(screen.getByRole("button", { name: "More actions" }));
    expect(dialog.contains(active)).toBe(true);
    expect(nav.contains(active)).toBe(false);
    expect(active).not.toBe(document.body);
    expect(active).not.toBe(bodyStandIn);
  });
});
