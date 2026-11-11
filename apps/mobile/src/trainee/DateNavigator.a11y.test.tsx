/**
 * Each day button says its state out loud (BT13, D-W4-16).
 *
 * The strip used to show the state only as a dot colour. These tests read
 * the accessible name react-native-web exposes (`aria-label`), which is what
 * a screen reader announces. The native branch is not exercised here
 * (D-W4-17).
 */
import { describe, expect, it, vi } from "vitest";
import { formatCivilDate, labelFor } from "@fitbud/core";
import {
  colors,
  DateNavigator,
  type DateNavigatorDay,
} from "@fitbud/ui-mobile";
import { fireEvent, render, screen } from "../test/render";

const STATES = ["done", "partial", "due", "open", "rest", "future", "unknown"] as const;

/** `open` is the server's missed state; `unknown` has no shared label. */
function spokenState(state: DateNavigatorDay["state"]): string {
  if (state === "open") return labelFor("week_day_state", "missed");
  if (state === "unknown") return "State not known";
  return labelFor("week_day_state", state);
}

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
    const spoken = `${formatCivilDate(`2026-10-${12 + index}`)}, ${spokenState(state)}`;
    expect(screen.getByRole("button", { name: spoken })).toBeTruthy();
    expect(spoken).not.toContain(`2026-10-${12 + index}`);
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
    const due = dotColourOf(
      screen.getByRole("button", {
        name: `${formatCivilDate("2026-10-12")}, ${labelFor("week_day_state", "due")}`,
      }),
    );
    const partial = dotColourOf(
      screen.getByRole("button", {
        name: `${formatCivilDate("2026-10-13")}, ${labelFor("week_day_state", "partial")}`,
      }),
    );
    expect(due).toBe(rgba(colors.darkGrey));
    expect(partial).toBe(rgba(colors.warning));
    expect(due).not.toBe(partial);
  });
});

describe("DateNavigator strip (Z10-20, frame 04)", () => {
  const props = {
    days: [day("done", 0), day("partial", 1)],
    todayDate: "2026-10-12",
    onToday: () => {},
  };

  it("labels today's cell 'Today' and moves a week with the chevrons", () => {
    const onSelect = vi.fn();
    render(<DateNavigator {...props} selectedDate="2026-10-12" onSelect={onSelect} />);
    expect(screen.getByText("Today")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(onSelect).toHaveBeenLastCalledWith("2026-10-19");
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(onSelect).toHaveBeenLastCalledWith("2026-10-05");
  });

  it("hides its own Today pill when the host has another way back", () => {
    render(
      <DateNavigator
        {...props}
        selectedDate="2026-10-13"
        onSelect={() => {}}
        showTodayPill={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Go to today" })).toBeNull();
  });
});
