import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { formatClockTime } from "@fitbud/core";

export function WorkoutPanel({
  assignment,
  execution,
  clientTimezone,
}: {
  assignment: WorkoutAssignment;
  execution: WorkoutExecution | null;
  clientTimezone: string;
}) {
  const prescribed = assignment.workoutDay.exercises ?? [];

  return (
    <div className="activity-panel" data-testid="workout-panel">
      <header className="activity-panel-head">
        <h2>{assignment.workoutDayName}</h2>
        <p className="muted">
          {assignment.localDate} · window ends{" "}
          {formatClockTime(assignment.windowEndsAt, clientTimezone)}
        </p>
      </header>

      {!execution ? (
        <p className="muted">No execution logged yet.</p>
      ) : (
        <ul className="activity-panel-list">
          {execution.exercises.map((exercise) => {
            const planned = prescribed.find((row) => row.id === exercise.exerciseId);
            const doneSets = exercise.sets.filter(
              (set) => set.status === "completed",
            ).length;
            const totalSets = exercise.sets.length;
            return (
              <li key={exercise.id}>
                <strong>{exercise.name}</strong>
                <span className="muted">
                  {" "}
                  · {doneSets} of {totalSets} sets
                  {planned?.setTargets?.length
                    ? ` (plan ${planned.setTargets.length})`
                    : ""}
                </span>
                <ul>
                  {exercise.sets.map((set) => (
                    <li key={set.id}>
                      Set {set.order}:{" "}
                      {set.actualReps != null
                        ? `${set.actualReps} reps`
                        : "—"}
                      {set.actualLoadLabel
                        ? ` @ ${set.actualLoadLabel}`
                        : set.prescribedLoadLabel
                          ? ` (plan ${set.prescribedLoadLabel})`
                          : ""}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
