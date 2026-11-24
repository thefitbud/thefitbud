/**
 * Clients, Activity and Check-ins page by scrolling (Z14-21, D-W14-26).
 *
 * Real screens, real `usePagedList`, real cache; only the API client and the
 * list container are replaced (`listScreenDouble`: the harness has no layout,
 * so the double draws every row and gives the test the list's end-of-list
 * callback). Windowing and end detection are tested in `ListScreen.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkinSchema,
  clientDirectoryListResponseSchema,
  trainerCheckinInboxItemSchema,
  type ClientDirectoryListResponse,
} from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor, within } from "../test/render";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("react-native-gesture-handler", () => ({
  Swipeable: ({ children }: { children: unknown }) => children,
}));
vi.mock("../components/ListScreen", async () => {
  const actual = await vi.importActual<typeof import("../components/ListScreen")>(
    "../components/ListScreen",
  );
  const { ListScreenDouble } = await import("../test/listScreenDouble");
  return { ...actual, ListScreen: ListScreenDouble };
});

const uuid = (n: number | string) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const api = {
  listClients: vi.fn(),
  getActivityFeed: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listMealAssignments: vi.fn(async () => ({ items: [], nextCursor: null })),
};
const auth = mockAuth({ api, relationships: [], selectedRole: "trainer", me: { timezone: "Asia/Kolkata" } });
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

const { ClientsTab } = await import("./ClientsTab");
const { CheckinsTab } = await import("./CheckinsTab");
const { clearTrainerCache, setTrainerCacheOwner } = await import("./cache");

const TRAINER = "6f1c2a9e-3b4d-4c5e-8f70-1a2b3c4d5e6f";

beforeEach(() => {
  clearTrainerCache();
  setTrainerCacheOwner(null);
  setTrainerCacheOwner(TRAINER);
  for (const fn of Object.values(api)) {
    if ("mockReset" in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
});

function endReached() {
  fireEvent.click(screen.getByTestId("list-end"));
}

// ---------------------------------------------------------------- Clients --

const ROSTER = Array.from({ length: 78 }, (_, i) => {
  const n = i + 1;
  return {
    relationshipId: uuid(n),
    invitationId: null,
    traineeDisplayName: `Client ${String(n).padStart(3, "0")}`,
    // 75 live clients (every fifth needs attention), then 3 who have ended.
    status: n > 75 ? "ended" : "coaching_ready",
    goalShort: null,
    nextCheckin: null,
    effectivePlan: null,
    adherenceState: n <= 75 && n % 5 === 0 ? "needs_attention" : "on_track",
    renewalState: null,
    renewsOn: null,
    startedAt: "2026-07-06T04:00:00.000Z",
    endedAt: n > 75 ? "2026-11-01T04:00:00.000Z" : null,
    // Newest first, as the API sorts.
    updatedAt: new Date(Date.UTC(2026, 10, 20) - i * 3_600_000).toISOString(),
  };
});

/** A fake roster endpoint: cursor = offset, `adherenceState` filters, facets over everyone. */
function rosterEndpoint() {
  return vi.fn(
    async (query?: {
      limit?: number;
      cursor?: string;
      adherenceState?: string[];
      q?: string;
    }): Promise<ClientDirectoryListResponse> => {
      const limit = query?.limit ?? 50;
      const matching = ROSTER.filter(
        (row) =>
          (!query?.adherenceState || query.adherenceState.includes(row.adherenceState)) &&
          (!query?.q || row.traineeDisplayName.toLowerCase().includes(query.q.toLowerCase())),
      );
      const from = query?.cursor ? Number(query.cursor) : 0;
      const to = Math.min(from + limit, matching.length);
      const status: Record<string, number> = {};
      const adherence: Record<string, number> = {};
      for (const row of ROSTER) {
        status[row.status] = (status[row.status] ?? 0) + 1;
        adherence[row.adherenceState] = (adherence[row.adherenceState] ?? 0) + 1;
      }
      return clientDirectoryListResponseSchema.parse({
        items: matching.slice(from, to),
        facets: { status, adherence, renewal: {} },
        nextCursor: to < matching.length ? String(to) : null,
      });
    },
  );
}

const shownNames = () => screen.queryAllByText(/^Client \d{3}$/).map((el) => el.textContent);

describe("Clients pages by scrolling", () => {
  it("shows 30, then 60, then all 75 with no duplicates, one request per page", async () => {
    api.listClients = rosterEndpoint();
    render(<ClientsTab onOpenClient={vi.fn()} />);

    await waitFor(() => expect(shownNames()).toHaveLength(30));
    expect(api.listClients).toHaveBeenCalledTimes(1);

    endReached();
    await waitFor(() => expect(shownNames()).toHaveLength(60));
    endReached();
    await waitFor(() => expect(shownNames()).toHaveLength(75));

    const names = shownNames();
    expect(new Set(names).size).toBe(75);
    expect(names[0]).toBe("Client 001");
    expect(names[74]).toBe("Client 075");

    // Nothing at the end, and no further request.
    endReached();
    expect(api.listClients).toHaveBeenCalledTimes(3);
    expect(screen.queryByTestId("paged-footer-loading")).toBeNull();
    expect(screen.queryByTestId("paged-footer-retry")).toBeNull();

    // Every call is a page of 30; no second "count everything" call (Z14-21).
    const calls = api.listClients.mock.calls.map((call) => call[0]);
    expect(calls.every((query) => query?.limit === 30)).toBe(true);
    expect(calls.map((query) => query?.cursor)).toEqual([undefined, "30", "60"]);
  });

  it("counts the chips from the response's own facets", async () => {
    api.listClients = rosterEndpoint();
    render(<ClientsTab onOpenClient={vi.fn()} />);
    await waitFor(() => expect(shownNames()).toHaveLength(30));
    // 75 live clients and 3 ended; 15 need attention.
    expect(screen.getByTestId("clients-filter-all").textContent).toBe("All 75");
    expect(screen.getByTestId("clients-filter-needs_attention").textContent).toBe(
      "Needs attention 15",
    );
    expect(screen.getByTestId("clients-filter-ended").textContent).toBe("Ended 3");
  });

  it("a chip change starts over from the first page with that chip's query", async () => {
    api.listClients = rosterEndpoint();
    render(<ClientsTab onOpenClient={vi.fn()} />);
    await waitFor(() => expect(shownNames()).toHaveLength(30));
    endReached();
    await waitFor(() => expect(shownNames()).toHaveLength(60));

    fireEvent.click(screen.getByTestId("clients-filter-needs_attention"));
    await waitFor(() => expect(shownNames()).toHaveLength(15));
    const last = api.listClients.mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({ adherenceState: ["needs_attention"], limit: 30 });
    expect(last?.cursor).toBeUndefined();
    expect(shownNames().every((name) => Number(name!.slice(-3)) % 5 === 0)).toBe(true);
  });

  it("a failed page shows an inline retry and keeps the rows", async () => {
    const endpoint = rosterEndpoint();
    api.listClients = endpoint;
    render(<ClientsTab onOpenClient={vi.fn()} />);
    await waitFor(() => expect(shownNames()).toHaveLength(30));

    endpoint.mockRejectedValueOnce(
      Object.assign(new Error("HTTP 500 boom"), { status: 500 }),
    );
    endReached();
    const retry = await screen.findByRole("button", { name: "Couldn't load more. Try again" });
    expect(shownNames()).toHaveLength(30);
    // Friendly copy only: no status, no raw message.
    expect(screen.queryByText(/500|boom/)).toBeNull();

    fireEvent.click(retry);
    await waitFor(() => expect(shownNames()).toHaveLength(60));
    expect(screen.queryByTestId("paged-footer-retry")).toBeNull();
  });

  it("offline while paging says so neutrally", async () => {
    const endpoint = rosterEndpoint();
    api.listClients = endpoint;
    render(<ClientsTab onOpenClient={vi.fn()} />);
    await waitFor(() => expect(shownNames()).toHaveLength(30));

    endpoint.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    endReached();
    expect(await screen.findByText("You're offline. Showing what's loaded.")).toBeTruthy();
    expect(screen.queryByText(/Couldn't load more/)).toBeNull();
    expect(shownNames()).toHaveLength(30);
  });

  it("shows the quiet loading row while a page is in flight", async () => {
    const endpoint = rosterEndpoint();
    api.listClients = endpoint;
    render(<ClientsTab onOpenClient={vi.fn()} />);
    await waitFor(() => expect(shownNames()).toHaveLength(30));

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const real = endpoint.getMockImplementation()!;
    endpoint.mockImplementationOnce(async (query) => {
      await gate;
      return real(query);
    });
    endReached();
    expect(await screen.findByTestId("paged-footer-loading")).toBeTruthy();
    release();
    await waitFor(() => expect(shownNames()).toHaveLength(60));
    expect(screen.queryByTestId("paged-footer-loading")).toBeNull();
  });
});

// --------------------------------------------------------------- Activity --

function activityEvents(from: number, to: number) {
  return Array.from({ length: to - from }, (_, i) => {
    const n = from + i;
    return {
      id: `meal:${uuid(n)}`,
      relationshipId: uuid(1),
      traineeDisplayName: "Priya Nair",
      type: "meal",
      subtype: "As planned",
      // Newest first, one every 4 hours.
      occurredAt: new Date(Date.UTC(2026, 10, 20, 12) - n * 4 * 3_600_000).toISOString(),
      traineeLocalTime: null,
      summary: `Meal number ${n}`,
    };
  });
}

describe("Activity pages by scrolling", () => {
  it("loads 30 at a time as the list ends, with no Load more button", async () => {
    api.listClients.mockResolvedValue(
      clientDirectoryListResponseSchema.parse({ items: [], nextCursor: null }),
    );
    api.getActivityFeed.mockImplementation(
      async (query?: { cursor?: string; limit?: number }) => {
        const from = query?.cursor ? Number(query.cursor) : 0;
        const to = Math.min(from + (query?.limit ?? 30), 42);
        return { events: activityEvents(from, to), nextCursor: to < 42 ? String(to) : null };
      },
    );
    render(<ClientsTab onOpenClient={vi.fn()} initialSegment="activity" />);

    await waitFor(() => expect(screen.getAllByText(/Meal number \d+/)).toHaveLength(30));
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();

    endReached();
    await waitFor(() => expect(screen.getAllByText(/Meal number \d+/)).toHaveLength(42));
    endReached();
    expect(api.getActivityFeed).toHaveBeenCalledTimes(2);
    expect(api.getActivityFeed.mock.calls[1]![0]).toMatchObject({ limit: 30, cursor: "30" });
  });

  it("a failed page offers Try again as the retry, not a Load more button", async () => {
    api.listClients.mockResolvedValue(
      clientDirectoryListResponseSchema.parse({ items: [], nextCursor: null }),
    );
    api.getActivityFeed
      .mockResolvedValueOnce({ events: activityEvents(0, 30), nextCursor: "30" })
      .mockRejectedValueOnce(Object.assign(new Error("HTTP 503"), { status: 503 }))
      .mockResolvedValueOnce({ events: activityEvents(30, 35), nextCursor: null });
    render(<ClientsTab onOpenClient={vi.fn()} initialSegment="activity" />);
    await waitFor(() => expect(screen.getAllByText(/Meal number \d+/)).toHaveLength(30));

    endReached();
    fireEvent.click(await screen.findByRole("button", { name: "Couldn't load more. Try again" }));
    await waitFor(() => expect(screen.getAllByText(/Meal number \d+/)).toHaveLength(35));
    expect(screen.queryByText(/503/)).toBeNull();
  });
});

// -------------------------------------------------------------- Check-ins --

function inboxItem(n: number, status: "submitted" | "overdue" | "reviewed") {
  return trainerCheckinInboxItemSchema.parse({
    checkin: checkinSchema.parse({
      id: uuid(`1${status.length}${n}`),
      coachingRelationshipId: uuid(`9${n}`),
      checkinScheduleId: null,
      localDate: "2026-11-10",
      windowStartsAt: "2026-11-09T18:30:00.000Z",
      windowEndsAt: "2026-11-10T18:29:00.000Z",
      recordStatus: status === "overdue" ? "draft" : "submitted",
      recordVersion: 1,
      definitionVersion: 1,
      checkinFormVersionId: uuid(7),
      answers: null,
      submittedAt: status === "overdue" ? null : "2026-11-11T04:00:00.000Z",
      status,
      review:
        status === "reviewed"
          ? {
              id: uuid(`5${n}`),
              checkinId: uuid(`1${status.length}${n}`),
              coachingRelationshipId: uuid(`9${n}`),
              trainerUserId: uuid(6),
              outcome: "acknowledged",
              notes: null,
              createdAt: "2026-11-12T04:00:00.000Z",
              updatedAt: "2026-11-12T04:00:00.000Z",
            }
          : null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    }),
    coachingRelationshipId: uuid(`9${n}`),
    traineeUserId: uuid(`8${n}`),
    traineeDisplayName: `Trainee ${String(n).padStart(3, "0")}`,
    traineeTimezone: "Asia/Kolkata",
  });
}

/** Per-segment fake inbox: to_review 40 rows, overdue 3, reviewed 35. */
function inboxEndpoint() {
  const sizes = { to_review: 40, overdue: 3, reviewed: 35 } as const;
  const statusOf = { to_review: "submitted", overdue: "overdue", reviewed: "reviewed" } as const;
  return vi.fn(
    async (query?: {
      segment?: keyof typeof sizes;
      limit?: number;
      cursor?: string;
    }) => {
      const segment = query?.segment ?? "to_review";
      const total = sizes[segment];
      const from = query?.cursor ? Number(query.cursor) : 0;
      const to = Math.min(from + (query?.limit ?? total), total);
      return {
        items: Array.from({ length: to - from }, (_, i) =>
          inboxItem(from + i + 1, statusOf[segment]),
        ),
        nextCursor: to < total ? String(to) : null,
      };
    },
  );
}

const traineeRows = () => screen.queryAllByText(/^Trainee \d{3}$/).map((el) => el.textContent);

describe("Check-ins page by scrolling, per segment", () => {
  it("To review pages 30 then the rest; each segment reads its own segment", async () => {
    api.listTrainerCheckinInbox = inboxEndpoint();
    render(<CheckinsTab onReviewCheckin={vi.fn()} />);

    await waitFor(() => expect(traineeRows()).toHaveLength(30));
    // Not the whole inbox, and not a partial total passed off as the full count.
    expect(screen.getByRole("tab", { name: "To review · 30+" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overdue · 3" })).toBeTruthy();

    endReached();
    await waitFor(() => expect(traineeRows()).toHaveLength(40));
    expect(screen.getByRole("tab", { name: "To review · 40" })).toBeTruthy();

    const calls = api.listTrainerCheckinInbox.mock.calls.map((call) => call[0]);
    expect(calls.every((query) => query?.limit === 30)).toBe(true);
    expect(calls.filter((query) => query?.segment === "to_review").map((q) => q?.cursor)).toEqual([
      undefined,
      "30",
    ]);
  });

  it("Reviewed loads on first open and pages", async () => {
    api.listTrainerCheckinInbox = inboxEndpoint();
    render(<CheckinsTab onReviewCheckin={vi.fn()} />);
    await waitFor(() => expect(traineeRows()).toHaveLength(30));
    expect(
      api.listTrainerCheckinInbox.mock.calls.some((call) => call[0]?.segment === "reviewed"),
    ).toBe(false);

    fireEvent.click(screen.getByTestId("checkins-segment-reviewed"));
    await waitFor(() => expect(traineeRows()).toHaveLength(30));
    expect(screen.getAllByText("Reviewed").length).toBeGreaterThan(0);
    endReached();
    await waitFor(() => expect(traineeRows()).toHaveLength(35));
    expect(within(screen.getByRole("main")).queryByTestId("paged-footer-loading")).toBeNull();
  });

  it("a failed page in a segment offers the inline retry", async () => {
    const endpoint = inboxEndpoint();
    api.listTrainerCheckinInbox = endpoint;
    render(<CheckinsTab onReviewCheckin={vi.fn()} />);
    await waitFor(() => expect(traineeRows()).toHaveLength(30));

    endpoint.mockRejectedValueOnce(Object.assign(new Error("HTTP 500"), { status: 500 }));
    endReached();
    fireEvent.click(await screen.findByRole("button", { name: "Couldn't load more. Try again" }));
    await waitFor(() => expect(traineeRows()).toHaveLength(40));
  });
});
