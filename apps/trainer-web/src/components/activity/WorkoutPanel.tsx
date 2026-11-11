import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  formatCivilDate,
  formatClockTime,
  formatLocalDate,
} from "@fitbud/core";
import { isWithinWindow } from "../../pages/log-workout/logWorkoutModel";
import type { WorkspaceOutletContext } from "../../pages/workspaceContext";

/** "Logged by coach" / "Edited by coach · Mon 2 Nov"; null for the client's own entry. */
export function coachTag(
  execution: WorkoutExecution,
  clientTimezone: string,
): string | null {
  if (execution.loggedByRole === "coach") return "Logged by coach";
  if (execution.lastEditedByRole === "coach") {
    const day = formatLocalDate(new Date(execution.updatedAt), clientTimezone);
    return `Edited by coach · ${formatCivilDate(day)}`;
  }
  return null;
}

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
  const { relationshipId = assignment.coachingRelationshipId } = useParams();
  const outlet = useOutletContext<WorkspaceOutletContext | undefined>();
  const ended = outlet?.ended ?? false;
  const today = formatLocalDate(new Date(), clientTimezone);
  const tag = execution ? coachTag(execution, clientTimezone) : null;
  const finished =
    execution?.status === "completed" || execution?.status === "modified";
  const entryDay = execution
    ? formatLocalDate(
        new Date(execution.completedAt ?? execution.startedAt),
        clientTimezone,
      )
    : null;
  const canEdit =
    !ended && finished && entryDay !== null && isWithinWindow(entryDay, today);
  const canLog =
    !ended &&
    !execution &&
    assignment.scheduleStatus === "scheduled" &&
    isWithinWindow(assignment.localDate, today);

  return (
    <div className="activity-panel" data-testid="workout-panel">
      <header className="activity-panel-head">
        <h2>{assignment.workoutDayName}</h2>
        <p className="muted">
          {assignment.localDate} · window ends{" "}
          {formatClockTime(assignment.windowEndsAt, clientTimezone)}
        </p>
      </header>

      {tag ? (
        <p className="activity-panel-tag" data-testid="workout-coach-tag">
          <strong>{tag}</strong>
        </p>
      ) : null}
      {canEdit && execution ? (
        <Link
          className="button-secondary"
          to={`/clients/${relationshipId}/workouts/${execution.id}/edit`}
        >
          Edit workout
        </Link>
      ) : null}
      {canLog ? (
        <Link
          className="button-secondary"
          to={`/clients/${relationshipId}/log-workout/${assignment.id}`}
        >
          Log workout
        </Link>
      ) : null}

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
