/**
 * The Expo-web date strip says each day's state and tells `unknown` apart
 * from `future` (Z5-9, G1).
 *
 * `WebDateHeading` used to show the state only as a dot colour, with no
 * accessible name on the day buttons, and its `dotColor` `default` painted
 * `unknown` (a day the server never described) the same grey as `future`.
 *
 * Harness (CU6): happy-dom plus react-native-web, which is exactly the
 * runtime this component is written for. Accessible names are read from
 * `aria-label`, which is what a screen reader announces on web.
 */
import { describe, expect, it } from "vitest";
import { colors, type DateNavigatorDay } from "@fitbud/ui-mobile";
import { render, screen } from "../../test/render";
import { WebDateHeading, webDayStateLabel } from "./WebTraineeChrome";

const TIME_ZONE = "Asia/Kolkata";
const STATES = ["done", "partial", "open", "rest", "future", "unknown", "due"] as const;

/** What a screen reader says for each strip state. */
const SPOKEN: Record<DateNavigatorDay["state"], string> = {
  done: "Done",
  partial: "Partial",
  due: "To do",
  open: "Missed",
  rest: "Rest",
  future: "Upcoming",
  unknown: "State not known",
};

function day(state: DateNavigatorDay["state"], index: number): DateNavigatorDay {
  return {
    localDate: `2026-10-${String(12 + index).padStart(2, "0")}`,
    weekdayLabel: "Wed",
    dayLabel: String(12 + index),
    state,
  };
}

const WEEK = STATES.map((state, index) => day(state, index));

/** react-native-web writes a hex colour inline as `rgba(r, g, b, 1.00)`. */
function rgba(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 1.00)`;
}

/** The dot inside a day button: its only inline background. */
function dotColourOf(button: HTMLElement): string {
  for (const node of button.querySelectorAll("div")) {
    const bg = (node as HTMLElement).style.backgroundColor;
    if (bg) return bg;
  }
  return "";
}

function renderStrip(selectedDate = WEEK[0]!.localDate) {
  return render(
    <WebDateHeading
      timeZone={TIME_ZONE}
      selectedDate={selectedDate}
      onSelectDate={() => {}}
      today="2026-10-14"
      days={WEEK}
    />,
  );
}

describe("WebDateHeading accessible state", () => {
  it.each(STATES)("names the %s day with its state in words", (state) => {
    const index = STATES.indexOf(state);
    renderStrip();
    expect(
      screen.getByRole("button", {
        name: `Wed ${12 + index}, ${SPOKEN[state]}`,
      }),
    ).toBeTruthy();
  });

  it("speaks no raw enum value", () => {
    for (const state of STATES) {
      const spoken = webDayStateLabel(state);
      expect(spoken).not.toBe(state);
      expect(spoken).not.toMatch(/^[a-z_]+$/);
    }
    // `open` is the server's `missed`; it is never read out as "open".
    expect(webDayStateLabel("open")).toBe("Missed");
  });

  it("marks only the selected day as the current date", () => {
    // `aria-current="date"`, not `aria-selected`: ARIA does not allow
    // `aria-selected` on role=button.
    renderStrip(WEEK[2]!.localDate);
    const selected = screen.getByRole("button", { name: "Wed 14, Missed" });
    expect(selected.getAttribute("aria-current")).toBe("date");
    expect(selected.hasAttribute("aria-selected")).toBe(false);
    for (const state of STATES) {
      if (state === "open") continue;
      const index = STATES.indexOf(state);
      const other = screen.getByRole("button", {
        name: `Wed ${12 + index}, ${SPOKEN[state]}`,
      });
      expect(other.hasAttribute("aria-current")).toBe(false);
    }
  });
});

describe("WebDateHeading dot colours", () => {
  function colourFor(state: DateNavigatorDay["state"]): string {
    const index = STATES.indexOf(state);
    const button = screen.getByRole("button", {
      name: `Wed ${12 + index}, ${SPOKEN[state]}`,
    });
    return dotColourOf(button);
  }

  it("paints unknown and future differently", () => {
    renderStrip();
    expect(colourFor("unknown")).not.toBe("");
    expect(colourFor("unknown")).not.toBe(colourFor("future"));
  });

  it("paints unknown the native strip's no-information grey and future mid grey", () => {
    renderStrip();
    expect(colourFor("unknown")).toBe(rgba(colors.lightGrey));
    expect(colourFor("future")).toBe(rgba(colors.midGrey));
  });

  it("keeps the other states' colours", () => {
    renderStrip();
    expect(colourFor("done")).toBe(rgba(colors.success));
    expect(colourFor("partial")).toBe(rgba(colors.warning));
    expect(colourFor("open")).toBe(rgba(colors.indigo));
    expect(colourFor("rest")).toBe(rgba(colors.lightGrey));
  });
});
