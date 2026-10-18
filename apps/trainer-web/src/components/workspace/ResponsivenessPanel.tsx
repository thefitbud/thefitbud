import { useEffect, useState } from "react";
import type { ResponsivenessResponse } from "@fitbud/contracts";
import { formatHhMmTime } from "@fitbud/core";
import { stage1Api } from "../../lib/stage1-api";
import { LoadingBlock } from "../StatePanels";

const LABEL_COPY: Record<
  ResponsivenessResponse["label"],
  string
> = {
  logs_on_own: "Logs on their own · rarely needs reminders",
  responds: "Responds to reminders",
  often_misses: "Often misses reminders",
  reminders_paused: "Reminders paused",
  notifications_off: "Notifications off",
  not_enough_data: "Not enough data yet",
};

export function quietHoursText(
  data: Pick<ResponsivenessResponse, "quietHoursStart" | "quietHoursEnd">,
): string | null {
  if (!data.quietHoursStart || !data.quietHoursEnd) return null;
  return `${formatHhMmTime(data.quietHoursStart)} – ${formatHhMmTime(data.quietHoursEnd)}`;
}

function compactHeadline(data: ResponsivenessResponse): string {
  const { sent, opened } = data.counts;
  switch (data.label) {
    case "responds":
      return `Responds to ${opened} of ${sent} reminders`;
    case "often_misses":
      return `Often misses reminders · ${opened} of ${sent} opened`;
    case "not_enough_data":
      return sent > 0
        ? `Not enough data yet · ${sent} sent`
        : LABEL_COPY.not_enough_data;
    default:
      return LABEL_COPY[data.label];
  }
}

export function ResponsivenessPanel({
  relationshipId,
  compact = false,
}: {
  relationshipId: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<ResponsivenessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void stage1Api
      .getResponsiveness(relationshipId, 14)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load reminders data.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [relationshipId]);

  if (error) {
    return <p className="muted">{error}</p>;
  }
  if (!data) return <LoadingBlock label="Loading reminder responsiveness…" />;

  const summary = LABEL_COPY[data.label];

  const quiet = quietHoursText(data);
  const subParts = [
    "Last 14 days",
    data.pushEnabled === undefined
      ? null
      : data.pushEnabled
        ? "push on"
        : "push off",
    quiet ? `quiet hours ${quiet}` : null,
  ].filter(Boolean);

  if (compact) {
    return (
      <div className="responsiveness-line">
        <div className="ov-big">{compactHeadline(data)}</div>
        <div className="ov-sub">{subParts.join(" · ")}</div>
      </div>
    );
  }

  return (
    <div className="responsiveness-panel">
      <h3>Reminder responsiveness</h3>
      <p>{summary}</p>
      <p className="muted">{subParts.join(" · ")}</p>
      <dl className="detail-list compact">
        <div>
          <dt>Sent</dt>
          <dd>{data.counts.sent}</dd>
        </div>
        <div>
          <dt>Opened</dt>
          <dd>{data.counts.opened}</dd>
        </div>
        <div>
          <dt>Logged after reminder</dt>
          <dd>{data.counts.loggedAfter}</dd>
        </div>
      </dl>
    </div>
  );
}
