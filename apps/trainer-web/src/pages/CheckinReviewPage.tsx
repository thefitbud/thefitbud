import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { userFacingMessage } from "@fitbud/api-client";
import type {
  CheckinFieldDefinition,
  CheckinReviewContext,
  CheckinReviewOutcome,
} from "@fitbud/contracts";
import {
  checkinAnswerEntries,
  formatCivilDate,
  formatInstant,
  labelFor,
} from "@fitbud/core";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
} from "lucide-react";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { LinkedMedia } from "../components/LinkedMedia";
import { Button } from "../components/Button";
import { OverflowMenu } from "../components/OverflowMenu";
import { StatusChip } from "../components/StatusChip";
import { Pill } from "../components/ui/Pill";
import { WhatsAppGlyph } from "../components/WhatsAppGlyph";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../components/StatePanels";
import { useOutletContext } from "react-router-dom";
import type { WorkspaceOutletContext } from "./workspaceContext";
import { useAuth } from "../auth/AuthProvider";
import { useOnline } from "../hooks/useOnline";
import "./CheckinReviewPage.css";

const OUTCOMES: Array<{ value: CheckinReviewOutcome; label: string }> = [
  { value: "acknowledged", label: "Acknowledged" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "adjust_coaching", label: "Adjust coaching" },
];

type CheckinAnswerEntry = ReturnType<typeof checkinAnswerEntries>[number];

/** Answer text as the trainer reads it: the stored value, with its unit. */
function answerText(
  entry: CheckinAnswerEntry,
  field: CheckinFieldDefinition | undefined,
): string {
  const { value } = entry;
  if (entry.type === "photo_intent") return "Photo noted";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.map((id) => optionLabel(field, id)).join(", ");
  }
  if (typeof value === "number") {
    return entry.type === "measurement" && entry.unit
      ? `${value} ${entry.unit}`
      : String(value);
  }
  if (typeof value === "string") {
    return entry.type === "single_choice" ? optionLabel(field, value) : value;
  }
  return "";
}

function optionLabel(
  field: CheckinFieldDefinition | undefined,
  id: string,
): string {
  if (
    field &&
    (field.type === "single_choice" || field.type === "multiple_choice")
  ) {
    return field.options.find((option) => option.id === id)?.label ?? id;
  }
  return id;
}

function looksLikePain(label: string, text: string): boolean {
  const hay = `${label} ${text}`.toLowerCase();
  return /hurt|pain|ache|stiff|sore|injur/.test(hay);
}

export function CheckinReviewPage() {
  const navigate = useNavigate();
  const online = useOnline();
  const { me } = useAuth();
  const [searchParams] = useSearchParams();
  const { relationshipId: routeRelationshipId = "", checkinId = "" } =
    useParams();
  const outlet = useOutletContext<WorkspaceOutletContext | undefined>();
  const workspace = outlet?.workspace ?? null;
  const refreshEpoch = outlet?.refreshEpoch ?? 0;

  const [context, setContext] = useState<CheckinReviewContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CheckinReviewOutcome>("acknowledged");
  const [noteBody, setNoteBody] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Read by a background refresh, which must never discard a review being edited.
  const editingRef = useRef(editing);
  useLayoutEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  // Only the newest load may apply its response (a refresh can overlap a save
  // or a change of check-in and resolve out of order).
  const latestLoad = useRef(0);
  const [comparePhotos, setComparePhotos] = useState(false);
  type ReviewStop = { checkinId: string; relationshipId: string };
  const [pager, setPager] = useState<{
    index: number;
    total: number;
    prev: ReviewStop | null;
    next: ReviewStop | null;
  } | null>(null);

  const relationshipId =
    routeRelationshipId || context?.checkin.coachingRelationshipId || "";
  const clientName = workspace?.header.traineeDisplayName ?? "Client";
  const firstName = clientName.trim().split(/\s+/)[0] || "Client";
  const clientTz =
    workspace?.header.traineeTimezone ??
    me?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const trainerTz =
    me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const clientWa = workspace?.header.clientWhatsappE164 ?? null;
  const fromInbox = searchParams.get("from") === "inbox";
  // Keep "from the inbox" through the pager so Back-style context survives.
  const pagerQuery = fromInbox ? "?from=inbox" : "";

  /**
   * "initial" (open, change of check-in, after a save) shows the loading state
   * and seeds the review form. "refresh" (workspace refresh: saves elsewhere,
   * realtime hints) updates the data quietly and leaves a form the trainer is
   * editing untouched.
   */
  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!checkinId) return;
      const loadId = ++latestLoad.current;
      if (mode === "initial") setLoading(true);
      setError(null);
      try {
        const result = await apiClient.getCheckinReviewContext(checkinId);
        if (loadId !== latestLoad.current) return;
        setContext(result);
        if (mode === "refresh" && editingRef.current) return;
        if (result.checkin.review) {
          setOutcome(result.checkin.review.outcome);
          setNoteBody(result.checkin.review.notes ?? "");
          setEditing(false);
        } else {
          setEditing(true);
        }
      } catch (err) {
        if (loadId !== latestLoad.current) return;
        setError(
          userFacingMessage(err, {
            fallback: "Could not load review context.",
          }),
        );
      } finally {
        // The newest load ends loading, whichever mode it is (it may supersede an initial one).
        if (loadId === latestLoad.current) setLoading(false);
      }
    },
    [checkinId],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  // The workspace stays mounted while it refreshes (#88): refetch on its
  // refresh instead of relying on a remount.
  const seenRefreshEpoch = useRef(refreshEpoch);
  useEffect(() => {
    if (seenRefreshEpoch.current === refreshEpoch) return;
    seenRefreshEpoch.current = refreshEpoch;
    void load("refresh");
  }, [load, refreshEpoch]);

  useEffect(() => {
    // "2 of 3 to review": the to-review queue in inbox order, with the
    // neighbours either side. Shown only when this check-in is in that queue.
    if (!checkinId) {
      setPager(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const inbox = await apiClient.listTrainerCheckinInbox();
        const queue = inbox.items.filter(
          (row) => row.checkin.status === "submitted",
        );
        const index = queue.findIndex((row) => row.checkin.id === checkinId);
        const stop = (
          row: (typeof queue)[number] | undefined,
        ): ReviewStop | null =>
          row
            ? {
                checkinId: row.checkin.id,
                relationshipId: row.coachingRelationshipId,
              }
            : null;
        if (!cancelled) {
          setPager(
            index >= 0
              ? {
                  index: index + 1,
                  total: queue.length,
                  prev: stop(queue[index - 1]),
                  next: stop(queue[index + 1]),
                }
              : null,
          );
        }
      } catch {
        // The pager is a convenience; the review loads and saves without it.
        if (!cancelled) setPager(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkinId]);

  const contextRows = useMemo(() => {
    if (!context) return [];
    const w = context.recentWorkoutAdherence;
    const m = context.recentMealCompliance;
    const rows: Array<{ label: string; text: string }> = [];
    const workoutTotal =
      w.completed + w.missed + w.modified + w.skipped + w.pending;
    if (workoutTotal > 0) {
      const missedBits: string[] = [];
      if (w.missed > 0) missedBits.push(`missed ${w.missed}`);
      if (w.modified > 0) missedBits.push(`${w.modified} modified`);
      if (w.skipped > 0) missedBits.push(`${w.skipped} skipped`);
      rows.push({
        label: "Workouts",
        text:
          missedBits.length > 0
            ? `${w.completed} of ${workoutTotal} · ${missedBits.join(", ")}`
            : `${w.completed} of ${workoutTotal}`,
      });
    }
    const mealTotal =
      m.confirmed + m.modified + m.skipped + m.overdue + m.pending;
    const mealsLogged = m.confirmed + m.modified + m.skipped;
    if (mealTotal > 0) {
      rows.push({
        label: "Meals logged",
        text: `${mealsLogged} of ${mealTotal}`,
      });
    }
    const weight = context.measurements.find(
      (row) =>
        row.type === "body_weight_kg" ||
        row.type === "weight" ||
        /weight/i.test(row.type),
    );
    if (weight) {
      const sameType = context.measurements
        .filter((row) => row.type === weight.type)
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
      const latest = sameType[0]!;
      const previous = sameType[1];
      if (previous) {
        const delta =
          Number.parseFloat(String(latest.value)) -
          Number.parseFloat(String(previous.value));
        if (Number.isFinite(delta) && delta !== 0) {
          const sign = delta > 0 ? "+" : "−";
          rows.push({
            label: "Weight trend",
            text: `${sign}${Math.abs(delta).toFixed(1).replace(/\.0$/, "")} ${latest.unit ?? "kg"} / week`,
          });
        }
      }
    }
    const renewal = workspace?.header.renewalState;
    if (renewal === "expired" || renewal === "due") {
      rows.push({
        label: "Renewal",
        text: labelFor("renewal_state", renewal),
      });
    }
    return rows;
  }, [context, workspace?.header.renewalState]);

  // "This week": each stored measurement, the latest reading against the one
  // before it. Only stored readings; nothing is estimated.
  const measurementRows = useMemo(() => {
    if (!context) return [];
    const byType = new Map<string, typeof context.measurements>();
    for (const row of context.measurements) {
      const list = byType.get(row.type) ?? [];
      list.push(row);
      byType.set(row.type, list);
    }
    const reading = (row: (typeof context.measurements)[number]) =>
      `${row.value}${row.unit ? ` ${row.unit}` : ""}`;
    return Array.from(byType, ([type, rows]) => {
      const sorted = [...rows].sort((a, b) =>
        b.observedAt.localeCompare(a.observedAt),
      );
      const latest = sorted[0]!;
      const previous = sorted[1];
      let change: string | null = null;
      if (previous) {
        const delta =
          Number.parseFloat(String(latest.value)) -
          Number.parseFloat(String(previous.value));
        if (Number.isFinite(delta)) {
          const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
          change = `${sign}${Math.abs(delta).toFixed(1).replace(/\.0$/, "")}`;
        }
      }
      return {
        type,
        label: labelFor("measurement_type", type),
        previous: previous ? reading(previous) : null,
        previousOn: previous
          ? formatCivilDate(previous.observedAt.slice(0, 10))
          : null,
        latest: reading(latest),
        latestOn: formatCivilDate(latest.observedAt.slice(0, 10)),
        change,
      };
    });
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
      setError(userFacingMessage(err, { fallback: "Could not save review." }));
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
        userFacingMessage(err, {
          fallback: "Could not schedule next check-in.",
        }),
      );
    } finally {
      setActing(false);
    }
  }

  function openWhatsApp() {
    if (!clientWa) return;
    const text = encodeURIComponent(
      `Reviewed your check-in — open it in FitBud: /checkin/${checkinId}`,
    );
    window.open(
      `https://wa.me/${clientWa.replace(/\D/g, "")}?text=${text}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  const submittedLabel = context?.checkin.submittedAt
    ? `Submitted ${formatInstant(context.checkin.submittedAt, clientTz)}`
    : context
      ? `Due ${formatCivilDate(context.checkin.localDate)}`
      : "Weekly check-in";

  const alreadyReviewed = Boolean(context?.checkin.review) && !editing;
  const photos = context?.photos ?? [];

  // The client's answers in form order. A measurement the "This week" table
  // already shows (stored reading plus change) is not repeated here.
  const answerRows = useMemo(() => {
    if (!context) return [];
    const fields = context.pinnedForm.fields;
    const tableTypes = new Set(measurementRows.map((row) => row.type));
    const tableLabels = new Set(
      measurementRows.map((row) => row.label.toLowerCase()),
    );
    const covered = (
      entry: CheckinAnswerEntry,
      field: CheckinFieldDefinition | undefined,
    ) => {
      if (entry.type !== "measurement") return false;
      if (tableLabels.has(entry.label.toLowerCase())) return true;
      if (field && field.type === "measurement") {
        if (tableTypes.has(field.measurementType)) return true;
      }
      return entry.key === "weight" && tableTypes.has("body_weight_kg");
    };
    return checkinAnswerEntries(fields, context.checkin.answers)
      .map((entry) => {
        const field = fields.find((f) => f.id === entry.fieldId);
        return {
          entry,
          field,
          row: {
            fieldId: entry.fieldId,
            label: entry.label,
            text: answerText(entry, field),
          },
        };
      })
      .filter(({ entry, field }) => !covered(entry, field))
      .map(({ row }) => ({
        ...row,
        flag: looksLikePain(row.label, row.text),
      }));
  }, [context, measurementRows]);

  const checkinDateLabel = context
    ? formatCivilDate(context.checkin.localDate)
    : "";
  const showStatus =
    context &&
    (context.checkin.review !== null || context.checkin.status === "submitted");

  return (
    <div
      className="workspace-page checkin-review-page"
      data-testid="screen-TW-20"
    >
      <header className="checkin-review-head">
        <Link
          className="checkin-review-back"
          to={
            relationshipId
              ? `/clients/${relationshipId}/check-ins`
              : "/checkins"
          }
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          Check-ins
        </Link>
        <div className="checkin-review-title">
          <h1>
            <span className="sr-only">Check-in review: </span>
            {context
              ? `Weekly check-in · ${checkinDateLabel}`
              : "Weekly check-in"}
          </h1>
          {showStatus ? (
            context.checkin.review ? (
              <Pill
                tone="done"
                icon={<CheckCircle2 className="ui-i" aria-hidden="true" />}
              >
                Reviewed
              </Pill>
            ) : (
              <Pill
                tone="info"
                icon={<ClipboardCheck className="ui-i" aria-hidden="true" />}
              >
                To review
              </Pill>
            )
          ) : null}
          {context ? (
            <span className="checkin-review-sent">{submittedLabel}</span>
          ) : null}
        </div>
        {pager ? (
          <nav
            className="checkin-review-pager"
            aria-label="Check-ins to review"
          >
            <span>
              {pager.index} of {pager.total} to review
            </span>
            {pager.prev ? (
              <Link
                className="checkin-review-step"
                aria-label="Previous check-in to review"
                to={`/clients/${pager.prev.relationshipId}/check-ins/${pager.prev.checkinId}${pagerQuery}`}
              >
                <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
              </Link>
            ) : (
              <span className="checkin-review-step is-off" aria-hidden="true">
                <ChevronLeft size={18} strokeWidth={2} />
              </span>
            )}
            {pager.next ? (
              <Link
                className="checkin-review-step"
                aria-label="Next check-in to review"
                to={`/clients/${pager.next.relationshipId}/check-ins/${pager.next.checkinId}${pagerQuery}`}
              >
                <ChevronRight size={18} strokeWidth={2} />
              </Link>
            ) : (
              <span className="checkin-review-step is-off" aria-hidden="true">
                <ChevronRight size={18} strokeWidth={2} />
              </span>
            )}
          </nav>
        ) : null}
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
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      {loading ? <LoadingBlock label="Loading review…" /> : null}

      {!loading && !context ? <EmptyState title="Check-in not found." /> : null}

      {context ? (
        <div className="checkin-review-grid">
          <div
            className="checkin-review-main"
            data-testid="checkin-answers-col"
          >
            {measurementRows.length > 0 ? (
              <section
                className="workspace-card"
                aria-labelledby="week-h"
                data-testid="checkin-this-week"
              >
                <div className="checkin-card-head">
                  <h2 id="week-h">This week</h2>
                  <p>Latest reading against the one before</p>
                </div>
                <div className="checkin-week-wrap">
                  <table className="ui-table is-compact checkin-week-table">
                    <thead>
                      <tr>
                        <th scope="col">Measure</th>
                        <th scope="col" className="is-r">
                          Before
                        </th>
                        <th scope="col" className="is-r">
                          Latest
                        </th>
                        <th scope="col" className="is-r">
                          Change
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurementRows.map((row) => (
                        <tr key={row.type}>
                          <td>{row.label}</td>
                          <td className="is-r checkin-week-before">
                            {row.previous ?? "—"}
                          </td>
                          <td className="is-r checkin-week-latest">
                            {row.latest}
                          </td>
                          <td className="is-r">{row.change ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="workspace-card" aria-labelledby="answers-h">
              <div className="checkin-card-head">
                <h2 id="answers-h">{firstName} wrote</h2>
                <p>
                  {answerRows.length === 1
                    ? "1 answer"
                    : `${answerRows.length} answers`}
                </p>
              </div>
              {context.checkin.status === "due" ||
              context.checkin.status === "overdue" ||
              context.checkin.status === "scheduled" ? (
                <p>
                  Due by {formatCivilDate(context.checkin.localDate)}, 11:59 pm
                </p>
              ) : null}
              {answerRows.length > 0 ? (
                <dl className="checkin-answer-list detail-list">
                  {answerRows.map((row) => (
                    <div key={row.fieldId}>
                      <dt>{row.label}</dt>
                      <dd>
                        <span>{row.text}</span>
                        {row.flag ? (
                          <span className="checkin-answer-flag">
                            <AlertTriangle
                              size={12}
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                            Review
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="workspace-empty">
                  {context.checkin.recordStatus === "draft"
                    ? `${firstName} has started but not submitted.`
                    : "No answers submitted yet."}
                </p>
              )}
            </section>

            <section
              className="workspace-card checkin-photos"
              aria-labelledby="photos-h"
            >
              <div className="checkin-card-head">
                <h2 id="photos-h">Photos</h2>
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
            {/* Your review first so Save stays in the first screenful (163). At
                iPad widths its actions move to a bar fixed at the bottom. */}
            <section
              className="workspace-card checkin-review-card"
              aria-labelledby="review-h"
              data-testid="review-action-bar"
            >
              {alreadyReviewed ? (
                <>
                  <div className="checkin-review-card-body">
                    <h2 id="review-h">Your review</h2>
                    <p className="checkin-reviewed-meta">
                      Reviewed by you ·{" "}
                      {formatInstant(
                        context.checkin.review!.createdAt,
                        trainerTz,
                      )}
                    </p>
                    {context.checkin.review!.notes ? (
                      <p className="checkin-reviewed-body">
                        {context.checkin.review!.notes}
                      </p>
                    ) : (
                      <p className="muted">No note saved.</p>
                    )}
                  </div>
                  <div className="checkin-reviewed-pill-row">
                    <span className="checkin-reviewed-pill">
                      <CheckCircle2
                        size={14}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      Reviewed
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => setEditing(true)}
                    >
                      Edit review
                    </Button>
                  </div>
                  <p className="muted checkin-reviewed-outcome">
                    {labelFor(
                      "checkin_review_outcome",
                      context.checkin.review!.outcome,
                    )}
                  </p>
                </>
              ) : (
                <>
                  <div className="checkin-review-card-body">
                    <h2 id="review-h">Your review</h2>
                    <p className="checkin-field-label" id="outcome-l">
                      Outcome
                    </p>
                    <div
                      className="ui-seg is-full"
                      role="group"
                      aria-label="Outcome"
                    >
                      {OUTCOMES.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={outcome === opt.value ? "is-on" : undefined}
                          aria-pressed={outcome === opt.value}
                          onClick={() => setOutcome(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="checkin-review-note field">
                      <label>
                        <span>Note to {firstName}</span>
                        <textarea
                          rows={3}
                          value={noteBody}
                          onChange={(e) => setNoteBody(e.target.value)}
                          maxLength={2000}
                          placeholder="Optional note"
                        />
                      </label>
                      {visibleToClient ? (
                        <p className="checkin-review-helper">
                          {firstName} sees this in the app with a push
                          notification.
                        </p>
                      ) : (
                        <p className="checkin-review-helper">
                          Private unless you mark it visible to {firstName}.
                        </p>
                      )}
                    </div>
                    <label className="checkin-review-visible">
                      <input
                        type="checkbox"
                        checked={visibleToClient}
                        onChange={(e) => setVisibleToClient(e.target.checked)}
                      />
                      Visible to client
                    </label>
                    <div className="checkin-review-more">
                      <Button
                        variant="secondary"
                        disabled={acting || !online}
                        onClick={() => void scheduleNext()}
                      >
                        Schedule next
                      </Button>
                      <OverflowMenu
                        label="More review actions"
                        items={[
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
                  </div>
                  <div
                    className="checkin-review-footer"
                    data-testid="checkin-review-bar"
                  >
                    <p className="checkin-review-footer-note">
                      Saving closes this check-in in Needs attention.
                    </p>
                    <div className="checkin-review-actions">
                      <Button
                        variant="whatsapp"
                        disabled={!clientWa}
                        onClick={openWhatsApp}
                      >
                        <WhatsAppGlyph />
                        Message on WhatsApp
                      </Button>
                      <Button
                        variant="primary"
                        disabled={acting || !online}
                        onClick={() => void saveReview()}
                      >
                        {acting ? "Saving…" : "Save review"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section
              className="workspace-card checkin-side-card"
              aria-labelledby="context-h"
            >
              <h2 id="context-h">Context · last 7 days</h2>
              {contextRows.length === 0 ? (
                <p className="muted">No activity counted in this period.</p>
              ) : (
                <dl className="checkin-context-list">
                  {contextRows.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {context.activeExceptions.length > 0 ? (
                <ul className="checkin-open-list" aria-label="Open items">
                  {context.activeExceptions.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      <div className="workspace-row-copy">
                        <p className="workspace-row-title">{item.summary}</p>
                        <StatusChip kind="severity" value={item.severity} />
                      </div>
                      <Link
                        className="button-ghost"
                        to={`/clients/${relationshipId}?exception=${item.id}`}
                      >
                        Review
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {context.activeExceptions.length > 3 ? (
                <p className="muted checkin-open-more">
                  +{context.activeExceptions.length - 3} more open
                </p>
              ) : null}
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
