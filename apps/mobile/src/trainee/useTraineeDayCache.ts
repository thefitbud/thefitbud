import { useCallback, useEffect, useState } from "react";
import {
  cacheKey,
  getCached,
  invalidateRelationshipDayData,
  setCached,
  subscribeAll,
} from "./dataCache";

/**
 * Shared day/meal cache: screens read the same keys and reload when
 * invalidateRelationshipDayData runs after logging.
 */
export function useTraineeDayCache<T>(input: {
  kind: "meals" | "day" | "week" | "exceptions" | "workouts";
  relationshipId: string;
  date?: string;
  load: () => Promise<T>;
  enabled?: boolean;
}): {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: (value: T) => void;
} {
  const { kind, relationshipId, date, load, enabled = true } = input;
  const key = cacheKey(kind, relationshipId, date ?? "_");
  const [data, setDataState] = useState<T | undefined>(() => getCached<T>(key));
  const [loading, setLoading] = useState(enabled && data === undefined);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const value = await load();
      setCached(key, value);
      setDataState(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't refresh.");
    } finally {
      setLoading(false);
    }
  }, [enabled, key, load]);

  useEffect(() => {
    if (!enabled) return;
    const cached = getCached<T>(key);
    if (cached !== undefined) {
      setDataState(cached);
      setLoading(false);
    }
    void refresh();
  }, [enabled, key, refresh, nonce]);

  useEffect(() => {
    return subscribeAll(() => {
      setNonce((n) => n + 1);
    });
  }, []);

  function setData(value: T) {
    setCached(key, value);
    setDataState(value);
  }

  return { data, loading, error, refresh, setData };
}

export function bumpDayCaches(relationshipId: string) {
  invalidateRelationshipDayData(relationshipId);
}
