import type { PlanContent, WorkoutDay } from "@fitbud/contracts";
import { formatNumber } from "@fitbud/core";
import { OverflowMenu } from "../OverflowMenu";
import {
  duplicateExercise,
  moveExercise,
  removeExercise,
  sortedByOrder,
  updateWorkoutDay,
} from "../plan-composition";
import { exerciseSummaryLine } from "./formatters";
import { weekdayShort } from "./weekdays";

export function SessionEditor({
  day,
  selectedExerciseId,
  onSelectExercise,
  onChange,
  readOnly = false,
  onOpenLibrary,
  showLibraryToggle = false,
}: {
  day: WorkoutDay | null;
  selectedExerciseId: string | null;
  onSelectExercise: (exerciseId: string) => void;
  onChange: (update: (current: PlanContent) => PlanContent) => void;
  readOnly?: boolean;
  onOpenLibrary?: () => void;
  showLibraryToggle?: boolean;
}) {
  if (!day) {
    return (
      <div className="session-empty" data-testid="session-empty">
        <h2>No session selected</h2>
        <p className="muted">Pick a day above, or tap a Rest tab to add a session.</p>
      </div>
    );
  }

  const exercises = sortedByOrder(day.exercises);
  const setCount = exercises.reduce((sum, exercise) => sum + exercise.setTargets.length, 0);
  const dayLabel =
    day.weekday != null ? `${weekdayShort(day.weekday)} · ${day.name}` : day.name;
  const meta = [
    `${formatNumber(exercises.length)} ${exercises.length === 1 ? "exercise" : "exercises"}`,
    `${formatNumber(setCount)} ${setCount === 1 ? "set" : "sets"}`,
  ].join(" · ");

  return (
    <div className="session-editor session-board" data-testid="session-board">
      <header className="session-board-head">
        <div>
          <label className="field session-title">
            <span className="sr-only">Session title</span>
            <input
              value={day.name}
              maxLength={120}
              disabled={readOnly}
              aria-label="Session title"
              onChange={(event) =>
                onChange((current) =>
                  updateWorkoutDay(current, day.id, { name: event.target.value }),
                )
              }
            />
          </label>
          <p className="session-board-meta">{dayLabel} · {meta}</p>
        </div>
      </header>

      {exercises.length === 0 ? (
        <div className="session-empty" data-testid="session-empty">
          <p>
            {showLibraryToggle && onOpenLibrary ? (
              <button type="button" className="button-link" onClick={onOpenLibrary}>
                Add exercises from the library →
              </button>
            ) : (
              "Drag an exercise here or add one from the library."
            )}
          </p>
        </div>
      ) : (
        <ol className="exercise-card-list">
          {exercises.map((exercise, index) => {
            const selected = exercise.id === selectedExerciseId;
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  className={selected ? "exercise-card is-selected" : "exercise-card"}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelectExercise(exercise.id)}
                >
                  <span className="exercise-card-handle" aria-hidden="true">
                    ⋮⋮
                  </span>
                  <span className="exercise-card-body">
                    <span className="exercise-card-title">
                      {index + 1}. {exercise.name || "Untitled exercise"}
                    </span>
                    <span className="exercise-card-summary">
                      {exerciseSummaryLine(exercise) || "Add sets in properties"}
                    </span>
                  </span>
                </button>
                {readOnly ? null : (
                  <span className="exercise-card-menu">
                    <OverflowMenu
                      label={`Actions for ${exercise.name || "exercise"}`}
                      items={[
                        {
                          id: "up",
                          label: "Move up",
                          disabled: index === 0,
                          onSelect: () =>
                            onChange((current) =>
                              moveExercise(current, day.id, exercise.id, -1),
                            ),
                        },
                        {
                          id: "down",
                          label: "Move down",
                          disabled: index === exercises.length - 1,
                          onSelect: () =>
                            onChange((current) =>
                              moveExercise(current, day.id, exercise.id, 1),
                            ),
                        },
                        {
                          id: "duplicate",
                          label: "Duplicate",
                          onSelect: () =>
                            onChange((current) =>
                              duplicateExercise(current, day.id, exercise.id),
                            ),
                        },
                        {
                          id: "delete",
                          label: "Delete",
                          destructive: true,
                          onSelect: () =>
                            onChange((current) =>
                              removeExercise(current, day.id, exercise.id),
                            ),
                        },
                      ]}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="exercise-dropzone" data-testid="exercise-dropzone">
        {showLibraryToggle && onOpenLibrary ? (
          <button type="button" className="button-link" onClick={onOpenLibrary}>
            Drag an exercise here or add one
          </button>
        ) : (
          <p>
            Drag an exercise here or <strong>add one</strong>
          </p>
        )}
      </div>
    </div>
  );
}
