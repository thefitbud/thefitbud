import { useEffect, useState } from "react";
import type { ResponsivenessResponse } from "@fitbud/contracts";
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
  const detail = `${data.counts.opened} of ${data.counts.sent} reminders opened this week`;

  if (compact) {
    return (
      <p className="responsiveness-line">
        <strong>{summary}</strong>
        {data.label === "responds" || data.label === "often_misses" ? (
          <span className="muted"> · {detail}</span>
        ) : null}
      </p>
    );
  }

  return (
    <div className="responsiveness-panel">
      <h3>Reminder responsiveness</h3>
      <p>{summary}</p>
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
