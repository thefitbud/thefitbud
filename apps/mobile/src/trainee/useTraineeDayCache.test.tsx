/**
 * The per-day cache behind Today and Diet (Z12-40): keying, stale-while-
 * revalidate, the ±3 prefetch window, request sharing and eviction.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, act } from "../test/render";
import {
  DAY_VIEW_LIMIT,
  claimDayCacheOwner,
  clearDayViews,
  dayViewKey,
  getCacheEntry,
  getCached,
  invalidateRelationshipDayData,
  setCached,
} from "./dataCache";
import {
  DAY_VIEW_MAX_AGE_MS,
  fetchDayInto,
  needsRevalidate,
  prefetchDates,
  sharedRead,
  useTraineeDayCache,
} from "./useTraineeDayCache";

const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const OTHER_REL = "2c76f4be-95d0-4ef2-b652-1e73767d3d8a";

type Day = { date: string; meals: number };

beforeEach(() => {
  clearDayViews();
});
afterEach(() => {
  clearDayViews();
});

describe("dayViewKey", () => {
  it("keys a view by screen, relationship and civil date", () => {
    expect(dayViewKey("today", REL, "2026-11-12")).toBe(
      `dayview:today:${REL}:2026-11-12`,
    );
    expect(dayViewKey("today", REL, "2026-11-12")).not.toBe(
      dayViewKey("today", OTHER_REL, "2026-11-12"),
    );
    expect(dayViewKey("today", REL, "2026-11-12")).not.toBe(
      dayViewKey("diet", REL, "2026-11-12"),
    );
  });
});

describe("prefetchDates", () => {
  it("is the three days either side, nearest first", () => {
    expect(prefetchDates("2026-11-12")).toEqual([
      "2026-11-13",
      "2026-11-11",
      "2026-11-14",
      "2026-11-10",
      "2026-11-15",
      "2026-11-09",
    ]);
  });

  it("crosses month ends and steps by a week for weeks", () => {
    expect(prefetchDates("2026-11-30", 1)).toEqual(["2026-12-01", "2026-11-29"]);
    expect(prefetchDates("2026-11-16", 1, 7)).toEqual(["2026-11-23", "2026-11-09"]);
  });
});

describe("needsRevalidate", () => {
  it("refetches a missing, stale or old entry and keeps a fresh one", () => {
    const now = 1_000_000;
    expect(needsRevalidate(undefined, now)).toBe(true);
    expect(needsRevalidate({ updatedAt: now - 1000, stale: true }, now)).toBe(true);
    expect(
      needsRevalidate({ updatedAt: now - DAY_VIEW_MAX_AGE_MS - 1, stale: false }, now),
    ).toBe(true);
    expect(needsRevalidate({ updatedAt: now - 1000, stale: false }, now)).toBe(false);
  });
});

describe("dataCache day views", () => {
  it("a write marks this relationship's views stale but keeps them; others untouched", () => {
    const mine = dayViewKey("today", REL, "2026-11-12");
    const theirs = dayViewKey("today", OTHER_REL, "2026-11-12");
    setCached(mine, { date: "2026-11-12", meals: 3 });
    setCached(theirs, { date: "2026-11-12", meals: 1 });
    invalidateRelationshipDayData(REL);
    expect(getCacheEntry<Day>(mine)).toMatchObject({
      value: { meals: 3 },
      stale: true,
    });
    expect(getCacheEntry<Day>(theirs)?.stale).toBe(false);
  });

  it("a write drops the shared day reads, so a log is never answered from them", () => {
    const meals = `meals:${REL}:2026-11-12:2026-11-12`;
    setCached(meals, { items: [] });
    invalidateRelationshipDayData(REL);
    expect(getCached(meals)).toBeUndefined();
  });

  it(`keeps at most ${DAY_VIEW_LIMIT} views, dropping the least recently used`, () => {
    const keys = Array.from({ length: DAY_VIEW_LIMIT + 2 }, (_, i) =>
      dayViewKey("today", REL, `2026-10-${String(i + 1).padStart(2, "0")}`),
    );
    let clock = 1;
    const realNow = Date.now;
    Date.now = () => clock;
    try {
      for (const key of keys.slice(0, DAY_VIEW_LIMIT)) {
        clock += 1;
        setCached(key, { meals: 0 });
      }
      // Touch the oldest so it is no longer the least recently used.
      clock += 1;
      getCached(keys[0]!);
      clock += 1;
      setCached(keys[DAY_VIEW_LIMIT]!, { meals: 0 });
      clock += 1;
      setCached(keys[DAY_VIEW_LIMIT + 1]!, { meals: 0 });
    } finally {
      Date.now = realNow;
    }
    expect(getCached(keys[0]!)).toBeDefined();
    expect(getCached(keys[1]!)).toBeUndefined();
    expect(getCached(keys[2]!)).toBeUndefined();
    expect(getCached(keys[DAY_VIEW_LIMIT + 1]!)).toBeDefined();
  });
});

describe("fetchDayInto and sharedRead", () => {
  it("shares one request between callers of the same key", async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const fetch = () =>
      new Promise<Day>((resolve) => {
        calls += 1;
        release = () => resolve({ date: "2026-11-12", meals: 2 });
      });
    const key = dayViewKey("today", REL, "2026-11-12");
    const a = fetchDayInto(key, fetch);
    const b = fetchDayInto(key, fetch);
    release();
    await expect(Promise.all([a, b])).resolves.toEqual([
      { date: "2026-11-12", meals: 2 },
      { date: "2026-11-12", meals: 2 },
    ]);
    expect(calls).toBe(1);
    expect(getCached(key)).toEqual({ date: "2026-11-12", meals: 2 });
  });

  it("reuses a fresh shared read, and a forced read always asks again", async () => {
    let calls = 0;
    const key = `week:${REL}:2026-11-09`;
    const fetch = async () => {
      calls += 1;
      return calls;
    };
    expect(await sharedRead(key, fetch)).toBe(1);
    expect(await sharedRead(key, fetch)).toBe(1);
    expect(await sharedRead(key, fetch, { force: true })).toBe(2);
  });
});

/** A day screen in miniature: the hook's state, as text. */
function DayProbe({
  date,
  fetchDay,
}: {
  date: string;
  fetchDay: (date: string) => Promise<Day>;
}) {
  const { data, firstLoad, error } = useTraineeDayCache<Day>({
    screen: "probe",
    relationshipId: REL,
    date,
    fetchDay,
  });
  return (
    <>
      <span data-testid="state">
        {firstLoad ? "skeleton" : error ? "error" : data ? `${data.date}:${data.meals}` : "none"}
      </span>
    </>
  );
}

describe("useTraineeDayCache", () => {
  it("shows the skeleton only on a first load, then prefetches ±3 days", async () => {
    const asked: string[] = [];
    const fetchDay = async (date: string) => {
      asked.push(date);
      return { date, meals: 1 };
    };
    render(<DayProbe date="2026-11-12" fetchDay={fetchDay} />);
    expect(screen.getByTestId("state").textContent).toBe("skeleton");
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("2026-11-12:1"),
    );
    await waitFor(() => expect(asked).toHaveLength(7));
    expect([...asked].sort()).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });

  it("paints a cached day in the same render and revalidates a stale one underneath", async () => {
    let meals = 1;
    let release: (() => void) | null = null;
    const fetchDay = (date: string) =>
      new Promise<Day>((resolve) => {
        const done = () => resolve({ date, meals });
        if (release === null) done();
        else release = done;
      });
    const view = render(<DayProbe date="2026-11-12" fetchDay={fetchDay} />);
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("2026-11-12:1"),
    );
    await waitFor(() =>
      expect(getCached(dayViewKey("probe", REL, "2026-11-13"))).toBeDefined(),
    );
    // Hold every later fetch.
    release = () => undefined;
    view.rerender(<DayProbe date="2026-11-13" fetchDay={fetchDay} />);
    expect(screen.getByTestId("state").textContent).toBe("2026-11-13:1");

    // A log marks it stale: still shown, refetched underneath.
    meals = 2;
    act(() => {
      invalidateRelationshipDayData(REL);
    });
    expect(screen.getByTestId("state").textContent).toBe("2026-11-13:1");
    act(() => {
      release?.();
    });
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("2026-11-13:2"),
    );
  });

  it("a failed first load is an error, not a skeleton for ever", async () => {
    const fetchDay = async (): Promise<Day> => {
      throw new Error("offline");
    };
    render(<DayProbe date="2026-11-12" fetchDay={fetchDay} />);
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("error"),
    );
  });
});

describe("reads across a write (review fix)", () => {
  /** Fetches that each wait until the test releases them, in call order. */
  function heldFetches<T>() {
    const calls: Array<() => void> = [];
    const fetch = (value: T) => () =>
      new Promise<T>((resolve) => {
        calls.push(() => resolve(value));
      });
    return { calls, fetch };
  }

  it("a read started before a write is not joined after it", async () => {
    const key = dayViewKey("today", REL, "2026-11-12");
    setCached(key, { date: "2026-11-12", meals: 1 });
    const held = heldFetches<Day>();
    const before = fetchDayInto(key, held.fetch({ date: "2026-11-12", meals: 1 }));
    invalidateRelationshipDayData(REL);
    const after = fetchDayInto(key, held.fetch({ date: "2026-11-12", meals: 2 }));
    expect(held.calls).toHaveLength(2);
    held.calls[1]!();
    await expect(after).resolves.toEqual({ date: "2026-11-12", meals: 2 });
    held.calls[0]!();
    await before;
    // The pre-write answer landing last does not overwrite the fresh one.
    expect(getCacheEntry<Day>(key)).toMatchObject({
      value: { meals: 2 },
      stale: false,
    });
  });

  it("a pre-write answer is never stored as fresh", async () => {
    const key = dayViewKey("today", REL, "2026-11-12");
    setCached(key, { date: "2026-11-12", meals: 1 });
    const held = heldFetches<Day>();
    const before = fetchDayInto(key, held.fetch({ date: "2026-11-12", meals: 1 }));
    invalidateRelationshipDayData(REL);
    held.calls[0]!();
    await before;
    expect(getCacheEntry<Day>(key)?.stale).toBe(true);
  });

  it("a write on another relationship does not retire this one's reads", async () => {
    const key = dayViewKey("today", REL, "2026-11-12");
    const held = heldFetches<Day>();
    const first = fetchDayInto(key, held.fetch({ date: "2026-11-12", meals: 1 }));
    invalidateRelationshipDayData(OTHER_REL);
    const second = fetchDayInto(key, held.fetch({ date: "2026-11-12", meals: 1 }));
    expect(held.calls).toHaveLength(1);
    held.calls[0]!();
    await Promise.all([first, second]);
    expect(getCacheEntry<Day>(key)?.stale).toBe(false);
  });

  it("a forced read never joins one in flight", async () => {
    const key = `meals:${REL}:2026-11-12:2026-11-12`;
    const held = heldFetches<number>();
    const a = sharedRead(key, held.fetch(1));
    const b = sharedRead(key, held.fetch(2), { force: true });
    expect(held.calls).toHaveLength(2);
    held.calls[0]!();
    held.calls[1]!();
    await expect(Promise.all([a, b])).resolves.toEqual([1, 2]);
  });

  it("clearing drops the reads in flight with the data", async () => {
    const key = dayViewKey("today", REL, "2026-11-12");
    const held = heldFetches<Day>();
    const before = fetchDayInto(key, held.fetch({ date: "2026-11-12", meals: 1 }));
    clearDayViews();
    const after = fetchDayInto(key, held.fetch({ date: "2026-11-12", meals: 1 }));
    expect(held.calls).toHaveLength(2);
    held.calls[0]!();
    await before;
    expect(getCached(key)).toBeUndefined();
    held.calls[1]!();
    await after;
    expect(getCached(key)).toBeDefined();
  });

  it("a meal logged during a slow revalidation shows as logged", async () => {
    // The server's answer at the moment each request is made.
    let serverMeals = 1;
    const pending: Array<() => void> = [];
    let hold = false;
    const fetchDay = (date: string) =>
      new Promise<Day>((resolve) => {
        const answer = { date, meals: serverMeals };
        if (hold && date === "2026-11-12") pending.push(() => resolve(answer));
        else resolve(answer);
      });
    render(<DayProbe date="2026-11-12" fetchDay={fetchDay} />);
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("2026-11-12:1"),
    );
    hold = true;
    // Something else wrote: a slow revalidation starts, answering "1".
    act(() => {
      invalidateRelationshipDayData(REL);
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    // The trainee logs a meal while it is still running.
    serverMeals = 2;
    act(() => {
      invalidateRelationshipDayData(REL);
    });
    await waitFor(() => expect(pending).toHaveLength(2));
    // The slow pre-log answer arrives first, then the post-log one.
    act(() => pending[0]!());
    act(() => pending[1]!());
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("2026-11-12:2"),
    );
    expect(
      getCacheEntry<Day>(dayViewKey("probe", REL, "2026-11-12")),
    ).toMatchObject({ value: { meals: 2 }, stale: false });
  });
});

describe("account change (review fix)", () => {
  it("another relationship on screen drops the previous one's days first", () => {
    const mine = dayViewKey("today", REL, "2026-11-12");
    claimDayCacheOwner(REL);
    setCached(mine, { date: "2026-11-12", meals: 3 });
    claimDayCacheOwner(REL);
    expect(getCached(mine)).toBeDefined();
    claimDayCacheOwner(OTHER_REL);
    expect(getCached(mine)).toBeUndefined();
  });
});

describe("prefetch window (review fix)", () => {
  it("moving to an adjacent day fetches only the newly needed day", async () => {
    const asked: string[] = [];
    const fetchDay = async (date: string) => {
      asked.push(date);
      return { date, meals: 1 };
    };
    const view = render(<DayProbe date="2026-11-12" fetchDay={fetchDay} />);
    await waitFor(() => expect(asked).toHaveLength(7));
    asked.length = 0;
    view.rerender(<DayProbe date="2026-11-13" fetchDay={fetchDay} />);
    expect(screen.getByTestId("state").textContent).toBe("2026-11-13:1");
    await waitFor(() => expect(asked).toEqual(["2026-11-16"]));
    // Nothing else follows: the cached days are skipped.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(asked).toEqual(["2026-11-16"]);
  });

  it("a day change stops the previous day's prefetch loop", async () => {
    const asked: string[] = [];
    const held = new Map<string, () => void>();
    const fetchDay = (date: string) =>
      new Promise<Day>((resolve) => {
        asked.push(date);
        held.set(date, () => resolve({ date, meals: 1 }));
      });
    const view = render(<DayProbe date="2026-11-12" fetchDay={fetchDay} />);
    await waitFor(() => expect(held.has("2026-11-12")).toBe(true));
    act(() => held.get("2026-11-12")!());
    // The loop is now waiting on its first prefetch, the next day.
    await waitFor(() => expect(held.has("2026-11-13")).toBe(true));
    view.rerender(<DayProbe date="2026-11-20" fetchDay={fetchDay} />);
    await waitFor(() => expect(held.has("2026-11-20")).toBe(true));
    act(() => held.get("2026-11-13")!());
    act(() => held.get("2026-11-20")!());
    await waitFor(() => expect(held.has("2026-11-21")).toBe(true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    // The 12th's loop never went on to the 11th.
    expect(asked).not.toContain("2026-11-11");
  });
});
