import type {
  AdherenceState,
  ClientDirectoryItem,
  CoachingRelationship,
  Invitation,
  OnboardingStatus,
} from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";

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
  return labelFor("onboarding_status", status);
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

export type ClientListFilter =
  | "all"
  | "needs_attention"
  | "checkin_due"
  | "onboarding"
  | "ended";

export type ClientListApiQuery = {
  q?: string;
  status?: OnboardingStatus[];
  adherenceState?: AdherenceState[];
  limit?: number;
};

export function clientListQueryForChip(
  chip: ClientListFilter,
  query: string,
): ClientListApiQuery {
  const q = query.trim();
  const base: ClientListApiQuery = { limit: 50, ...(q ? { q } : {}) };
  switch (chip) {
    case "needs_attention":
      return { ...base, adherenceState: ["needs_attention"] };
    case "onboarding":
      return {
        ...base,
        status: ["invited", "onboarding_pending", "onboarding_submitted"],
      };
    case "ended":
      return { ...base, status: ["ended"] };
    case "checkin_due":
      return { ...base, status: ["coaching_ready", "active"] };
    default:
      return base;
  }
}

export function clientSubtitle(item: ClientDirectoryItem): string {
  const goal = item.goalShort?.trim() ?? "";
  if (!goal) {
    return item.relationshipId
      ? "No goal set yet"
      : onboardingStatusLabel(item.status);
  }
  const parts = [
    goal,
    item.city?.trim() || null,
    item.week != null ? `week ${item.week}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

export function mapDirectoryItemToRow(
  item: ClientDirectoryItem,
): ClientDirectoryRow {
  const relationshipId = item.relationshipId;
  const invitationId = item.invitationId;
  const subtitle = clientSubtitle(item);
  return {
    key: relationshipId
      ? `relationship:${relationshipId}`
      : `invitation:${invitationId ?? item.traineeDisplayName}`,
    kind: relationshipId ? "relationship" : "invitation",
    name: item.traineeDisplayName,
    subtitle,
    onboardingStatus: item.status,
    relationshipId,
    invitationId,
    traineeUserId: null,
    updatedAt: item.updatedAt,
  };
}

export function filterClientRows(
  rows: ClientDirectoryRow[],
  query: string,
  chip: ClientListFilter = "all",
): ClientDirectoryRow[] {
  let next = rows;
  if (chip === "checkin_due") {
    next = next.filter(
      (row) =>
        row.onboardingStatus === "coaching_ready" ||
        row.onboardingStatus === "active",
    );
  }

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return next;
  return next.filter(
    (row) =>
      row.name.toLowerCase().includes(trimmed) ||
      row.subtitle.toLowerCase().includes(trimmed) ||
      onboardingStatusLabel(row.onboardingStatus)
        .toLowerCase()
        .includes(trimmed),
  );
}
