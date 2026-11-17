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

/** Frame 168 type words: Nutrition (not Diet), Intake form, Check-in form. */
export function hubTypeLabel(
  kind: "workout" | "nutrition" | "combined" | "onboarding" | "checkin",
): string {
  switch (kind) {
    case "workout":
      return "Workout";
    case "nutrition":
      return "Nutrition";
    case "combined":
      return "Full plan";
    case "onboarding":
      return "Intake form";
    case "checkin":
      return "Check-in form";
    default: {
      const _exhaustive: never = kind;
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
    return "";
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

export function hubRowSubtitle(
  kind: "workout" | "nutrition" | "combined" | "onboarding" | "checkin",
  detail: string,
  versionNumber?: number,
): string {
  const type = hubTypeLabel(kind);
  const version =
    typeof versionNumber === "number" && versionNumber > 0
      ? ` · v${versionNumber}`
      : "";
  const trimmed = detail.trim();
  if (
    !trimmed ||
    trimmed === type ||
    trimmed === "Diet" ||
    trimmed === "Full plan" ||
    trimmed === "Workout"
  ) {
    return `${type}${version}`;
  }
  return `${type} · ${trimmed}${version}`;
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

/** Frame 169 empty copy by type filter. */
export function emptyMineTitle(
  typeFilter: "all" | "workout" | "nutrition" | "onboarding" | "checkin" | "combined",
): string {
  switch (typeFilter) {
    case "nutrition":
      return "No nutrition templates of your own yet";
    case "workout":
      return "No workout templates of your own yet";
    case "onboarding":
      return "No intake forms of your own yet";
    case "checkin":
      return "No check-in forms of your own yet";
    case "combined":
      return "No full plan templates of your own yet";
    default:
      return "No templates of your own yet";
  }
}

export function emptyMineBody(
  typeFilter: "all" | "workout" | "nutrition" | "onboarding" | "checkin" | "combined",
): string {
  switch (typeFilter) {
    case "nutrition":
      return "Make your own copy of a FitBud base nutrition plan, or save a client's plan as a template.";
    case "workout":
      return "Make your own copy of a FitBud base workout, or save a client's plan as a template.";
    case "onboarding":
      return "Make your own copy of a FitBud base intake form, or start blank.";
    case "checkin":
      return "Make your own copy of a FitBud base check-in form, or start blank.";
    default:
      return "Make your own copy of a FitBud base, or save a client's plan as a template.";
  }
}

export function clientInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function forkDefaultName(
  templateTitle: string,
  trainerDisplayName: string | null | undefined,
): string {
  const first =
    (trainerDisplayName ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";
  if (!first) return templateTitle;
  if (templateTitle.toLowerCase().includes(first.toLowerCase())) {
    return templateTitle;
  }
  return `${templateTitle} - ${first}`;
}

export function clientStatusLabel(status: string): string {
  // Use-modal clients are already coaching-ready; frame 174 reads "Ready to coach".
  if (status === "active" || status === "coaching_ready") return "Ready to coach";
  return labelFor("onboarding_status", status);
}
