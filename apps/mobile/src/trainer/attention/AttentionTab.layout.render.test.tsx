/**
 * Attention layout (Z14-22, D-W14-25): jump tiles and pills, capped sections
 * with See all, collapsible headers, one row template.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionList } from "react-native";
import {
  attentionGroupsResponseSchema,
  type AttentionGroupsResponse,
} from "@fitbud/contracts";
import {
  fireEvent,
  mockAuth,
  render,
  screen,
  waitFor,
  within,
} from "../../test/render";

vi.mock("../../lib/reportError", () => ({ reportError: vi.fn() }));

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
vi.mock("react-native-gesture-handler", () => ({
  Swipeable: ({ children }: { children: unknown }) => children,
  Gesture: {
    Pan: () => {
      const chain: Record<string, unknown> = {};
      for (const name of [
        "runOnJS",
        "hitSlop",
        "activeOffsetX",
        "failOffsetY",
        "onUpdate",
        "onEnd",
      ]) {
        chain[name] = () => chain;
      }
      return chain;
    },
  },
  GestureDetector: ({ children }: { children: unknown }) => children,
}));
vi.mock("../../realtime/useRealtimeHints", () => ({
  useRealtimeHints: vi.fn(),
}));

const { AttentionTab } = await import("../AttentionTab");
const { clearTrainerCache, setTrainerCacheOwner } = await import("../cache");

const TRAINER = "6f1c2a9e-3b4d-4c5e-8f70-1a2b3c4d5e6f";
const NAMES = [
  "Rohan Mehta",
  "Neha Reddy",
  "Farhan Ali",
  "Deepak Nair",
  "Ishita Sen",
];

function uuid(kind: number, n: number) {
  const hex = `${kind}${n}`.padStart(8, "0");
  return `${hex}-1111-4111-8111-111111111111`;
}

function groups(): AttentionGroupsResponse {
  const missed = NAMES.map((name, i) => ({
    relationshipId: uuid(1, i),
    traineeDisplayName: name,
    clientWhatsappE164: null,
    bucket: "needs_you",
    itemCount: 1,
    mostSevere: i === 0 ? "critical" : "attention",
    oldestAgeMinutes: 7200 - i * 600,
    items: [
      {
        id: uuid(2, i),
        type: "missed_workout",
        severity: i === 0 ? "critical" : "attention",
        status: "active",
        ageMinutes: 7200 - i * 600,
        summary: "Missed workout",
        details: { localDate: "2026-11-09" },
        acknowledgedAt: null,
      },
    ],
  }));
  const noted = {
    relationshipId: uuid(3, 0),
    traineeDisplayName: "Meera Iyer",
    clientWhatsappE164: null,
    bucket: "reviewed",
    itemCount: 1,
    mostSevere: "attention",
    oldestAgeMinutes: 2880,
    items: [
      {
        id: uuid(4, 0),
        type: "overdue_meal",
        severity: "attention",
        status: "acknowledged",
        ageMinutes: 2880,
        summary: "Lunch not logged",
        details: { localDate: "2026-11-09" },
        acknowledgedAt: "2026-11-24T04:22:00.000Z",
      },
    ],
  };
  return attentionGroupsResponseSchema.parse({
    groups: [...missed, noted],
    needsYou: missed,
    reviewed: [noted],
  });
}

function mount(onOpenClient = vi.fn(), onFullScreenChange?: (open: boolean) => void) {
  api.getAttentionGroups.mockResolvedValue(groups());
  api.listCoachAsks.mockResolvedValue({ items: [], nextCursor: null });
  api.listTrainerCheckinInbox.mockResolvedValue({ items: [], nextCursor: null });
  api.listClients.mockResolvedValue({ items: [], nextCursor: null });
  render(
    <AttentionTab
      onOpenClients={vi.fn()}
      onOpenClient={onOpenClient}
      onReviewException={vi.fn()}
      onReviewCheckin={vi.fn()}
      onFullScreenChange={onFullScreenChange}
    />,
  );
  return onOpenClient;
}

beforeEach(() => {
  clearTrainerCache();
  setTrainerCacheOwner(null);
  setTrainerCacheOwner(TRAINER);
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.restoreAllMocks();
});

describe("Attention layout (Z14-22)", () => {
  it("shows the first 3 missed rows and See all 5 missed; the Noted section is titled and timed", async () => {
    mount();
    expect(await screen.findByText("Rohan Mehta")).toBeTruthy();
    expect(screen.getByText("Farhan Ali")).toBeTruthy();
    expect(screen.queryByText("Deepak Nair")).toBeNull();
    expect(screen.getByRole("button", { name: "See all 5 missed" })).toBeTruthy();
    expect(screen.getByText("Noted, still open")).toBeTruthy();
    expect(screen.queryByText(/Reviewed, still open/)).toBeNull();
    expect(screen.getByText(/^Noted · \d{1,2}:\d{2} [ap]m$/)).toBeTruthy();
  });

  it("See all opens the whole section with its count; Back returns to Attention", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "See all 5 missed" }));
    const pushed = await screen.findByTestId("section-all-screen");
    expect(within(pushed).getByText("Missed · 5")).toBeTruthy();
    expect(within(pushed).getByText("Ishita Sen")).toBeTruthy();
    expect(within(pushed).getAllByTestId("needs-you-row")).toHaveLength(5);
    fireEvent.click(within(pushed).getByRole("button", { name: "Back" }));
    expect(screen.queryByTestId("section-all-screen")).toBeNull();
    expect(screen.getByRole("button", { name: "See all 5 missed" })).toBeTruthy();
  });

  it("reports a full-screen child while See all is open and clears it on Back (Z14-36)", async () => {
    const onFullScreenChange = vi.fn();
    mount(vi.fn(), onFullScreenChange);
    fireEvent.click(await screen.findByRole("button", { name: "See all 5 missed" }));
    const pushed = await screen.findByTestId("section-all-screen");
    expect(onFullScreenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(within(pushed).getByRole("button", { name: "Back" }));
    expect(onFullScreenChange).toHaveBeenLastCalledWith(false);
  });

  it("a tile tap scrolls to its section; a zero tile is muted and not pressable", async () => {
    const spy = vi
      .spyOn(SectionList.prototype, "scrollToLocation")
      .mockImplementation(() => undefined);
    mount();
    await screen.findByText("Rohan Mehta");
    expect(screen.queryByRole("button", { name: /Jump to Asked, 0/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Jump to Missed, 5" }));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ sectionIndex: 0, itemIndex: 0 }),
    );
    // The Noted pill is the second section here.
    fireEvent.click(screen.getByTestId("needs-you-pill-reviewed"));
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ sectionIndex: 1, itemIndex: 0 }),
    );
    expect(
      screen.getByTestId("needs-you-pill-asked").getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("a header tap collapses and expands its rows; the count stays; a pill expands it again", async () => {
    vi.spyOn(SectionList.prototype, "scrollToLocation").mockImplementation(
      () => undefined,
    );
    mount();
    await screen.findByText("Rohan Mehta");
    const header = screen.getByTestId("needs-you-section-missed");
    expect(header.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(header);
    await waitFor(() => expect(screen.queryByText("Rohan Mehta")).toBeNull());
    const collapsed = screen.getByTestId("needs-you-section-missed");
    expect(collapsed.getAttribute("aria-expanded")).toBe("false");
    expect(within(collapsed).getByText("5")).toBeTruthy();
    fireEvent.click(screen.getByTestId("needs-you-pill-missed"));
    await waitFor(() => expect(screen.getByText("Rohan Mehta")).toBeTruthy());
  });

  it("every row uses the same avatar, text and action slots, in every section", async () => {
    mount();
    await screen.findByText("Rohan Mehta");
    const widthOf = (el: HTMLElement) => getComputedStyle(el).width;
    const slots = screen.getAllByTestId("needs-you-slot").map(widthOf);
    expect(slots.length).toBeGreaterThan(3);
    expect(new Set(slots)).toEqual(new Set(["84px"]));
    const avatars = screen.getAllByTestId("needs-you-avatar-slot").map(widthOf);
    expect(new Set(avatars)).toEqual(new Set(["44px"]));
    // Noted rows end in a chevron button, the others in Review: same slot.
    expect(screen.getAllByTestId("needs-you-action").length).toBe(slots.length);
  });

  it("the avatar and the name open the client's profile", async () => {
    const onOpenClient = mount();
    const rohan = await screen.findByText("Rohan Mehta");
    fireEvent.click(rohan);
    expect(onOpenClient).toHaveBeenCalledWith(uuid(1, 0));
    fireEvent.click(screen.getAllByTestId("client-avatar-link")[1]!);
    expect(onOpenClient).toHaveBeenLastCalledWith(uuid(1, 1));
  });
});
