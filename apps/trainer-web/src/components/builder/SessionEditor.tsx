import type { PlanContent, WorkoutDay } from "@fitbud/contracts";
import {
  addSetTarget,
  duplicateExercise,
  duplicateSetTarget,
  moveExercise,
  moveSessionToWeekday,
  removeExercise,
  removeSetTarget,
  sortedByOrder,
  updateExercise,
  updateSetTarget,
  updateWorkoutDay,
} from "../plan-composition";
import { SetTable } from "./SetTable";
import { WEEK_ORDER, WEEKDAY_INITIAL, weekdayShort } from "./weekdays";

export function SessionEditor({
  day,
  onChange,
  readOnly = false,
  onOpenLibrary,
  showLibraryToggle = false,
}: {
  day: WorkoutDay | null;
  onChange: (update: (current: PlanContent) => PlanContent) => void;
  readOnly?: boolean;
  onOpenLibrary?: () => void;
  showLibraryToggle?: boolean;
}) {
  if (!day) {
    return (
      <div className="session-empty" data-testid="session-empty">
        <h2>No session selected</h2>
        <p className="muted">
          Pick a day on the left, or add a session to start building this week.
        </p>
      </div>
    );
  }
  const exercises = sortedByOrder(day.exercises);
  return (
    <div className="session-editor">
      <header className="session-head">
        <label className="field session-title">
          <span>Session title</span>
          <input
            value={day.name}
            maxLength={120}
            disabled={readOnly}
            onChange={(event) =>
              onChange((current) => updateWorkoutDay(current, day.id, { name: event.target.value }))
            }
          />
        </label>
        <div className="weekday-chips" role="group" aria-label="Weekday">
          {WEEK_ORDER.map((weekday) => (
            <button
              key={weekday}
              type="button"
              className={day.weekday === weekday ? "weekday-chip is-on" : "weekday-chip"}
              aria-pressed={day.weekday === weekday}
              aria-label={weekdayShort(weekday)}
              disabled={readOnly}
              onClick={() =>
                onChange((current) => moveSessionToWeekday(current, day.id, weekday))
              }
            >
              {WEEKDAY_INITIAL[weekday]}
            </button>
          ))}
        </div>
        <label className="field session-note">
          <span>Instructions for the session</span>
          <textarea
            rows={2}
            maxLength={2000}
            placeholder="Warm-up, tempo, anything the client should know before starting"
            value={day.instructions ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              onChange((current) =>
                updateWorkoutDay(current, day.id, {
                  instructions: event.target.value || null,
                }),
              )
            }
          />
        </label>
      </header>

      {exercises.length === 0 ? (
        <div className="session-empty" data-testid="session-empty">
          <p>
            {showLibraryToggle && onOpenLibrary ? (
              <button type="button" className="button-link" onClick={onOpenLibrary}>
                Add exercises from the library →
              </button>
            ) : (
              "Add exercises from the library →"
            )}
          </p>
        </div>
      ) : (
        <ol className="exercise-list">
          {exercises.map((exercise, index) => (
            <li key={exercise.id} className="exercise-block">
              <div className="exercise-head">
                <label className="field exercise-name">
                  <span className="sr-only">Exercise name</span>
                  <input
                    value={exercise.name}
                    maxLength={120}
                    placeholder="Exercise name"
                    disabled={readOnly}
                    onChange={(event) =>
                      onChange((current) =>
                        updateExercise(current, day.id, exercise.id, { name: event.target.value }),
                      )
                    }
                  />
                </label>
                {exercise.primaryMuscles.map((muscle) => (
                  <span key={muscle} className="muscle-chip">
                    {muscle}
                  </span>
                ))}
                {readOnly ? null : (
                  <span className="exercise-actions">
                    <button
                      type="button"
                      className="button-ghost button-sm"
                      disabled={index === 0}
                      aria-label={`Move ${exercise.name || "exercise"} up`}
                      onClick={() =>
                        onChange((current) => moveExercise(current, day.id, exercise.id, -1))
                      }
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="button-ghost button-sm"
                      disabled={index === exercises.length - 1}
                      aria-label={`Move ${exercise.name || "exercise"} down`}
                      onClick={() =>
                        onChange((current) => moveExercise(current, day.id, exercise.id, 1))
                      }
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="button-ghost button-sm"
                      onClick={() =>
                        onChange((current) => duplicateExercise(current, day.id, exercise.id))
                      }
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="button-ghost button-sm"
                      onClick={() =>
                        onChange((current) => removeExercise(current, day.id, exercise.id))
                      }
                    >
                      Delete
                    </button>
                  </span>
                )}
              </div>
              {exercise.sourceExerciseLibraryItemId ? (
                <p className="exercise-source">From library · snapshot</p>
              ) : null}
              <SetTable
                sets={exercise.setTargets}
                exerciseName={exercise.name}
                readOnly={readOnly}
                onUpdate={(setId, patch) =>
                  onChange((current) =>
                    updateSetTarget(current, day.id, exercise.id, setId, patch),
                  )
                }
                onAdd={() =>
                  onChange((current) => addSetTarget(current, day.id, exercise.id))
                }
                onDuplicate={(setId) =>
                  onChange((current) =>
                    duplicateSetTarget(current, day.id, exercise.id, setId),
                  )
                }
                onRemove={(setId) =>
                  onChange((current) => removeSetTarget(current, day.id, exercise.id, setId))
                }
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
