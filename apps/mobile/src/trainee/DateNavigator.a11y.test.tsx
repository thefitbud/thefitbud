/**
 * Each day button says its state out loud (BT13, D-W4-16).
 *
 * The strip used to show the state only as a dot colour. These tests read
 * the accessible name react-native-web exposes (`aria-label`), which is what
 * a screen reader announces. The native branch is not exercised here
 * (D-W4-17).
 */
import { describe, expect, it } from "vitest";
import { DateNavigator, type DateNavigatorDay } from "@fitbud/ui-mobile";
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
