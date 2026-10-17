import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import type { WeekDayState } from "@fitbud/contracts";
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
import { stage1Api } from "../lib/stage1Api";
import { WebDateHeading } from "./web/WebTraineeChrome";

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

  const [weekModel, setWeekModel] = useState<Awaited<
    ReturnType<typeof s1.getMeWeek>
  > | null>(null);

  const loadWeek = useCallback(async () => {
    try {
      const week = await s1.getMeWeek(weekStart);
      setWeekModel(week);
    } catch {
      setWeekModel(null);
    }
  }, [s1, weekStart]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  const navigatorDays = useMemo((): DateNavigatorDay[] => {
    const dates = weekDatesFrom(weekStart);
    const byDate = new Map(
      (weekModel?.days ?? []).map((day) => [day.date, day.state]),
    );
    return dates.map((localDate) => ({
      localDate,
      weekdayLabel: weekdayShort(timeZone, localDate),
      dayLabel: dayOfMonth(timeZone, localDate),
      state: mapWeekState(
        byDate.get(localDate) ?? (localDate > today ? "future" : "missed"),
      ),
    }));
  }, [weekModel?.days, weekStart, timeZone, today]);

  if (Platform.OS === "web") {
    return (
      <>
        {showPreviewBanner && !isToday ? (
          <Text style={styles.previewBanner}>
            {isFuture
              ? `Preview · ${formatHeadingDate(timeZone, selectedDate)}`
              : `Viewing ${selectedDate} · read-only except late logging`}
          </Text>
        ) : null}
        <WebDateHeading
          timeZone={timeZone}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          today={today}
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
            : `Viewing ${selectedDate} · read-only except late logging`}
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
