/**
 * Z14-3: Needs you, Clients, Check-ins and Activity paint from the last
 * snapshot while the network call is still open (a pending promise), show a
 * quiet "Updating…" and never a skeleton; a snapshot saved for one trainer is
 * not painted for the next. Real screens and the real cache; only the API
 * client is replaced.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attentionGroupsResponseSchema,
  checkinSchema,
  clientDirectoryListResponseSchema,
  trainerCheckinInboxItemSchema,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("react-native-gesture-handler", () => ({
  Swipeable: ({ children }: { children: unknown }) => children,
}));
vi.mock("../realtime/useRealtimeHints", () => ({ useRealtimeHints: vi.fn() }));

const never = () => new Promise<never>(() => undefined);
const api = {
  getAttentionGroups: vi.fn(),
  listCoachAsks: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listClients: vi.fn(),
  getActivityFeed: vi.fn(),
};
const auth = mockAuth({ api, relationships: [], selectedRole: "trainer" });
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

const { AttentionTab } = await import("./AttentionTab");
const { ClientsTab } = await import("./ClientsTab");
const { CheckinsTab } = await import("./CheckinsTab");
const { clearTrainerCache, setTrainerCacheOwner, trainerCacheEpoch, writeTrainerCache } =
  await import("./cache");

const TRAINER_A = "6f1c2a9e-3b4d-4c5e-8f70-1a2b3c4d5e6f";
const TRAINER_B = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b";
const REL = "6a68b615-c47c-4bfc-a7f8-550becf7878a";

const group = {
  relationshipId: REL,
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
const attention = attentionGroupsResponseSchema.parse({
  groups: [group],
  needsYou: [group],
  reviewed: [],
});

const roster = clientDirectoryListResponseSchema.parse({
  items: [
    {
      relationshipId: REL,
      invitationId: null,
      traineeDisplayName: "Rohan Mehta",
      status: "coaching_ready",
      goalShort: "Lose 4 kg",
      nextCheckin: null,
      effectivePlan: null,
      adherenceState: "on_track",
      renewalState: null,
      renewsOn: null,
      startedAt: "2026-07-06T04:00:00.000Z",
      endedAt: null,
      updatedAt: "2026-11-10T04:00:00.000Z",
    },
  ],
  nextCursor: null,
});

const uuid = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const inboxItem = trainerCheckinInboxItemSchema.parse({
  checkin: checkinSchema.parse({
    id: uuid("1"),
    coachingRelationshipId: REL,
    checkinScheduleId: null,
    localDate: "2026-11-09",
    windowStartsAt: "2026-11-08T18:30:00.000Z",
    windowEndsAt: "2026-11-09T18:29:00.000Z",
    recordStatus: "submitted",
    recordVersion: 1,
    definitionVersion: 1,
    checkinFormVersionId: uuid("7"),
    answers: null,
    submittedAt: "2026-11-09T05:00:00.000Z",
    status: "submitted",
    review: null,
    createdAt: "2026-11-08T00:00:00.000Z",
    updatedAt: "2026-11-09T05:00:00.000Z",
  }),
  coachingRelationshipId: REL,
  traineeUserId: uuid("8"),
  traineeDisplayName: "Rohan Mehta",
  traineeTimezone: "Asia/Kolkata",
});

function seed(key: string, value: unknown) {
  writeTrainerCache(key, value, trainerCacheEpoch());
}

beforeEach(() => {
  clearTrainerCache();
  setTrainerCacheOwner(null);
  setTrainerCacheOwner(TRAINER_A);
  Object.values(api).forEach((fn) => fn.mockReset());
  for (const fn of Object.values(api)) fn.mockReturnValue(never());
});

describe("snapshot paint", () => {
  it("Needs you paints the last answer while the calls are open", async () => {
    seed("trainer:attention", {
      groups: attention.groups,
      needsYou: attention.needsYou,
      reviewed: attention.reviewed,
      asks: [],
      checkins: [],
      clientNames: { [REL]: "Rohan Mehta" },
      savedAt: "2026-11-10T04:00:00.000Z",
    });
    render(
      <AttentionTab
        onOpenClients={vi.fn()}
        onReviewException={vi.fn()}
        onReviewCheckin={vi.fn()}
      />,
    );
    // On the first render, before any call has answered.
    expect(screen.getByText("Rohan Mehta")).toBeTruthy();
    expect(await screen.findByText("Updating…")).toBeTruthy();
    expect(api.getAttentionGroups).toHaveBeenCalled();
  });

  it("Needs you with no snapshot has nothing to paint and no Updating line", () => {
    render(
      <AttentionTab
        onOpenClients={vi.fn()}
        onReviewException={vi.fn()}
        onReviewCheckin={vi.fn()}
      />,
    );
    expect(screen.queryByText("Rohan Mehta")).toBeNull();
    expect(screen.queryByText("Updating…")).toBeNull();
  });

  it("Clients paints the roster, makes one clients call and no attention or asks call", async () => {
    seed("trainer:clients", { items: roster.items, savedAt: "2026-11-10T04:00:00.000Z" });
    render(<ClientsTab onOpenClient={vi.fn()} />);
    expect(screen.getByText("Rohan Mehta")).toBeTruthy();
    await waitFor(() => expect(api.listClients).toHaveBeenCalled());
    expect(await screen.findByText("Updating…")).toBeTruthy();
    expect(api.listClients).toHaveBeenCalledTimes(1);
    expect(api.getAttentionGroups).not.toHaveBeenCalled();
    expect(api.listCoachAsks).not.toHaveBeenCalled();
  });

  it("Check-ins paints the last inbox while the calls are open", async () => {
    seed("trainer:checkins", {
      inbox: [inboxItem],
      weeks: [[REL, 18]],
      savedAt: "2026-11-10T04:00:00.000Z",
    });
    render(<CheckinsTab onReviewCheckin={vi.fn()} />);
    expect(screen.getByText(/Rohan/)).toBeTruthy();
    expect(screen.queryByLabelText("Loading check-ins")).toBeNull();
    expect(await screen.findByText("Updating…")).toBeTruthy();
  });

  it("a snapshot saved for trainer A is not painted for trainer B", () => {
    seed("trainer:clients", { items: roster.items, savedAt: "2026-11-10T04:00:00.000Z" });
    clearTrainerCache();
    setTrainerCacheOwner(null);
    setTrainerCacheOwner(TRAINER_B);
    render(<ClientsTab onOpenClient={vi.fn()} />);
    expect(screen.queryByText("Rohan Mehta")).toBeNull();
  });

  it("an owner change removes the other trainer's snapshots and kept items", async () => {
    const { readTrainerCache, readTrainerSession, writeTrainerSession } = await import("./cache");
    seed("trainer:clients", { items: roster.items, savedAt: "2026-11-10T04:00:00.000Z" });
    writeTrainerSession("review-item:x", { any: true }, trainerCacheEpoch());
    expect(readTrainerCache("trainer:clients")).not.toBeNull();
    expect(readTrainerSession("review-item:x")).not.toBeNull();

    setTrainerCacheOwner(TRAINER_B);
    expect(readTrainerCache("trainer:clients")).toBeNull();
    expect(readTrainerSession("review-item:x")).toBeNull();
  });
});
