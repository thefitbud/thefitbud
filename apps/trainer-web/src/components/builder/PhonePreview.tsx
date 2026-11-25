import { useState } from "react";
import type { PlanContent } from "@fitbud/contracts";
import { formatHhMmTime } from "@fitbud/core";
import { X } from "lucide-react";
import { sortedByOrder, sortedMealsByTime } from "../plan-composition";
import { Button, Chip } from "../ui";
import { WEEK_ORDER, weekdayShort } from "./weekdays";

function setSummary(reps: number | null, load: string | null): string {
  return [reps != null ? `${reps} reps` : null, load].filter(Boolean).join(" · ");
}

export function PhonePreview({
  content,
  clientName,
  onClose,
}: {
  content: PlanContent;
  clientName?: string;
  onClose: () => void;
}) {
  const firstWithSession = WEEK_ORDER.find((weekday) =>
    content.workoutDays.some((day) => day.weekday === weekday),
  );
  const [weekday, setWeekday] = useState<number>(firstWithSession ?? 1);
  const sessions = content.workoutDays.filter((day) => day.weekday === weekday);
  const meals = sortedMealsByTime(content.mealPrescriptions).filter((meal) =>
    (meal.applicableWeekdays ?? []).includes(weekday),
  );
  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        className="phone-preview-card"
        role="dialog"
        aria-modal="true"
        aria-label="Preview as client"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="phone-preview-head">
          <h2>Preview as {clientName ?? "client"}</h2>
          <Button variant="ghost" onClick={onClose}>
            <X className="ui-i" strokeWidth={1.75} aria-hidden />
            Close
          </Button>
        </header>
        <div className="phone-preview-days" role="group" aria-label="Preview day">
          {WEEK_ORDER.map((value) => (
            <Chip key={value} selected={value === weekday} onClick={() => setWeekday(value)}>
              {weekdayShort(value)}
            </Chip>
          ))}
        </div>
        <div className="phone-frame">
          <div className="phone-screen">
            <p className="phone-title">{weekdayShort(weekday)}</p>
            <section>
              <h3 className="phone-section-title">Workout</h3>
              {sessions.length === 0 ? (
                <p className="muted">Rest day</p>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="phone-card">
                    <p className="phone-card-title">{session.name}</p>
                    {session.instructions ? <p className="muted">{session.instructions}</p> : null}
                    <ul>
                      {sortedByOrder(session.exercises).map((exercise) => (
                        <li key={exercise.id}>
                          <span>{exercise.name}</span>
                          <span className="muted">
                            {exercise.setTargets.length} ×{" "}
                            {setSummary(
                              exercise.setTargets[0]?.reps ?? null,
                              exercise.setTargets[0]?.loadLabel ?? null,
                            ) || "sets"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>
            <section>
              <h3 className="phone-section-title">Meals</h3>
              {meals.length === 0 ? (
                <p className="muted">No meals planned</p>
              ) : (
                meals.map((meal) => (
                  <div key={meal.id} className="phone-card">
                    <p className="phone-card-title">
                      {meal.name}
                      {meal.localTime ? ` · ${formatHhMmTime(meal.localTime)}` : ""}
                    </p>
                    <ul>
                      {(meal.items ?? []).map((item, index) => (
                        <li key={`${item.name}-${index}`}>
                          <span>{item.name}</span>
                          <span className="muted">{item.serving.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
