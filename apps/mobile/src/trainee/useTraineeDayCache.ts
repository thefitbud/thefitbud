import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { addDays } from "../lib/dates";
import {
  dayViewKey,
  getCacheEntry,
  setCached,
  subscribe,
  subscribeAll,
} from "./dataCache";

/**
 * Per-day cache for the trainee's day screens (Z12-40, ISSUE-MAP #6).
 *
 * Each screen keeps one entry per relationship and civil date
 * (`dayViewKey`). Moving to a day reads that entry synchronously during
 * render, so a day already seen or prefetched paints in the same frame as the
 * tap, with no spinner, and is refreshed underneath (stale-while-revalidate).
 * Only a first visit to a day with nothing cached is a `firstLoad`, the one
 * case a skeleton is shown. After the selected day settles, the days within
 * `prefetchRadius` either side are fetched once if they are not cached.
 *
 * The server stays the source of truth: every visit to a day whose entry is
 * older than `maxAgeMs`, or was marked stale by a write
 * (`invalidateRelationshipDayData`), refetches it.
 */

/** Days either side of the selected one that are fetched ahead (spec: ±3). */
export const PREFETCH_RADIUS = 3;
/** An entry younger than this is shown without refetching on a revisit. */
export const DAY_VIEW_MAX_AGE_MS = 30_000;

const inflight = new Map<string, Promise<unknown>>();

/**
 * Fetches one day into the cache, sharing a request already in flight for the
 * same key (a prefetch and a tap on that day make one call, not two).
 */
export function fetchDayInto<T>(
  key: string,
  fetchDay: () => Promise<T>,
): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const promise = fetchDay()
    .then((value) => {
      setCached(key, value);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/** The civil dates prefetched around `date`, nearest first. */
export function prefetchDates(date: string, radius = PREFETCH_RADIUS): string[] {
  const out: string[] = [];
  for (let offset = 1; offset <= radius; offset += 1) {
    out.push(addDays(date, offset), addDays(date, -offset));
  }
  return out;
}

/**
 * A read several day views share (the day's meals, the week, coach notes),
 * reused while it is younger than `maxAgeMs` so a prefetch of six days and two
 * screens does not repeat it. `force` (pull to refresh) always refetches.
 * Writes clear these keys (`invalidateRelationshipDayData`), so a log is never
 * answered from here.
 */
export async function sharedRead<T>(
  key: string,
  fetch: () => Promise<T>,
  options: { force?: boolean; maxAgeMs?: number } = {},
): Promise<T> {
  const entry = getCacheEntry<T>(key);
  if (
    !options.force &&
    entry &&
    !needsRevalidate(entry, Date.now(), options.maxAgeMs ?? DAY_VIEW_MAX_AGE_MS)
  ) {
    return entry.value;
  }
  return fetchDayInto(key, fetch);
}

export function needsRevalidate(
  entry: { updatedAt: number; stale: boolean } | undefined,
  now: number,
  maxAgeMs = DAY_VIEW_MAX_AGE_MS,
): boolean {
  return !entry || entry.stale || now - entry.updatedAt > maxAgeMs;
}

export type DayCacheResult<T> = {
  /** The selected day's data, cached or fresh; never another day's. */
  data: T | undefined;
  /** Nothing cached for this day and its first fetch is running: the skeleton case. */
  firstLoad: boolean;
  /** The last fetch for this day failed (data, if any, is the cached copy). */
  error: unknown;
  /** Refetches the selected day now (pull to refresh, after a log). */
  refresh: () => Promise<void>;
};

export function useTraineeDayCache<T>(input: {
  /** Which screen's view this is: "today", "diet". */
  screen: string;
  relationshipId: string;
  date: string;
  /** Loads one day. `force` is set for a pull to refresh: bypass `sharedRead`. */
  fetchDay: (date: string, options: { force: boolean }) => Promise<T>;
  enabled?: boolean;
  prefetchRadius?: number;
  maxAgeMs?: number;
}): DayCacheResult<T> {
  const {
    screen,
    relationshipId,
    date,
    enabled = true,
    prefetchRadius = PREFETCH_RADIUS,
    maxAgeMs = DAY_VIEW_MAX_AGE_MS,
  } = input;
  const key = dayViewKey(screen, relationshipId, date);
  // The latest loader without making it an effect dependency: hosts build it
  // inline, and a new function each render must not refetch the day.
  const fetchRef = useRef(input.fetchDay);
  fetchRef.current = input.fetchDay;

  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [nonce, setNonce] = useState(0);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; error: unknown } | null>(
    null,
  );

  const entry = enabled ? getCacheEntry<T>(key) : undefined;

  useEffect(() => subscribe(key, rerender), [key]);
  // A write anywhere (a log, a sync) marks the day views stale and fires the
  // global listeners: refetch the day on screen, keeping what it shows.
  useEffect(() => subscribeAll(() => setNonce((n) => n + 1)), []);

  const revalidate = useCallback(
    async (force: boolean) => {
      if (!enabled) return;
      const current = getCacheEntry<T>(key);
      if (!force && !needsRevalidate(current, Date.now(), maxAgeMs)) return;
      setPendingKey(key);
      try {
        await fetchDayInto(key, () => fetchRef.current(date, { force }));
        setFailure((prev) => (prev?.key === key ? null : prev));
      } catch (error) {
        setFailure({ key, error });
      } finally {
        setPendingKey((prev) => (prev === key ? null : prev));
      }
    },
    [date, enabled, key, maxAgeMs],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void revalidate(false).then(() => {
      if (cancelled) return;
      for (const near of prefetchDates(date, prefetchRadius)) {
        const nearKey = dayViewKey(screen, relationshipId, near);
        if (getCacheEntry(nearKey)) continue;
        // A failed prefetch shows nothing and is retried when the day is
        // visited, where its failure is shown; nothing to report here.
        fetchDayInto(nearKey, () =>
          fetchRef.current(near, { force: false }),
        ).catch(
          () => undefined,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [date, enabled, nonce, prefetchRadius, relationshipId, revalidate, screen]);

  const refresh = useCallback(() => revalidate(true), [revalidate]);

  const data = entry?.value;
  const firstLoad =
    enabled && data === undefined && (pendingKey === key || failure?.key !== key);
  return {
    data,
    firstLoad,
    error: failure?.key === key ? failure.error : null,
    refresh,
  };
}
