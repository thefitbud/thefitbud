/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { CoachAsk, RealtimeEvent, RealtimeEventType, RealtimeEntityType } from "@fitbud/contracts";
import { sectionForRealtimeEvent, type HomeSectionId } from "./useHomeSections";

const REL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXC = "11111111-1111-4111-8111-111111111111";
const ASK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const ASK_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";

const api = vi.hoisted(() => ({
  getAttentionGroups: vi.fn(),
  listCoachAsks: vi.fn(),
  getReengagementCandidates: vi.fn(),
  getActivityFeed: vi.fn(),
  listSubscriptionAttention: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listClients: vi.fn(),
  listInvitations: vi.fn(),
}));

vi.mock("../../lib/stage1-api", () => ({
  stage1Api: {
    getAttentionGroups: api.getAttentionGroups,
    listCoachAsks: api.listCoachAsks,
    getReengagementCandidates: api.getReengagementCandidates,
    getActivityFeed: api.getActivityFeed,
  },
}));
vi.mock("../../lib/api", () => ({
  apiClient: {
    listSubscriptionAttention: api.listSubscriptionAttention,
    listTrainerCheckinInbox: api.listTrainerCheckinInbox,
    listClients: api.listClients,
    listInvitations: api.listInvitations,
  },
}));
vi.mock("../../realtime/useRealtimeHints", () => ({
  useRealtimeHints: () => undefined,
}));

import { useHomeSections } from "./useHomeSections";

function ask(id: string): CoachAsk {
  return {
    id,
    relationshipId: REL,
    itemType: "workout_assignment",
    itemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    topic: "form",
    status: "open",
    askCount: 1,
    askedAt: "2026-10-21T09:00:00.000Z",
    lastAskedAt: "2026-10-21T09:00:00.000Z",
    itemLabel: "Squat",
    itemDate: "2026-10-21",
  };
}

function attentionGroup() {
  return {
    relationshipId: REL,
    traineeDisplayName: "Rohan Mehta",
    clientWhatsappE164: null,
    items: [
      {
        id: EXC,
        type: "missed_workout",
        severity: "critical" as const,
        status: "active" as const,
        ageMinutes: 90,
        summary: "Missed workout",
        details: null,
      },
    ],
  };
}

function event(
  eventType: RealtimeEventType,
  entityType: RealtimeEntityType,
): RealtimeEvent {
  return {
    eventId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    eventType,
    entityType,
    entityId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    coachingRelationshipId: REL,
    serverVersion: 1,
    occurredAt: "2026-10-21T09:00:00.000Z",
  };
}

describe("sectionForRealtimeEvent", () => {
  const cases: Array<[RealtimeEventType, RealtimeEntityType, HomeSectionId]> = [
    ["exception_created", "exception", "attention"],
    ["exception_acknowledged", "exception", "attention"],
    ["exception_resolved", "exception", "attention"],
    ["exception_changed", "exception", "attention"],
    ["workout_execution_changed", "workout_execution", "attention"],
    ["meal_compliance_changed", "meal_compliance", "attention"],
    ["checkin_submitted", "checkin", "checkins"],
    ["checkin_reviewed", "checkin", "checkins"],
    ["effective_plan_changed", "plan_version", "renewals"],
  ];

  it.each(cases)("%s (%s) refreshes %s", (eventType, entityType, section) => {
    expect(sectionForRealtimeEvent(event(eventType, entityType))).toBe(section);
  });
});

describe("useHomeSections optimistic updates", () => {
  beforeEach(() => {
    api.getAttentionGroups.mockResolvedValue({ groups: [attentionGroup()] });
    api.listCoachAsks.mockResolvedValue({ items: [ask(ASK_A), ask(ASK_B)] });
    api.getReengagementCandidates.mockResolvedValue({ items: [] });
    api.getActivityFeed.mockResolvedValue({ events: [] });
    api.listSubscriptionAttention.mockResolvedValue({ items: [] });
    api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
    api.listClients.mockResolvedValue({ items: [] });
    api.listInvitations.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  async function renderSections() {
    const rendered = renderHook(() =>
      useHomeSections({ timeZone: "Asia/Kolkata" }),
    );
    await waitFor(() => expect(rendered.result.current.loading).toBe(false));
    return rendered;
  }

  it("rolls an optimistic ask removal back when the write fails", async () => {
    const { result } = await renderSections();
    expect(result.current.counts.asks).toBe(2);

    let rejectCommit: (err: Error) => void = () => undefined;
    const commit = new Promise<void>((_resolve, reject) => {
      rejectCommit = reject;
    });
    act(() => {
      void result.current
        .mutateSection(
          "asks",
          (prev) => prev.filter((item) => item.id !== ASK_A),
          () => commit,
        )
        .catch(() => undefined);
    });
    expect(result.current.coachAsks.map((item) => item.id)).toEqual([ASK_B]);
    expect(result.current.counts.asks).toBe(1);

    await act(async () => {
      rejectCommit(new Error("save failed"));
    });
    expect(result.current.coachAsks.map((item) => item.id)).toEqual([
      ASK_A,
      ASK_B,
    ]);
    expect(result.current.counts.asks).toBe(2);
  });

  it("keeps the optimistic ask removal and refetches only asks when the write lands", async () => {
    const { result } = await renderSections();
    const before = {
      attention: api.getAttentionGroups.mock.calls.length,
      asks: api.listCoachAsks.mock.calls.length,
      checkins: api.listTrainerCheckinInbox.mock.calls.length,
      renewals: api.listSubscriptionAttention.mock.calls.length,
      clients: api.listClients.mock.calls.length,
    };
    api.listCoachAsks.mockResolvedValue({ items: [ask(ASK_B)] });

    await act(async () => {
      await result.current.mutateSection(
        "asks",
        (prev) => prev.filter((item) => item.id !== ASK_A),
        async () => undefined,
      );
    });

    expect(result.current.counts.asks).toBe(1);
    expect(result.current.coachAsks.map((item) => item.id)).toEqual([ASK_B]);
    expect(api.listCoachAsks.mock.calls.length).toBe(before.asks + 1);
    expect(api.getAttentionGroups.mock.calls.length).toBe(before.attention);
    expect(api.listTrainerCheckinInbox.mock.calls.length).toBe(before.checkins);
    expect(api.listSubscriptionAttention.mock.calls.length).toBe(before.renewals);
    expect(api.listClients.mock.calls.length).toBe(before.clients);
  });

  it("keeps a held attention row out of the count when that section is refetched", async () => {
    const { result } = await renderSections();
    expect(result.current.counts.attention).toBe(1);

    act(() => {
      result.current.holdException(EXC);
    });
    expect(result.current.counts.attention).toBe(0);
    expect(result.current.counts.reviewed).toBe(1);

    api.getAttentionGroups.mockClear();
    api.listCoachAsks.mockClear();
    await act(async () => {
      await result.current.refreshSection("attention");
    });
    expect(api.getAttentionGroups).toHaveBeenCalledTimes(1);
    expect(api.listCoachAsks).not.toHaveBeenCalled();
    expect(result.current.counts.attention).toBe(0);

    act(() => {
      result.current.releaseException(EXC);
    });
    expect(result.current.counts.attention).toBe(1);
    expect(result.current.counts.reviewed).toBe(0);
  });
});
