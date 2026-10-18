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
  clientWhatsappE164: string | null;
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
        clientWhatsappE164: group.clientWhatsappE164 ?? null,
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

/** Chip copy: "Since 2 days" (never "Since 2 D"). */
export function formatAttentionAge(ageMinutes: number): string {
  if (ageMinutes < 60) {
    const mins = Math.max(0, ageMinutes);
    return mins === 1 ? "Since 1 min" : `Since ${mins} min`;
  }
  if (ageMinutes < 24 * 60) {
    const hours = Math.round(ageMinutes / 60);
    return hours === 1 ? "Since 1 hour" : `Since ${hours} hours`;
  }
  const days = Math.round(ageMinutes / (24 * 60));
  return days === 1 ? "Since 1 day" : `Since ${days} days`;
}
