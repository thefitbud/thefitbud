import type { MealAssignment } from "@fitbud/contracts";
import type { WorkspaceActivityItem, WorkspaceActivityType } from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatCivilDate,
  formatClockTime,
  formatLocalDate,
  weekdayFromLocalDate,
} from "@fitbud/core";

export type ActivityTypeFilter = WorkspaceActivityType;
export type DateRangeMode = "this_week" | "last_week" | "custom";

export type MealStateFilter =
  | ""
  | "pending"
  | "confirmed"
  | "modified"
  | "skipped"
  | "logged_later"
  | "overdue";

export type WorkoutStateFilter =
  | ""
  | "assigned"
  | "completed"
  | "modified"
  | "skipped"
  | "missed";

export function todayInTimezone(timeZone: string): string {
  return formatLocalDate(new Date(), timeZone);
}

export function calendarWeekContaining(
  today: string,
): { from: string; to: string } {
  const weekday = weekdayFromLocalDate(today);
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const from = addDaysToLocalDate(today, -daysFromMonday);
  return { from, to: addDaysToLocalDate(from, 6) };
}

export function lastCalendarWeek(today: string): { from: string; to: string } {
  const current = calendarWeekContaining(today);
  const from = addDaysToLocalDate(current.from, -7);
  return { from, to: addDaysToLocalDate(current.from, -1) };
}

export function resolveDateRange(
  mode: DateRangeMode,
  today: string,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  if (mode === "this_week") return calendarWeekContaining(today);
  if (mode === "last_week") return lastCalendarWeek(today);
  return {
    from: customFrom || calendarWeekContaining(today).from,
    to: customTo || today,
  };
}

export function mealStateForApi(filter: MealStateFilter): string | undefined {
  return filter || undefined;
}

export function workoutStateForApi(
  filter: WorkoutStateFilter,
): string | undefined {
  return filter || undefined;
}

export function chipValueForActivity(item: WorkspaceActivityItem): string {
  if (item.type === "workout" && item.state === "assigned") {
    return "assigned";
  }
  return item.state;
}

export function mealChipLabel(state: string): string | undefined {
  if (state === "confirmed") return "Logged";
  if (state === "modified") return "Changed";
  if (state === "logged_later") return "Logged late";
  return undefined;
}

export function workoutChipLabel(state: string): string | undefined {
  if (state === "assigned") return "Pending";
  return undefined;
}

export function canNudgeItem(item: WorkspaceActivityItem): boolean {
  if (item.type === "meal") {
    return item.state === "pending" || item.state === "overdue";
  }
  if (item.type === "workout") {
    return item.state === "assigned" || item.state === "missed";
  }
  return (
    item.state === "scheduled" ||
    item.state === "due" ||
    item.state === "overdue"
  );
}

export function sortActivityItems(
  items: WorkspaceActivityItem[],
): WorkspaceActivityItem[] {
  return [...items].sort((left, right) => {
    const dateCmp = right.localDate.localeCompare(left.localDate);
    if (dateCmp !== 0) return dateCmp;
    return right.occurredAt.localeCompare(left.occurredAt);
  });
}

export function groupByDay(
  items: WorkspaceActivityItem[],
  type: ActivityTypeFilter,
): Array<{ date: string; items: WorkspaceActivityItem[] }> {
  const sorted = sortActivityItems(items);
  const groups: Array<{ date: string; items: WorkspaceActivityItem[] }> = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (!last || last.date !== item.localDate) {
      groups.push({ date: item.localDate, items: [item] });
    } else {
      last.items.push(item);
    }
  }
  if (type === "meal") {
    for (const group of groups) {
      group.items.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    }
  }
  return groups;
}

export function mealDayHeaderSummary(
  items: WorkspaceActivityItem[],
): string | null {
  const meals = items.filter((item) => item.type === "meal");
  if (meals.length === 0) return null;
  const total = meals.length;
  const logged = meals.filter((item) => {
    const state = item.state;
    return (
      state === "confirmed" ||
      state === "modified" ||
      state === "skipped" ||
      state === "logged_later"
    );
  }).length;
  return `${logged} of ${total} meals logged`;
}

export function mealDetailLine(
  assignment: MealAssignment | undefined,
): string {
  if (!assignment) return "";
  const compliance = assignment.compliance;
  if (!compliance) {
    if (assignment.status === "overdue") return "Not logged yet";
    if (assignment.status === "pending") return "Awaiting log";
    return "";
  }
  if (compliance.outcome === "skipped") {
    const note = compliance.notes?.trim();
    return note ? `Skipped · '${note}'` : "Skipped";
  }
  const loggedItems = compliance.loggedItems ?? [];
  if (loggedItems.length > 0) {
    const names = loggedItems
      .slice(0, 3)
      .map((row) => row.name)
      .join(", ");
    const loggedKcal = compliance.loggedTotals?.energyKcal;
    const planKcal = assignment.prescription.items?.reduce((sum, row) => {
      if ("calculated" in row && row.calculated?.energyKcalScaled != null) {
        return sum + row.calculated.energyKcalScaled;
      }
      return sum;
    }, 0);
    const kcalPart =
      loggedKcal != null
        ? ` · ${loggedKcal} kcal${planKcal != null ? ` (plan ${planKcal})` : ""}`
        : "";
    return `Ate: ${names}${kcalPart}`;
  }
  if (compliance.notes?.trim()) {
    return compliance.notes.trim();
  }
  if (compliance.deviationKind) {
    return compliance.deviationKind.replaceAll("_", " ");
  }
  return "";
}

export function formatActivityTime(
  iso: string,
  clientTz: string,
  trainerTz: string,
): { label: string; title: string } {
  const label = formatClockTime(iso, clientTz);
  const trainer = formatClockTime(iso, trainerTz);
  const title =
    clientTz === trainerTz
      ? `${label} (${clientTz})`
      : `${label} client time · ${trainer} your time`;
  return { label, title };
}

export function dayHeaderLabel(date: string, suffix: string | null): string {
  const base = formatCivilDate(date);
  return suffix ? `${base} · ${suffix}` : base;
}

export function parseItemParam(
  raw: string | null,
): { type: "meal" | "workout"; id: string } | null {
  if (!raw) return null;
  const match = /^(meal|workout):([0-9a-f-]{36})$/i.exec(raw.trim());
  if (!match) return null;
  return { type: match[1]!.toLowerCase() as "meal" | "workout", id: match[2]! };
}
