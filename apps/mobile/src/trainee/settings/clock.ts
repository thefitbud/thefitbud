import { formatHhMmTime } from "@fitbud/core";

export function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatHm(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function clockLabel(hhmm: string): string {
  return formatHhMmTime(hhmm);
}

export function clockRange(start: string, end: string): string {
  return `${clockLabel(start)} – ${clockLabel(end)}`;
}

/** Quiet span in minutes, including ranges that cross midnight. */
export function quietSpanMinutes(start: string, end: string): number | null {
  const from = parseHm(start);
  const to = parseHm(end);
  if (from == null || to == null || from === to) return null;
  if (to > from) return to - from;
  return 24 * 60 - from + to;
}

export function validateQuietHours(start: string, end: string): string | null {
  const span = quietSpanMinutes(start, end);
  if (span == null) return "Choose a start and an end.";
  if (span < 6 * 60) return "Quiet hours need to be at least 6 hours.";
  if (span > 12 * 60) return "Quiet hours can be at most 12 hours.";
  return null;
}

export function shiftQuarterHour(
  hhmm: string,
  deltaMinutes: number,
  bounds?: { min: string; max: string },
): string {
  const current = parseHm(hhmm) ?? 0;
  let next = current + deltaMinutes;
  if (bounds) {
    const min = parseHm(bounds.min) ?? 0;
    const max = parseHm(bounds.max) ?? 22 * 60;
    if (next < min) next = min;
    if (next > max) next = max;
  }
  return formatHm(next);
}

export type MealTimeDraft = { label: string; time: string };

/** Slot order, 05:00–22:00, and at least 60 minutes between neighbours. */
export function validateMealTimes(slots: MealTimeDraft[]): string | null {
  const minutes: number[] = [];
  for (const slot of slots) {
    const value = parseHm(slot.time);
    if (value == null || value < 5 * 60 || value > 22 * 60) {
      return `${slot.label} needs to be between 5:00 am and 10:00 pm.`;
    }
    minutes.push(value);
  }
  for (let i = 1; i < slots.length; i += 1) {
    const gap = minutes[i]! - minutes[i - 1]!;
    if (gap < 60) {
      return `${slots[i]!.label} needs to be at least an hour after ${slots[i - 1]!.label}.`;
    }
  }
  return null;
}

export function mealReminderClock(mealTime: string): string | null {
  const value = parseHm(mealTime);
  if (value == null) return null;
  return formatHm(value + 40);
}
