import type { PlanContent, WorkoutDay, WorkoutExercise } from "@fitbud/contracts";
import { OverflowMenu } from "../OverflowMenu";
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
        <div>
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

      <label className="field">
        <span>Sets</span>
        <input
          type="number"
          min={1}
          max={30}
          inputMode="numeric"
          value={setCount}
          disabled={readOnly}
          onChange={(event) => patch({ setCount: Number(event.target.value) || 1 })}
        />
      </label>
      <label className="field">
        <span>Reps</span>
        <input
          type="number"
          min={1}
          max={100}
          inputMode="numeric"
          value={sample?.reps ?? ""}
          disabled={readOnly}
          onChange={(event) => {
            const raw = event.target.value.trim();
            patch({ reps: raw === "" ? null : Number(raw) });
          }}
        />
      </label>
      <label className="field">
        <span>Weight</span>
        <input
          type="text"
          maxLength={80}
          placeholder="60 kg"
          value={sample?.loadLabel ?? ""}
          disabled={readOnly}
          onChange={(event) => patch({ loadLabel: event.target.value || null })}
        />
      </label>
      <label className="field">
        <span>Rest</span>
        <input
          type="text"
          maxLength={40}
          placeholder="2 min"
          value={restLabel}
          disabled={readOnly}
          onChange={(event) => patch({ restSeconds: parseRestLabel(event.target.value) })}
        />
      </label>
      <label className="field">
        <span>Coach cue</span>
        <textarea
          rows={3}
          maxLength={2000}
          placeholder="Brace, sit between the hips, knees out."
          value={selected.instructions ?? ""}
          disabled={readOnly}
          onChange={(event) => patch({ instructions: event.target.value || null })}
        />
      </label>
      <p className="builder-props-note">Shown on the client&apos;s set screen.</p>
    </aside>
  );
}
