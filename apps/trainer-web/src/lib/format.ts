import {
  formatCivilDate,
  formatInstant,
  formatRelative,
  formatTimeDiff,
} from "@fitbud/core";

/** @deprecated Prefer formatInstant from @fitbud/core. */
export function formatIsoDateTime(iso: string, timeZone?: string): string {
  return formatInstant(
    iso,
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
}

/** Civil localDate → product rule date ("Thu 15 Oct"). */
export function formatLocalDate(localDate: string): string {
  return formatCivilDate(localDate);
}

export function formatAgeMinutes(minutes: number, now = new Date()): string {
  const clamped = Math.max(0, minutes);
  const iso = new Date(now.getTime() - clamped * 60_000).toISOString();
  return formatRelative(iso, now);
}

export function traineeTimeDiffLabel(
  trainerTz: string,
  traineeTz: string,
): string | null {
  const label = formatTimeDiff(trainerTz, traineeTz, new Date());
  if (!label || label.toLowerCase().includes("same")) return null;
  return label;
}

export {
  formatCivilDate,
  formatInstant,
  formatRelative,
  formatTimeDiff,
};
