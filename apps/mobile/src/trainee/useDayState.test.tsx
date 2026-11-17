/**
 * One day state for Today, Diet and Workout (Z12-40): the day's kind, the
 * header eyebrow, the day moves and the swipe that makes them.
 */
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "../test/render";
import { localDateInTimezone } from "../lib/dates";
import {
  dayEyebrow,
  dayKindOf,
  longDayLabel,
  shouldClaimSwipe,
  swipeDirection,
  useDayState,
} from "./useDayState";

const TIME_ZONE = "Asia/Kolkata";

describe("dayKindOf", () => {
  it("places a civil date against the trainee's today", () => {
    expect(dayKindOf("2026-11-12", "2026-11-14")).toBe("past");
    expect(dayKindOf("2026-11-14", "2026-11-14")).toBe("today");
    expect(dayKindOf("2026-11-16", "2026-11-14")).toBe("future");
    expect(dayKindOf("2026-12-01", "2026-11-30")).toBe("future");
  });
});

describe("header eyebrow (TR-06a/c/d, TR-07a/k)", () => {
  it("reads the long weekday and the day and month, never ISO", () => {
    expect(longDayLabel("2026-11-12")).toBe("Thursday, 12 Nov");
    expect(longDayLabel("2026-11-16")).toBe("Monday, 16 Nov");
    expect(longDayLabel("2026-11-14")).toBe("Saturday, 14 Nov");
  });

  it("says past day, planned, or the screen's own suffix on today", () => {
    expect(dayEyebrow("2026-11-12", "past")).toBe("Thursday, 12 Nov · past day");
    expect(dayEyebrow("2026-11-16", "future")).toBe("Monday, 16 Nov · planned");
    expect(dayEyebrow("2026-11-14", "today")).toBe("Saturday, 14 Nov");
    expect(dayEyebrow("2026-11-14", "today", "Rahul’s plan")).toBe(
      "Saturday, 14 Nov · Rahul’s plan",
    );
    // A past or future day keeps its own suffix even where today has one.
    expect(dayEyebrow("2026-11-16", "future", "Rahul’s plan")).toBe(
      "Monday, 16 Nov · planned",
    );
  });
});

describe("swipe", () => {
  it("a left swipe is the next day, a right swipe the previous one", () => {
    expect(swipeDirection(-80, 5)).toBe(1);
    expect(swipeDirection(80, -5)).toBe(-1);
  });

  it("a short or mostly vertical drag is not a day change", () => {
    expect(swipeDirection(-30, 0)).toBe(0);
    expect(swipeDirection(-80, 60)).toBe(0);
    expect(shouldClaimSwipe(10, 0)).toBe(false);
    expect(shouldClaimSwipe(30, 40)).toBe(false);
    expect(shouldClaimSwipe(30, 5)).toBe(true);
  });
});

function Probe({ onSelect }: { onSelect: (date: string) => void }) {
  const today = localDateInTimezone(TIME_ZONE);
  const [date, setDate] = useState(today);
  const state = useDayState({
    selectedDate: date,
    onSelectDate: (next) => {
      onSelect(next);
      setDate(next);
    },
    timeZone: TIME_ZONE,
  });
  return (
    <>
      <span data-testid="kind">{state.kind}</span>
      <button onClick={state.goPrevDay}>prev</button>
      <button onClick={state.goNextDay}>next</button>
      <button onClick={state.goToToday}>today</button>
    </>
  );
}

describe("useDayState", () => {
  it("moves a day either way and back to today through the shared setter", () => {
    const onSelect = vi.fn();
    render(<Probe onSelect={onSelect} />);
    const today = localDateInTimezone(TIME_ZONE);
    expect(screen.getByTestId("kind").textContent).toBe("today");
    fireEvent.click(screen.getByText("prev"));
    expect(screen.getByTestId("kind").textContent).toBe("past");
    fireEvent.click(screen.getByText("prev"));
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("next"));
    expect(screen.getByTestId("kind").textContent).toBe("future");
    fireEvent.click(screen.getByText("today"));
    expect(screen.getByTestId("kind").textContent).toBe("today");
    expect(onSelect).toHaveBeenLastCalledWith(today);
    expect(onSelect).toHaveBeenCalledTimes(6);
  });
});
