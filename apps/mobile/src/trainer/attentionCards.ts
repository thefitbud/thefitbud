import type { AttentionGroupsResponse } from "@fitbud/contracts";

type AttentionGroup = AttentionGroupsResponse["groups"][number];
type AttentionGroupItem = AttentionGroup["items"][number];

const SEVERITY_RANK: Record<AttentionGroupItem["severity"], number> = {
  critical: 0,
  attention: 1,
};

export type ClientAttentionCard = {
  relationshipId: string;
  traineeDisplayName: string;
  primary: AttentionGroupItem;
  itemCount: number;
};

export function buildClientAttentionCards(
  groups: AttentionGroup[],
): ClientAttentionCard[] {
  return groups
    .map((group) => {
      const sorted = [...group.items].sort((a, b) => {
        const sev =
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
        if (sev !== 0) return sev;
        return b.ageMinutes - a.ageMinutes;
      });
      const primary = sorted[0];
      if (!primary) return null;
      return {
        relationshipId: group.relationshipId,
        traineeDisplayName: group.traineeDisplayName,
        primary,
        itemCount: group.items.length,
      };
    })
    .filter((row): row is ClientAttentionCard => row != null)
    .sort((a, b) => {
      const sev =
        (SEVERITY_RANK[a.primary.severity] ?? 9) -
        (SEVERITY_RANK[b.primary.severity] ?? 9);
      if (sev !== 0) return sev;
      return b.primary.ageMinutes - a.primary.ageMinutes;
    });
}

export function formatAttentionAge(ageMinutes: number): string {
  if (ageMinutes < 60) return `since ${ageMinutes} min`;
  if (ageMinutes < 24 * 60) {
    const hours = Math.round(ageMinutes / 60);
    return `since ${hours} h`;
  }
  const days = Math.round(ageMinutes / (24 * 60));
  return `since ${days} d`;
}
