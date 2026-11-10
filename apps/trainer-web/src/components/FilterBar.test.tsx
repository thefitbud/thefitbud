/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FilterBar, type FilterPillOption } from "./FilterBar";

const css = readFileSync(resolve(process.cwd(), "src/styles/clients.css"), "utf8");

function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  expect(close).toBeGreaterThan(open);
  return source.slice(open + 1, close);
}

const status: FilterPillOption[] = [
  { value: "invited", label: "Invited", count: 2 },
  { value: "onboarding_pending", label: "Pending", count: 1 },
  { value: "onboarding_submitted", label: "Submitted" },
  { value: "coaching_ready", label: "Ready" },
  { value: "active", label: "Active", count: 15 },
];

const adherence: FilterPillOption[] = [
  { value: "on_track", label: "On track", count: 4 },
  { value: "needs_attention", label: "Attention", count: 6 },
  { value: "no_recent_data", label: "No data" },
  { value: "not_available", label: "N/A" },
];

function renderBar(showClear = false) {
  const onSearchChange = vi.fn();
  const onClear = vi.fn();
  const onStatus = vi.fn();
  const onAdherence = vi.fn();
  const onGoal = vi.fn();
  const onRenewal = vi.fn();
  render(
    <FilterBar
      search=""
      onSearchChange={onSearchChange}
      showClear={showClear}
      onClear={onClear}
      status={{
        label: "Status",
        options: status,
        selected: ["active"],
        onToggle: onStatus,
      }}
      adherence={{
        label: "Adherence",
        options: adherence,
        selected: [],
        onToggle: onAdherence,
      }}
      goal={{
        label: "Goal",
        options: [{ value: "Lose fat", label: "Lose fat" }],
        selected: [],
        onToggle: onGoal,
      }}
      renewal={{
        label: "Renewal",
        options: [{ value: "expired", label: "Expired", count: 2 }],
        selected: [],
        onToggle: onRenewal,
      }}
    />,
  );
  return { onSearchChange, onClear, onStatus, onGoal, onRenewal };
}

afterEach(() => {
  cleanup();
});

describe("FilterBar", () => {
  it("shows the primary pills and keeps Goal and Renewal behind More", () => {
    const { onStatus, onRenewal } = renderBar();
    expect(screen.getByRole("searchbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Active 15" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByRole("button", { name: "Lose fat" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Expired/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "Lose fat" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expired 2" }));
    expect(onRenewal).toHaveBeenCalledWith("expired");
    expect(onStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Active 15" }));
    expect(onStatus).toHaveBeenCalledWith("active");
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

describe("FilterBar overflow styles", () => {
  it("wraps the row and each pill group so pills stay inside the bar", () => {
    const bar = ruleBody(css, ".filter-bar {");
    const row = ruleBody(css, ".filter-bar-row {");
    const group = ruleBody(css, ".filter-pill-group {");
    const pills = ruleBody(css, ".filter-pills {");

    expect(bar).toMatch(/overflow:\s*visible/);
    expect(bar).not.toMatch(/overflow-x:\s*hidden/);
    expect(row).toMatch(/flex-wrap:\s*wrap/);
    expect(row).toMatch(/overflow:\s*visible/);
    expect(row).not.toMatch(/overflow-x:\s*auto/);
    expect(row).not.toMatch(/overflow-y:\s*hidden/);
    expect(group).toMatch(/flex-wrap:\s*wrap/);
    expect(group).toMatch(/max-width:\s*100%/);
    expect(pills).toMatch(/flex-wrap:\s*wrap/);
    expect(pills).toMatch(/max-width:\s*100%/);

    const search = ruleBody(css, ".filter-bar-row > .filter-search {");
    const fixed = ruleBody(css, ".filter-bar-row > .filter-pill-group,");
    expect(search).toMatch(/flex:\s*1 1 120px/);
    expect(search).toMatch(/max-width:\s*168px/);
    expect(fixed).toMatch(/flex:\s*0 0 auto/);
  });
});
