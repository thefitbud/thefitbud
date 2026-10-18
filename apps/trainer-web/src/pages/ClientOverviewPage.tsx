import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import type { TrainerNote, WeekReadModel } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatInstant,
  formatKcal,
  formatNumber,
  formatRelative,
  labelFor,
} from "@fitbud/core";
import { AlertOctagon, AlertTriangle } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/Button";
import { ExceptionDrawer } from "../components/ExceptionDrawer";
import { MeasurementTrend } from "../components/MeasurementTrend";
import { StatusChip } from "../components/StatusChip";
import { ResponsivenessPanel } from "../components/workspace/ResponsivenessPanel";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import type { WorkspaceOutletContext } from "./workspaceContext";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function civilParts(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Monday of the civil week containing `date` (trainee-local YYYY-MM-DD). */
function mondayOfWeek(date: string): string {
  const { y, m, d } = civilParts(date);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = utc.getUTCDay(); // 0 Sun … 6 Sat
  const delta = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + delta);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function todayCivilUtc(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekdayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const { y, m, d } = civilParts(date);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAYS[utc.getUTCDay()]!;
}

function dayNum(date: string): number {
  return civilParts(date).d;
}

function MiniRing({
  value,
  max,
  color,
  label,
  unit,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  unit: string;
}) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const dash = pct * c;
  return (
    <div className="ov-mini">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="var(--ink-200, #E6E8EB)"
          strokeWidth="5"
        />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span>
        <b>
          {formatNumber(value)} / {formatNumber(max)}
          {unit ? ` ${unit}` : ""}
        </b>
        {label}
      </span>
    </div>
  );
}

export function ClientOverviewPage() {
  const { relationshipId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const drawerId = params.get("exception");
  const { workspace, openWorkspaceModal, refreshEpoch } =
    useOutletContext<WorkspaceOutletContext>();
  const { me } = useAuth();
  const viewerTz = me?.timezone ?? "Asia/Kolkata";
  const [week, setWeek] = useState<WeekReadModel | null>(null);
  const [notes, setNotes] = useState<TrainerNote[]>([]);
  const [weekError, setWeekError] = useState(false);

  const [noteBusyId, setNoteBusyId] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const loadNotes = useCallback(() => {
    if (!relationshipId) return;
    void apiClient
      .listTrainerNotes(relationshipId)
      .then((res) => setNotes(res.items.slice(0, 3)))
      .catch(() => setNotes([]));
  }, [relationshipId]);

  async function makeNotePrivate(note: TrainerNote) {
    setNoteBusyId(note.id);
    setNoteError(null);
    try {
      await stage1Api.patchTrainerNote(
        relationshipId,
        note.id,
        { visibility: "private" },
        createIdempotencyKey(),
      );
      loadNotes();
    } catch (err) {
      setNoteError(
        err instanceof ApiClientError ? err.message : "Could not update note.",
      );
    } finally {
      setNoteBusyId(null);
    }
  }

  async function deleteNote(note: TrainerNote) {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    setNoteBusyId(note.id);
    setNoteError(null);
    try {
      await apiClient.deleteTrainerNote(relationshipId, note.id);
      loadNotes();
    } catch (err) {
      setNoteError(
        err instanceof ApiClientError ? err.message : "Could not delete note.",
      );
    } finally {
      setNoteBusyId(null);
    }
  }

  useEffect(() => {
    if (!relationshipId) return;
    setWeekError(false);
    const weekStart = mondayOfWeek(todayCivilUtc());
    void stage1Api
      .getWorkspaceWeek(relationshipId, weekStart)
      .then(setWeek)
      .catch(() => {
        setWeek(null);
        setWeekError(true);
      });
    loadNotes();
  }, [relationshipId, refreshEpoch, loadNotes]);

  if (!workspace) {
    return (
      <p className="muted" data-testid="screen-TW-09">
        Loading overview…
      </p>
    );
  }

  const { header, overview, plan } = workspace;
  const version = plan.version;
  const coachingReady =
    header.onboardingStatus === "active" ||
    header.onboardingStatus === "coaching_ready";
  const firstName = header.traineeDisplayName.split(" ")[0] ?? "Client";

  if (!coachingReady) {
    return (
      <div className="overview-guided" data-testid="screen-TW-09">
        <h2>Next step</h2>
        <p>
          {header.onboardingStatus === "onboarding_submitted"
            ? "Review intake answers, then configure coaching."
            : "Waiting for the client to finish onboarding."}
        </p>
        <Link
          className="button-primary"
          to={`/clients/${relationshipId}/onboarding`}
        >
          Open onboarding
        </Link>
      </div>
    );
  }

  const openEx = overview.openException;
  const nutrition = week?.todayNutrition;
  const todayDate = nutrition?.date ?? week?.days.find(() => true)?.date;
  const weekEnd = week?.days[week.days.length - 1]?.date;

  return (
    <div className="overview-grid" data-testid="screen-TW-09">
      <div className="overview-main">
        {openEx ? (
          <section className="ov-card ov-attention">
            <div className="ov-card-h">
              <h2 className="t-h3">Needs attention</h2>
              <span className="t-cap muted">Most severe open item</span>
            </div>
            <div className="ov-att">
              <span
                className={`ov-att-ico is-${openEx.severity}`}
                aria-hidden="true"
              >
                {openEx.severity === "critical" ? (
                  <AlertOctagon size={20} strokeWidth={1.75} />
                ) : (
                  <AlertTriangle size={20} strokeWidth={1.75} />
                )}
              </span>
              <div className="ov-att-tx">
                <b>
                  {openEx.summary?.trim() ||
                    labelFor("exception_type", openEx.type)}
                </b>
                <span>
                  Open {formatRelative(openEx.detectedAt)}
                  {openEx.status === "acknowledged"
                    ? ", reviewed"
                    : ", not reviewed yet"}
                  .
                </span>
              </div>
              <StatusChip kind="severity" value={openEx.severity} />
              <Button
                variant="tinted"
                onClick={() => setParams({ exception: openEx.id })}
              >
                Review
              </Button>
            </div>
          </section>
        ) : null}

        <section className="ov-card">
          <div className="ov-card-h">
            <div>
              <h2 className="t-h3">This week</h2>
              {week ? (
                <div className="t-cap muted" style={{ marginTop: 2 }}>
                  {formatCivilDate(week.start)}
                  {weekEnd ? ` – ${formatCivilDate(weekEnd)}` : ""}
                </div>
              ) : null}
            </div>
          </div>
          {week ? (
            <>
              <div className="ov-week" role="list" aria-label="Week consistency">
                {week.days.map((day) => (
                  <div
                    key={day.date}
                    className={`ov-day${todayDate === day.date ? " is-today" : ""}`}
                    role="listitem"
                  >
                    <div className="ov-dn">
                      {weekdayLabel(day.date, todayDate ?? "")}
                    </div>
                    <div className="ov-dd">{dayNum(day.date)}</div>
                    <div
                      className={`ov-wk is-${day.state}`}
                      role="img"
                      title={labelFor("week_day_state", day.state)}
                      aria-label={labelFor("week_day_state", day.state)}
                    />
                  </div>
                ))}
              </div>
              <div className="ov-stats">
                <div className="ov-stat">
                  <div className="ov-stat-v">
                    {week.workouts.completed}{" "}
                    <small>of {week.workouts.assigned}</small>
                  </div>
                  <div className="ov-stat-l">Workouts done</div>
                </div>
                <div className="ov-stat">
                  <div className="ov-stat-v">
                    {week.meals.logged}{" "}
                    <small>of {week.meals.assigned}</small>
                  </div>
                  <div className="ov-stat-l">Meals logged so far</div>
                </div>
                <div className="ov-stat">
                  <div className="ov-stat-v">
                    {overview.nextCheckin
                      ? formatCivilDate(overview.nextCheckin.localDate, {
                          includeWeekday: true,
                        }).split(" ")[0]
                      : "—"}
                  </div>
                  <div className="ov-stat-l">
                    {overview.nextCheckin?.status === "submitted"
                      ? "Check-in submitted"
                      : overview.nextCheckin
                        ? "Next check-in"
                        : "No check-in"}
                  </div>
                </div>
              </div>
              {nutrition ? (
                <div className="ov-nut">
                  <div className="ov-nut-lbl">
                    Today&apos;s nutrition
                    <span>Logged so far</span>
                  </div>
                  <MiniRing
                    value={nutrition.logged.kcal}
                    max={
                      (nutrition.assigned?.kcal ?? nutrition.logged.kcal) || 1
                    }
                    color="var(--brand-indigo, #4527C6)"
                    label="kcal"
                    unit=""
                  />
                  <MiniRing
                    value={nutrition.logged.proteinG}
                    max={
                      (nutrition.assigned?.proteinG ??
                        nutrition.logged.proteinG) || 1
                    }
                    color="var(--brand-deep-navy, #1A1248)"
                    label="Protein"
                    unit="g"
                  />
                  <MiniRing
                    value={nutrition.logged.carbsG}
                    max={
                      (nutrition.assigned?.carbsG ??
                        nutrition.logged.carbsG) || 1
                    }
                    color="#7C6CF0"
                    label="Carbs"
                    unit="g"
                  />
                  <MiniRing
                    value={nutrition.logged.fatG}
                    max={
                      (nutrition.assigned?.fatG ?? nutrition.logged.fatG) || 1
                    }
                    color="#0E7490"
                    label="Fat"
                    unit="g"
                  />
                </div>
              ) : null}
              {nutrition?.assigned ? (
                <p className="ov-nut-line muted">
                  {nutrition.logged.hasUnknown ? "≥ " : ""}
                  {formatKcal(nutrition.logged.kcal)} /{" "}
                  {formatKcal(nutrition.assigned.kcal)} · P{" "}
                  {formatNumber(nutrition.logged.proteinG)}/
                  {formatNumber(nutrition.assigned.proteinG)} g · C{" "}
                  {formatNumber(nutrition.logged.carbsG)}/
                  {formatNumber(nutrition.assigned.carbsG)} g · F{" "}
                  {formatNumber(nutrition.logged.fatG)}/
                  {formatNumber(nutrition.assigned.fatG)} g
                </p>
              ) : null}
            </>
          ) : weekError ? (
            <p className="form-error" role="alert">
              Could not load this week.{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setWeekError(false);
                  void stage1Api
                    .getWorkspaceWeek(
                      relationshipId,
                      mondayOfWeek(todayCivilUtc()),
                    )
                    .then(setWeek)
                    .catch(() => setWeekError(true));
                }}
              >
                Retry
              </button>
            </p>
          ) : (
            <p className="muted">Loading week…</p>
          )}
        </section>

        <section className="ov-card">
          <div className="ov-card-h">
            <h2 className="t-h3">Recent activity</h2>
            <Link
              className="text-link"
              to={`/clients/${relationshipId}/activity`}
            >
              View all activity
            </Link>
          </div>
          {overview.recentActivity.length === 0 ? (
            <p className="muted ov-pad">
              No activity logged yet. Activity appears once {firstName} starts
              logging.
            </p>
          ) : (
            <ul className="ov-activity">
              {overview.recentActivity.slice(0, 5).map((item) => (
                <li key={`${item.type}:${item.id}`}>
                  <div>
                    <b>{item.title}</b>
                    <span className="muted s">
                      {labelFor("workspace_activity_type", item.type)}
                    </span>
                  </div>
                  <StatusChip
                    kind={
                      item.type === "workout"
                        ? "workout"
                        : item.type === "meal"
                          ? "meal"
                          : "checkin"
                    }
                    value={item.state}
                  />
                  <time
                    className="ov-when"
                    title={formatInstant(item.occurredAt, viewerTz)}
                    dateTime={item.occurredAt}
                  >
                    {formatRelative(item.occurredAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="overview-side">
        {overview.nextCheckin ? (
          <section className="ov-card ov-side">
            <div className="ov-side-h">
              <h3>Check-in</h3>
              <Link
                className="text-link"
                to={`/clients/${relationshipId}/check-ins/${overview.nextCheckin.id}`}
              >
                Open
              </Link>
            </div>
            <div className="ov-big">
              {labelFor("checkin_status", overview.nextCheckin.status)} check-in
            </div>
            <div className="ov-sub">
              {formatCivilDate(overview.nextCheckin.localDate)}
              {overview.nextCheckin.status === "submitted"
                ? " · waiting for your review"
                : ""}
            </div>
          </section>
        ) : null}

        {plan.plan && version ? (
          <section className="ov-card ov-side">
            <div className="ov-side-h">
              <h3>Plan</h3>
              <Link
                className="text-link"
                to={`/clients/${relationshipId}/plan`}
              >
                Open plan
              </Link>
            </div>
            <div className="ov-big">{plan.plan.title}</div>
            <div className="ov-sub">
              Effective since{" "}
              {formatCivilDate(version.effectiveFrom ?? "")} · Version{" "}
              {version.versionNumber}
            </div>
            {header.hasCustomMealTimes ? (
              <div className="ov-sub">Custom meal times</div>
            ) : null}
          </section>
        ) : (
          <section className="ov-card ov-side">
            <div className="ov-side-h">
              <h3>Plan</h3>
            </div>
            <div className="ov-big">No plan yet</div>
            <Link
              className="button-primary"
              to={`/clients/${relationshipId}/plan`}
              style={{ marginTop: 12, display: "inline-flex" }}
            >
              Set up plan
            </Link>
          </section>
        )}

        <section className="ov-card ov-side">
          <div className="ov-side-h">
            <h3>Reminders</h3>
            <button
              type="button"
              className="text-link"
              onClick={() => openWorkspaceModal({ type: "responsiveness" })}
            >
              Details
            </button>
          </div>
          <ResponsivenessPanel relationshipId={relationshipId} compact />
        </section>

        <section className="ov-card ov-side">
          <div className="ov-side-h">
            <h3>Progress</h3>
            <Link
              className="text-link"
              to={`/clients/${relationshipId}/progress`}
            >
              View
            </Link>
          </div>
          {overview.progress.measurements.filter(
            (m) => m.type === "body_weight_kg",
          ).length >= 2 ? (
            <MeasurementTrend
              compact
              label="Weight"
              points={overview.progress.measurements
                .filter((m) => m.type === "body_weight_kg")
                .map((m) => ({
                  id: m.id,
                  value: m.value,
                  unit: m.unit,
                  observedAt: m.observedAt,
                }))}
            />
          ) : (
            <p className="muted">No weigh-ins yet</p>
          )}
        </section>

        {header.renewalState && header.renewalState !== "current" ? (
          <section className="ov-card ov-side">
            <div className="ov-side-h">
              <h3>Renewal</h3>
              <Link
                className="text-link"
                to={`/clients/${relationshipId}/configure`}
              >
                Open settings
              </Link>
            </div>
            <StatusChip kind="renewal" value={header.renewalState} />
          </section>
        ) : null}

        <section className="ov-card ov-side">
          <div className="ov-side-h">
            <h3>Coach notes</h3>
            {header.onboardingStatus !== "ended" ? (
              <button
                type="button"
                className="text-link"
                onClick={() => openWorkspaceModal({ type: "note" })}
              >
                Add note
              </button>
            ) : null}
          </div>
          {noteError ? (
            <p className="form-error" role="alert">
              {noteError}
            </p>
          ) : null}
          {notes.length === 0 ? (
            <p className="muted">No notes yet</p>
          ) : (
            <ul className="ov-notes">
              {notes.map((note) => (
                <li key={note.id}>
                  <p>{note.body}</p>
                  <div className="ov-note-meta">
                    <span
                      className={`note-vis-badge is-${note.visibility === "client" ? "client" : "private"}`}
                    >
                      {labelFor("trainer_note_visibility", note.visibility)}
                    </span>
                    <time dateTime={note.createdAt}>
                      {formatRelative(note.createdAt)}
                    </time>
                  </div>
                  {header.onboardingStatus !== "ended" ? (
                    <div className="ov-note-actions">
                      <button
                        type="button"
                        className="text-link"
                        disabled={noteBusyId === note.id}
                        onClick={() => openWorkspaceModal({ type: "note", note })}
                      >
                        Edit
                      </button>
                      {note.visibility === "client" ? (
                        <button
                          type="button"
                          className="text-link"
                          disabled={noteBusyId === note.id}
                          onClick={() => void makeNotePrivate(note)}
                        >
                          Make private
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-link"
                        disabled={noteBusyId === note.id}
                        onClick={() => void deleteNote(note)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      {drawerId ? (
        <ExceptionDrawer
          exceptionId={drawerId}
          onClose={() => setParams({})}
        />
      ) : null}
    </div>
  );
}
