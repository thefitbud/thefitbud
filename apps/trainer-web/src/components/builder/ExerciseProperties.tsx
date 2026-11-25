import type { PlanContent, WorkoutDay, WorkoutExercise } from "@fitbud/contracts";
import { OverflowMenu } from "../OverflowMenu";
import { Field, LibraryThumb, Stepper } from "../ui";
import {
  duplicateExercise,
  moveExercise,
  removeExercise,
  sortedByOrder,
} from "../plan-composition";
import {
  exerciseMetaLine,
  firstSet,
  formatRestLabel,
  parseRestLabel,
} from "./formatters";
import { applyExercisePrescription } from "./prescription";

export function ExerciseProperties({
  day,
  exercise,
  onChange,
  readOnly = false,
}: {
  day: WorkoutDay;
  exercise: WorkoutExercise | null;
  onChange: (update: (current: PlanContent) => PlanContent) => void;
  readOnly?: boolean;
}) {
  if (!exercise) {
    return (
      <aside className="builder-props" aria-label="Exercise properties">
        <h2 className="builder-pane-title">Properties</h2>
        <p className="muted">Select an exercise to edit sets, reps, weight and coach cue.</p>
      </aside>
    );
  }

  const selected = exercise;
  const sample = firstSet(selected);
  const setCount = selected.setTargets.length;
  const restLabel = formatRestLabel(sample?.restSeconds) || "";
  const meta = exerciseMetaLine(selected);
  const exercises = sortedByOrder(day.exercises);
  const index = exercises.findIndex((item) => item.id === selected.id);

  function patch(partial: {
    setCount?: number;
    reps?: number | null;
    loadLabel?: string | null;
    restSeconds?: number | null;
    instructions?: string | null;
  }) {
    onChange((current) =>
      applyExercisePrescription(current, day.id, selected.id, {
        setCount: partial.setCount ?? setCount,
        reps: partial.reps !== undefined ? partial.reps : (sample?.reps ?? null),
        loadLabel:
          partial.loadLabel !== undefined ? partial.loadLabel : (sample?.loadLabel ?? null),
        restSeconds:
          partial.restSeconds !== undefined
            ? partial.restSeconds
            : (sample?.restSeconds ?? null),
        instructions:
          partial.instructions !== undefined
            ? partial.instructions
            : selected.instructions,
      }),
    );
  }

  return (
    <aside className="builder-props" aria-label="Exercise properties" data-testid="exercise-properties">
      <header className="builder-props-head">
        <LibraryThumb name={selected.name || "Exercise"} kind="exercise" />
        <div className="builder-props-title">
          <h2 className="builder-pane-title">{selected.name || "Exercise"}</h2>
          {meta ? <p className="builder-props-meta">{meta}</p> : null}
        </div>
        {readOnly ? null : (
          <OverflowMenu
            label={`Actions for ${selected.name || "exercise"}`}
            items={[
              {
                id: "up",
                label: "Move up",
                disabled: index <= 0,
                onSelect: () =>
                  onChange((current) => moveExercise(current, day.id, selected.id, -1)),
              },
              {
                id: "down",
                label: "Move down",
                disabled: index < 0 || index >= exercises.length - 1,
                onSelect: () =>
                  onChange((current) => moveExercise(current, day.id, selected.id, 1)),
              },
              {
                id: "duplicate",
                label: "Duplicate",
                onSelect: () =>
                  onChange((current) => duplicateExercise(current, day.id, selected.id)),
              },
              {
                id: "delete",
                label: "Delete",
                destructive: true,
                onSelect: () =>
                  onChange((current) => removeExercise(current, day.id, selected.id)),
              },
            ]}
          />
        )}
      </header>

      <Field label="Sets">
        {readOnly ? (
          <p className="builder-props-value">{setCount}</p>
        ) : (
          <Stepper
            aria-label="Sets"
            value={setCount}
            min={1}
            max={30}
            onChange={(next) => patch({ setCount: next })}
          />
        )}
      </Field>
      <div className="builder-props-pair">
        <Field label="Reps">
          <span className="ui-input">
            <input
              type="number"
              min={1}
              max={100}
              inputMode="numeric"
              aria-label="Reps"
              value={sample?.reps ?? ""}
              disabled={readOnly}
              onChange={(event) => {
                const raw = event.target.value.trim();
                patch({ reps: raw === "" ? null : Number(raw) });
              }}
            />
          </span>
        </Field>
        <Field label="Weight">
          <span className="ui-input">
            <input
              type="text"
              maxLength={80}
              placeholder="60 kg"
              aria-label="Weight"
              value={sample?.loadLabel ?? ""}
              disabled={readOnly}
              onChange={(event) => patch({ loadLabel: event.target.value || null })}
            />
          </span>
        </Field>
      </div>
      <Field label="Rest">
        <span className="ui-input">
          <input
            type="text"
            maxLength={40}
            placeholder="2 min"
            aria-label="Rest"
            value={restLabel}
            disabled={readOnly}
            onChange={(event) => patch({ restSeconds: parseRestLabel(event.target.value) })}
          />
        </span>
      </Field>
      <Field label="Coach cue" help="Shown on the client's set screen.">
        <textarea
          className="ui-textarea"
          rows={3}
          maxLength={2000}
          aria-label="Coach cue"
          placeholder="Brace, sit between the hips, knees out."
          value={selected.instructions ?? ""}
          disabled={readOnly}
          onChange={(event) => patch({ instructions: event.target.value || null })}
        />
      </Field>
    </aside>
  );
}
