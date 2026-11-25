import type { PlanContent, WorkoutDay } from "@fitbud/contracts";
import {
  PLAN_COMPOSITION_LIMITS,
  addWorkoutDayOnWeekday,
  sortedByOrder,
} from "../plan-composition";
import { WEEK_ORDER, weekdayShort } from "./weekdays";

function tabLabel(day: WorkoutDay | null, weekday: number): string {
  const short = weekdayShort(weekday);
  if (!day) return `${short} · Rest`;
  return `${short} · ${day.name}`;
}

export function DayTabs({
  content,
  selectedId,
  onSelect,
  onChange,
  readOnly = false,
}: {
  content: PlanContent;
  selectedId: string | null;
  onSelect: (dayId: string) => void;
  onChange: (update: (current: PlanContent) => PlanContent) => void;
  readOnly?: boolean;
}) {
  const days = sortedByOrder(content.workoutDays);
  const byWeekday = new Map<number, WorkoutDay>();
  const unscheduled: WorkoutDay[] = [];
  for (const day of days) {
    if (day.weekday == null) {
      unscheduled.push(day);
      continue;
    }
    if (!byWeekday.has(day.weekday)) byWeekday.set(day.weekday, day);
  }
  const atLimit = days.length >= PLAN_COMPOSITION_LIMITS.workoutDays;

  return (
    <div className="builder-day-tabs ui-tabs" role="tablist" aria-label="Training days">
      {WEEK_ORDER.map((weekday) => {
        const day = byWeekday.get(weekday) ?? null;
        const selected = day != null && day.id === selectedId;
        return (
          <button
            key={weekday}
            type="button"
            role="tab"
            aria-selected={selected}
            className={
              selected
                ? "builder-day-tab is-on is-active"
                : day
                  ? "builder-day-tab"
                  : "builder-day-tab is-rest"
            }
            onClick={() => {
              if (day) {
                onSelect(day.id);
                return;
              }
              if (readOnly || atLimit) return;
              let addedId: string | null = null;
              onChange((current) => {
                const next = addWorkoutDayOnWeekday(current, weekday);
                const added = next.workoutDays.find(
                  (candidate) =>
                    !current.workoutDays.some((existing) => existing.id === candidate.id),
                );
                addedId = added?.id ?? null;
                return next;
              });
              if (addedId) onSelect(addedId);
            }}
          >
            {tabLabel(day, weekday)}
          </button>
        );
      })}
      {unscheduled.map((day) => (
        <button
          key={day.id}
          type="button"
          role="tab"
          aria-selected={day.id === selectedId}
          className={
            day.id === selectedId ? "builder-day-tab is-on is-active" : "builder-day-tab"
          }
          onClick={() => onSelect(day.id)}
        >
          {day.name}
        </button>
      ))}
    </div>
  );
}
