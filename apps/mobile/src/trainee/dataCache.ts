/**
 * Shared trainee day/meal query cache with invalidation.
 * Today and Diet (and overlays) read the same entries so logging updates both.
 */
type Listener = () => void;

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const listeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<Listener>();

export function cacheKey(
  kind: "meals" | "day" | "week" | "exceptions",
  ...parts: string[]
): string {
  return [kind, ...parts].join(":");
}

export function getCached<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, { value, updatedAt: Date.now() });
  notify(key);
}

export function invalidate(...keys: string[]): void {
  for (const key of keys) {
    store.delete(key);
    notify(key);
  }
  for (const listener of globalListeners) listener();
}

/** Invalidate all meal/day data for a relationship (any date). */
export function invalidateRelationshipDayData(relationshipId: string): void {
  const prefixMeals = `meals:${relationshipId}:`;
  const prefixDay = "day:";
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefixMeals) || key.startsWith(prefixDay) || key.startsWith("week:")) {
      store.delete(key);
      notify(key);
    }
  }
  for (const listener of globalListeners) listener();
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
