import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { WeekReadModel } from "@fitbud/contracts";
import { addDays, startOfWeekMonday } from "../lib/dates";
import {
  cacheGeneration,
  claimDayCacheOwner,
  dayViewKey,
  getCacheEntry,
  inflightReads,
  setCached,
  subscribe,
  subscribeAll,
} from "./dataCache";
import { loadWeekModel, type WeekModelState } from "./TraineeDateNavigator";

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

/**
 * Fetches one day into the cache, sharing a request already in flight for the
 * same key (a prefetch and a tap on that day make one call, not two).
 *
 * A request is shared only within one write generation (`cacheGeneration`):
 * one that started before a log may carry pre-log data, so a read after the
 * log never joins it, and its result is not stored as fresh. A `force` read
 * (pull to refresh, refresh after a log) never joins at all.
 */
export function fetchDayInto<T>(
  key: string,
  fetchDay: () => Promise<T>,
  options: { force?: boolean } = {},
): Promise<T> {
  const generation = cacheGeneration(key);
  const running = inflightReads.get(key);
  if (running && !options.force && running.generation === generation) {
    return running.promise as Promise<T>;
  }
  const promise: Promise<T> = fetchDay()
    .then((value) => {
      setCached(key, value, { generation });
      return value;
    })
    .finally(() => {
      // A newer request for the key may have replaced this one.
      if (inflightReads.get(key)?.promise === promise) inflightReads.delete(key);
    });
  inflightReads.set(key, { promise, generation });
  return promise;
}

/** The civil dates prefetched around `date`, nearest first. */
export function prefetchDates(
  date: string,
  radius = PREFETCH_RADIUS,
  stepDays = 1,
): string[] {
  const out: string[] = [];
  for (let offset = 1; offset <= radius; offset += 1) {
    out.push(addDays(date, offset * stepDays), addDays(date, -offset * stepDays));
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
  return fetchDayInto(key, fetch, { force: options.force });
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
  /** Days between prefetched keys: 1 for days, 7 for weeks. */
  prefetchStepDays?: number;
  maxAgeMs?: number;
}): DayCacheResult<T> {
  const {
    screen,
    relationshipId,
    date,
    enabled = true,
    prefetchRadius = PREFETCH_RADIUS,
    prefetchStepDays = 1,
    maxAgeMs = DAY_VIEW_MAX_AGE_MS,
  } = input;
  // Another relationship on screen (another account) drops the previous
  // one's days before anything is read.
  if (enabled) claimDayCacheOwner(relationshipId);
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
        await fetchDayInto(key, () => fetchRef.current(date, { force }), {
          force,
        });
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
    void (async () => {
      await revalidate(false);
      // One prefetch at a time, nearest day first: a burst of six day loads
      // at once would compete with the day on screen for a slow network.
      for (const near of prefetchDates(date, prefetchRadius, prefetchStepDays)) {
        if (cancelled) return;
        const nearKey = dayViewKey(screen, relationshipId, near);
        if (getCacheEntry(nearKey)) continue;
        try {
          await fetchDayInto(nearKey, () =>
            fetchRef.current(near, { force: false }),
          );
        } catch {
          // A failed prefetch shows nothing and is retried when the day is
          // visited, where its failure is shown; nothing to report here.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    date,
    enabled,
    nonce,
    prefetchRadius,
    prefetchStepDays,
    relationshipId,
    revalidate,
    screen,
  ]);

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

/** `GET /me/week` did not give a week; nothing is cached for it. */
class WeekUnavailable extends Error {
  constructor() {
    super("Week unavailable");
    this.name = "WeekUnavailable";
  }
}

/**
 * The selected day's week (`GET /me/week`) as the strip and "This week" read
 * it, cached per relationship and week start and shared by Today and Diet
 * (Z12-40), with the weeks either side prefetched. Loaded on its own, beside
 * the day, so a failed week shows as soon as it fails (CU23).
 *
 * A failure is never cached: it reads `unavailable` (four states, never a
 * nullable model, D-W3b-25) and the next visit or pull to refresh asks
 * again.
 */
export function useTraineeWeek(input: {
  relationshipId: string;
  selectedDate: string;
  getMeWeek: (weekStart: string) => Promise<WeekReadModel | null>;
  where: string;
}): { weekState: WeekModelState; refresh: () => Promise<void> } {
  const { relationshipId, selectedDate, getMeWeek, where } = input;
  const getRef = useRef(getMeWeek);
  getRef.current = getMeWeek;
  const fetchWeek = useCallback(
    async (weekStart: string): Promise<WeekModelState> => {
      const week = await loadWeekModel(
        (start) => getRef.current(start),
        weekStart,
        where,
      );
      if (week.status !== "loaded") throw new WeekUnavailable();
      return week;
    },
    [where],
  );
  const cache = useTraineeDayCache<WeekModelState>({
    screen: "week",
    relationshipId,
    date: startOfWeekMonday(selectedDate),
    fetchDay: fetchWeek,
    prefetchRadius: 1,
    prefetchStepDays: 7,
  });
  const weekState: WeekModelState =
    cache.data ??
    (cache.error != null ? { status: "unavailable" } : { status: "loading" });
  return { weekState, refresh: cache.refresh };
}
