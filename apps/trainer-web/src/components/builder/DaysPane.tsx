import { useState } from "react";
import type { PlanContent, WorkoutDay } from "@fitbud/contracts";
import {
  PLAN_COMPOSITION_LIMITS,
  addWorkoutDayOnWeekday,
  moveSessionToWeekday,
  removeWorkoutDay,
  sortedByOrder,
  updateWorkoutDayWeekday,
} from "../plan-composition";
import { WEEK_ORDER, weekdayShort } from "./weekdays";

export function DaysPane({
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [overWeekday, setOverWeekday] = useState<number | null>(null);
  const days = sortedByOrder(content.workoutDays);
  const byWeekday = new Map<number, WorkoutDay[]>();
  const unscheduled: WorkoutDay[] = [];
  for (const day of days) {
    if (day.weekday == null) {
      unscheduled.push(day);
      continue;
    }
    byWeekday.set(day.weekday, [...(byWeekday.get(day.weekday) ?? []), day]);
  }
  const atLimit = days.length >= PLAN_COMPOSITION_LIMITS.workoutDays;
  const firstFree = WEEK_ORDER.find((weekday) => !byWeekday.has(weekday));

  return (
    <nav className="days-pane" aria-label="Days">
      <h2 className="builder-pane-title">Days</h2>
      <ul className="days-list">
        {WEEK_ORDER.map((weekday) => {
          const sessions = byWeekday.get(weekday) ?? [];
          const isOver = overWeekday === weekday && dragId != null;
          return (
            <li
              key={weekday}
              className={isOver ? "day-row is-drop-target" : "day-row"}
              onDragOver={(event) => {
                if (!dragId) return;
                event.preventDefault();
                setOverWeekday(weekday);
              }}
              onDragLeave={() => setOverWeekday(null)}
              onDrop={(event) => {
                event.preventDefault();
                if (dragId) {
                  onChange((current) => moveSessionToWeekday(current, dragId, weekday));
                }
                setDragId(null);
                setOverWeekday(null);
              }}
            >
              <span className="day-weekday">{weekdayShort(weekday)}</span>
              {sessions.length > 0 ? (
                <div className="day-sessions">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={
                        session.id === selectedId ? "day-session is-selected" : "day-session"
                      }
                      aria-current={session.id === selectedId ? "true" : undefined}
                      draggable={!readOnly}
                      onDragStart={() => setDragId(session.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverWeekday(null);
                      }}
                      onClick={() => onSelect(session.id)}
                    >
                      <span className="day-session-name">{session.name}</span>
                      <span className="day-session-meta">
                        {session.exercises.length}{" "}
                        {session.exercises.length === 1 ? "exercise" : "exercises"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="day-rest">
                  <span>Rest</span>
                  {readOnly || atLimit ? null : (
                    <button
                      type="button"
                      className="button-ghost button-sm"
                      aria-label={`Add session on ${weekdayShort(weekday)}`}
                      onClick={() =>
                        onChange((current) => addWorkoutDayOnWeekday(current, weekday))
                      }
                    >
                      +
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {unscheduled.length > 0 ? (
        <div className="days-unscheduled">
          <h3 className="builder-pane-subtitle">Not on a weekday</h3>
          <ul className="days-list">
            {unscheduled.map((day) => (
              <li key={day.id} className="day-row">
                <button
                  type="button"
                  className={
                    day.id === selectedId ? "day-session is-selected" : "day-session"
                  }
                  onClick={() => onSelect(day.id)}
                >
                  <span className="day-session-name">{day.name}</span>
                  <span className="day-session-meta">Pick a weekday</span>
                </button>
                {readOnly ? null : (
                  <button
                    type="button"
                    className="button-ghost button-sm"
                    onClick={() =>
                      onChange((current) =>
                        updateWorkoutDayWeekday(current, day.id, firstFree ?? 1),
                      )
                    }
                  >
                    Place
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {readOnly ? null : (
        <button
          type="button"
          className="button-secondary days-add"
          disabled={atLimit}
          onClick={() =>
            onChange((current) =>
              firstFree == null
                ? addWorkoutDayOnWeekday(current, 1)
                : addWorkoutDayOnWeekday(current, firstFree),
            )
          }
        >
          + Add session
        </button>
      )}
      {readOnly || days.length <= 1 || !selectedId ? null : (
        <button
          type="button"
          className="button-ghost days-remove"
          onClick={() => onChange((current) => removeWorkoutDay(current, selectedId))}
        >
          Delete selected session
        </button>
      )}
    </nav>
  );
}
