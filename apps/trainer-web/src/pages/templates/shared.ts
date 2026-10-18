import { ApiClientError } from "@fitbud/api-client";
import type { ClientDirectoryItem, PlanTemplateType } from "@fitbud/contracts";
import { formatInstant } from "@fitbud/core";

export type ApplyClient = ClientDirectoryItem & { relationshipId: string };

export type TemplateFamily =
  | "onboarding"
  | "workout"
  | "nutrition"
  | "combined"
  | "libraries";

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function matchesName(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return name.toLowerCase().includes(needle);
}

export function formatUpdated(value: string, timeZone = "UTC"): string {
  return formatInstant(value, timeZone);
}

export function templateTypeLabel(type: PlanTemplateType): string {
  switch (type) {
    case "workout":
      return "Workout";
    case "nutrition":
      return "Nutrition";
    case "combined":
      return "Combined";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function withRelationship(
  items: ClientDirectoryItem[],
): ApplyClient[] {
  return items.filter(
    (item): item is ApplyClient => item.relationshipId !== null,
  );
}
