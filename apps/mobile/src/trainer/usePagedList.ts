import { useCallback, useEffect, useRef, useState } from "react";

/** One page as every trainer list endpoint returns it (D-W14-26). */
export type PagedResult<T> = { items: T[]; nextCursor: string | null };

/** Why the footer is not just "Loading more…" (Z14-21). */
export type PagedFailure = "failed" | "offline";

type Options<T> = {
  /**
   * Identity of the query (chip, search, segment, filter). A new value resets
   * the list; a page still in flight for the old value is dropped.
   */
  queryKey: string;
  /** `cursor` is null for the first page. Called once per cursor. */
  fetchPage: (cursor: string | null) => Promise<PagedResult<T>>;
  getKey: (item: T) => string;
  /** The cached first page: painted at once, then refreshed underneath (Z14-3). */
  initial?: PagedResult<T> | null;
  /** False holds the list back (a segment the trainer has not opened yet). */
  enabled?: boolean;
  /** Delay before the first page of a changed query, for search typing. */
  debounceMs?: number;
  isOffline?: (err: unknown) => boolean;
  onError?: (err: unknown, phase: "first" | "more") => void;
};

export type PagedList<T> = {
  items: T[];
  hasMore: boolean;
  /** First page in flight with nothing to show: the skeleton. */
  loading: boolean;
  /** First page in flight under items already on screen: the quiet line. */
  updating: boolean;
  /** Pull to refresh in flight. */
  refreshing: boolean;
  loadingMore: boolean;
  /** The first page failed. Items already on screen stay. */
  error: PagedFailure | null;
  /** The next page failed; nothing more loads until `retryMore`. */
  moreError: PagedFailure | null;
  /** Ask for the next page (wire to `onEndReached`). Once per cursor. */
  loadMore: () => void;
  retryMore: () => void;
  /** Pull to refresh: back to the first page. */
  refresh: () => void;
  /**
   * Refresh the first page underneath what is on screen (a tab becoming active
   * again): later pages already loaded stay, so the scroll position holds.
   */
  refreshQuietly: () => void;
  /** Drop rows that no longer belong (a check-in marked reviewed). */
  removeWhere: (predicate: (item: T) => boolean) => void;
};

/**
 * Cursor paging for the trainer lists (Z14-21, D-W14-26): items plus
 * `nextCursor`; one request per cursor; a reset on query change or pull to
 * refresh; a late page from an old query is dropped.
 */
export function usePagedList<T>(options: Options<T>): PagedList<T> {
  const { queryKey, enabled = true, debounceMs = 0 } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [initial] = useState(options.initial ?? null);
  const [items, setItems] = useState<T[]>(initial?.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initial?.nextCursor ?? null,
  );
  const [firstPending, setFirstPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<PagedFailure | null>(null);
  const [moreError, setMoreError] = useState<PagedFailure | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(initial != null);

  // Mirrors of state the callbacks read, so they never act on a stale render.
  const itemsRef = useRef<T[]>(items);
  const cursorRef = useRef<string | null>(nextCursor);
  const firstPageSize = useRef(initial?.items.length ?? 0);
  const generation = useRef(0);
  const requested = useRef(new Set<string>());
  const moreInFlight = useRef(false);
  const moreErrorRef = useRef<PagedFailure | null>(null);
  const firstQuery = useRef(true);
  const firstInFlight = useRef(false);

  const failureOf = useCallback((err: unknown): PagedFailure => {
    return optionsRef.current.isOffline?.(err) ? "offline" : "failed";
  }, []);

  const commit = useCallback((next: T[], cursor: string | null) => {
    itemsRef.current = next;
    cursorRef.current = cursor;
    setItems(next);
    setNextCursor(cursor);
  }, []);

  const loadFirst = useCallback(
    async (mode: "reset" | "quiet" | "pull") => {
      const gen = ++generation.current;
      const keep = mode === "quiet" ? itemsRef.current : [];
      // A quiet refresh keeps the pages already loaded (when there are any
      // beyond the first), so the scroll position holds.
      const keepTail = mode === "quiet" && keep.length > firstPageSize.current;
      const keptCursor = cursorRef.current;
      const keptFirstSize = firstPageSize.current;
      firstInFlight.current = true;
      requested.current = new Set();
      moreInFlight.current = false;
      setLoadingMore(false);
      moreErrorRef.current = null;
      setMoreError(null);
      setError(null);
      if (mode === "pull") setRefreshing(true);
      else setFirstPending(true);
      try {
        const page = await optionsRef.current.fetchPage(null);
        if (gen !== generation.current) return;
        const { getKey } = optionsRef.current;
        firstPageSize.current = page.items.length;
        if (keepTail) {
          const fresh = new Set(page.items.map(getKey));
          const tail = keep
            .slice(keptFirstSize)
            .filter((item) => !fresh.has(getKey(item)));
          commit([...page.items, ...tail], keptCursor);
        } else {
          commit(page.items, page.nextCursor);
        }
        setLoadedOnce(true);
      } catch (err) {
        if (gen !== generation.current) return;
        optionsRef.current.onError?.(err, "first");
        setError(failureOf(err));
        setLoadedOnce(true);
      } finally {
        if (gen === generation.current) {
          firstInFlight.current = false;
          setFirstPending(false);
          setRefreshing(false);
        }
      }
    },
    [commit, failureOf],
  );

  // Query change: reset (debounced for typing); the first mount starts at once.
  useEffect(() => {
    if (!enabled) return;
    const first = firstQuery.current;
    firstQuery.current = false;
    firstInFlight.current = true;
    if (!first) {
      generation.current += 1; // drop any page of the old query now
      firstPageSize.current = 0;
      commit([], null);
      setLoadedOnce(false);
      setFirstPending(true);
    }
    const handle = setTimeout(
      () => void loadFirst("reset"),
      first || debounceMs === 0 ? 0 : debounceMs,
    );
    return () => clearTimeout(handle);
    // loadFirst and commit are stable; the query is the only trigger.
  }, [queryKey, enabled]);

  const fetchMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (cursor === null || moreInFlight.current) return;
    if (requested.current.has(cursor)) return;
    requested.current.add(cursor);
    moreInFlight.current = true;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const page = await optionsRef.current.fetchPage(cursor);
      if (gen !== generation.current) return;
      const { getKey } = optionsRef.current;
      const have = new Set(itemsRef.current.map(getKey));
      commit(
        [
          ...itemsRef.current,
          ...page.items.filter((item) => !have.has(getKey(item))),
        ],
        page.nextCursor,
      );
    } catch (err) {
      if (gen !== generation.current) return;
      requested.current.delete(cursor);
      optionsRef.current.onError?.(err, "more");
      const failure = failureOf(err);
      moreErrorRef.current = failure;
      setMoreError(failure);
    } finally {
      if (gen === generation.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  }, [commit, failureOf]);

  const loadMore = useCallback(() => {
    // After a failed page the footer's own button retries; scrolling does not.
    if (moreErrorRef.current || firstInFlight.current) return;
    void fetchMore();
  }, [fetchMore]);

  const retryMore = useCallback(() => {
    moreErrorRef.current = null;
    setMoreError(null);
    void fetchMore();
  }, [fetchMore]);

  const refresh = useCallback(() => void loadFirst("pull"), [loadFirst]);
  const refreshQuietly = useCallback(() => void loadFirst("quiet"), [loadFirst]);

  const removeWhere = useCallback(
    (predicate: (item: T) => boolean) => {
      commit(itemsRef.current.filter((item) => !predicate(item)), cursorRef.current);
    },
    [commit],
  );

  return {
    items,
    hasMore: nextCursor !== null,
    loading: items.length === 0 && (firstPending || (enabled && !loadedOnce)),
    updating: items.length > 0 && firstPending && !refreshing,
    refreshing,
    loadingMore,
    error,
    moreError,
    loadMore,
    retryMore,
    refresh,
    refreshQuietly,
    removeWhere,
  };
}
