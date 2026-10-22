import {
  eachLocalDateInclusive,
  formatCivilDate,
  nextCalendarWeekRange,
  nextSevenDayRange,
  type AssignmentWindowMode,
  type LocalDateRange,
} from "@fitbud/core";

export const MAX_WINDOW_DAYS = 35;
export const LONG_WINDOW_WARNING_DAYS = 28;

export type DateWindowValue = {
  mode: AssignmentWindowMode;
  customFrom: string;
  customTo: string;
};

/** Window dates are always trainee-local civil dates. */
export function windowRange(value: DateWindowValue, today: string): LocalDateRange | null {
  if (value.mode === "next_7_days") return nextSevenDayRange(today);
  if (value.mode === "next_calendar_week") return nextCalendarWeekRange(today);
  if (!value.customFrom || !value.customTo) return null;
  if (value.customFrom > value.customTo) return null;
  return { fromDate: value.customFrom, toDate: value.customTo };
}

export function windowError(value: DateWindowValue, today: string): string | null {
  if (value.mode !== "custom") return null;
  if (!value.customFrom || !value.customTo) return "Choose a start and end date.";
  if (value.customFrom < today) return "The window can't start in the past.";
  if (value.customFrom > value.customTo) return "The start date must be on or before the end date.";
  const days = eachLocalDateInclusive(value.customFrom, value.customTo).length;
  if (days > MAX_WINDOW_DAYS) return `Choose at most ${MAX_WINDOW_DAYS} days.`;
  return null;
}

function rangeLabel(range: LocalDateRange): string {
  return `${formatCivilDate(range.fromDate)} → ${formatCivilDate(range.toDate)}`;
}

export function DateWindowPicker({
  today,
  value,
  onChange,
  disabled = false,
}: {
  today: string;
  value: DateWindowValue;
  onChange: (next: DateWindowValue) => void;
  disabled?: boolean;
}) {
  const sevenDays = nextSevenDayRange(today);
  const calendarWeek = nextCalendarWeekRange(today);
  const customDays =
    value.customFrom && value.customTo && value.customFrom <= value.customTo
      ? eachLocalDateInclusive(value.customFrom, value.customTo).length
      : 0;
  const error = windowError(value, today);

  const options: Array<{
    mode: AssignmentWindowMode;
    title: string;
    detail: string;
  }> = [
    {
      mode: "next_7_days",
      title: "Next 7 days",
      detail: `Today, ${rangeLabel(sevenDays)}`,
    },
    {
      mode: "next_calendar_week",
      title: "Next calendar week",
      detail: rangeLabel(calendarWeek),
    },
    {
      mode: "custom",
      title: "Custom dates",
      detail:
        value.customFrom && value.customTo && value.customFrom <= value.customTo
          ? rangeLabel({ fromDate: value.customFrom, toDate: value.customTo })
          : "Choose an inclusive range",
    },
  ];

  return (
    <fieldset className="window-picker" disabled={disabled}>
      <legend>First schedule window</legend>
      <div className="radio-cards" role="radiogroup" aria-label="First schedule window">
        {options.map((option) => (
          <label
            key={option.mode}
            className={value.mode === option.mode ? "radio-card is-selected" : "radio-card"}
          >
            <input
              type="radio"
              name="schedule-window"
              checked={value.mode === option.mode}
              onChange={() => onChange({ ...value, mode: option.mode })}
            />
            <span className="radio-card-copy">
              <span className="radio-card-title">{option.title}</span>
              <span className="radio-card-detail">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
      {value.mode === "custom" ? (
        <div className="window-custom">
          <label className="field">
            <span>From</span>
            <input
              type="date"
              min={today}
              value={value.customFrom}
              onChange={(event) => onChange({ ...value, customFrom: event.target.value })}
            />
          </label>
          <label className="field">
            <span>To</span>
            <input
              type="date"
              min={value.customFrom || today}
              value={value.customTo}
              onChange={(event) => onChange({ ...value, customTo: event.target.value })}
            />
          </label>
        </div>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && value.mode === "custom" && customDays > LONG_WINDOW_WARNING_DAYS ? (
        <p className="window-warning" role="status">
          That&apos;s {customDays} days. Long windows schedule many sessions and meals at once.
        </p>
      ) : null}
      <p className="muted window-helper">
        After this, FitBud keeps the next 7 days scheduled automatically.
      </p>
    </fieldset>
  );
}
