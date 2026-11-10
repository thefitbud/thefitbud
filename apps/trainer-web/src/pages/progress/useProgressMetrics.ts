import { useEffect, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import {
  PROGRESS_METRICS_MAX_KEYS,
  type ProgressMetricKey,
  type ProgressMetricSeries,
} from "@fitbud/contracts";
import { apiClient } from "../../lib/api";

export type MetricRange =
  | { range: "4w" | "12w" | "all" }
  | { range: "custom"; from: string; to: string };

export type MetricsResult = {
  /** Series by key, oldest point first (Z6-7). */
  series: Partial<Record<ProgressMetricKey, ProgressMetricSeries>>;
  /** Resolved window in the client's timezone; `from` is null for "all". */
  from: string | null;
  to: string | null;
};

type State = {
  data: MetricsResult | null;
  loading: boolean;
  error: string | null;
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/**
 * Loads series for any number of standard keys. The metrics endpoint takes at most
 * two keys per call (compare), so keys are asked in pairs and merged.
 */
export async function fetchProgressMetrics(
  relationshipId: string,
  keys: readonly ProgressMetricKey[],
  range: MetricRange,
): Promise<MetricsResult> {
  const query =
    range.range === "custom"
      ? { range: "custom" as const, from: range.from, to: range.to }
      : { range: range.range };
  const responses = await Promise.all(
    chunk(keys, PROGRESS_METRICS_MAX_KEYS).map((pair) =>
      apiClient.getProgressMetrics(relationshipId, { keys: pair, ...query }),
    ),
  );
  const series: MetricsResult["series"] = {};
  for (const response of responses) {
    for (const row of response.series) series[row.key] = row;
  }
  const first = responses[0];
  return { series, from: first?.from ?? null, to: first?.to ?? null };
}

export function rangeCacheKey(range: MetricRange): string {
  return range.range === "custom"
    ? `custom:${range.from}:${range.to}`
    : range.range;
}

export function useProgressMetrics(input: {
  relationshipId: string;
  keys: readonly ProgressMetricKey[];
  range: MetricRange;
  refreshEpoch: number;
  enabled?: boolean;
}): State & { reload: () => void } {
  const { relationshipId, keys, range, refreshEpoch, enabled = true } = input;
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const keysKey = keys.join(",");
  const rangeKey = rangeCacheKey(range);

  useEffect(() => {
    if (!enabled || !relationshipId || keysKey === "") {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    fetchProgressMetrics(
      relationshipId,
      keysKey.split(",") as ProgressMetricKey[],
      range,
    )
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
              : "Could not load progress.",
        });
      });
    return () => {
      cancelled = true;
    };
    // `range` is represented by rangeKey.
  }, [relationshipId, keysKey, rangeKey, refreshEpoch, attempt, enabled]);

  return { ...state, reload: () => setAttempt((value) => value + 1) };
}
