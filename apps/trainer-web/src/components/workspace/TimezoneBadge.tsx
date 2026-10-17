import { useEffect, useState } from "react";
import { formatTimeDiff } from "@fitbud/core";

export function TimezoneBadge({
  traineeName,
  traineeTimezone,
  trainerTimezone,
}: {
  traineeName: string;
  traineeTimezone: string;
  trainerTimezone: string;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const diff = formatTimeDiff(trainerTimezone, traineeTimezone, now);
  if (!diff || diff.toLowerCase().includes("same")) return null;

  const localTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: traineeTimezone,
  }).format(now);

  const first = traineeName.split(" ")[0] ?? traineeName;

  return (
    <span className="timezone-badge" title={traineeTimezone}>
      {first}&apos;s time {localTime} · {diff}
    </span>
  );
}
