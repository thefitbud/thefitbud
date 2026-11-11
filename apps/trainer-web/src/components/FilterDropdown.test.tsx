/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  FilterDropdown,
  filterDropdownSummary,
  type FilterOption,
} from "./FilterDropdown";

const options: FilterOption[] = [
  { value: "invited", label: "Invited", count: 2 },
  { value: "onboarding_pending", label: "Onboarding", count: 1 },
  { value: "active", label: "Active", count: 15 },
];

function renderDropdown(selected: string[] = []) {
  const onToggle = vi.fn();
  const onClear = vi.fn();
  render(
    <FilterDropdown
      label="Status"
      options={options}
      selected={selected}
      onToggle={onToggle}
      onClear={onClear}
    />,
  );
  return { onToggle, onClear };
}

afterEach(() => cleanup());

describe("filterDropdownSummary", () => {
  it("spells the selection out in text", () => {
    expect(filterDropdownSummary("Status", options, [])).toBe("Status");
    expect(filterDropdownSummary("Status", options, ["invited"])).toBe(
      "Status: Invited",
    );
    expect(
      filterDropdownSummary("Status", options, ["invited", "active"]),
    ).toBe("Status: Invited +1");
  });
});

describe("FilterDropdown", () => {
  it("opens a menu of checkable options with counts and picks one", () => {
    const { onToggle } = renderDropdown();
    const trigger = screen.getByRole("button", { name: "Status" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: "Status" });
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    const items = screen.getAllByRole("menuitemcheckbox");
    expect(items.map((item) => item.textContent)).toEqual([
      "Invited 2",
      "Onboarding 1",
      "Active 15",
    ]);
    fireEvent.click(items[2]!);
    expect(onToggle).toHaveBeenCalledWith("active");
    // Multi-select: the menu stays open after a pick.
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("shows the selection on the closed button and clears it", () => {
    const { onClear } = renderDropdown(["invited"]);
    const trigger = screen.getByRole("button", { name: "Status: Invited" });
    fireEvent.click(trigger);
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: /Invited/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear status" }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("has no Clear item when nothing is selected", () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.queryByRole("menuitem", { name: /Clear/ })).toBeNull();
  });

  it("supports the keyboard: Enter opens, arrows move, Escape returns focus", () => {
    const { onToggle } = renderDropdown();
    const trigger = screen.getByRole("button", { name: "Status" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    const items = screen.getAllByRole("menuitemcheckbox");
    expect(document.activeElement).toBe(items[0]);

    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.click(document.activeElement as HTMLElement);
    expect(onToggle).toHaveBeenCalledWith("active");

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("ArrowUp on the button opens with the last option focused", () => {
    renderDropdown();
    const trigger = screen.getByRole("button", { name: "Status" });
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    const items = screen.getAllByRole("menuitemcheckbox");
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("closes on a pointer down outside", () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
