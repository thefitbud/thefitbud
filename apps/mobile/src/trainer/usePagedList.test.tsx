import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePagedList, type PagedResult } from "./usePagedList";

type Row = { id: string };
const rows = (from: number, to: number): Row[] =>
  Array.from({ length: to - from }, (_, i) => ({ id: `r${from + i}` }));

/** A fake endpoint over `total` rows, `size` per page, cursor = next offset. */
function endpoint(total: number, size = 30) {
  return vi.fn(async (cursor: string | null): Promise<PagedResult<Row>> => {
    const from = cursor ? Number(cursor) : 0;
    const to = Math.min(from + size, total);
    return { items: rows(from, to), nextCursor: to < total ? String(to) : null };
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const getKey = (row: Row) => row.id;

describe("usePagedList", () => {
  it("loads the first page, then each next page once", async () => {
    const fetchPage = endpoint(75);
    const { result } = renderHook(() =>
      usePagedList<Row>({ queryKey: "all", fetchPage, getKey }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(60));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(75));

    expect(result.current.hasMore).toBe(false);
    act(() => result.current.loadMore());
    expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([null, "30", "60"]);
    expect(new Set(result.current.items.map(getKey)).size).toBe(75);
  });

  it("never asks twice for the same cursor", async () => {
    const first = deferred<PagedResult<Row>>();
    const fetchPage = vi
      .fn<(cursor: string | null) => Promise<PagedResult<Row>>>()
      .mockResolvedValueOnce({ items: rows(0, 30), nextCursor: "30" })
      .mockReturnValueOnce(first.promise);
    const { result } = renderHook(() =>
      usePagedList<Row>({ queryKey: "all", fetchPage, getKey }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(30));

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
      result.current.loadMore();
    });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.current.loadingMore).toBe(true);

    await act(async () => first.resolve({ items: rows(30, 40), nextCursor: null }));
    expect(result.current.items).toHaveLength(40);
    expect(result.current.loadingMore).toBe(false);
  });

  it("resets on a query change and drops a late page of the old query", async () => {
    const late = deferred<PagedResult<Row>>();
    const fetchPage = vi.fn(async (cursor: string | null): Promise<PagedResult<Row>> => {
      if (cursor === "30") return late.promise;
      return { items: rows(0, 30), nextCursor: "30" };
    });
    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: string }) =>
        usePagedList<Row>({ queryKey, fetchPage, getKey }),
      { initialProps: { queryKey: "all" } },
    );
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);

    // A chip change while page 2 of "all" is still in flight.
    fetchPage.mockImplementation(async () => ({ items: [{ id: "x1" }], nextCursor: null }));
    rerender({ queryKey: "needs" });
    await waitFor(() => expect(result.current.items).toEqual([{ id: "x1" }]));

    await act(async () => late.resolve({ items: rows(30, 60), nextCursor: null }));
    expect(result.current.items).toEqual([{ id: "x1" }]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it("pull to refresh goes back to the first page and keeps paging after", async () => {
    const fetchPage = endpoint(75);
    const { result } = renderHook(() =>
      usePagedList<Row>({ queryKey: "all", fetchPage, getKey }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(60));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(60));
    // Cursor "30" is a new request after the reset, not a repeat.
    expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([null, "30", null, "30"]);
  });

  it("a quiet refresh swaps the first page and keeps the pages already loaded", async () => {
    let fresh = false;
    const fetchPage = vi.fn(async (cursor: string | null): Promise<PagedResult<Row>> => {
      const from = cursor ? Number(cursor) : 0;
      const to = Math.min(from + 30, 75);
      // After the change, a new row leads the first page and r29 slips to page 2.
      if (fresh && cursor === null) {
        return { items: [{ id: "new" }, ...rows(0, 29)], nextCursor: "30" };
      }
      return { items: rows(from, to), nextCursor: to < 75 ? String(to) : null };
    });
    const { result } = renderHook(() =>
      usePagedList<Row>({ queryKey: "all", fetchPage, getKey }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(60));

    fresh = true;
    act(() => result.current.refreshQuietly());
    await waitFor(() => expect(result.current.items[0]?.id).toBe("new"));
    await waitFor(() => expect(result.current.updating).toBe(false));
    // Fresh first page (30) + the tail already loaded (page 2, 30 rows).
    expect(result.current.items).toHaveLength(60);
    expect(result.current.hasMore).toBe(true);
    expect(new Set(result.current.items.map(getKey)).size).toBe(60);
  });

  it("a failed page keeps what is loaded, stops auto-loading, and retries on request", async () => {
    const fetchPage = vi
      .fn<(cursor: string | null) => Promise<PagedResult<Row>>>()
      .mockResolvedValueOnce({ items: rows(0, 30), nextCursor: "30" })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ items: rows(30, 45), nextCursor: null });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      usePagedList<Row>({ queryKey: "all", fetchPage, getKey, onError }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(30));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.moreError).toBe("failed"));
    expect(result.current.items).toHaveLength(30);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "more");

    // Scrolling again does not loop on a failing endpoint.
    act(() => result.current.loadMore());
    expect(fetchPage).toHaveBeenCalledTimes(2);

    act(() => result.current.retryMore());
    await waitFor(() => expect(result.current.items).toHaveLength(45));
    expect(result.current.moreError).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  it("calls a network failure offline", async () => {
    const fetchPage = vi
      .fn<(cursor: string | null) => Promise<PagedResult<Row>>>()
      .mockResolvedValueOnce({ items: rows(0, 30), nextCursor: "30" })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() =>
      usePagedList<Row>({
        queryKey: "all",
        fetchPage,
        getKey,
        isOffline: (err) => err instanceof TypeError,
      }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.moreError).toBe("offline"));
  });

  it("paints the cached first page at once and refreshes underneath", async () => {
    const gate = deferred<PagedResult<Row>>();
    const fetchPage = vi.fn(() => gate.promise);
    const { result } = renderHook(() =>
      usePagedList<Row>({
        queryKey: "all",
        fetchPage,
        getKey,
        initial: { items: rows(0, 3), nextCursor: null },
      }),
    );
    expect(result.current.items).toHaveLength(3);
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.updating).toBe(true));

    await act(async () => gate.resolve({ items: rows(10, 14), nextCursor: null }));
    expect(result.current.items.map(getKey)).toEqual(["r10", "r11", "r12", "r13"]);
    expect(result.current.updating).toBe(false);
  });

  it("does not page while the first page of a query is still loading", async () => {
    const gate = deferred<PagedResult<Row>>();
    const fetchPage = vi.fn(() => gate.promise);
    const { result } = renderHook(() =>
      usePagedList<Row>({
        queryKey: "all",
        fetchPage,
        getKey,
        initial: { items: rows(0, 30), nextCursor: "30" },
      }),
    );
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    act(() => result.current.loadMore());
    expect(fetchPage).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve({ items: rows(0, 30), nextCursor: "30" }));
  });

  it("removeWhere drops rows without touching the cursor", async () => {
    const fetchPage = endpoint(45);
    const { result } = renderHook(() =>
      usePagedList<Row>({ queryKey: "all", fetchPage, getKey }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    act(() => result.current.removeWhere((row) => row.id === "r0"));
    expect(result.current.items).toHaveLength(29);
    expect(result.current.hasMore).toBe(true);
  });
});
