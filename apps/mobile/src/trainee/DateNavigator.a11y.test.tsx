/**
 * Each day button says its state out loud (BT13, D-W4-16).
 *
 * The strip used to show the state only as a dot colour. These tests read
 * the accessible name react-native-web exposes (`aria-label`), which is what
 * a screen reader announces. The native branch is not exercised here
 * (D-W4-17).
 */
import { describe, expect, it } from "vitest";
import {
  colors,
  DateNavigator,
  type DateNavigatorDay,
} from "@fitbud/ui-mobile";
import { render, screen } from "../test/render";

const STATES = ["done", "partial", "due", "open", "rest", "future", "unknown"] as const;

function day(state: DateNavigatorDay["state"], index: number): DateNavigatorDay {
  return {
    localDate: `2026-10-${12 + index}`,
    weekdayLabel: "Wed",
    dayLabel: String(12 + index),
    state,
  };
}

describe("DateNavigator accessible names", () => {
  it.each(STATES)("says %s in that day's accessible name", (state) => {
    const index = STATES.indexOf(state);
    render(
      <DateNavigator
        days={[day(state, index)]}
        selectedDate="2026-10-12"
        todayDate="2026-10-14"
        onSelect={() => {}}
        onToday={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: `Wed ${12 + index}, ${state === "due" ? "to do" : state}` }),
    ).toBeTruthy();
  });
});

/** react-native-web writes a hex colour inline as `rgba(r, g, b, 1.00)`. */
function rgba(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 1.00)`;
}

function dotColourOf(button: HTMLElement): string {
  for (const node of button.querySelectorAll("div")) {
    const bg = (node as HTMLElement).style.backgroundColor;
    if (bg) return bg;
  }
  return "";
}

describe("DateNavigator dot colours", () => {
  it("paints due neutral dark grey, never the partial colour (D-W6-10)", () => {
    render(
      <DateNavigator
        days={[day("due", 0), day("partial", 1)]}
        selectedDate="2026-10-12"
        todayDate="2026-10-12"
        onSelect={() => {}}
        onToday={() => {}}
      />,
    );
    const due = dotColourOf(screen.getByRole("button", { name: "Wed 12, to do" }));
    const partial = dotColourOf(
      screen.getByRole("button", { name: "Wed 13, partial" }),
    );
    expect(due).toBe(rgba(colors.darkGrey));
    expect(partial).toBe(rgba(colors.warning));
    expect(due).not.toBe(partial);
  });
});
