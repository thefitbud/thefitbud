import { describe, expect, it } from "vitest";
import type {
  ClientDirectoryItem,
  CoachingRelationship,
  Invitation,
} from "@fitbud/contracts";
import {
  applyClientListFilter,
  buildClientDirectoryRows,
  endedChipLabel,
  filterClientRows,
  mapDirectoryItemToRow,
} from "./clients.js";

const invitation: Invitation = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  trainerUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  recipientEmail: "client@example.com",
  recipientDisplayName: "Alex Client",
  recipientWhatsappE164: "919876543210",
  status: "accepted",
  expiresAt: "2026-10-01T00:00:00.000Z",
  acceptedUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  coachingRelationshipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  onboardingFormTemplateVersionId: "66666666-6666-4666-8666-666666666666",
  onboardingStatus: "coaching_ready",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const relationship: CoachingRelationship = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  trainerUserId: invitation.trainerUserId,
  traineeUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: invitation.id,
  startedAt: "2026-09-02T00:00:00.000Z",
  endedAt: null,
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
};

describe("buildClientDirectoryRows", () => {
  it("joins invitation display name onto relationships", () => {
    const rows = buildClientDirectoryRows({
      invitations: [invitation],
      relationships: [relationship],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Alex Client");
    expect(rows[0]?.relationshipId).toBe(relationship.id);
  });

  it("filters by name and status label", () => {
    const rows = buildClientDirectoryRows({
      invitations: [invitation],
      relationships: [relationship],
    });
    expect(filterClientRows(rows, "alex")).toHaveLength(1);
    expect(filterClientRows(rows, "ready")).toHaveLength(1);
    expect(filterClientRows(rows, "zzz")).toHaveLength(0);
  });
});

describe("mapDirectoryItemToRow", () => {
  it("shows the real goal, city, and week — never a placeholder goal", () => {
    const item = {
      relationshipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      invitationId: null,
      traineeDisplayName: "Deepak Nair",
      status: "active",
      goalShort: "Lose 8 kg",
      nextCheckin: null,
      effectivePlan: null,
      adherenceState: "on_track",
      renewalState: null,
      renewsOn: null,
      week: 5,
      city: "Dubai",
      updatedAt: "2026-10-18T04:10:00.000Z",
    } satisfies ClientDirectoryItem;
    const row = mapDirectoryItemToRow(item);
    expect(row.subtitle).toBe("Lose 8 kg · Dubai · week 5");
    expect(row.subtitle.toLowerCase()).not.toContain("demo goal");
  });

  it("uses a plain fallback when an active client has no goal", () => {
    const item = {
      relationshipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      invitationId: null,
      traineeDisplayName: "Rohan Mehta",
      status: "active",
      goalShort: null,
      nextCheckin: null,
      effectivePlan: null,
      adherenceState: "needs_attention",
      renewalState: null,
      renewsOn: null,
      updatedAt: "2026-10-18T04:10:00.000Z",
    } satisfies ClientDirectoryItem;
    expect(mapDirectoryItemToRow(item).subtitle).toBe("No goal set yet");
  });
});

function item(over: Partial<ClientDirectoryItem>): ClientDirectoryItem {
  return {
    relationshipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    invitationId: null,
    traineeDisplayName: "Kavya Nair",
    status: "active",
    goalShort: "Lose 4 kg",
    nextCheckin: null,
    effectivePlan: null,
    adherenceState: "on_track",
    renewalState: null,
    renewsOn: null,
    updatedAt: "2026-10-18T04:10:00.000Z",
    ...over,
  };
}

describe("ended clients", () => {
  const active = item({ traineeDisplayName: "Rohan Mehta", week: 6 });
  const ended = item({
    status: "ended",
    startedAt: "2026-07-01T04:00:00.000Z",
    endedAt: "2026-10-02T20:00:00.000Z",
  });
  const due = item({
    traineeDisplayName: "Neha Reddy",
    nextCheckin: {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      localDate: "2026-10-18",
      status: "overdue",
    },
  });

  it("hides ended clients everywhere except the Ended filter", () => {
    const all = [active, ended, due];
    expect(applyClientListFilter(all, "all")).toEqual([active, due]);
    expect(applyClientListFilter(all, "needs_attention")).toEqual([active, due]);
    expect(applyClientListFilter(all, "onboarding")).toEqual([]);
    expect(applyClientListFilter(all, "ended")).toEqual([ended]);
  });

  it("narrows check-in due to clients with a check-in waiting", () => {
    expect(applyClientListFilter([active, ended, due], "checkin_due")).toEqual([due]);
  });

  it("shows Ended date for ended clients and week N for active ones (TM-02c)", () => {
    expect(mapDirectoryItemToRow(ended, "Asia/Kolkata", new Date("2026-11-11T00:00:00Z")).subtitle).toBe(
      "Ended Sat 3 Oct",
    );
    expect(mapDirectoryItemToRow(active).subtitle).toBe("Lose 4 kg · week 6");
  });

  it("keeps invites and onboarding as separate filters (TM-02d)", () => {
    const invite = item({
      status: "invited",
      relationshipId: null,
      invitationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      traineeDisplayName: "Anita Desai",
    });
    const intake = item({
      status: "onboarding_pending",
      traineeDisplayName: "Vikram Rao",
    });
    const all = [active, invite, intake, ended];
    expect(applyClientListFilter(all, "invites")).toEqual([invite]);
    expect(applyClientListFilter(all, "onboarding")).toEqual([intake]);
  });

  it("labels the ended chip with the end date in the trainer zone", () => {
    expect(endedChipLabel(ended, "Asia/Kolkata", new Date("2026-11-11T00:00:00Z"))).toBe(
      "Ended Sat 3 Oct",
    );
    expect(endedChipLabel(item({ status: "ended" }), "Asia/Kolkata")).toBe("Ended");
  });
});
