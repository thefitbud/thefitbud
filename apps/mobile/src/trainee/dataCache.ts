/**
 * Shared trainee day/meal/workout query cache with invalidation.
 * Today and Diet (and overlays) read the same entries so logging updates both.
 */
type Listener = () => void;

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
  /**
   * Set when a write elsewhere (a log, a sync) made the value out of date. A
   * stale entry is still shown (stale-while-revalidate, Z12-40) and is
   * refetched the next time a screen reads its day.
   */
  stale?: boolean;
  /** Last read or write, for the day-view eviction below. */
  touchedAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const listeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<Listener>();

export function cacheKey(
  kind: "meals" | "day" | "week" | "exceptions" | "workouts" | "dayview",
  ...parts: string[]
): string {
  return [kind, ...parts].join(":");
}

/**
 * Per-day screen data (Z12-40): one entry per screen, relationship and civil
 * date, `dayview:<screen>:<relationshipId>:<YYYY-MM-DD>`. A trainee moving
 * between days reads these first, so a day already seen (or prefetched)
 * paints at once and refreshes underneath.
 */
export function dayViewKey(
  screen: string,
  relationshipId: string,
  localDate: string,
): string {
  return cacheKey("dayview", screen, relationshipId, localDate);
}

/**
 * Day views kept in memory at most. Seven days either side of where the
 * trainee is, for two screens, with room to spare; the least recently used
 * go first.
 */
export const DAY_VIEW_LIMIT = 42;

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (entry) entry.touchedAt = Date.now();
  return entry?.value as T | undefined;
}

/** The entry with its freshness, for stale-while-revalidate readers. */
export function getCacheEntry<T>(
  key: string,
): { value: T; updatedAt: number; stale: boolean } | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  entry.touchedAt = Date.now();
  return {
    value: entry.value as T,
    updatedAt: entry.updatedAt,
    stale: entry.stale === true,
  };
}

export function setCached<T>(key: string, value: T): void {
  const now = Date.now();
  store.set(key, { value, updatedAt: now, touchedAt: now });
  if (key.startsWith("dayview:")) evictDayViews();
  notify(key);
}

function evictDayViews() {
  const views = [...store.entries()].filter(([key]) =>
    key.startsWith("dayview:"),
  );
  if (views.length <= DAY_VIEW_LIMIT) return;
  views.sort((a, b) => a[1].touchedAt - b[1].touchedAt);
  for (const [key] of views.slice(0, views.length - DAY_VIEW_LIMIT)) {
    store.delete(key);
  }
}

export function invalidate(...keys: string[]): void {
  for (const key of keys) {
    store.delete(key);
    notify(key);
  }
  for (const listener of globalListeners) listener();
}

/** Invalidate all meal/day/workout data for a relationship (any date). */
export function invalidateRelationshipDayData(relationshipId: string): void {
  const prefixMeals = `meals:${relationshipId}:`;
  const prefixWorkouts = `workouts:${relationshipId}:`;
  const prefixDay = "day:";
  for (const [key, entry] of [...store.entries()]) {
    // Day views are marked stale, not dropped: the day keeps showing what it
    // had (no skeleton after a log) while the screen refetches it (Z12-40).
    if (key.startsWith("dayview:") && key.includes(`:${relationshipId}:`)) {
      entry.stale = true;
      continue;
    }
    if (
      key.startsWith(prefixMeals) ||
      key.startsWith(prefixWorkouts) ||
      key.startsWith(prefixDay) ||
      key.startsWith("week:")
    ) {
      store.delete(key);
      notify(key);
    }
  }
  for (const listener of globalListeners) listener();
}

/**
 * Drops every per-day screen view (`dayview:` keys) and the day reads they
 * share (meals, workouts, day, week). Used when what is cached can no longer
 * be trusted as a starting point at all, for example a new session; an
 * ordinary write marks views stale instead (`invalidateRelationshipDayData`).
 */
export function clearDayViews(): void {
  const prefixes = ["dayview:", "meals:", "workouts:", "day:", "week:"];
  for (const key of [...store.keys()]) {
    if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
    store.delete(key);
    notify(key);
  }
}

export function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

export function subscribeAll(listener: Listener): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

function notify(key: string) {
  const set = listeners.get(key);
  if (set) for (const listener of set) listener();
}

/** Map sync rejection/conflict to trainee-facing copy. */
export function messageFromSyncResults(
  results: Array<{
    status: string;
    error?: { code?: string; message?: string; details?: unknown } | null;
  }>,
  coachName = "Your coach",
): string | null {
  const bad = results.find(
    (r) => r.status === "rejected" || r.status === "conflicted",
  );
  if (!bad) return null;
  const code = bad.error?.code;
  const reason =
    bad.error?.details &&
    typeof bad.error.details === "object" &&
    bad.error.details &&
    "reason" in bad.error.details
      ? String((bad.error.details as { reason?: string }).reason)
      : null;
  if (code === "LOCKED" || reason === "exception_resolved") {
    return `${coachName} closed this meal before your log was sent.`;
  }
  if (reason === "optional_past_day") {
    return "This optional meal can't be logged for a past day.";
  }
  if (reason === "edit_window_closed") {
    return "This meal can't be changed anymore.";
  }
  return bad.error?.message ?? "Couldn't save. Try again when you're online.";
}
