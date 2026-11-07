/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RealtimeEvent, RealtimeEventType, RealtimeEntityType } from "@fitbud/contracts";
import { HOME_POLL_MS } from "./home/useHomeSections";

const REL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXC = "11111111-1111-4111-8111-111111111111";

const hints = vi.hoisted(() => ({
  onHint: null as null | ((event?: unknown) => void),
}));

const api = vi.hoisted(() => ({
  getAttentionGroups: vi.fn(),
  listCoachAsks: vi.fn(),
  getReengagementCandidates: vi.fn(),
  getActivityFeed: vi.fn(),
  listSubscriptionAttention: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listClients: vi.fn(),
  listInvitations: vi.fn(),
  acknowledgeException: vi.fn(),
}));

vi.mock("../lib/stage1-api", () => ({
  stage1Api: {
    getAttentionGroups: api.getAttentionGroups,
    listCoachAsks: api.listCoachAsks,
    getReengagementCandidates: api.getReengagementCandidates,
    getActivityFeed: api.getActivityFeed,
  },
}));
vi.mock("../lib/api", () => ({
  apiClient: {
    listSubscriptionAttention: api.listSubscriptionAttention,
    listTrainerCheckinInbox: api.listTrainerCheckinInbox,
    listClients: api.listClients,
    listInvitations: api.listInvitations,
    acknowledgeException: api.acknowledgeException,
    getException: vi.fn(),
    nudgeActivity: vi.fn(),
  },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));
vi.mock("../components/OfflineBanner", () => ({
  useOnlineStatus: () => true,
}));
vi.mock("../realtime/useRealtimeHints", () => ({
  useRealtimeHints: (
    _client: unknown,
    _ids: unknown,
    onHint: (event?: unknown) => void,
  ) => {
    hints.onHint = onHint;
  },
}));
vi.mock("../components/ExceptionDrawer", () => ({
  ExceptionDrawer: () => null,
}));
vi.mock("../components/CoachAskDrawer", () => ({
  CoachAskDrawer: () => null,
}));

import { HomePage } from "./HomePage";

function group(status: "active" | "acknowledged" = "active") {
  return {
    relationshipId: REL,
    traineeDisplayName: "Rohan Mehta",
    clientWhatsappE164: null,
    items: [
      {
        id: EXC,
        type: "missed_workout",
        severity: "critical" as const,
        status,
        ageMinutes: 90,
        summary: "Missed workout",
        details: null,
      },
    ],
  };
}

function counts() {
  return {
    attention: api.getAttentionGroups.mock.calls.length,
    asks: api.listCoachAsks.mock.calls.length,
    checkins: api.listTrainerCheckinInbox.mock.calls.length,
    renewals: api.listSubscriptionAttention.mock.calls.length,
    clients: api.listClients.mock.calls.length,
    invitations: api.listInvitations.mock.calls.length,
    reengage: api.getReengagementCandidates.mock.calls.length,
    activity: api.getActivityFeed.mock.calls.length,
  };
}

function hint(
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

let hidden = false;
const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");

function setHidden(value: boolean) {
  hidden = value;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

async function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
  await screen.findByRole("grid", { name: "Needs attention" });
  await act(async () => {
    await Promise.resolve();
  });
}

function markReviewed() {
  fireEvent.click(
    screen.getByRole("button", { name: "More actions for Rohan Mehta" }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Mark reviewed" }));
}

describe("HomePage section refresh (Z7-1)", () => {
  beforeEach(() => {
    hidden = false;
    api.getAttentionGroups.mockResolvedValue({ groups: [group()] });
    api.listCoachAsks.mockResolvedValue({ items: [] });
    api.getReengagementCandidates.mockResolvedValue({ items: [] });
    api.getActivityFeed.mockResolvedValue({ events: [] });
    api.listSubscriptionAttention.mockResolvedValue({ items: [] });
    api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
    api.listClients.mockResolvedValue({ items: [] });
    api.listInvitations.mockResolvedValue({ items: [] });
    api.acknowledgeException.mockResolvedValue({});
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    if (hiddenDescriptor) {
      Object.defineProperty(document, "hidden", hiddenDescriptor);
    } else {
      delete (document as { hidden?: boolean }).hidden;
    }
    hidden = false;
  });

  it("refetches only attention, and its count, after Mark reviewed", async () => {
    await renderHome();
    const before = counts();
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      writable: true,
      value: 480,
    });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    markReviewed();

    expect(screen.queryByLabelText("Loading")).toBeNull();
    expect(window.scrollY).toBe(480);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByRole("row")).toBeNull();
    expect(counts()).toEqual(before);
    expect(
      screen.getByRole("button", { name: /Needs attention/ }).textContent,
    ).toContain("0");

    api.getAttentionGroups.mockResolvedValue({
      groups: [group("acknowledged")],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(api.acknowledgeException).toHaveBeenCalledTimes(1);
    expect(api.acknowledgeException.mock.calls[0]?.[0]).toBe(EXC);
    const after = counts();
    expect(after.attention).toBe(before.attention + 1);
    expect(after.asks).toBe(before.asks);
    expect(after.checkins).toBe(before.checkins);
    expect(after.renewals).toBe(before.renewals);
    expect(after.clients).toBe(before.clients);
    expect(after.invitations).toBe(before.invitations);
    expect(after.reengage).toBe(before.reengage);
    expect(after.activity).toBe(before.activity);
    expect(screen.queryByLabelText("Loading")).toBeNull();
    expect(window.scrollY).toBe(480);
    expect(
      screen.getByRole("button", { name: /Needs attention/ }).textContent,
    ).toContain("0");
  });

  it("does not bring a row back from a poll inside the 5s Undo window", async () => {
    await renderHome();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(41_000);
    });
    markReviewed();
    expect(screen.queryByText("Rohan Mehta")).toBeNull();
    const attentionCalls = api.getAttentionGroups.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(api.acknowledgeException).not.toHaveBeenCalled();
    expect(api.getAttentionGroups.mock.calls.length).toBe(attentionCalls + 1);
    expect(screen.queryByText("Rohan Mehta")).toBeNull();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("polls every 45s, skips hidden tabs, and refetches once on becoming visible", async () => {
    await renderHome();
    const loaded = counts();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOME_POLL_MS - 1_000);
    });
    expect(counts()).toEqual(loaded);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    const polled = counts();
    expect(polled.attention).toBe(loaded.attention + 1);
    expect(polled.asks).toBe(loaded.asks + 1);
    expect(polled.checkins).toBe(loaded.checkins + 1);
    expect(polled.renewals).toBe(loaded.renewals + 1);
    expect(polled.clients).toBe(loaded.clients + 1);
    expect(polled.invitations).toBe(loaded.invitations + 1);

    setHidden(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    const whileHidden = counts();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOME_POLL_MS);
    });
    expect(counts()).toEqual(whileHidden);

    setHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    const shown = counts();
    expect(shown.attention).toBe(whileHidden.attention + 1);
    expect(shown.asks).toBe(whileHidden.asks + 1);
    expect(shown.checkins).toBe(whileHidden.checkins + 1);
    expect(shown.renewals).toBe(whileHidden.renewals + 1);
    expect(shown.clients).toBe(whileHidden.clients + 1);
    expect(shown.invitations).toBe(whileHidden.invitations + 1);
  });

  it("sends a realtime hint to the matching section only", async () => {
    await renderHome();

    const cases: Array<{
      eventType: RealtimeEventType;
      entityType: RealtimeEntityType;
      key: keyof ReturnType<typeof counts>;
    }> = [
      { eventType: "checkin_submitted", entityType: "checkin", key: "checkins" },
      { eventType: "exception_created", entityType: "exception", key: "attention" },
      { eventType: "effective_plan_changed", entityType: "plan_version", key: "renewals" },
      {
        eventType: "workout_execution_changed",
        entityType: "workout_execution",
        key: "attention",
      },
      {
        eventType: "meal_compliance_changed",
        entityType: "meal_compliance",
        key: "attention",
      },
      { eventType: "checkin_reviewed", entityType: "checkin", key: "checkins" },
    ];

    for (const item of cases) {
      const before = counts();
      await act(async () => {
        hints.onHint?.(hint(item.eventType, item.entityType));
        await Promise.resolve();
      });
      const after = counts();
      for (const key of Object.keys(after) as Array<keyof typeof after>) {
        const expected = before[key] + (key === item.key ? 1 : 0);
        expect(after[key], item.eventType).toBe(expected);
      }
    }
  });
});
