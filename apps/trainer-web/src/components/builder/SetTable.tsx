import type { WorkoutSetTarget } from "@fitbud/contracts";
import { sortedByOrder } from "../plan-composition";

type SetPatch = Partial<
  Pick<WorkoutSetTarget, "reps" | "loadLabel" | "rpe" | "restSeconds" | "notes">
>;

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function SetTable({
  sets,
  exerciseName,
  readOnly = false,
  onUpdate,
  onAdd,
  onDuplicate,
  onRemove,
}: {
  sets: WorkoutSetTarget[];
  exerciseName: string;
  readOnly?: boolean;
  onUpdate: (setId: string, patch: SetPatch) => void;
  onAdd: () => void;
  onDuplicate: (setId: string) => void;
  onRemove: (setId: string) => void;
}) {
  const rows = sortedByOrder(sets);
  return (
    <div className="set-table-wrap">
      <table className="set-table" aria-label={`Sets for ${exerciseName || "exercise"}`}>
        <thead>
          <tr>
            <th scope="col">Set</th>
            <th scope="col">Reps</th>
            <th scope="col">Load</th>
            <th scope="col">RPE</th>
            <th scope="col">Rest (s)</th>
            <th scope="col">Notes</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((set) => (
            <tr
              key={set.id}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
                  event.preventDefault();
                  if (!readOnly) onDuplicate(set.id);
                }
              }}
            >
              <td className="set-num">{set.order}</td>
              <td>
                <input
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  aria-label={`Set ${set.order} reps`}
                  value={set.reps ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    onUpdate(set.id, { reps: numberOrNull(event.target.value) })
                  }
                />
              </td>
              <td>
                <input
                  type="text"
                  maxLength={80}
                  placeholder="kg or RPE 7"
                  aria-label={`Set ${set.order} load`}
                  value={set.loadLabel ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    onUpdate(set.id, { loadLabel: event.target.value || null })
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  aria-label={`Set ${set.order} RPE`}
                  value={set.rpe ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    onUpdate(set.id, { rpe: numberOrNull(event.target.value) })
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  step={15}
                  aria-label={`Set ${set.order} rest seconds`}
                  value={set.restSeconds ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    onUpdate(set.id, { restSeconds: numberOrNull(event.target.value) })
                  }
                />
              </td>
              <td>
                <input
                  type="text"
                  maxLength={200}
                  aria-label={`Set ${set.order} notes`}
                  value={set.notes ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    onUpdate(set.id, { notes: event.target.value || null })
                  }
                />
              </td>
              <td className="set-actions">
                {readOnly ? null : (
                  <>
                    <button
                      type="button"
                      className="button-ghost button-sm"
                      onClick={() => onDuplicate(set.id)}
                      aria-label={`Duplicate set ${set.order}`}
                      title="Duplicate set (⌘D)"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="button-ghost button-sm"
                      onClick={() => onRemove(set.id)}
                      aria-label={`Delete set ${set.order}`}
                      disabled={rows.length <= 1}
                    >
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {readOnly ? null : (
        <button type="button" className="button-ghost button-sm" onClick={onAdd}>
          + Add set
        </button>
      )}
    </div>
  );
}
