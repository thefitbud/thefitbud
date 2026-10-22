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

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "since 5 d" — age on the attention card. */
export function formatAttentionAge(ageMinutes: number): string {
  if (ageMinutes < 60) {
    const mins = Math.max(1, ageMinutes);
    return `since ${mins} min`;
  }
  if (ageMinutes < 24 * 60) {
    const hours = Math.max(1, Math.round(ageMinutes / 60));
    return `since ${hours} h`;
  }
  const days = Math.max(1, Math.round(ageMinutes / (24 * 60)));
  return `since ${days} d`;
}

function localDateOf(item: AttentionGroupItem): string | null {
  const value = item.details?.localDate;
  return typeof value === "string" ? value : null;
}

function weekdayLabel(localDate: string): string | null {
  const [year, month, day] = localDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return WEEKDAY[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? null;
}

/** One issue line for a client card, grouped the way the attention mockup reads. */
export function attentionIssueLine(items: AttentionGroupItem[]): string {
  const workouts = items.filter(
    (item) => item.type === "missed_workout" || item.type === "skipped_workout",
  );
  const meals = items.filter(
    (item) =>
      item.type === "overdue_meal" ||
      item.type === "skipped_meal" ||
      item.type === "meal_deviation" ||
      item.type === "meal_logged_later",
  );
  const checkins = items.filter((item) => item.type === "overdue_checkin");
  if (checkins[0] && workouts.length === 0) {
    const days = Math.max(1, Math.round(checkins[0].ageMinutes / (24 * 60)));
    return days === 1
      ? "Check-in 1 day overdue"
      : `Check-in ${days} days overdue`;
  }
  if (workouts.length > 0 && workouts.length >= meals.length) {
    const days = [
      ...new Set(
        workouts
          .map((item) => localDateOf(item))
          .filter((value): value is string => Boolean(value))
          .map((date) => weekdayLabel(date))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const shown = days.slice(0, 2);
    const hidden = Math.max(0, days.length - shown.length) + (items.length - workouts.length);
    const noun =
      workouts.length === 1
        ? "Missed workout"
        : `Missed ${workouts.length} workouts`;
    const parts = [noun];
    if (shown.length > 0) parts.push(shown.join(", "));
    if (hidden > 0) parts.push(`+${hidden} more`);
    return parts.join(" · ");
  }
  if (meals.length > 0) {
    const label = meals[0]!.summary.replace(/^Skipped required meal:\s*/i, "").replace(/^Required meal still unlogged:\s*/i, "");
    const headline = /breakfast/i.test(label)
      ? "Breakfast not logged"
      : label;
    const days = [
      ...new Set(
        meals
          .map((item) => localDateOf(item))
          .filter((value): value is string => Boolean(value))
          .map((date) => weekdayLabel(date))
          .filter((value): value is string => Boolean(value)),
      ),
    ].slice(0, 3);
    return days.length > 0 ? `${headline} · ${days.join(", ")}` : headline;
  }
  return items[0]?.summary ?? "Needs a look";
}
