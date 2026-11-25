/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PanelHeader, type PanelNav } from "./PanelHeader";

function nav(total: number): PanelNav {
  return {
    index: 0,
    total,
    resolved: Array.from({ length: total }, () => false),
    resolvedCount: 0,
    onPrev: vi.fn(),
    onNext: vi.fn(),
  };
}

function renderHeader(total: number) {
  render(
    <PanelHeader
      clientName="Ishita Banerjee"
      meta="Rebuild morning routine · week 11 · 1 open item"
      nav={nav(total)}
      severity="critical"
      currentResolved={false}
      closeRef={{ current: null }}
      onClose={vi.fn()}
    />,
  );
}

describe("PanelHeader pager (W13-11, FLOW 6.7)", () => {
  afterEach(cleanup);

  it("has no pager and no dashes for a client with one open item", () => {
    renderHeader(1);
    expect(screen.queryByRole("button", { name: "Previous item" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next item" })).toBeNull();
    expect(screen.queryByText(/1 of 1/)).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByText("Critical")).toBeTruthy();
  });

  it("keeps the pager with two or more items", () => {
    renderHeader(2);
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next item" })).toBeTruthy();
  });
});
