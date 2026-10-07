import { useCallback, useEffect, useRef, useState } from "react";
import { errorText } from "./shared";

type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export function useCursorPage<T>(
  resetKey: string,
  fetchPage: (cursor?: string) => Promise<Page<T>>,
) {
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;
  const generation = useRef(0);
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const request = ++generation.current;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPageRef
      .current(undefined)
      .then((page) => {
        if (cancelled || request !== generation.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (cancelled || request !== generation.current) return;
        setItems([]);
        setNextCursor(null);
        setError(errorText(err, "Could not load this list."));
      })
      .finally(() => {
        if (!cancelled && request === generation.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resetKey, reloadToken]);

  const loadMore = useCallback(async () => {
    const cursor = nextCursor;
    if (!cursor || loadingMore) return;
    const request = generation.current;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchPageRef.current(cursor);
      if (request !== generation.current) return;
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err: unknown) {
      if (request !== generation.current) return;
      setError(errorText(err, "Could not load more."));
    } finally {
      if (request === generation.current) setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  return {
    items,
    setItems,
    nextCursor,
    loading,
    loadingMore,
    error,
    loadMore: () => {
      void loadMore();
    },
    reload: () => setReloadToken((value) => value + 1),
  };
}

export function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}
