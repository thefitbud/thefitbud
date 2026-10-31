import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CheckinReviewContext,
  CheckinReviewOutcome,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatInstant,
  labelFor,
} from "@fitbud/core";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { LinkedMedia } from "../components/LinkedMedia";
import { Button } from "../components/Button";
import { OverflowMenu } from "../components/OverflowMenu";
import { StatusChip } from "../components/StatusChip";
import { TimezoneBadge } from "../components/workspace/TimezoneBadge";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../components/StatePanels";
import { useOutletContext } from "react-router-dom";
import type { WorkspaceOutletContext } from "./workspaceContext";
import { useAuth } from "../auth/AuthProvider";
import { useOnline } from "../hooks/useOnline";

const OUTCOMES: Array<{ value: CheckinReviewOutcome; label: string }> = [
  { value: "acknowledged", label: "Acknowledged" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "adjust_coaching", label: "Adjust coaching" },
];

export function CheckinReviewPage() {
  const navigate = useNavigate();
  const online = useOnline();
  const { me } = useAuth();
  const [searchParams] = useSearchParams();
  const { relationshipId: routeRelationshipId = "", checkinId = "" } =
    useParams();
  const outlet = useOutletContext<WorkspaceOutletContext | undefined>();
  const workspace = outlet?.workspace ?? null;
  // The workspace stays mounted while it refreshes (#88), so refetch on its
  // refresh (saves, realtime hints) instead of relying on a remount.
  const refreshEpoch = outlet?.refreshEpoch ?? 0;

  const [context, setContext] = useState<CheckinReviewContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] =
    useState<CheckinReviewOutcome>("acknowledged");
  const [noteBody, setNoteBody] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [comparePhotos, setComparePhotos] = useState(false);
  const [nextReview, setNextReview] = useState<{
    checkinId: string;
    relationshipId: string;
  } | null>(null);

  const relationshipId =
    routeRelationshipId || context?.checkin.coachingRelationshipId || "";
  const clientName =
    workspace?.header.traineeDisplayName ?? "Client";
  const clientTz =
    workspace?.header.traineeTimezone ??
    me?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const trainerTz =
    me?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const clientWa = workspace?.header.clientWhatsappE164 ?? null;
  const fromInbox = searchParams.get("from") === "inbox";

  const load = useCallback(async () => {
    if (!checkinId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getCheckinReviewContext(checkinId);
      setContext(result);
      if (result.checkin.review) {
        setOutcome(result.checkin.review.outcome);
        setNoteBody(result.checkin.review.notes ?? "");
        setEditing(false);
      } else {
        setEditing(true);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load review context.",
      );
    } finally {
      setLoading(false);
    }
  }, [checkinId]);

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  useEffect(() => {
    if (!fromInbox || !checkinId) {
      setNextReview(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const inbox = await apiClient.listTrainerCheckinInbox();
        const submitted = inbox.items.filter(
          (row) => row.checkin.status === "submitted",
        );
        const index = submitted.findIndex((row) => row.checkin.id === checkinId);
        const next = index >= 0 ? submitted[index + 1] : undefined;
        if (!cancelled) {
          setNextReview(
            next
              ? {
                  checkinId: next.checkin.id,
                  relationshipId: next.coachingRelationshipId,
                }
              : null,
          );
        }
      } catch {
        if (!cancelled) setNextReview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromInbox, checkinId]);

  const adherenceLines = useMemo(() => {
    if (!context) return [];
    const w = context.recentWorkoutAdherence;
    const m = context.recentMealCompliance;
    const lines: string[] = [];
    const workoutTotal =
      w.completed + w.missed + w.modified + w.skipped + w.pending;
    if (w.completed > 0 && workoutTotal > 0) {
      lines.push(`${w.completed} of ${workoutTotal} workouts`);
    }
    if (w.modified > 0) lines.push(`${w.modified} workouts modified`);
    if (w.skipped > 0) lines.push(`${w.skipped} workouts skipped`);
    if (w.missed > 0) lines.push(`${w.missed} workouts missed`);
    if (m.modified > 0) lines.push(`${m.modified} meals changed`);
    if (m.skipped > 0) lines.push(`${m.skipped} meals skipped`);
    if (m.confirmed > 0) lines.push(`${m.confirmed} meals logged`);
    if (m.overdue > 0) lines.push(`${m.overdue} meals overdue`);
    return lines;
  }, [context]);

  const measurementLines = useMemo(() => {
    if (!context) return [];
    const byType = new Map<string, typeof context.measurements>();
    for (const row of context.measurements) {
      const list = byType.get(row.type) ?? [];
      list.push(row);
      byType.set(row.type, list);
    }
    const lines: Array<{
      key: string;
      label: string;
      text: string;
    }> = [];
    for (const [type, rows] of byType) {
      const sorted = [...rows].sort((a, b) =>
        b.observedAt.localeCompare(a.observedAt),
      );
      const latest = sorted[0]!;
      const previous = sorted[1];
      let text = `${latest.value}${latest.unit ? ` ${latest.unit}` : ""}`;
      if (previous) {
        const delta =
          Number.parseFloat(String(latest.value)) -
          Number.parseFloat(String(previous.value));
        if (Number.isFinite(delta)) {
          const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
          text += ` · ${sign}${Math.abs(delta).toFixed(1).replace(/\.0$/, "")} since ${formatCivilDate(previous.observedAt.slice(0, 10))}`;
        }
      }
      lines.push({
        key: type,
        label: labelFor("measurement_type", type),
        text,
      });
    }
    return lines;
  }, [context]);

  async function saveReview() {
    if (!checkinId || !online) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.recordCheckinReview(
        checkinId,
        {
          outcome,
          notes: noteBody.trim() ? noteBody.trim() : null,
        },
        createIdempotencyKey(),
      );
      if (noteBody.trim() && relationshipId) {
        await apiClient.createTrainerNote(
          relationshipId,
          {
            body: noteBody.trim(),
            visibility: visibleToClient ? "client" : "private",
            checkinId,
            subjectType: "checkin",
            subjectId: checkinId,
          },
          createIdempotencyKey(),
        );
      }
      setMessage("Review saved.");
      setEditing(false);
      await load();
      if (outcome === "adjust_coaching" && relationshipId) {
        navigate(`/clients/${relationshipId}/plan`);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not save review.",
      );
    } finally {
      setActing(false);
    }
  }

  async function scheduleNext() {
    if (!relationshipId || !checkinId || !online) return;
    setActing(true);
    setError(null);
    try {
      const result = await apiClient.scheduleNextCheckin(
        relationshipId,
        { fromCheckinId: checkinId },
        createIdempotencyKey(),
      );
      setMessage(
        result.created
          ? `Next check-in scheduled for ${formatCivilDate(result.checkin.localDate)}.`
          : `Next check-in already exists for ${formatCivilDate(result.checkin.localDate)}.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not schedule next check-in.",
      );
    } finally {
      setActing(false);
    }
  }

  const submittedLabel = context?.checkin.submittedAt
    ? `Weekly check-in · submitted ${formatInstant(context.checkin.submittedAt, clientTz)}`
    : context
      ? `Weekly check-in · due ${formatCivilDate(context.checkin.localDate)}`
      : "Weekly check-in";

  const alreadyReviewed = Boolean(context?.checkin.review) && !editing;
  const photos = context?.photos ?? [];

  return (
    <div
      className="workspace-page checkin-review-page"
      data-testid="screen-TW-20"
    >
      <header className="workspace-toolbar">
        <div>
          <h1 className="workspace-card-title">Check-in review</h1>
          <p className="lede">{submittedLabel}</p>
        </div>
        <div className="workspace-header-actions">
          {fromInbox && nextReview ? (
            <Link
              className="button-secondary"
              to={`/clients/${nextReview.relationshipId}/check-ins/${nextReview.checkinId}?from=inbox`}
            >
              Next ›
            </Link>
          ) : null}
          <Link
            className="button-ghost"
            to={
              relationshipId
                ? `/clients/${relationshipId}/check-ins`
                : "/checkins"
            }
          >
            Back
          </Link>
        </div>
      </header>

      {!online ? (
        <p className="offline-banner" role="status">
          You&apos;re offline. Saving is unavailable.
        </p>
      ) : null}

      {error ? (
        <ErrorState
          message={error}
          screenId="TW-20"
          onRetry={() => void load()}
        />
      ) : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}

      {loading ? <LoadingBlock label="Loading review…" /> : null}

      {!loading && !context ? (
        <EmptyState title="Check-in not found." />
      ) : null}

      {context ? (
        <>
          <div className="checkin-review-columns">
            <div className="checkin-review-main">
              <section className="workspace-card" aria-labelledby="answers-h">
                <h2 id="answers-h" className="workspace-card-title">
                  Answers
                </h2>
                <p className="muted">
                  Form v{context.pinnedForm.version} (pinned)
                </p>
                {context.checkin.status === "due" ||
                context.checkin.status === "overdue" ||
                context.checkin.status === "scheduled" ? (
                  <p>
                    Due by {formatCivilDate(context.checkin.localDate)}, 11:59 pm
                  </p>
                ) : null}
                {context.checkin.answers ? (
                  <dl className="detail-list">
                    {context.pinnedForm.fields.map((field) => {
                      const answers = context.checkin.answers!;
                      let value: string = "—";
                      if (field.type === "measurement") {
                        const raw =
                          answers.fieldAnswers?.[field.id] ??
                          answers.bodyWeightKg;
                        value =
                          raw != null && raw !== ""
                            ? `${raw}${field.measurementType === "body_weight_kg" ? " kg" : ""}`
                            : "—";
                      } else if (field.type === "photo_intent") {
                        value = answers.photoIntent
                          ? "Photo noted"
                          : answers.fieldAnswers?.[field.id]
                            ? "Photo noted"
                            : "—";
                      } else {
                        const raw =
                          answers.fieldAnswers?.[field.id] ??
                          (field.id === "wellbeing"
                            ? answers.wellbeing
                            : field.id === "notes"
                              ? answers.notes
                              : undefined);
                        value =
                          raw != null && String(raw).trim() !== ""
                            ? String(raw)
                            : "—";
                      }
                      return (
                        <div key={field.id}>
                          <dt>{field.label}</dt>
                          <dd>{value}</dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : (
                  <p className="workspace-empty">
                    {context.checkin.recordStatus === "draft"
                      ? `${clientName.split(" ")[0]} has started but not submitted.`
                      : "No answers submitted yet."}
                  </p>
                )}
              </section>

              <section
                className="workspace-card"
                aria-labelledby="measurements-h"
              >
                <h2 id="measurements-h" className="workspace-card-title">
                  Measurements
                </h2>
                {measurementLines.length === 0 ? (
                  <p className="muted">No measurements in this review.</p>
                ) : (
                  <ul className="workspace-list">
                    {measurementLines.map((line) => (
                      <li key={line.key}>
                        <strong>{line.label}</strong> · {line.text}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="workspace-card" aria-labelledby="photos-h">
                <div className="workspace-card-head">
                  <h2 id="photos-h" className="workspace-card-title">
                    Photos
                  </h2>
                  {photos.length >= 2 ? (
                    <Button
                      variant="secondary"
                      onClick={() => setComparePhotos((v) => !v)}
                    >
                      Compare with last
                    </Button>
                  ) : null}
                </div>
                {photos.length === 0 ? (
                  <p className="muted">No photos.</p>
                ) : (
                  <ul className="progress-photo-grid">
                    {photos.map((photo) => (
                      <li key={photo.id}>
                        <LinkedMedia
                          mediaAssetId={photo.id}
                          label="Check-in photo"
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {comparePhotos && photos.length >= 2 ? (
                  <div className="progress-compare">
                    <LinkedMedia
                      mediaAssetId={photos[photos.length - 1]!.id}
                      label="Latest"
                    />
                    <LinkedMedia
                      mediaAssetId={photos[photos.length - 2]!.id}
                      label="Previous"
                    />
                  </div>
                ) : null}
              </section>
            </div>

            <aside className="checkin-review-side">
              <section className="workspace-card" aria-labelledby="since-h">
                <h2 id="since-h" className="workspace-card-title">
                  Since last check-in
                </h2>
                {adherenceLines.length === 0 ? (
                  <p className="muted">No activity counted in this period.</p>
                ) : (
                  <ul>
                    {adherenceLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="workspace-card" aria-labelledby="open-h">
                <h2 id="open-h" className="workspace-card-title">
                  Open items
                </h2>
                {context.activeExceptions.length === 0 ? (
                  <p className="muted">No open exceptions.</p>
                ) : (
                  <ul className="activity-list">
                    {context.activeExceptions.map((item) => (
                      <li key={item.id} className="activity-row">
                        <div className="workspace-row-copy">
                          <p className="workspace-row-title">{item.summary}</p>
                          <StatusChip kind="severity" value={item.severity} />
                        </div>
                        <Link
                          className="button-tinted"
                          to={`/clients/${relationshipId}?exception=${item.id}`}
                        >
                          Review
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {context.currentConfiguration ? (
                <p className="muted">
                  Cadence:{" "}
                  {labelFor(
                    "checkin_cadence",
                    context.currentConfiguration.checkinCadence,
                  )}
                </p>
              ) : null}
            </aside>
          </div>

          <div className="checkin-review-bar" data-testid="review-action-bar">
            {alreadyReviewed ? (
              <>
                <p>
                  Reviewed ·{" "}
                  {labelFor(
                    "checkin_review_outcome",
                    context.checkin.review!.outcome,
                  )}{" "}
                  · {formatCivilDate(context.checkin.review!.createdAt.slice(0, 10))}
                </p>
                <div className="review-bar-actions">
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    Edit review
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div
                  className="segment"
                  role="group"
                  aria-label="Outcome"
                >
                  {OUTCOMES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={
                        outcome === opt.value
                          ? "segment-btn is-on"
                          : "segment-btn"
                      }
                      aria-pressed={outcome === opt.value}
                      onClick={() => setOutcome(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <label className="field review-note-field">
                  <span>Note</span>
                  <textarea
                    rows={2}
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    maxLength={2000}
                    placeholder="Optional note"
                  />
                </label>
                <label className="review-visible-toggle">
                  <input
                    type="checkbox"
                    checked={visibleToClient}
                    onChange={(e) => setVisibleToClient(e.target.checked)}
                  />
                  Visible to client
                </label>
                <div className="review-bar-actions">
                  <Button
                    variant="primary"
                    disabled={acting || !online}
                    onClick={() => void saveReview()}
                  >
                    {acting ? "Saving…" : "Save review"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={acting || !online}
                    onClick={() => void scheduleNext()}
                  >
                    Schedule next
                  </Button>
                  <TimezoneBadge
                    traineeName={clientName}
                    traineeTimezone={clientTz}
                    trainerTimezone={trainerTz}
                  />
                  <OverflowMenu
                    label="More review actions"
                    items={[
                      {
                        id: "whatsapp",
                        label: "WhatsApp client",
                        disabled: !clientWa,
                        onSelect: () => {
                          if (!clientWa) return;
                          const text = encodeURIComponent(
                            `Reviewed your check-in — open it in FitBud: /checkin/${checkinId}`,
                          );
                          window.open(
                            `https://wa.me/${clientWa.replace(/\D/g, "")}?text=${text}`,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        },
                      },
                      {
                        id: "adjust-plan",
                        label: "Adjust plan",
                        onSelect: () => {
                          if (relationshipId) {
                            navigate(`/clients/${relationshipId}/plan`);
                          }
                        },
                      },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
