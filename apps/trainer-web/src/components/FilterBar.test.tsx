/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FilterBar, type FilterOption } from "./FilterBar";

const css = readFileSync(resolve(process.cwd(), "src/styles/clients.css"), "utf8");

function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  expect(close).toBeGreaterThan(open);
  return source.slice(open + 1, close);
}

const status: FilterOption[] = [
  { value: "invited", label: "Invited", count: 2 },
  { value: "active", label: "Active", count: 15 },
];

const adherence: FilterOption[] = [
  { value: "on_track", label: "On track", count: 4 },
  { value: "needs_attention", label: "Needs attention", count: 6 },
];

function renderBar(showClear = false) {
  const fns = {
    onSearchChange: vi.fn(),
    onClear: vi.fn(),
    onStatus: vi.fn(),
    onAdherence: vi.fn(),
    onGoal: vi.fn(),
    onRenewal: vi.fn(),
  };
  render(
    <FilterBar
      search=""
      onSearchChange={fns.onSearchChange}
      showClear={showClear}
      onClear={fns.onClear}
      trailing={<div role="tablist" aria-label="Client list segment" />}
      status={{
        label: "Status",
        options: status,
        selected: ["active"],
        onToggle: fns.onStatus,
        onClear: vi.fn(),
      }}
      adherence={{
        label: "Adherence",
        options: adherence,
        selected: [],
        onToggle: fns.onAdherence,
        onClear: vi.fn(),
      }}
      goal={{
        label: "Goal",
        options: [{ value: "Lose fat", label: "Lose fat" }],
        selected: [],
        onToggle: fns.onGoal,
        onClear: vi.fn(),
      }}
      renewal={{
        label: "Renewal",
        options: [{ value: "expired", label: "Expired", count: 2 }],
        selected: [],
        onToggle: fns.onRenewal,
        onClear: vi.fn(),
      }}
    />,
  );
  return fns;
}

afterEach(() => cleanup());

describe("FilterBar", () => {
  it("renders search, the four dropdowns in order, then the trailing switch in one row", () => {
    renderBar();
    const row = screen.getByTestId("filter-bar").querySelector(".filter-bar-row")!;
    expect(screen.getByRole("searchbox")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search clients")).toBeTruthy();
    const triggers = Array.from(
      row.querySelectorAll<HTMLButtonElement>(".filter-dropdown-trigger"),
    ).map((b) => b.textContent);
    expect(triggers).toEqual([
      "Status: Active",
      "Adherence",
      "Goal",
      "Renewal",
    ]);
    // No inline pills and no More button (D-W8-13).
    expect(row.querySelector(".filter-pill")).toBeNull();
    expect(screen.queryByRole("button", { name: /^More/ })).toBeNull();
    expect(row.lastElementChild?.className).toBe("filter-bar-trailing");
    expect(
      row.lastElementChild?.querySelector("[role='tablist']"),
    ).toBeTruthy();
  });

  it("routes each dropdown pick to its own handler", () => {
    const fns = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Renewal" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Expired/ }));
    expect(fns.onRenewal).toHaveBeenCalledWith("expired");
    expect(fns.onStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Adherence" }));
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: /Needs attention/ }),
    );
    expect(fns.onAdherence).toHaveBeenCalledWith("needs_attention");
  });

  it("forwards search typing", () => {
    const fns = renderBar();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "rohan" },
    });
    expect(fns.onSearchChange).toHaveBeenCalledWith("rohan");
  });

  it("calls onClear only when Clear is shown", () => {
    const hidden = renderBar(false);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    cleanup();
    const shown = renderBar(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(shown.onClear).toHaveBeenCalledOnce();
    expect(hidden.onClear).not.toHaveBeenCalled();
  });
});

describe("Clients toolbar and table styles", () => {
  it("keeps the toolbar one wrapping row with the switch pushed right", () => {
    const row = ruleBody(css, ".filter-bar-row {");
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/flex-wrap:\s*wrap/);
    expect(row).not.toMatch(/overflow-x:\s*(auto|hidden|scroll)/);
    expect(ruleBody(css, ".filter-bar-trailing {")).toMatch(/margin-left:\s*auto/);
    expect(ruleBody(css, ".filter-bar-row > .filter-search {")).toMatch(
      /flex:\s*0 1 280px/,
    );
  });

  it("sizes the table to fit instead of scrolling the Action column away", () => {
    const wrap = ruleBody(css, ".clients-table-wrap {");
    expect(wrap).not.toMatch(/overflow-x:\s*auto/);
    expect(ruleBody(css, ".clients-table {")).toMatch(/table-layout:\s*fixed/);
    expect(ruleBody(css, ".clients-table .col-action {")).toMatch(
      /width:\s*\d+px/,
    );
    const truncate = ruleBody(css, ".clients-table .client-name,");
    expect(truncate).toMatch(/text-overflow:\s*ellipsis/);
    expect(truncate).toMatch(/white-space:\s*nowrap/);
  });
});
