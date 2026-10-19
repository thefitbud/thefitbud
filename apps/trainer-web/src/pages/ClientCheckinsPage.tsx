import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { Checkin, CheckinFormTemplateSummary } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatInstant,
  formatTimeDiff,
  labelFor,
  possessivePronoun,
} from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { Button } from "../components/Button";
import { StatusChip } from "../components/StatusChip";
import { TimezoneBadge } from "../components/workspace/TimezoneBadge";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../components/StatePanels";
import type { WorkspaceOutletContext } from "./workspaceContext";

export function ClientCheckinsPage() {
  const { me } = useAuth();
  const trainerTz =
    me?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const { relationshipId = "" } = useParams();
  const {
    workspace,
    online,
    ended,
    refreshEpoch = 0,
  } = useOutletContext<WorkspaceOutletContext>();

  const clientTz =
    workspace?.header.traineeTimezone ?? trainerTz;
  const clientName = workspace?.header.traineeDisplayName ?? "Client";
  const pronoun = possessivePronoun(workspace?.header.traineeProfile.gender);

  const [items, setItems] = useState<Checkin[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [forms, setForms] = useState<CheckinFormTemplateSummary[]>([]);
  const [formVersionId, setFormVersionId] = useState<string>("");

  const load = useCallback(
    async (cursor?: string | null) => {
      if (!relationshipId) return;
      const appending = Boolean(cursor);
      if (appending) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await apiClient.listCheckins(relationshipId, {
          cursor: cursor ?? undefined,
          limit: 30,
        });
        setItems((current) =>
          appending ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load check-ins.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [relationshipId],
  );

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  useEffect(() => {
    void apiClient.listCheckinFormTemplates({ limit: 50, scope: "all" }).then(
      (result) => setForms(result.items),
      () => setForms([]),
    );
  }, []);

  const preview = useMemo(() => {
    if (!scheduleDate) return null;
    const dueLocal = `${scheduleDate}T23:59:00`;
    // Approximate: show civil due in client TZ label + trainer clock for same instant mid-day.
    const mid = new Date(`${scheduleDate}T18:29:00.000Z`);
    const clientLabel = formatCivilDate(scheduleDate);
    const trainerClock = formatClockTime(mid, trainerTz);
    const diff = formatTimeDiff(trainerTz, clientTz, mid);
    return `Due ${clientLabel}, 11:59 pm ${clientName.split(" ")[0] ?? clientName}'s time (${trainerClock} your time${diff ? ` · ${diff}` : ""})`;
  }, [scheduleDate, clientName, clientTz, trainerTz]);

  async function openSchedule() {
    setShowSchedule(true);
    setMessage(null);
    if (!scheduleDate) {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: clientTz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      setScheduleDate(today);
    }
    if (!formVersionId && forms[0]) {
      setFormVersionId(forms[0].latestVersionId);
    }
  }

  async function scheduleCheckin() {
    if (!relationshipId || !scheduleDate || !online || ended) return;
    setScheduling(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.scheduleCheckin(
        relationshipId,
        {
          localDate: scheduleDate,
          ...(formVersionId ? { checkinFormVersionId: formVersionId } : {}),
        },
        createIdempotencyKey(),
      );
      setMessage(
        result.created
          ? `Scheduled check-in for ${formatCivilDate(result.checkin.localDate)}.`
          : `Check-in for ${formatCivilDate(result.checkin.localDate)} already exists.`,
      );
      setShowSchedule(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not schedule check-in.",
      );
    } finally {
      setScheduling(false);
    }
  }

  return (
    <div className="workspace-page" data-testid="screen-TW-19">
      <header className="workspace-toolbar">
        <div>
          <h1 className="workspace-card-title">Check-ins</h1>
          <p className="lede">
            History and upcoming check-ins for {clientName}.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={!online || ended}
          onClick={() => void openSchedule()}
        >
          Schedule check-in
        </Button>
      </header>

      {!online ? (
        <p className="offline-banner" role="status">
          You&apos;re offline. Scheduling is unavailable.
        </p>
      ) : null}

      {error ? (
        <ErrorState message={error} screenId="TW-19" onRetry={() => void load()} />
      ) : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}

      {showSchedule ? (
        <section
          className="workspace-card schedule-checkin-panel"
          aria-labelledby="schedule-heading"
        >
          <h2 id="schedule-heading" className="workspace-card-title">
            Schedule check-in
          </h2>
          <TimezoneBadge
            traineeName={clientName}
            traineeTimezone={clientTz}
            trainerTimezone={trainerTz}
          />
          <label className="field">
            <span>Date ({clientName.split(" ")[0]}&apos;s time)</span>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Form</span>
            <select
              value={formVersionId}
              onChange={(e) => setFormVersionId(e.target.value)}
            >
              <option value="">Default weekly form</option>
              {forms.map((form) => (
                <option key={form.id} value={form.latestVersionId}>
                  {form.name}
                </option>
              ))}
            </select>
          </label>
          {preview ? <p className="lede">{preview}</p> : null}
          <div className="button-row">
            <Button
              variant="primary"
              disabled={scheduling || !scheduleDate || !online}
              onClick={() => void scheduleCheckin()}
            >
              {scheduling ? "Scheduling…" : "Schedule"}
            </Button>
            <Button variant="tertiary" onClick={() => setShowSchedule(false)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {loading ? <LoadingBlock label="Loading check-ins…" /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title={`No check-ins yet. They'll appear here based on ${pronoun} weekly schedule.`}
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="table-wrap">
          <table className="checkins-table">
            <thead>
              <tr>
                <th scope="col">Due window</th>
                <th scope="col">Form</th>
                <th scope="col">Status</th>
                <th scope="col">Outcome</th>
                <th scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div>{formatCivilDate(item.localDate)}</div>
                    <div className="muted">
                      Ends {formatInstant(item.windowEndsAt, clientTz)}
                    </div>
                  </td>
                  <td>Weekly check-in</td>
                  <td>
                    <StatusChip kind="checkin" value={item.status} />
                  </td>
                  <td>
                    {item.review ? (
                      <StatusChip
                        kind="checkin"
                        value="reviewed"
                        label={labelFor(
                          "checkin_review_outcome",
                          item.review.outcome,
                        )}
                      />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <Link
                      className="button-tinted"
                      to={`/clients/${relationshipId}/check-ins/${item.id}`}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {nextCursor ? (
        <Button
          variant="secondary"
          disabled={loadingMore}
          onClick={() => void load(nextCursor)}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
