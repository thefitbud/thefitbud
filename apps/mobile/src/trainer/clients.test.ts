import { describe, expect, it } from "vitest";
import type { CoachingRelationship, Invitation } from "@fitbud/contracts";
import {
  buildClientDirectoryRows,
  filterClientRows,
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
  onboardingStatus: "coaching_ready",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const relationship: CoachingRelationship = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  trainerUserId: invitation.trainerUserId,
  traineeUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  status: "coaching_ready",
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
    expect(filterClientRows(rows, "coaching")).toHaveLength(1);
    expect(filterClientRows(rows, "zzz")).toHaveLength(0);
  });
});
