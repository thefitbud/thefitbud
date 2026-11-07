/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  OverflowMenu,
  placeOverflowMenu,
  type OverflowMenuItem,
} from "./OverflowMenu";

const items: OverflowMenuItem[] = [
  { id: "settings", label: "Client settings", onSelect: vi.fn() },
  { id: "setup", label: "Coaching setup", onSelect: vi.fn() },
  { id: "answers", label: "Onboarding answers", onSelect: vi.fn() },
  { id: "reminders", label: "Reminder settings", onSelect: vi.fn() },
  { id: "end", label: "End coaching", onSelect: vi.fn(), destructive: true },
];

function renderMenu(
  menuItems: OverflowMenuItem[] = items.map((item) => ({
    ...item,
    onSelect: vi.fn(),
  })),
) {
  render(<OverflowMenu items={menuItems} />);
  return menuItems;
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  return screen.getAllByRole("menuitem");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OverflowMenu keyboard", () => {
  it("returns focus to the trigger on Escape", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "More actions" });
    openMenu();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Client settings" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("moves with ArrowUp and ArrowDown, wrapping at the ends", () => {
    renderMenu();
    const menuItems = openMenu();
    expect(document.activeElement).toBe(menuItems[0]);

    fireEvent.keyDown(menuItems[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems[1]);

    fireEvent.keyDown(menuItems[1]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(menuItems[0]);

    fireEvent.keyDown(menuItems[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(menuItems[4]);

    fireEvent.keyDown(menuItems[4]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems[0]);
  });

  it("skips disabled items", () => {
    renderMenu([
      { id: "a", label: "First", onSelect: vi.fn() },
      { id: "b", label: "Middle", onSelect: vi.fn(), disabled: true },
      { id: "c", label: "Last", onSelect: vi.fn() },
    ]);
    openMenu();
    const first = screen.getByRole("menuitem", { name: "First" });
    const last = screen.getByRole("menuitem", { name: "Last" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(last);
    expect(screen.getByRole("menuitem", { name: "Middle" })).toHaveProperty("disabled", true);
  });

  it("jumps with Home and End", () => {
    renderMenu();
    const menuItems = openMenu();
    fireEvent.keyDown(menuItems[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems[1]);

    fireEvent.keyDown(menuItems[1]!, { key: "End" });
    expect(document.activeElement).toBe(menuItems[4]);

    fireEvent.keyDown(menuItems[4]!, { key: "Home" });
    expect(document.activeElement).toBe(menuItems[0]);
  });

  it("activates the focused item on Enter and closes", () => {
    const menuItems = renderMenu();
    const rendered = openMenu();
    fireEvent.keyDown(rendered[0]!, { key: "ArrowDown" });
    fireEvent.keyDown(rendered[1]!, { key: "Enter" });

    expect(menuItems[1]?.onSelect).toHaveBeenCalledTimes(1);
    expect(menuItems[0]?.onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "More actions" }),
    );
  });
});

describe("placeOverflowMenu", () => {
  it("flips a right-aligned menu that would clip off the left at 393px", () => {
    // QA-PR27 finding 8: 5-item menu measured from x -132 to 60.
    const placed = placeOverflowMenu({
      trigger: { left: 28, top: 72, right: 60, bottom: 104 },
      menu: { width: 192, height: 220 },
      viewport: { width: 393, height: 852 },
    });

    expect(placed.flippedX).toBe(true);
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.left + 192).toBeLessThanOrEqual(393 - 8);
    expect(placed.top).toBe(104 + 4);
    expect(placed.flippedY).toBe(false);
  });

  it("keeps the right-aligned default when that side fits", () => {
    const placed = placeOverflowMenu({
      trigger: { left: 1368, top: 72, right: 1400, bottom: 104 },
      menu: { width: 192, height: 220 },
      viewport: { width: 1440, height: 900 },
    });

    expect(placed.flippedX).toBe(false);
    expect(placed.left).toBe(1400 - 192);
    expect(placed.left + 192).toBeLessThanOrEqual(1440 - 8);
  });

  it("flips above the trigger when the menu would clip the bottom", () => {
    const placed = placeOverflowMenu({
      trigger: { left: 1200, top: 800, right: 1240, bottom: 832 },
      menu: { width: 192, height: 220 },
      viewport: { width: 1440, height: 900 },
    });

    expect(placed.flippedY).toBe(true);
    expect(placed.top).toBe(800 - 4 - 220);
    expect(placed.top).toBeGreaterThanOrEqual(8);
  });

  it("clamps into the viewport when both sides overflow", () => {
    const placed = placeOverflowMenu({
      trigger: { left: -40, top: -30, right: -8, bottom: 2 },
      menu: { width: 192, height: 80 },
      viewport: { width: 393, height: 200 },
    });

    expect(placed.left).toBe(8);
    expect(placed.top).toBe(8);
    expect(placed.left + 192).toBeLessThanOrEqual(393 - 8);
  });
});

describe("OverflowMenu viewport clamp", () => {
  it("writes a flipped left edge when the menu would start at x -132", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 393 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 852 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function mockRect(
      this: HTMLElement,
    ) {
      if (this.classList.contains("overflow-menu-list")) {
        return new DOMRect(-132, 108, 192, 220);
      }
      if (this.classList.contains("overflow-menu")) {
        return new DOMRect(28, 72, 32, 32);
      }
      return new DOMRect(0, 0, 0, 0);
    });

    renderMenu();
    openMenu();
    const menu = screen.getByRole("menu");

    expect(menu.style.right).toBe("auto");
    expect(menu.style.left).toBe("0px");
    expect(Number.parseFloat(menu.style.left) + 28).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(menu.style.left) + 28 + 192).toBeLessThanOrEqual(393);
  });
});
