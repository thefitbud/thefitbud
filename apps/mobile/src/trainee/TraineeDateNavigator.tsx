import { useMemo } from "react";
import { Platform, StyleSheet } from "react-native";
import { Text } from "../components/Text";
import type {
  MeDayResponse,
  WeekDayState,
  WeekReadModel,
} from "@fitbud/contracts";
import {
  DateNavigator,
  colors,
  type DateNavigatorDay,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import {
  dayOfMonth,
  formatHeadingDate,
  localDateInTimezone,
  startOfWeekMonday,
  weekDatesFrom,
  weekdayShort,
} from "../lib/dates";
import { reportError } from "../lib/reportError";
import { WebDateHeading } from "./web/WebTraineeChrome";

/**
 * The trainee's week read model as an explicit load state (CU23, D-W3b-25),
 * following the four-state shape CU22/CU24 established for the plan
 * (`EffectivePlanState` in `TodayTab.tsx`).
 *
 * `weekModel: WeekReadModel | null` used to carry two different facts — "not
 * loaded yet" and "the call failed" — and all three call sites answered the
 * second with day states derived from the date alone: `future` ahead of
 * today, `missed` behind it. `GET /me/week` had never been implemented, so
 * every call threw and every trainee saw every past day as `missed` whether
 * or not it was. That silent fallback is the defect CU23 removes.
 *
 * It is a discriminated union, not a nullable model and not a boolean beside
 * one: the days are reachable only through `loaded`, so `unavailable` cannot
 * be read as "no days this week" without narrowing on `status` first.
 *
 * D-W3b-25's "Weekly view isn't available yet" dress-rehearsal fallback is
 * retired by D-W3b-37, so `unavailable` is an honest failure state, not a
 * stand-in for the endpoint.
 */
export type WeekModelState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly week: WeekReadModel }
  | { readonly status: "unavailable" };

/**
 * What a trainee reads when the week could not be loaded. Static text: the
 * failure's own detail goes to `reportError` only, never to the screen
 * (D-W3-12, D-W3b-7). "Pull down to try again" is actionable on all three
 * screens that render it, each of which refetches the week on refresh.
 */
export const WEEK_UNAVAILABLE_MESSAGE =
  "Couldn't load your week. Pull down to try again";

/**
 * Loads the week, or settles on `unavailable`. The failure is reported, never
 * swallowed, and no day state is invented from it.
 */
export async function loadWeekModel(
  getMeWeek: (start: string) => Promise<WeekReadModel | null>,
  weekStart: string,
  where: string,
): Promise<WeekModelState> {
  try {
    const week = await getMeWeek(weekStart);
    // A client that resolves nothing has not given us a week, so this is
    // `unavailable`, not a loaded week with no days. Reading it as loaded is
    // how a nullable model hides a failure in the first place.
    return week ? { status: "loaded", week } : { status: "unavailable" };
  } catch (err) {
    reportError(where, err);
    return { status: "unavailable" };
  }
}

/**
 * The day strip when the week is unknown (BT13, D-W4-16).
 *
 * One constant for every day the server did not describe. It is never a
 * state derived from the date, so a day is never claimed to be done, missed
 * or a rest day on no evidence.
 */
const UNKNOWN_DAY_STATE: DateNavigatorDay["state"] = "unknown";

/**
 * The part of `GET /me/day/:date` the strip reads: the day it describes and
 * the state the server derived for it (BT17, Z5-8).
 */
export type MeDayState = Pick<MeDayResponse, "date" | "state">;

export function navigatorDaysFor(input: {
  weekState: WeekModelState;
  dates: readonly string[];
  timeZone: string;
  weekdayShortOf: (timeZone: string, localDate: string) => string;
  dayOfMonthOf: (timeZone: string, localDate: string) => string;
  /**
   * The host's own `GET /me/day/:date` response (Z5-8, G10). Its `state` is
   * the server's state for that one day, so it is what the strip shows for
   * that date, whether or not the week loaded. It applies only to the date
   * it names: a response still held for the previously selected day never
   * paints the newly selected one.
   */
  day?: MeDayState | null;
}): DateNavigatorDay[] {
  const byDate =
    input.weekState.status === "loaded"
      ? new Map(input.weekState.week.days.map((day) => [day.date, day.state]))
      : new Map<string, WeekDayState>();
  if (input.day) byDate.set(input.day.date, input.day.state);
  return input.dates.map((localDate) => {
    const state = byDate.get(localDate);
    return {
      localDate,
      weekdayLabel: input.weekdayShortOf(input.timeZone, localDate),
      dayLabel: input.dayOfMonthOf(input.timeZone, localDate),
      // No `??` onto a date comparison here: that fallback is the defect.
      state: state ? mapWeekState(state) : UNKNOWN_DAY_STATE,
    };
  });
}

function mapWeekState(state: WeekDayState): DateNavigatorDay["state"] {
  switch (state) {
    case "done":
      return "done";
    case "partial":
      return "partial";
    case "missed":
      return "open";
    case "rest":
      return "rest";
    case "future":
      return "future";
    default:
      return "open";
  }
}

type Props = {
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
  showPreviewBanner?: boolean;
  /**
   * The week, loaded and owned by the host screen (CU23 review fix).
   *
   * This component used to fetch `GET /me/week` itself, which was wrong in
   * two ways at once. Its `loadWeek` depended only on the api client and the
   * selected week, neither of which changes on a pull-to-refresh, and the
   * host renders it without a `key`, so it never remounted and never
   * re-fetched: the strip could keep saying it could not load the week while
   * the host's own "This week" card, on the same screen, showed the real
   * rollup — and no pull-down ever cleared it. It also meant two `GET
   * /me/week` calls per host load, for the same `weekStart`, each a real
   * database round trip now that the route is implemented.
   *
   * The week is therefore the host's single source of truth and arrives as a
   * prop. This component derives nothing and fetches nothing, so the strip
   * and the host can no longer disagree, and the host's refresh is the one
   * retry. CU24's standard in `TodayTab.tsx` — "Neither screen promises a
   * retry it cannot perform" (D-W3b-32) — is what this restores.
   */
  weekState: WeekModelState;
  /**
   * The host's `GET /me/day/:date` response for the selected day, or null
   * when it has not loaded or failed (Z5-8). Like the week, the host owns
   * it; this component fetches nothing.
   */
  day?: MeDayState | null;
};

export function TraineeDateNavigator({
  selectedDate,
  onSelectDate,
  showPreviewBanner = true,
  weekState,
  day = null,
}: Props) {
  const { me } = useAuth();
  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;

  const weekStart = useMemo(
    () => startOfWeekMonday(selectedDate),
    [selectedDate],
  );

  const navigatorDays = useMemo(
    (): DateNavigatorDay[] =>
      navigatorDaysFor({
        weekState,
        dates: weekDatesFrom(weekStart),
        timeZone,
        weekdayShortOf: weekdayShort,
        dayOfMonthOf: dayOfMonth,
        day,
      }),
    [weekState, weekStart, timeZone, day],
  );

  if (Platform.OS === "web") {
    return (
      <>
        {showPreviewBanner && !isToday ? (
          <Text style={styles.previewBanner}>
            {isFuture
              ? `Preview · ${formatHeadingDate(timeZone, selectedDate)}`
              : `Viewing ${formatHeadingDate(timeZone, selectedDate)} · read-only except late logging`}
          </Text>
        ) : null}
        {/*
          No "couldn't load the week" line here: the host owns the week and
          renders that message itself, with the retry control that actually
          performs the retry. Two copies of it on one screen, one of them
          beside a button and one not, is the duplication the CU23 review
          flagged.
        */}
        <WebDateHeading
          timeZone={timeZone}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          today={today}
          days={navigatorDays}
        />
      </>
    );
  }

  return (
    <>
      {showPreviewBanner && !isToday ? (
        <Text style={styles.previewBanner}>
          {isFuture
            ? `Preview · ${formatHeadingDate(timeZone, selectedDate)}`
            : `Viewing ${formatHeadingDate(timeZone, selectedDate)} · read-only except late logging`}
          </Text>
        ) : null}
      <DateNavigator
        days={navigatorDays}
        selectedDate={selectedDate}
        todayDate={today}
        onSelect={onSelectDate}
        onToday={() => onSelectDate(today)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  previewBanner: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
});
