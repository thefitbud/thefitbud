/**
 * AttentionTab load logic (Z10-2, frames 43-45): which state a failed or
 * successful load lands in. Network failure with a cache is "offline"; nothing
 * else ever is (AGENTS.md "No misleading catch").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attentionGroupsResponseSchema,
  type AttentionGroupsResponse,
} from "@fitbud/contracts";
import { ApiClientError } from "@fitbud/api-client";
import {
  fireEvent,
  mockAuth,
  render,
  screen,
  waitFor,
} from "../../test/render";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("../../lib/reportError", () => ({ reportError }));

const api = {
  getAttentionGroups: vi.fn(),
  listCoachAsks: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listClients: vi.fn(),
};
const auth = mockAuth({ api, relationships: [], selectedRole: "trainer" });

vi.mock("../../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});
// The real cache keeps a module-level fallback map that outlives a test, so
// the same read/write contract is backed by a map the tests clear.
const cacheStore = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../cache", () => ({
  readTrainerCache: (key: string) => cacheStore.get(key) ?? null,
  writeTrainerCache: (key: string, value: unknown) => {
    cacheStore.set(key, JSON.parse(JSON.stringify(value)));
  },
}));
vi.mock("react-native-gesture-handler", () => ({
  // Swipe is not under test; render the row's children inline.
  Swipeable: ({ children }: { children: unknown }) => children,
}));
vi.mock("../../realtime/useRealtimeHints", () => ({
  useRealtimeHints: vi.fn(),
}));

const { AttentionTab } = await import("../AttentionTab");

const RELATIONSHIP_ID = "6a68b615-c47c-4bfc-a7f8-550becf7878a";
const group = {
  relationshipId: RELATIONSHIP_ID,
  traineeDisplayName: "Rohan Mehta",
  clientWhatsappE164: null,
  bucket: "needs_you",
  itemCount: 1,
  mostSevere: "critical",
  oldestAgeMinutes: 7200,
  items: [
    {
      id: "0b1f6d1e-2f0a-4c55-9d3b-1a2b3c4d5e6f",
      type: "overdue_meal",
      severity: "critical",
      status: "active",
      ageMinutes: 7200,
      summary: "Lunch not logged",
      details: { localDate: "2026-11-09" },
      acknowledgedAt: null,
    },
  ],
};
const attention: AttentionGroupsResponse = attentionGroupsResponseSchema.parse({
  groups: [group],
  needsYou: [group],
  reviewed: [],
});

function loadOk() {
  api.getAttentionGroups.mockResolvedValue(attention);
  api.listCoachAsks.mockResolvedValue({ items: [], nextCursor: null });
  api.listTrainerCheckinInbox.mockResolvedValue({
    items: [],
    nextCursor: null,
  });
  api.listClients.mockResolvedValue({ items: [], nextCursor: null });
}

function mount() {
  return render(
    <AttentionTab onReviewException={vi.fn()} onReviewCheckin={vi.fn()} />,
  );
}

beforeEach(() => {
  cacheStore.clear();
  reportError.mockClear();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("AttentionTab load states", () => {
  it("network failure with no cache is the error state, never all-clear or offline", async () => {
    loadOk();
    api.getAttentionGroups.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();

    expect(await screen.findByText("Couldn't load Attention")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText("Nobody needs you right now")).toBeNull();
    expect(screen.queryByText(/You're offline/)).toBeNull();
    // The title and the chip both read "Needs you"; neither carries a count.
    expect(screen.getAllByText("Needs you")).toHaveLength(2);
    expect(screen.queryByText(/^Needs you \d/)).toBeNull();
  });

  it("network failure after a good load shows the offline line over the cached rows", async () => {
    loadOk();
    const first = mount();
    expect(await screen.findByText("Rohan Mehta")).toBeTruthy();
    first.unmount();

    api.getAttentionGroups.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    expect(
      await screen.findByText(/You're offline\. Showing the last update from /),
    ).toBeTruthy();
    expect(screen.getByText("Rohan Mehta")).toBeTruthy();
    expect(screen.queryByText("Couldn't load Attention")).toBeNull();
  });

  it("a server error with a cache is the error state, reported, with no offline line", async () => {
    loadOk();
    const first = mount();
    expect(await screen.findByText("Rohan Mehta")).toBeTruthy();
    first.unmount();

    const failure = new ApiClientError({
      code: "INTERNAL",
      message: "Something went wrong.",
      requestId: "req-1",
      status: 500,
    });
    api.getAttentionGroups.mockRejectedValue(failure);
    mount();
    expect(await screen.findByText("Couldn't load Attention")).toBeTruthy();
    expect(screen.queryByText(/You're offline/)).toBeNull();
    expect(reportError).toHaveBeenCalledWith("attention.load", failure);
  });

  it("Retry calls the API again and the rows replace the error state", async () => {
    loadOk();
    api.getAttentionGroups.mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Rohan Mehta")).toBeTruthy();
    expect(api.getAttentionGroups).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByText("Couldn't load Attention")).toBeNull(),
    );
  });
});
