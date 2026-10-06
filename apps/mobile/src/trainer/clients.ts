import type {
  CoachingRelationship,
  Invitation,
  OnboardingStatus,
} from "@fitbud/contracts";

export type ClientDirectoryRow = {
  key: string;
  kind: "invitation" | "relationship";
  name: string;
  subtitle: string;
  onboardingStatus: OnboardingStatus;
  relationshipId: string | null;
  invitationId: string | null;
  traineeUserId: string | null;
  updatedAt: string;
};

export function onboardingStatusLabel(status: OnboardingStatus): string {
  switch (status) {
    case "invited":
      return "Invited";
    case "onboarding_pending":
      return "Onboarding pending";
    case "onboarding_submitted":
      return "Onboarding submitted";
    case "coaching_ready":
      return "Coaching ready";
    case "active":
      return "Active";
    case "ended":
      return "Ended";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function invitationDisplayName(invitation: Invitation): string {
  return invitation.recipientDisplayName?.trim() || invitation.recipientEmail;
}

export function buildClientDirectoryRows(input: {
  invitations: Invitation[];
  relationships: CoachingRelationship[];
}): ClientDirectoryRow[] {
  const invitationByRelationshipId = new Map<string, Invitation>();
  const invitationById = new Map<string, Invitation>();

  for (const invitation of input.invitations) {
    invitationById.set(invitation.id, invitation);
    if (invitation.coachingRelationshipId) {
      invitationByRelationshipId.set(
        invitation.coachingRelationshipId,
        invitation,
      );
    }
  }

  const relationshipIds = new Set(
    input.relationships.map((relationship) => relationship.id),
  );

  const pendingInvitations = input.invitations
    .filter((invitation) => invitation.status === "pending")
    .filter(
      (invitation) =>
        !invitation.coachingRelationshipId ||
        !relationshipIds.has(invitation.coachingRelationshipId),
    )
    .map(
      (invitation): ClientDirectoryRow => ({
        key: `invitation:${invitation.id}`,
        kind: "invitation",
        name: invitationDisplayName(invitation),
        subtitle: invitation.recipientEmail,
        onboardingStatus: invitation.onboardingStatus,
        relationshipId: null,
        invitationId: invitation.id,
        traineeUserId: null,
        updatedAt: invitation.updatedAt,
      }),
    );

  const relationshipRows = input.relationships
    .filter((relationship) => relationship.status !== "ended")
    .map((relationship): ClientDirectoryRow => {
      const invitation =
        (relationship.invitationId
          ? invitationById.get(relationship.invitationId)
          : undefined) ?? invitationByRelationshipId.get(relationship.id);
      const name = invitation
        ? invitationDisplayName(invitation)
        : `Trainee ${relationship.traineeUserId.slice(0, 8)}`;
      return {
        key: `relationship:${relationship.id}`,
        kind: "relationship",
        name,
        subtitle: invitation?.recipientEmail ?? relationship.traineeUserId,
        onboardingStatus: relationship.onboardingStatus,
        relationshipId: relationship.id,
        invitationId: relationship.invitationId,
        traineeUserId: relationship.traineeUserId,
        updatedAt: relationship.updatedAt,
      };
    });

  return [...pendingInvitations, ...relationshipRows].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function filterClientRows(
  rows: ClientDirectoryRow[],
  query: string,
): ClientDirectoryRow[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return rows;
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(trimmed) ||
      row.subtitle.toLowerCase().includes(trimmed) ||
      onboardingStatusLabel(row.onboardingStatus)
        .toLowerCase()
        .includes(trimmed),
  );
}
