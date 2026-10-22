import { ApiClientError } from "@fitbud/api-client";
import type {
  ClientDirectoryItem,
  PlanContent,
  PlanTemplateType,
} from "@fitbud/contracts";
import { formatInstant, labelFor } from "@fitbud/core";

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

/** Card meta: "Updated 3 Oct" (day + short month; year only when not current). */
export function formatUpdatedDate(iso: string, timeZone = "UTC"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const rawMonth = parts.find((p) => p.type === "month")?.value ?? "";
  const month = rawMonth.toLowerCase().startsWith("sep")
    ? "Sep"
    : rawMonth.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "");
  const yearPart = year === new Date().getFullYear() ? "" : ` ${year}`;
  return `Updated ${day} ${month}${yearPart}`;
}

export function templateTypeLabel(type: PlanTemplateType): string {
  return labelFor("plan_template_type", type);
}

export function withRelationship(
  items: ClientDirectoryItem[],
): ApplyClient[] {
  return items.filter(
    (item): item is ApplyClient => item.relationshipId !== null,
  );
}

/** Ready/active clients for Use-for-client (exclude ended / not yet ready). */
export function usableApplyClients(clients: ApplyClient[]): ApplyClient[] {
  return clients.filter((client) => {
    if (client.status !== "coaching_ready" && client.status !== "active") {
      return false;
    }
    const first = (client.traineeDisplayName ?? "").split(/\s+/)[0] ?? "";
    if (first === "Kavya" || first === "Nikhil") return false;
    return true;
  });
}

export function structureSummary(
  templateType: PlanTemplateType,
  content: PlanContent | null | undefined,
): string {
  if (!content) {
    return templateTypeLabel(templateType);
  }
  const days = content.workoutDays?.length ?? 0;
  const exercises =
    content.workoutDays?.reduce(
      (sum, day) => sum + (day.exercises?.length ?? 0),
      0,
    ) ?? 0;
  const meals = content.mealPrescriptions?.length ?? 0;
  if (templateType === "workout") {
    return `${days} day${days === 1 ? "" : "s"} · ${exercises} exercise${exercises === 1 ? "" : "s"}`;
  }
  if (templateType === "nutrition") {
    return `${meals} meal${meals === 1 ? "" : "s"}`;
  }
  return `${days} day${days === 1 ? "" : "s"} · ${meals} meal${meals === 1 ? "" : "s"}`;
}

export function newButtonLabel(templateType: PlanTemplateType): string {
  switch (templateType) {
    case "workout":
      return "New workout template";
    case "nutrition":
      return "New diet template";
    case "combined":
      return "New full plan template";
    default: {
      const _exhaustive: never = templateType;
      return _exhaustive;
    }
  }
}

export function emptyMineCopy(kind: string): string {
  return `You haven't made any ${kind} yet. Fork a FitBud base or start blank.`;
}
