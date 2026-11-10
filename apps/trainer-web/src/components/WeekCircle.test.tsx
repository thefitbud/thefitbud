/**
 * @vitest-environment happy-dom
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { weekDayStateSchema, type WeekDayState } from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import { WeekCircle, weekCirclePresentation } from "./WeekCircle";

function weekCircleCss(): string {
  const besideTest = import.meta.url.startsWith("file:")
    ? join(dirname(fileURLToPath(import.meta.url)), "week-circle.css")
    : null;
  const candidates = [
    besideTest,
    join(process.cwd(), "src/components/week-circle.css"),
    join(process.cwd(), "apps/trainer-web/src/components/week-circle.css"),
  ].filter((path): path is string => path != null && existsSync(path));
  const path = candidates[0];
  if (!path) throw new Error("week-circle.css not found");
  return readFileSync(path, "utf8");
}

const css = weekCircleCss();

afterEach(() => {
  cleanup();
});

describe("weekCirclePresentation", () => {
  it("gives every week-day state its own marker and spoken label", () => {
    const seen = new Map<string, WeekDayState>();
    for (const state of weekDayStateSchema.options) {
      const presentation = weekCirclePresentation(state);
      expect(presentation.state).toBe(state);
      expect(presentation.label).toBe(labelFor("week_day_state", state));
      expect(presentation.label).not.toBe(state);
      expect(seen.has(presentation.marker)).toBe(false);
      seen.set(presentation.marker, state);
    }
    expect(seen.size).toBe(weekDayStateSchema.options.length);
  });

  it("shows a started past day (API state partial) as partial, not rest", () => {
    const partial = weekCirclePresentation("partial");
    const rest = weekCirclePresentation("rest");
    expect(partial.marker).toBe("half");
    expect(partial.marker).not.toBe(rest.marker);
    expect(partial.label).toBe("Partial");
    expect(rest.label).toBe("Rest");
  });

  it("shows unlogged today (API state due) as To do, not partial", () => {
    const due = weekCirclePresentation("due");
    const partial = weekCirclePresentation("partial");
    expect(due.label).toBe("To do");
    expect(due.marker).toBe("open");
    expect(due.marker).not.toBe(partial.marker);
  });

  it("keeps done as the completed circle (a skip counts toward done)", () => {
    expect(weekCirclePresentation("done")).toEqual({
      state: "done",
      label: "Done",
      marker: "check",
    });
    const states: readonly string[] = weekDayStateSchema.options;
    expect(states).not.toContain("skipped");
  });
});

describe("WeekCircle", () => {
  it.each(weekDayStateSchema.options)(
    "renders %s with its label and marker",
    (state) => {
      const presentation = weekCirclePresentation(state);
      render(<WeekCircle state={state} />);
      const circle = screen.getByRole("img");
      expect(circle.getAttribute("aria-label")).toBe(presentation.label);
      expect(circle.getAttribute("title")).toBe(presentation.label);
      expect(circle.getAttribute("data-state")).toBe(state);
      expect(circle.getAttribute("data-marker")).toBe(presentation.marker);
      expect(circle.className).toBe(`week-circle week-circle--${state}`);
      expect(circle.textContent?.trim() ?? "").toBe("");
    },
  );

  it("does not paint a past partial day with the rest dash", () => {
    const { container } = render(<WeekCircle state="partial" />);
    const circle = screen.getByRole("img");
    expect(circle.className).toContain("week-circle--partial");
    expect(circle.className).not.toContain("week-circle--rest");
    expect(container.querySelector(".week-circle__half")).not.toBeNull();
    expect(container.querySelector(".week-circle__dash")).toBeNull();
    expect(circle.getAttribute("aria-label")).toBe("Partial");
  });

  it("paints today due as an open circle, not the partial half", () => {
    const { container } = render(<WeekCircle state="due" />);
    const circle = screen.getByRole("img");
    expect(circle.getAttribute("data-marker")).toBe("open");
    expect(circle.getAttribute("aria-label")).toBe("To do");
    expect(circle.className).not.toContain("week-circle--partial");
    expect(container.querySelector(".week-circle__half")).toBeNull();
    expect(container.querySelector(".week-circle__dash")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("uses a check for done and a cross for missed", () => {
    const { unmount } = render(<WeekCircle state="done" />);
    expect(screen.getByRole("img").querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("img").getAttribute("data-marker")).toBe("check");
    unmount();
    render(<WeekCircle state="missed" />);
    expect(screen.getByRole("img").getAttribute("data-marker")).toBe("cross");
    expect(screen.getByRole("img").querySelector("svg")).not.toBeNull();
  });

  it("appends a caller class without dropping the state class", () => {
    render(<WeekCircle state="future" className="ov-wk" />);
    expect(screen.getByRole("img").className).toBe(
      "week-circle week-circle--future ov-wk",
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Upcoming");
  });
});

describe("week-circle.css", () => {
  it("gives partial its own half-disc rule, separate from the rest dash", () => {
    expect(css).not.toMatch(/week-circle--rest\s*,[^}]*week-circle--partial/);
    expect(css).not.toMatch(/week-circle--partial\s*,[^}]*week-circle--rest/);
    expect(css).toContain(".week-circle__half");
    expect(css).toContain(".week-circle__dash");
    // A centred disc filled on one half only, so it reads as a half circle.
    const half = /\.week-circle__half\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(half).toMatch(/border-radius:\s*50%/);
    expect(half).toMatch(/width:\s*1\.125rem/);
    expect(half).toMatch(/height:\s*1\.125rem/);
    expect(half).toMatch(/linear-gradient\(\s*90deg,[^;]*50%,\s*transparent 50%/);
    expect(css).toMatch(/\.week-circle__dash\s*\{[^}]*height:\s*2px/);
  });

  it("draws due as a solid open ring and future as a dashed ring", () => {
    expect(css).toMatch(/\.week-circle--due\s*\{[^}]*border:\s*1\.5px solid/);
    expect(css).toMatch(/\.week-circle--future\s*\{[^}]*border:\s*1\.5px dashed/);
    expect(css).not.toMatch(/\.week-circle--due\s*\{[^}]*dashed/);
  });
});
