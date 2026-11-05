import { useEffect, useState } from "react";
import type {
  ResponsivenessCategoryCounts,
  ResponsivenessResponse,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatHhMmTime,
  possessivePronoun,
} from "@fitbud/core";
import { stage1Api } from "../../lib/stage1-api";
import { clientWhatsappHref } from "../../lib/whatsapp";
import { LoadingBlock } from "../StatePanels";

function labelTitle(
  label: ResponsivenessResponse["label"],
): string {
  switch (label) {
    case "logs_on_own":
      return "Logs on own";
    case "responds":
      return "Responds to reminders";
    case "often_misses":
      return "Often misses reminders";
    case "reminders_paused":
      return "Reminders paused";
    case "notifications_off":
      return "Notifications off";
    case "not_enough_data":
      return "Not enough data";
  }
}

function summaryCounts(data: ResponsivenessResponse): string {
  const { sent, opened, loggedAfter, loggedBefore } = data.counts;
  switch (data.label) {
    case "logs_on_own":
      return `Logged ${loggedBefore} of ${Math.max(sent, loggedBefore + loggedAfter)} before a reminder`;
    case "responds":
      return `Logged ${loggedAfter} of ${sent} after a reminder · ${opened} opened`;
    case "often_misses":
      return `${sent} reminders sent · ${opened} opened · ${loggedAfter} logged after`;
    case "reminders_paused":
      return data.pausedUntil
        ? `Paused until ${formatCivilDate(data.pausedUntil.slice(0, 10))}`
        : "Paused for this client";
    case "notifications_off":
      return sent > 0 ? `${sent} sent · push off` : "Push notifications off";
    case "not_enough_data":
      return sent > 0 ? `${sent} sent · need more history` : "Fewer than 5 reminders in 14 days";
    default:
      return labelTitle(data.label);
  }
}

export function quietHoursText(
  data: Pick<ResponsivenessResponse, "quietHoursStart" | "quietHoursEnd">,
): string | null {
  if (!data.quietHoursStart || !data.quietHoursEnd) return null;
  return `${formatHhMmTime(data.quietHoursStart)} – ${formatHhMmTime(data.quietHoursEnd)}`;
}

export function compactHeadline(
  data: ResponsivenessResponse,
  // Kept so callers (ExceptionDrawer, out of scope for H2) still compile; drop it with that file.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pronoun: string,
): string {
  return `${labelTitle(data.label)} · ${summaryCounts(data)}`;
}

function formatOpened(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

function CategoryTable({
  title,
  row,
}: {
  title: string;
  row: ResponsivenessCategoryCounts;
}) {
  return (
    <div className="responsiveness-category">
      <h4>{title}</h4>
      <table className="responsiveness-table">
        <thead>
          <tr>
            <th scope="col">Sent</th>
            <th scope="col">Opened</th>
            <th scope="col">Logged after</th>
            <th scope="col">Logged on own</th>
            <th scope="col">Not logged</th>
            <th scope="col">Suppressed</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{row.sent}</td>
            <td>{formatOpened(row.opened)}</td>
            <td>{row.loggedAfter}</td>
            <td>{row.loggedOnOwn}</td>
            <td>{row.notLogged}</td>
            <td>{row.suppressed}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ResponsivenessPanel({
  relationshipId,
  compact = false,
  gender,
  traineeFirstName = "Client",
  clientWhatsappE164,
  refreshEpoch = 0,
}: {
  relationshipId: string;
  compact?: boolean;
  gender?: string | null;
  traineeFirstName?: string;
  clientWhatsappE164?: string | null;
  /** Workspace refresh counter: the panel refetches on a refresh, keeping its data on screen. */
  refreshEpoch?: number;
}) {
  const pronoun = possessivePronoun(gender);
  const [data, setData] = useState<ResponsivenessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void stage1Api
      .getResponsiveness(relationshipId, 14)
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load reminders data.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [relationshipId, refreshEpoch]);

  // A failed background refresh keeps the data already on screen.
  if (error && !data) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }
  if (!data) return <LoadingBlock label="Loading reminder responsiveness…" />;

  const quiet = quietHoursText(data);
  const preferred =
    data.preferredWorkoutTime && data.preferredWorkoutTimeSource
      ? `~${formatHhMmTime(data.preferredWorkoutTime)}, ${data.preferredWorkoutTimeSource}`
      : data.preferredWorkoutTime
        ? `~${formatHhMmTime(data.preferredWorkoutTime)}`
        : null;

  const waSuggestHref =
    data.label === "notifications_off"
      ? clientWhatsappHref({
          phoneE164: clientWhatsappE164,
          name: traineeFirstName,
          onboardingStatus: "active",
        })
      : null;

  if (compact) {
    return (
      <div className="responsiveness-line">
        <div className="ov-big">{compactHeadline(data, pronoun)}</div>
        <div className="ov-sub">Last 14 days{quiet ? ` · Quiet hours ${quiet}` : ""}</div>
        {data.label === "notifications_off" ? (
          <p className="ov-sub muted">
            Ask {traineeFirstName} to turn on notifications · WhatsApp
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="responsiveness-panel">
      <p className="responsiveness-summary">
        <strong>{labelTitle(data.label)}</strong>
        <span className="muted"> · {summaryCounts(data)}</span>
      </p>
      {data.label === "notifications_off" ? (
        <p className="muted">
          {waSuggestHref ? (
            <a href={waSuggestHref} target="_blank" rel="noreferrer">
              Ask {traineeFirstName} to turn on notifications · WhatsApp
            </a>
          ) : (
            <>Ask {traineeFirstName} to turn on notifications · WhatsApp</>
          )}
        </p>
      ) : null}
      {quiet ? (
        <p className="muted">
          Quiet hours · {quiet}
        </p>
      ) : null}
      {preferred ? (
        <p className="muted">Preferred workout time · {preferred}</p>
      ) : null}

      {data.categories ? (
        <div className="responsiveness-categories">
          <CategoryTable title="Workouts" row={data.categories.workouts} />
          <CategoryTable title="Meals" row={data.categories.meals} />
          <CategoryTable title="Check-ins" row={data.categories.checkins} />
        </div>
      ) : null}

      <p className="responsiveness-wa-block muted">
        WhatsApp reminders · <strong>Coming soon</strong>
      </p>

      <p className="responsiveness-footer muted">
        Reminders are timed by FitBud and respect {traineeFirstName}&apos;s settings
        and meal times. You can switch categories on or off in Configure.
      </p>
    </div>
  );
}
