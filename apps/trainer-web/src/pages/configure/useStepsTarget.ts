import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import { STEPS_TARGET_MAX, STEPS_TARGET_MIN } from "@fitbud/contracts";
import { apiClient } from "../../lib/api";

/** Column default on `coaching_configurations.steps_target` (Z6-4). */
export const DEFAULT_STEPS_TARGET = 8000;

/** 1,000 to 50,000 a day in 1,000 steps, plus a stored value off that grid. */
export function stepsTargetOptions(current: number | null): number[] {
  const options: number[] = [];
  for (let value = STEPS_TARGET_MIN; value <= STEPS_TARGET_MAX; value += 1000) {
    options.push(value);
  }
  if (
    current != null &&
    current >= STEPS_TARGET_MIN &&
    current <= STEPS_TARGET_MAX &&
    !options.includes(current)
  ) {
    options.push(current);
    options.sort((a, b) => a - b);
  }
  return options;
}

export const stepsNumber = (value: number) => value.toLocaleString("en-IN");

export type StepsTargetState = {
  /** The stored target, or null while loading / when it could not be read. */
  target: number | null;
  loadFailed: boolean;
  saving: boolean;
  error: string | null;
  save: (next: number) => Promise<boolean>;
};

/**
 * The per-client daily steps target (Z6-9 route). It is a setting on the
 * configuration, written at once to the active version and any open draft
 * (Z8-18), so it saves on change rather than with Save draft. Before the first
 * configuration exists there is nothing to write to: callers disable it.
 */
export function useStepsTarget(
  relationshipId: string,
  options: {
    /** Bumps to refetch, e.g. after the first draft is saved. */
    reloadKey: unknown;
    onSaved: (target: number) => void;
    /** Returns true when it handled the error (coaching ended elsewhere). */
    onEndedElsewhere: (err: unknown) => boolean;
  },
): StepsTargetState {
  const { reloadKey, onSaved, onEndedElsewhere } = options;
  const [target, setTarget] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!relationshipId) return;
    let cancelled = false;
    setLoadFailed(false);
    apiClient
      .getClientSteps(relationshipId, "7d")
      .then((result) => {
        if (!cancelled) setTarget(result.target);
      })
      .catch(() => {
        if (cancelled) return;
        setTarget(null);
        setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [relationshipId, reloadKey]);

  const save = useCallback(
    async (next: number) => {
      if (!relationshipId) return false;
      const previous = target;
      setTarget(next);
      setSaving(true);
      setError(null);
      try {
        const result = await apiClient.putClientStepsTarget(relationshipId, next);
        setTarget(result.target);
        onSaved(result.target);
        return true;
      } catch (err) {
        setTarget(previous);
        if (onEndedElsewhere(err)) return false;
        if (
          err instanceof ApiClientError &&
          err.code === "CONFIGURATION_NOT_FOUND"
        ) {
          setError("Save the draft first. Then you can set the steps target.");
        } else {
          setError(
            err instanceof ApiClientError
              ? err.message
              : "Could not save the steps target.",
          );
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [onEndedElsewhere, onSaved, relationshipId, target],
  );

  return { target, loadFailed, saving, error, save };
}
