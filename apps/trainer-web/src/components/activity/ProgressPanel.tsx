import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { Measurement } from "@fitbud/contracts";
import { formatCivilDate, formatLocalDate, labelFor } from "@fitbud/core";
import { apiClient } from "../../lib/api";
import { coachEntryTag, isWithinWindow } from "../../pages/log-entry/logEntryModel";
import { LoadingBlock } from "../StatePanels";
import "../../pages/log-entry/log-entry.css";

/** "72.4 kg" / "88 cm": the stored value with its unit, no rounding. */
function valueLabel(row: Measurement): string {
  return `${row.value} ${row.unit}`;
}

/**
 * The client's recent body measurements with the trainer's entry points: Log
 * measurement, and Edit on every entry dated within the last 7 days (R2) that
 * did not come from a check-in. Ended clients get neither.
 */
export function ProgressPanel({
  relationshipId,
  clientTimezone,
  ended,
}: {
  relationshipId: string;
  clientTimezone: string;
  ended: boolean;
}) {
  const [rows, setRows] = useState<Measurement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    void (async () => {
      try {
        const list = await apiClient.listMeasurements(relationshipId);
        if (!cancelled) setRows(list.items);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : "Could not load measurements.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relationshipId]);

  const today = formatLocalDate(new Date(), clientTimezone);

  return (
    <section className="activity-panel" data-testid="progress-panel" aria-label="Measurements">
      <header className="activity-panel-head">
        <h2>Measurements</h2>
      </header>
      {!ended ? (
        <Link className="button-secondary" to={`/clients/${relationshipId}/log-entry/measurement`}>
          Log measurement
        </Link>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && rows === null ? <LoadingBlock label="Loading measurements…" /> : null}
      {rows !== null && rows.length === 0 ? <p className="muted">No measurements yet.</p> : null}
      {rows !== null && rows.length > 0 ? (
        <ul className="le-list">
          {rows.slice(0, 10).map((row) => {
            const day = formatLocalDate(new Date(row.observedAt), clientTimezone);
            const tag = coachEntryTag(row, clientTimezone);
            const canEdit =
              !ended &&
              row.source !== "checkin" &&
              row.checkinId === null &&
              isWithinWindow(day, today);
            return (
              <li className="le-row" key={row.id}>
                <span>
                  <strong>
                    {labelFor("measurement_type", row.type)} · {valueLabel(row)}
                  </strong>
                  <span className="muted">
                    {formatCivilDate(day)}
                    {tag ? ` · ${tag}` : ""}
                  </span>
                </span>
                {canEdit ? (
                  <Link
                    className="button-secondary"
                    aria-label={`Edit ${labelFor("measurement_type", row.type)} ${formatCivilDate(day)}`}
                    to={`/clients/${relationshipId}/log-entry/measurement/${row.id}`}
                  >
                    Edit
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
