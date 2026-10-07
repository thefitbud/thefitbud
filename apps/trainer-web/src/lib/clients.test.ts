import { describe, expect, it } from "vitest";
import type { CoachingRelationship, Invitation } from "@fitbud/contracts";
import { buildClientDirectoryRows } from "./clients";

const baseInvitation: Invitation = {
  id: "11111111-1111-4111-8111-111111111111",
  trainerUserId: "22222222-2222-4222-8222-222222222222",
  recipientEmail: "alex@example.com",
  recipientDisplayName: "Alex",
  recipientWhatsappE164: null,
  status: "pending",
  expiresAt: "2030-01-01T00:00:00.000Z",
  acceptedUserId: null,
  coachingRelationshipId: null,
  onboardingStatus: "invited",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const baseRelationship: CoachingRelationship = {
  id: "33333333-3333-4333-8333-333333333333",
  trainerUserId: "22222222-2222-4222-8222-222222222222",
  traineeUserId: "44444444-4444-4444-8444-444444444444",
  status: "onboarding_submitted",
  onboardingStatus: "onboarding_submitted",
  invitationId: "55555555-5555-4555-8555-555555555555",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

describe("buildClientDirectoryRows", () => {
  it("keeps pending invitations and joins names onto relationships", () => {
    const acceptedInvite: Invitation = {
      ...baseInvitation,
      id: "55555555-5555-4555-8555-555555555555",
      status: "accepted",
      recipientDisplayName: "Jordan",
      recipientEmail: "jordan@example.com",
      coachingRelationshipId: baseRelationship.id,
      onboardingStatus: "onboarding_submitted",
      updatedAt: "2026-01-03T00:00:00.000Z",
    };

    const roster = buildClientDirectoryRows({
      invitations: [baseInvitation, acceptedInvite],
      relationships: [baseRelationship],
    });

    expect(roster).toHaveLength(2);
    expect(roster[0]?.name).toBe("Jordan");
    expect(roster[0]?.relationshipId).toBe(baseRelationship.id);
    expect(roster[1]?.onboardingStatus).toBe("invited");
    expect(roster[1]?.name).toBe("Alex");
    expect(roster[1]?.recipientWhatsappE164).toBeNull();
  });
});
