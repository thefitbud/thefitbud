import type { PlanContent, WorkoutDay } from "@fitbud/contracts";
import { formatNumber } from "@fitbud/core";
import { GripVertical, Plus } from "lucide-react";
import { OverflowMenu } from "../OverflowMenu";
import { LibraryThumb } from "../ui";
import {
  duplicateExercise,
  moveExercise,
  removeExercise,
  sortedByOrder,
  updateWorkoutDay,
} from "../plan-composition";
import { exerciseSummaryLine } from "./formatters";

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
  const meta = [
    `${formatNumber(exercises.length)} ${exercises.length === 1 ? "exercise" : "exercises"}`,
    `${formatNumber(setCount)} ${setCount === 1 ? "set" : "sets"}`,
  ].join(" · ");

  return (
    <div className="session-editor session-board" data-testid="session-board">
      <header className="session-board-head">
        <div className="session-board-heading">
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
          <p className="session-board-meta">{meta}</p>
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
              <li
                key={exercise.id}
                className={selected ? "exercise-card-row is-selected" : "exercise-card-row"}
              >
                <button
                  type="button"
                  className={selected ? "exercise-card is-selected" : "exercise-card"}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelectExercise(exercise.id)}
                >
                  <GripVertical
                    className="exercise-card-handle ui-i"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="exercise-card-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <LibraryThumb name={exercise.name || "Exercise"} kind="exercise" />
                  <span className="exercise-card-body">
                    <span className="exercise-card-title">
                      <span className="sr-only">{index + 1}. </span>
                      {exercise.name || "Untitled exercise"}
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

      {onOpenLibrary && !readOnly ? (
        <button
          type="button"
          className="exercise-dropzone"
          data-testid="exercise-dropzone"
          onClick={onOpenLibrary}
        >
          <Plus className="ui-i" strokeWidth={1.75} aria-hidden />
          {showLibraryToggle ? (
            "Drag an exercise here or add one"
          ) : (
            <span>
              Drag an exercise here or <strong>add one</strong>
            </span>
          )}
        </button>
      ) : (
        <div className="exercise-dropzone" data-testid="exercise-dropzone">
          <p>
            Drag an exercise here or <strong>add one</strong>
          </p>
        </div>
      )}
    </div>
  );
}
