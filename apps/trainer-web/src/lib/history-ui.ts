import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HeartHandshake,
  StickyNote,
} from "lucide-react";
import type { HistoryItem, HistoryItemKind } from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";

/** Replace civil ISO dates embedded in API title strings. */
export function humanizeHistoryText(text: string): string {
  return text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (match) =>
    formatCivilDate(match),
  );
}

const KIND_ICON: Record<HistoryItemKind, LucideIcon> = {
  onboarding_submitted: FileText,
  onboarding_reviewed: ClipboardCheck,
  configuration_activated: ClipboardList,
  subscription_revision: HeartHandshake,
  plan_version: ClipboardList,
  workout_execution: HeartHandshake,
  meal_compliance: HeartHandshake,
  checkin_submitted: ClipboardCheck,
  checkin_reviewed: ClipboardCheck,
  measurement: HeartHandshake,
  progress_entry: HeartHandshake,
  progress_photo: HeartHandshake,
  exception: AlertTriangle,
  trainer_note: StickyNote,
  intervention: HeartHandshake,
};

export function historyKindIcon(kind: HistoryItemKind): LucideIcon {
  return KIND_ICON[kind] ?? HeartHandshake;
}

function civilDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function parseCivilParts(civil: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(civil);
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  };
}

function toCivilString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday-start week key (civil date of that Monday in `timeZone`). */
export function historyWeekStartKey(iso: string, timeZone: string): string {
  const civil = civilDateInZone(iso, timeZone);
  const parts = parseCivilParts(civil);
  if (!parts) return civil;
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  const dow = date.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + diff);
  return toCivilString(date);
}

export function historyWeekHeading(weekStartCivil: string): string {
  return `Week of ${formatCivilDate(weekStartCivil, { includeWeekday: false })}`;
}

export type HistoryWeekGroup = {
  weekStart: string;
  heading: string;
  items: HistoryItem[];
};

export function groupHistoryByWeek(
  items: HistoryItem[],
  timeZone: string,
): HistoryWeekGroup[] {
  const byWeek = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const key = historyWeekStartKey(item.occurredAt, timeZone);
    const bucket = byWeek.get(key);
    if (bucket) bucket.push(item);
    else byWeek.set(key, [item]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekStart, weekItems]) => ({
      weekStart,
      heading: historyWeekHeading(weekStart),
      items: weekItems,
    }));
}

export function historySourceHref(
  relationshipId: string,
  item: HistoryItem,
): string | null {
  switch (item.kind) {
    case "plan_version":
    case "configuration_activated":
    case "subscription_revision":
      return `/clients/${relationshipId}/plan`;
    case "checkin_submitted":
      return `/clients/${relationshipId}/check-ins/${item.sourceEntityId}`;
    case "checkin_reviewed":
      return `/clients/${relationshipId}/check-ins`;
    case "exception":
      return `/clients/${relationshipId}/overview?exception=${item.sourceEntityId}`;
    case "trainer_note":
    case "onboarding_submitted":
    case "onboarding_reviewed":
      return `/clients/${relationshipId}/overview`;
    case "workout_execution":
    case "meal_compliance":
      return `/clients/${relationshipId}/activity`;
    case "measurement":
    case "progress_entry":
    case "progress_photo":
      return `/clients/${relationshipId}/progress`;
    case "intervention":
      return `/clients/${relationshipId}/overview`;
    default:
      return null;
  }
}

export function historySourceLabel(item: HistoryItem): string {
  switch (item.kind) {
    case "plan_version":
      return "View plan";
    case "checkin_submitted":
    case "checkin_reviewed":
      return "View check-in";
    case "exception":
      return "View item";
    case "trainer_note":
      return "View overview";
    case "workout_execution":
    case "meal_compliance":
      return "View activity";
    case "measurement":
    case "progress_entry":
    case "progress_photo":
      return "View progress";
    default:
      return "View source";
  }
}
