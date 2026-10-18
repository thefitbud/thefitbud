/**
 * Shared date/time/name formatters (product rules §C / foundations §1.6.4).
 * Civil dates: "Thu 15 Oct" (no comma); year only when not current year.
 * Times: "7:30 am" lowercase. Relative times never go negative.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseCivilDate(localDate: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const trimmed = localDate.trim();
  // Accept ISO datetimes by taking the YYYY-MM-DD prefix.
  const civil =
    trimmed.length >= 10 && trimmed[4] === "-" && trimmed[7] === "-"
      ? trimmed.slice(0, 10)
      : trimmed;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(civil);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function civilUtcDate(parts: {
  year: number;
  month: number;
  day: number;
}): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

/** "Thu 15 Oct" or "Thu 15 Oct 2025" when not the current year. */
export function formatCivilDate(
  localDate: string,
  options?: { now?: Date; includeWeekday?: boolean },
): string {
  const parts = parseCivilDate(localDate);
  if (!parts) return localDate;
  const date = civilUtcDate(parts);
  const weekday = WEEKDAYS[date.getUTCDay()]!;
  const month = MONTHS[parts.month - 1]!;
  const now = options?.now ?? new Date();
  const yearPart =
    parts.year === now.getFullYear() ? "" : ` ${parts.year}`;
  if (options?.includeWeekday === false) {
    return `${parts.day} ${month}${yearPart}`;
  }
  return `${weekday} ${parts.day} ${month}${yearPart}`;
}

/** "7:30 am" / "10:00 pm" in the given IANA timezone (viewer default: local). */
export function formatClockTime(
  isoOrDate: string | Date,
  timeZone?: string,
): string {
  const date =
    typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  });
  const raw = formatter.format(date);
  return raw
    .replace(/\u202f/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s?am$/i, " am")
    .replace(/\s?pm$/i, " pm")
    .trim()
    .toLowerCase();
}

/** Clock-only "HH:MM" (24h plan/meal time) as "8:00 am" / "1:00 pm". */
export function formatHhMmTime(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!match) return hhmm;
  const hour = Number(match[1]);
  const minute = match[2]!;
  if (hour > 23 || Number(minute) > 59) return hhmm;
  const period = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

/**
 * Instant in a timezone: "13 Oct, 12:18 pm".
 * When `subjectTz` differs from `viewerTz`, append zone abbreviation
 * (e.g. "9:10 am GST") for client-local views.
 */
export function formatInstant(
  iso: string,
  timeZone: string,
  options?: { now?: Date; viewerTz?: string },
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = (
    parts.find((p) => p.type === "dayPeriod")?.value ?? ""
  ).toLowerCase();
  const time = `${hour}:${minute} ${dayPeriod}`.replace(/\s+/g, " ").trim();
  let out = `${day} ${month}, ${time}`;
  const viewerTz = options?.viewerTz;
  if (viewerTz && viewerTz !== timeZone) {
    const abbr = zoneAbbreviation(date, timeZone);
    if (abbr) out = `${day} ${month}, ${time} ${abbr}`;
  }
  return out;
}

function zoneAbbreviation(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
    hour: "2-digit",
  }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/**
 * Relative time. Negatives clamp to "just now".
 * Examples: "just now", "5 min ago", "2 h ago", "yesterday", "3 d ago", "in 2 d".
 */
export function formatRelative(
  iso: string,
  now: Date | string = new Date(),
): string {
  const then = Date.parse(iso);
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (Number.isNaN(then) || Number.isNaN(nowMs)) return "";
  let deltaSec = Math.round((nowMs - then) / 1000);
  if (deltaSec < 0) {
    // Future
    const ahead = -deltaSec;
    if (ahead < 60) return "just now";
    if (ahead < 3600) return `in ${Math.round(ahead / 60)} min`;
    if (ahead < 86_400) return `in ${Math.round(ahead / 3600)} h`;
    const days = Math.round(ahead / 86_400);
    if (days === 1) return "in 1 d";
    return `in ${days} d`;
  }
  if (deltaSec < 60) return "just now";
  if (deltaSec < 3600) {
    const mins = Math.round(deltaSec / 60);
    return `${mins} min ago`;
  }
  if (deltaSec < 86_400) {
    const hours = Math.round(deltaSec / 3600);
    return `${hours} h ago`;
  }
  const days = Math.round(deltaSec / 86_400);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} w ago`;
}

/** "Due by Wed 14 Oct, 11:59 pm" */
export function formatWindow(
  startIso: string,
  endIso: string,
  timeZone: string,
): string {
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return "";
  const civil = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(end);
  // en-CA → YYYY-MM-DD
  const localDate = civil;
  const dayLabel = formatCivilDate(localDate);
  const time = formatClockTime(end, timeZone);
  void startIso;
  return `Due by ${dayLabel}, ${time}`;
}

export function formatCount(n: number, unit: string): string {
  const abs = Math.abs(n);
  const plural = abs === 1 ? unit : `${unit}s`;
  return `${n} ${plural}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

export function formatWeight(kg: number, unit: "kg" | "lb" = "kg"): string {
  if (unit === "lb") {
    const lb = kg * 2.2046226218;
    return `${formatNumber(Math.round(lb * 10) / 10)} lb`;
  }
  return `${formatNumber(Math.round(kg * 10) / 10)} kg`;
}

export function formatKcal(
  n: number,
  unknown = false,
): string {
  const rounded = Math.round(n);
  const body = `${formatNumber(rounded)} kcal`;
  return unknown ? `≥ ${body}` : body;
}

/**
 * Title-case a person display name. Keeps existing capitals (McKenzie)
 * and single-letter initials.
 */
export function formatPersonName(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed
    .split(" ")
    .map((part) => {
      if (!part) return part;
      if (part.length === 1) return part.toUpperCase();
      // Preserve existing internal capitals (McKenzie, O'Brien)
      if (/[A-Z]/.test(part.slice(1))) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function formatTimeDiff(
  trainerTimezone: string,
  traineeTimezone: string,
  at = new Date(),
): string {
  if (trainerTimezone === traineeTimezone) {
    return "Same time as you";
  }
  const trainerOffset = timezoneOffsetMinutes(trainerTimezone, at);
  const traineeOffset = timezoneOffsetMinutes(traineeTimezone, at);
  const diffMinutes = traineeOffset - trainerOffset;
  if (diffMinutes === 0) {
    return "Same time as you";
  }
  const abs = Math.abs(diffMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} m`);
  }
  const span = parts.join(" ");
  return diffMinutes > 0
    ? `${span} ahead of you`
    : `${span} behind you`;
}

function timezoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = tz.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) {
    return 0;
  }
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const mins = Number(match[3] ?? 0);
  return sign * (hours * 60 + mins);
}

/** Date range: "Mon 12 Oct – Sun 18 Oct" */
export function formatDateRange(
  startLocalDate: string,
  endLocalDate: string,
): string {
  return `${formatCivilDate(startLocalDate)} – ${formatCivilDate(endLocalDate)}`;
}

/** Time range in am/pm: "10:00 pm – 7:00 am" */
export function formatTimeRange(
  startIso: string,
  endIso: string,
  timeZone?: string,
): string {
  return `${formatClockTime(startIso, timeZone)} – ${formatClockTime(endIso, timeZone)}`;
}
