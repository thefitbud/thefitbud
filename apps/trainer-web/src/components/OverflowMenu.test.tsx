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

describe("OverflowMenu keyboard: trigger, Tab and ARIA", () => {
  it("activates the focused item on Space", () => {
    const menuItems = renderMenu();
    const rendered = openMenu();
    fireEvent.keyDown(rendered[0]!, { key: "End" });
    fireEvent.keyDown(rendered[4]!, { key: " " });

    expect(menuItems[4]?.onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Tab, hands focus to the trigger and keeps the browser's Tab", () => {
    const menuItems = renderMenu();
    const trigger = screen.getByRole("button", { name: "More actions" });
    const rendered = openMenu();
    fireEvent.keyDown(rendered[0]!, { key: "ArrowDown" });

    const notPrevented = fireEvent.keyDown(rendered[1]!, { key: "Tab" });

    expect(notPrevented).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(menuItems.every((item) => vi.mocked(item.onSelect).mock.calls.length === 0)).toBe(
      true,
    );
  });

  it("does not activate an item when Enter is pressed on the trigger", () => {
    const menuItems = renderMenu();
    const trigger = screen.getByRole("button", { name: "More actions" });
    openMenu();
    trigger.focus();

    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(menuItems.every((item) => vi.mocked(item.onSelect).mock.calls.length === 0)).toBe(
      true,
    );
  });

  it("moves from the trigger into the menu with ArrowDown and ArrowUp", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "More actions" });
    const menuItems = openMenu();

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(document.activeElement).toBe(menuItems[4]);

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems[0]);
  });

  it("uses menu roles, keeps items out of the Tab order and links the trigger", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("aria-controls")).toBe(false);

    const menuItems = openMenu();
    const menu = screen.getByRole("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    for (const item of menuItems) {
      expect(item.getAttribute("tabindex")).toBe("-1");
      expect(item.parentElement?.getAttribute("role")).toBe("none");
    }
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

describe("OverflowMenu default variant (unchanged for every other consumer)", () => {
  it("renders plain label buttons, no icons, descriptions, dividers or wide class", () => {
    renderMenu();
    const menuItems = openMenu();
    const menu = screen.getByRole("menu");
    expect(menu.className).toBe("overflow-menu-list");
    expect(screen.queryAllByRole("separator")).toHaveLength(0);
    expect(menu.querySelectorAll("li")).toHaveLength(items.length);
    for (const [index, item] of menuItems.entries()) {
      // Exactly one text node, the label, as before Z9-13.
      expect(item.childNodes).toHaveLength(1);
      expect(item.childNodes[0]?.nodeType).toBe(Node.TEXT_NODE);
      expect(item.textContent).toBe(items[index]?.label);
      expect(item.hasAttribute("aria-label")).toBe(false);
      expect(item.hasAttribute("aria-describedby")).toBe(false);
    }
    expect(menuItems[4]?.className).toBe(
      "overflow-menu-item overflow-menu-item-destructive",
    );
    expect(menuItems[0]?.className).toBe("overflow-menu-item");
  });
});

describe("OverflowMenu icons, descriptions and dividers (frame 208)", () => {
  const rich = (): OverflowMenuItem[] => [
    {
      id: "settings",
      label: "Client settings",
      description: "Basic details, subscription & package",
      icon: <svg data-testid="icon-settings" />,
      onSelect: vi.fn(),
    },
    {
      id: "answers",
      label: "Onboarding answers",
      icon: <svg data-testid="icon-answers" />,
      onSelect: vi.fn(),
    },
    {
      id: "end",
      label: "End coaching…",
      icon: <svg data-testid="icon-end" />,
      destructive: true,
      dividerBefore: true,
      onSelect: vi.fn(),
    },
  ];

  it("renders the icon, the description as an accessible description and a divider", () => {
    render(<OverflowMenu items={rich()} variant="wide" />);
    const menuItems = openMenu();
    const menu = screen.getByRole("menu");
    expect(menu.classList.contains("overflow-menu-list-wide")).toBe(true);

    // Accessible name stays the label; the description is described-by.
    const settings = screen.getByRole("menuitem", { name: "Client settings" });
    expect(settings.textContent).toContain("Basic details, subscription & package");
    const descId = settings.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId!)?.textContent).toBe(
      "Basic details, subscription & package",
    );
    expect(screen.getByRole("menuitem", { name: "Onboarding answers" }).hasAttribute(
      "aria-describedby",
    )).toBe(false);

    // Icons are decorative.
    const icon = screen.getByTestId("icon-settings");
    expect(icon.parentElement?.getAttribute("aria-hidden")).toBe("true");

    // One separator, right before End coaching, not a menu item.
    const separators = screen.getAllByRole("separator");
    expect(separators).toHaveLength(1);
    expect(separators[0]?.nextElementSibling?.querySelector('[role="menuitem"]')).toBe(
      menuItems[2],
    );
    expect(menuItems).toHaveLength(3);
  });

  it("arrow keys skip the divider and wrap", () => {
    render(<OverflowMenu items={rich()} variant="wide" />);
    const menuItems = openMenu();
    fireEvent.keyDown(menuItems[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems[1]);
    fireEvent.keyDown(menuItems[1]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems[2]);
    fireEvent.keyDown(menuItems[2]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(menuItems[1]);
    fireEvent.keyDown(menuItems[1]!, { key: "End" });
    expect(document.activeElement).toBe(menuItems[2]);
    fireEvent.keyDown(menuItems[2]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems[0]);
  });

  it("Enter on the trigger opens it natively, Escape closes and returns focus", () => {
    const menuItems = rich();
    render(<OverflowMenu items={menuItems} variant="wide" />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    trigger.focus();
    // Native button: Enter/Space fire click.
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Client settings" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Enter activates the focused rich item", () => {
    const menuItems = rich();
    render(<OverflowMenu items={menuItems} variant="wide" />);
    const rendered = openMenu();
    fireEvent.keyDown(rendered[0]!, { key: "End" });
    fireEvent.keyDown(rendered[2]!, { key: "Enter" });
    expect(menuItems[2]?.onSelect).toHaveBeenCalledTimes(1);
  });
});
