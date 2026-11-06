import { labelFor } from "@fitbud/core";
import type { AttentionGroupsResponse } from "@fitbud/contracts";

export type AttentionGroup = AttentionGroupsResponse["groups"][number];
export type AttentionItem = AttentionGroup["items"][number];

function weekdayShortFromCivil(localDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function localDateFromDetails(
  details: Record<string, unknown> | null | undefined,
): string | null {
  if (!details) return null;
  const value = details.localDate;
  return typeof value === "string" ? value : null;
}

function isWorkoutType(type: AttentionItem["type"]): boolean {
  return type === "missed_workout" || type === "skipped_workout";
}

function isMealType(type: AttentionItem["type"]): boolean {
  return (
    type === "overdue_meal" ||
    type === "skipped_meal" ||
    type === "meal_logged_later"
  );
}

/**
 * Plain-words issue line for a Needs attention row.
 * When meals/workouts are rolled into "Missed N …", `more` counts only
 * items not already covered by that phrase (QA-PR28 finding 4 / NA1).
 */
export function issueLine(
  group: AttentionGroup,
  primary: AttentionItem,
): {
  text: string;
  more: number;
  title: string;
} {
  const open = group.items.filter(
    (i) => i.status === "detected" || i.status === "active",
  );
  const items = open.length > 0 ? open : group.items;
  const workouts = items.filter((i) => isWorkoutType(i.type));
  const meals = items.filter((i) => isMealType(i.type));
  const sameType = items.filter((i) => i.type === primary.type);
  const related = isWorkoutType(primary.type)
    ? workouts
    : isMealType(primary.type)
      ? meals
      : sameType;
  const weekdays = related
    .map((i) => localDateFromDetails(i.details))
    .filter((d): d is string => Boolean(d))
    .map((d) => weekdayShortFromCivil(d))
    .filter((d): d is string => Boolean(d));
  const uniqueWeekdays = [...new Set(weekdays)];

  let text =
    primary.summary?.trim() || labelFor("exception_type", primary.type);

  const dayList =
    uniqueWeekdays.length > 0 ? uniqueWeekdays.join(", ") : null;
  const rolledUp = related.length >= 2 && (isWorkoutType(primary.type) || isMealType(primary.type));
  if (rolledUp && isWorkoutType(primary.type)) {
    text = dayList
      ? `Missed ${related.length} workouts (${dayList})`
      : `Missed ${related.length} workouts`;
  } else if (rolledUp && isMealType(primary.type)) {
    text = dayList
      ? `Missed ${related.length} meals (${dayList})`
      : `Missed ${related.length} meals`;
  } else if (dayList && !/\([A-Z][a-z]{2}/.test(text)) {
    text = `${text} (${dayList})`;
  }

  // Items already named in the rolled-up phrase must not appear again as "+N more".
  const coveredCount = rolledUp ? related.length : 1;
  const more = Math.max(0, items.length - coveredCount);
  const title = items
    .map((i) => i.summary || labelFor("exception_type", i.type))
    .join("; ");
  return { text, more, title };
}
