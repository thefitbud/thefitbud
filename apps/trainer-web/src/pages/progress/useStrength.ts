import { useEffect, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import type { StrengthQuery, StrengthReadModel } from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { rangeCacheKey, type MetricRange } from "./useProgressMetrics";

type State = {
  data: StrengthReadModel | null;
  loading: boolean;
  error: string | null;
};

export function strengthQueryFor(range: MetricRange): Partial<StrengthQuery> {
  return range.range === "custom"
    ? { from: range.from, to: range.to }
    : { range: range.range };
}

/** Strength read model (Z6-5, Z8-13) for one range: lifts, workouts per week, uncharted sets. */
export function useStrength(input: {
  relationshipId: string;
  range: MetricRange;
  refreshEpoch: number;
  enabled?: boolean;
}): State & { reload: () => void } {
  const { relationshipId, range, refreshEpoch, enabled = true } = input;
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const rangeKey = rangeCacheKey(range);

  useEffect(() => {
    if (!enabled || !relationshipId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    apiClient
      .getStrength(relationshipId, strengthQueryFor(range))
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          data: null,
          loading: false,
          error:
            err instanceof ApiClientError
              ? err.message
              : "Could not load workouts.",
        });
      });
    return () => {
      cancelled = true;
    };
    // `range` is represented by rangeKey.
  }, [relationshipId, rangeKey, refreshEpoch, attempt, enabled]);

  return { ...state, reload: () => setAttempt((value) => value + 1) };
}
