export function formatTimeDiff(
  trainerTimezone: string,
  traineeTimezone: string,
  at = new Date(),
): string {
  if (trainerTimezone === traineeTimezone) {
    return "same time";
  }
  const trainerOffset = timezoneOffsetMinutes(trainerTimezone, at);
  const traineeOffset = timezoneOffsetMinutes(traineeTimezone, at);
  const diffMinutes = traineeOffset - trainerOffset;
  if (diffMinutes === 0) {
    return "same time";
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
