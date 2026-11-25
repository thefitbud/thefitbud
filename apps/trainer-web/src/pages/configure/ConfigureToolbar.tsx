import type { CoachingConfiguration } from "@fitbud/contracts";
import { formatCivilDate, formatClockTime } from "@fitbud/core";

/** Civil YYYY-MM-DD of an instant in a timezone (Asia/Kolkata by default). */
export function civilDateIn(
  instant: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  if (!instant) return null;
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  const zone = timeZone?.trim() || "Asia/Kolkata";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return null;
  }
}

/** "Wed 21 Oct" for an instant, or null; never an ISO value. */
function dayLabel(
  instant: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  const civil = civilDateIn(instant, timeZone);
  if (!civil) return null;
  const label = formatCivilDate(civil);
  return label && !/^\d{4}-\d{2}-\d{2}/.test(label) ? label : null;
}

/**
 * The right-hand note in frames 148/149: "Draft saved 9:42 am" (or the day
 * when not today) and "Active since Mon 5 Oct · v3". Times are the trainer's
 * own clock (the browser zone), like every other "saved" time on the web.
 */
export function configureStatusNote(
  configuration: CoachingConfiguration | null,
  now: Date = new Date(),
): string | null {
  if (!configuration) return "Not saved yet";
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (configuration.status === "active") {
    const since = dayLabel(configuration.activatedAt, browserZone);
    return since
      ? `Active since ${since} · v${configuration.versionNumber}`
      : `Active · v${configuration.versionNumber}`;
  }
  if (configuration.status === "draft") {
    const savedDay = civilDateIn(configuration.updatedAt, browserZone);
    const today = civilDateIn(now.toISOString(), browserZone);
    if (savedDay && savedDay === today) {
      const time = formatClockTime(configuration.updatedAt);
      return time ? `Draft saved ${time}` : "Draft saved";
    }
    const day = dayLabel(configuration.updatedAt, browserZone);
    return day ? `Draft saved ${day}` : "Draft saved";
  }
  return null;
}
