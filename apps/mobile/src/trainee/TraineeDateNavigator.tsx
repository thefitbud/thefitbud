import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { Text } from "../components/Text";
import type { WeekDayState, WeekReadModel } from "@fitbud/contracts";
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
import { stage1Api } from "../lib/stage1Api";
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
 * The day strip when the week is unknown.
 *
 * `DateNavigatorDay["state"]` has no "unknown" member and
 * `packages/ui-mobile` is outside CU23's `files_owned`, so an unknown day
 * takes the strip's own no-information dot — the same `lightGrey` its
 * `dotColor` falls back to — and the screens say in words why. It is one
 * constant for all seven days, never a state derived from the date, so a day
 * is never claimed to be done, missed or a rest day on no evidence. The PR
 * names adding an explicit `unknown` variant as the follow-up.
 */
const UNKNOWN_DAY_STATE: DateNavigatorDay["state"] = "rest";

export function navigatorDaysFor(input: {
  weekState: WeekModelState;
  dates: readonly string[];
  timeZone: string;
  weekdayShortOf: (timeZone: string, localDate: string) => string;
  dayOfMonthOf: (timeZone: string, localDate: string) => string;
}): DateNavigatorDay[] {
  const byDate =
    input.weekState.status === "loaded"
      ? new Map(input.weekState.week.days.map((day) => [day.date, day.state]))
      : new Map<string, WeekDayState>();
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
};

export function TraineeDateNavigator({
  selectedDate,
  onSelectDate,
  showPreviewBanner = true,
}: Props) {
  const { api, me } = useAuth();
  const s1 = stage1Api(api);
  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);
  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;

  const weekStart = useMemo(
    () => startOfWeekMonday(selectedDate),
    [selectedDate],
  );

  const [weekState, setWeekState] = useState<WeekModelState>({
    status: "loading",
  });

  const loadWeek = useCallback(async () => {
    setWeekState(
      await loadWeekModel(
        (start) => s1.getMeWeek(start),
        weekStart,
        "TraineeDateNavigator.getMeWeek",
      ),
    );
  }, [s1, weekStart]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  const navigatorDays = useMemo(
    (): DateNavigatorDay[] =>
      navigatorDaysFor({
        weekState,
        dates: weekDatesFrom(weekStart),
        timeZone,
        weekdayShortOf: weekdayShort,
        dayOfMonthOf: dayOfMonth,
      }),
    [weekState, weekStart, timeZone],
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
        {weekState.status === "unavailable" ? (
          <Text style={styles.weekUnavailable}>{WEEK_UNAVAILABLE_MESSAGE}</Text>
        ) : null}
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
      {weekState.status === "unavailable" ? (
        <Text style={styles.weekUnavailable}>{WEEK_UNAVAILABLE_MESSAGE}</Text>
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
  weekUnavailable: {
    color: colors.darkGrey,
    fontSize: 13,
    marginBottom: 4,
  },
});
