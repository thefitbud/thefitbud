import { userFacingMessage } from "@fitbud/api-client";
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

/**
 * Write generations (Z12-40 review). A read that started before a write may
 * answer with pre-write data; `invalidateRelationshipDayData` bumps the
 * relationship's generation, so such a read is never joined by a later one
 * (`fetchDayInto`) and its result is never stored as fresh (`setCached` with
 * the generation the read started in). `clearDayViews` bumps `epoch`, which
 * retires every read in flight.
 */
let epoch = 0;
/** Bumped by any relationship write: covers keys that name no relationship. */
let anyWrite = 0;
const relationshipWrites = new Map<string, number>();

/**
 * Requests in flight for the day reads, by key, with the generation they
 * started in. Lives here so `clearDayViews` drops them with the data.
 */
export const inflightReads = new Map<
  string,
  { promise: Promise<unknown>; generation: string }
>();

/** The relationship a day-data key belongs to, when its layout names one. */
function relationshipOfKey(key: string): string | null {
  const parts = key.split(":");
  switch (parts[0]) {
    case "meals":
    case "workouts":
      return parts[1] ?? null;
    case "dayview":
      // dayview:<screen>:<relationshipId>:<date>
      return parts[2] ?? null;
    case "day":
      // day:<what>:<relationshipId>
      return parts[2] ?? null;
    default:
      return null;
  }
}

/**
 * The generation a read of `key` belongs to. It changes whenever a write
 * could have made a read of that key, started earlier, out of date.
 */
export function cacheGeneration(key: string): string {
  const relationshipId = relationshipOfKey(key);
  const writes =
    relationshipId === null
      ? anyWrite
      : (relationshipWrites.get(relationshipId) ?? 0);
  return `${epoch}:${writes}`;
}

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

/**
 * Stores `value` as the fresh entry for `key`. A fetch result passes the
 * `generation` its read started in; if a write (or a clear) came since, the
 * result may predate it and is dropped, leaving the entry stale or missing so
 * the screen refetches it. Returns whether it was stored.
 */
export function setCached<T>(
  key: string,
  value: T,
  options: { generation?: string } = {},
): boolean {
  if (
    options.generation !== undefined &&
    options.generation !== cacheGeneration(key)
  ) {
    return false;
  }
  const now = Date.now();
  store.set(key, { value, updatedAt: now, touchedAt: now });
  if (key.startsWith("dayview:")) evictDayViews();
  notify(key);
  return true;
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
  relationshipWrites.set(
    relationshipId,
    (relationshipWrites.get(relationshipId) ?? 0) + 1,
  );
  anyWrite += 1;
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
  dayCacheOwner = null;
  dropDayData(true);
}

function dropDayData(notifyListeners: boolean): void {
  epoch += 1;
  inflightReads.clear();
  const prefixes = ["dayview:", "meals:", "workouts:", "day:", "week:"];
  for (const key of [...store.keys()]) {
    if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
    store.delete(key);
    if (notifyListeners) notify(key);
  }
}

let dayCacheOwner: string | null = null;

/**
 * Called by every day-cache reader with the relationship on screen before it
 * reads. When the relationship changes (another account signed in, or the
 * trainee's coaching relationship changed) everything cached for the previous
 * one is dropped first, so it never paints, and its reads in flight are
 * retired. Sign-out itself is not visible from here (AuthProvider is a shared
 * file), so the previous account's data stays in memory, unreadable, until
 * the next relationship is seen (hand-off: Z12-49).
 */
export function claimDayCacheOwner(relationshipId: string): void {
  if (dayCacheOwner === relationshipId) return;
  // Runs during render: drop silently. Nothing still mounted reads the
  // previous relationship's keys, so there is no one to notify.
  if (dayCacheOwner !== null) dropDayData(false);
  dayCacheOwner = relationshipId;
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
  return userFacingMessage(bad.error?.message, {
    fallback: "Couldn't save. Try again when you're online.",
  });
}
