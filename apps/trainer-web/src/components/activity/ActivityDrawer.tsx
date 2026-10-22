import { useEffect, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import type { MealAssignment, WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { LoadingBlock } from "../StatePanels";
import { Button } from "../Button";
import { MealPanel } from "./MealPanel";
import { WorkoutPanel } from "./WorkoutPanel";

type PanelTarget =
  | { type: "meal"; id: string }
  | { type: "workout"; id: string }
  | null;

export function ActivityDrawer({
  target,
  clientTimezone,
  onClose,
}: {
  target: PanelTarget;
  clientTimezone: string;
  onClose: () => void;
}) {
  const [meal, setMeal] = useState<MealAssignment | null>(null);
  const [workout, setWorkout] = useState<WorkoutAssignment | null>(null);
  const [execution, setExecution] = useState<WorkoutExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setMeal(null);
      setWorkout(null);
      setExecution(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (target.type === "meal") {
          const result = await apiClient.getMealAssignment(target.id);
          if (!cancelled) setMeal(result);
        } else {
          const assignment = await apiClient.getWorkoutAssignment(target.id);
          if (!cancelled) setWorkout(assignment);
          if (assignment.execution?.id) {
            const full = await apiClient.getWorkoutExecution(
              assignment.execution.id,
            );
            if (!cancelled) setExecution(full);
          } else if (!cancelled) {
            setExecution(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : "Could not load details.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!target) return null;

  return (
    <div className="activity-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="activity-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Activity details"
        onClick={(event) => event.stopPropagation()}
        data-testid="activity-drawer"
      >
        <div className="activity-drawer-toolbar">
          <Button type="button" variant="tertiary" onClick={onClose}>
            Close
          </Button>
        </div>
        {loading ? <LoadingBlock label="Loading details…" /> : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && target.type === "meal" && meal ? (
          <MealPanel assignment={meal} clientTimezone={clientTimezone} />
        ) : null}
        {!loading && !error && target.type === "workout" && workout ? (
          <WorkoutPanel
            assignment={workout}
            execution={execution}
            clientTimezone={clientTimezone}
          />
        ) : null}
      </aside>
    </div>
  );
}
