import { useCallback, useMemo, useRef } from "react";
import { PanResponder, type GestureResponderHandlers } from "react-native";
import { formatCivilDate } from "@fitbud/core";
import { addDays } from "../lib/dates";
import { useLocalToday } from "./futureDay";

/**
 * One day state for Today, Diet and Workout (Z12-40).
 *
 * The selected civil date lives once, in the trainee shell, and arrives in
 * each tab as `selectedDate` / `onSelectDate`; this hook derives everything a
 * tab needs from it so the three tabs cannot disagree: where the day sits
 * against the trainee's own today, the header eyebrow, the moves to the
 * previous and next day, and the swipe on the tab body that makes those
 * moves.
 */

export type DayKind = "past" | "today" | "future";

export function dayKindOf(selectedDate: string, today: string): DayKind {
  if (selectedDate === today) return "today";
  // ISO civil dates compare as strings.
  return selectedDate < today ? "past" : "future";
}

const LONG_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "Thursday, 12 Nov": the header's long form (TR-06a/c/d, TR-07a/k). */
export function longDayLabel(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const weekday = LONG_WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
  // formatCivilDate is "Thu 12 Nov"; keep its day and month.
  const [, day, month] = formatCivilDate(localDate).split(" ");
  return `${weekday}, ${day} ${month}`;
}

/**
 * The eyebrow over a day screen's title. A past day reads "· past day", a
 * future one "· planned" (TR-06c, TR-06d, TR-07k); today carries the
 * screen's own suffix, if any ("· Rahul’s plan" on Diet, TR-07a).
 */
export function dayEyebrow(
  localDate: string,
  kind: DayKind,
  todaySuffix?: string | null,
): string {
  const date = longDayLabel(localDate);
  if (kind === "past") return `${date} · past day`;
  if (kind === "future") return `${date} · planned`;
  return todaySuffix ? `${date} · ${todaySuffix}` : date;
}

/** Horizontal travel (pt) that counts as a swipe, and the slope it must keep. */
export const SWIPE_DISTANCE = 56;
const SWIPE_CLAIM = 18;

/**
 * Which way a finished horizontal gesture moves the day: a swipe to the left
 * shows the next day, to the right the previous one (the strip reads left to
 * right). Mostly vertical travel is a scroll, never a day change.
 */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_DISTANCE) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 2) return 0;
  return dx < 0 ? 1 : -1;
}

export function shouldClaimSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_CLAIM && Math.abs(dx) > Math.abs(dy) * 2;
}

export type DayState = {
  today: string;
  kind: DayKind;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  goToDay: (localDate: string) => void;
  goToToday: () => void;
  goPrevDay: () => void;
  goNextDay: () => void;
  /** Spread on the tab body's wrapping view: a horizontal swipe changes day. */
  swipeHandlers: GestureResponderHandlers;
};

export function useDayState(input: {
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
  timeZone: string;
}): DayState {
  const { selectedDate, onSelectDate, timeZone } = input;
  // Kept current across local midnight and app foregrounding (Z12-39).
  const today = useLocalToday(timeZone);
  const kind = dayKindOf(selectedDate, today);

  // The responder is built once; it reads the latest day through a ref so a
  // swipe never acts on the day that was selected when it was created.
  const latest = useRef({ selectedDate, onSelectDate });
  latest.current = { selectedDate, onSelectDate };

  const goToDay = useCallback(
    (localDate: string) => latest.current.onSelectDate(localDate),
    [],
  );
  const goPrevDay = useCallback(() => {
    const { selectedDate: day, onSelectDate: select } = latest.current;
    select(addDays(day, -1));
  }, []);
  const goNextDay = useCallback(() => {
    const { selectedDate: day, onSelectDate: select } = latest.current;
    select(addDays(day, 1));
  }, []);
  const goToToday = useCallback(() => goToDay(today), [goToDay, today]);

  const swipeHandlers = useMemo(
    () =>
      PanResponder.create({
        // Only a clearly horizontal drag is claimed; taps and vertical
        // scrolls stay with the rows and the scroll view.
        onMoveShouldSetPanResponder: (_e, g) => shouldClaimSwipe(g.dx, g.dy),
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          shouldClaimSwipe(g.dx, g.dy),
        // Once a drag is clearly horizontal it stays a day swipe: the
        // vertical scroll view must not take it over halfway (iOS).
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          const direction = swipeDirection(g.dx, g.dy);
          if (direction === 1) goNextDay();
          else if (direction === -1) goPrevDay();
        },
      }).panHandlers,
    [goNextDay, goPrevDay],
  );

  return {
    today,
    kind,
    isToday: kind === "today",
    isPast: kind === "past",
    isFuture: kind === "future",
    goToDay,
    goToToday,
    goPrevDay,
    goNextDay,
    swipeHandlers,
  };
}
