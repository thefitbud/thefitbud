import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import type {
  Checkin,
  ClientWorkspace,
  Measurement,
  MealComplianceItem,
  TrainerNote,
  WeekReadModel,
  WorkoutAdherenceItem,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatInstant,
  formatKcal,
  formatLocalDate,
  formatNumber,
  formatRelative,
  formatWeight,
  labelFor,
} from "@fitbud/core";
import { resolveTraineeTimezone } from "../lib/trainee-timezone";
import { AlertOctagon, AlertTriangle } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/Button";
import { ExceptionDrawer } from "../components/ExceptionDrawer";
import { ErrorState } from "../components/StatePanels";
import { MeasurementTrend } from "../components/MeasurementTrend";
import { StatusChip } from "../components/StatusChip";
import {
  RemindersDrawer,
  ResponsivenessPanel,
} from "../components/workspace/ResponsivenessPanel";
import { WeekCircle } from "../components/WeekCircle";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import { isWorkspaceReadOnly } from "../hooks/useWorkspaceReadOnly";
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

type WeekDayView = WeekReadModel["days"][number];

function mealSlotsFor(day: WeekDayView) {
  if (day.mealSlots) return day.mealSlots;
  const assigned = day.mealsAssigned ?? 0;
  const logged = day.mealsLogged ?? 0;
  return Array.from({ length: assigned }, (_, i) =>
    i < logged ? ("logged" as const) : ("missed" as const),
  );
}

function mealCountLabel(day: WeekDayView, isToday: boolean): string | null {
  const assigned = day.mealsAssigned ?? mealSlotsFor(day).length;
  if (assigned === 0) return null;
  const slots = mealSlotsFor(day);
  if (slots.length > 0 && slots.every((slot) => slot === "upcoming")) {
    return `${slots.length} planned`;
  }
  const logged = day.mealsLogged ?? slots.filter((slot) => slot === "logged").length;
  const suffix = isToday && slots.some((slot) => slot === "later") ? " so far" : "";
  return `${logged} of ${assigned}${suffix}`;
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
  const { workspace, openWorkspaceModal, refreshEpoch, online = true } =
    useOutletContext<WorkspaceOutletContext>();
  const { me } = useAuth();
  const viewerTz = me?.timezone ?? "Asia/Kolkata";
  const [week, setWeek] = useState<WeekReadModel | null>(null);
  const [notes, setNotes] = useState<TrainerNote[]>([]);
  const [weekError, setWeekError] = useState(false);

  // Frame 181: the Reminders drawer opens over Overview; closing returns focus to Details.
  const [remindersOpen, setRemindersOpen] = useState(false);
  const remindersDetailsRef = useRef<HTMLButtonElement>(null);
  const closeReminders = useCallback(() => {
    setRemindersOpen(false);
    remindersDetailsRef.current?.focus();
  }, []);

  const [noteBusyId, setNoteBusyId] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [notePendingDelete, setNotePendingDelete] = useState<TrainerNote | null>(
    null,
  );
  const [notesLoadError, setNotesLoadError] = useState<{
    message: string;
    requestId: string | null;
  } | null>(null);

  const loadNotes = useCallback(() => {
    if (!relationshipId) return;
    void apiClient
      .listTrainerNotes(relationshipId)
      .then((res) => {
        setNotesLoadError(null);
        setNotes(res.items.slice(0, 3));
      })
      .catch((err: unknown) => {
        setNotes([]);
        const apiError = err instanceof ApiClientError ? err : null;
        const rid = apiError?.requestId;
        setNotesLoadError({
          message: apiError?.message ?? "Could not load notes.",
          requestId: rid && rid !== "unknown" ? rid : null,
        });
      });
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

  async function confirmDeleteNote() {
    const note = notePendingDelete;
    if (!note) return;
    setNotePendingDelete(null);
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

  const workspaceLoaded = workspace != null;
  const endedWorkspace = isWorkspaceReadOnly(workspace);

  useEffect(() => {
    if (!relationshipId || !workspaceLoaded) return;
    loadNotes();
    // Frame 179: an ended client's Overview has no live week, so skip the fetch.
    if (endedWorkspace) return;
    setWeekError(false);
    const weekStart = mondayOfWeek(todayCivilUtc());
    void stage1Api
      .getWorkspaceWeek(relationshipId, weekStart)
      .then(setWeek)
      .catch(() => {
        setWeek(null);
        setWeekError(true);
      });
  }, [relationshipId, refreshEpoch, loadNotes, workspaceLoaded, endedWorkspace]);

  if (!workspace) {
    return (
      <p className="muted" data-testid="screen-TW-09">
        Loading overview…
      </p>
    );
  }

  const { header, overview, plan } = workspace;
  const version = plan.version;
  const ended = isWorkspaceReadOnly(workspace);
  const coachingReady =
    ended ||
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

  if (ended) {
    return (
      <EndedOverviewBody
        workspace={workspace}
        relationshipId={relationshipId}
        refreshEpoch={refreshEpoch}
        viewerTz={viewerTz}
        latestNote={notes[0] ?? null}
        notesLoadError={notesLoadError}
        onRetryNotes={loadNotes}
      />
    );
  }

  const openEx = overview.openException;
  const nutrition = week?.todayNutrition;
  const todayDate = nutrition?.date ?? week?.days.find(() => true)?.date;
  const weekEnd = week?.days[week.days.length - 1]?.date;
  const configured = workspace.configuration.configuration;
  const sessionsPerWeek =
    configured?.workout.sessionsPerWeek ?? plan.version?.content.workoutDays.length;
  const mealsPerDay =
    configured?.nutrition.mealsPerDay ??
    plan.version?.content.mealPrescriptions.length;
  const planWorkoutsLabel =
    sessionsPerWeek != null && sessionsPerWeek > 0
      ? `${sessionsPerWeek} a week`
      : null;
  const planMealsLabel =
    mealsPerDay != null && mealsPerDay > 0
      ? `${mealsPerDay} a day${
          nutrition?.assigned?.kcal
            ? ` · ${formatKcal(nutrition.assigned.kcal)}`
            : ""
        }`
      : null;

  return (
    <div className="overview-grid" data-testid="screen-TW-09">
      <div className="overview-main">
        {openEx ? (
          <section className="ov-card ov-attention" data-testid="ov-attention">
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
              {ended ? null : (
                <Button
                  variant="tinted"
                  disabled={!online}
                  onClick={() => setParams({ exception: openEx.id })}
                >
                  Review
                </Button>
              )}
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
            <div className="ov-legend" aria-label="Legend">
              <span>
                <i className="is-workout-done" />
                Workout done
              </span>
              <span>
                <i className="is-workout-missed" />
                Missed
              </span>
              <span>
                <i className="is-meal-logged" />
                Meal logged
              </span>
              <span>
                <i className="is-meal-no" />
                Not logged
              </span>
            </div>
          </div>
          {week ? (
            <>
              <div className="ov-week" role="list" aria-label="Week consistency">
                {week.days.map((day) => {
                  const isToday = todayDate === day.date;
                  const slots = mealSlotsFor(day);
                  const countLabel = mealCountLabel(day, isToday);
                  const label = day.workoutLabel ?? "Rest";
                  const isRestLabel = day.state === "rest" || label === "Rest";
                  return (
                    <div
                      key={day.date}
                      className={`ov-day${isToday ? " is-today" : ""}`}
                      role="listitem"
                    >
                      <div className="ov-dn">
                        {weekdayLabel(day.date, todayDate ?? "")}
                      </div>
                      <div className="ov-dd">{dayNum(day.date)}</div>
                      {/* D-W7-10: the API day-state as is; a started past day is partial, unlogged today is To do. */}
                      <WeekCircle state={day.state} className="ov-wk" />
                      <div className={`ov-wl${isRestLabel ? " is-muted" : ""}`}>
                        {label}
                      </div>
                      <div className="ov-meals" aria-hidden="true">
                        {slots.map((slot, index) => (
                          <i key={index} className={`is-${slot}`} />
                        ))}
                      </div>
                      <div className="ov-ml">{countLabel ?? "\u00a0"}</div>
                    </div>
                  );
                })}
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
                    {overview.pendingReviewCheckin
                      ? formatCivilDate(
                          overview.pendingReviewCheckin.localDate,
                          { includeWeekday: true },
                        ).split(" ")[0]
                      : overview.nextCheckin
                        ? formatCivilDate(overview.nextCheckin.localDate, {
                            includeWeekday: true,
                          }).split(" ")[0]
                        : "—"}
                  </div>
                  <div className="ov-stat-l">
                    {overview.pendingReviewCheckin
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
        {overview.pendingReviewCheckin || overview.nextCheckin ? (
          <section className="ov-card ov-side">
            {(() => {
              const checkin =
                overview.pendingReviewCheckin ?? overview.nextCheckin!;
              return (
                <>
                  <div className="ov-side-h">
                    <h3>Check-in</h3>
                    <Link
                      className="text-link"
                      to={`/clients/${relationshipId}/check-ins/${checkin.id}`}
                    >
                      Open
                    </Link>
                  </div>
                  <div className="ov-big">
                    {labelFor("checkin_status", checkin.status)} check-in
                  </div>
                  <div className="ov-sub">
                    {formatCivilDate(checkin.localDate)}
                    {checkin.status === "submitted"
                      ? " · waiting for your review"
                      : ""}
                  </div>
                </>
              );
            })()}
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
              {version.effectiveFrom
                ? formatCivilDate(
                    formatLocalDate(
                      new Date(version.effectiveFrom),
                      resolveTraineeTimezone(header).timezone,
                    ),
                  )
                : "—"}{" "}
              · Version {version.versionNumber}
            </div>
            {header.hasCustomMealTimes ? (
              <div className="ov-sub">Custom meal times</div>
            ) : null}
            {planWorkoutsLabel ? (
              <div className="ov-kv">
                <span>Workouts</span>
                <b>{planWorkoutsLabel}</b>
              </div>
            ) : null}
            {planMealsLabel ? (
              <div className="ov-kv">
                <span>Meals</span>
                <b>{planMealsLabel}</b>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="ov-card ov-side">
            <div className="ov-side-h">
              <h3>Plan</h3>
            </div>
            <div className="ov-big">No plan yet</div>
            {ended ? null : (
              <Link
                className="button-primary"
                to={`/clients/${relationshipId}/plan`}
                style={{ marginTop: 12, display: "inline-flex" }}
              >
                Set up plan
              </Link>
            )}
          </section>
        )}

        <section className="ov-card ov-side">
          <div className="ov-side-h">
            <h3>Reminders</h3>
            <button
              ref={remindersDetailsRef}
              type="button"
              className="text-link"
              aria-haspopup="dialog"
              aria-expanded={remindersOpen}
              onClick={() => setRemindersOpen(true)}
            >
              Details
            </button>
          </div>
          <ResponsivenessPanel
            relationshipId={relationshipId}
            refreshEpoch={refreshEpoch}
            compact
            gender={header.traineeProfile.gender}
            traineeFirstName={firstName}
            clientWhatsappE164={header.clientWhatsappE164}
            ended={ended}
          />
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
              {/* Ended: Configure is read-only (CE1), so label as view-only (CE3). */}
              <Link
                className="text-link"
                to={`/clients/${relationshipId}/configure`}
              >
                {ended ? "View coaching setup" : "Open settings"}
              </Link>
            </div>
            <StatusChip kind="renewal" value={header.renewalState} />
          </section>
        ) : null}

        <section className="ov-card ov-side">
          <div className="ov-side-h">
            <h3>Coach notes</h3>
            {!ended ? (
              <button
                type="button"
                className="text-link"
                disabled={!online}
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
          {notesLoadError ? (
            <ErrorState
              kind="server"
              title="We couldn't load notes"
              message={notesLoadError.message}
              requestId={notesLoadError.requestId}
              onRetry={loadNotes}
              screenId="TW-09"
            />
          ) : notes.length === 0 ? (
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
                  {!ended ? (
                    <div className="ov-note-actions">
                      <button
                        type="button"
                        className="text-link"
                        disabled={!online || noteBusyId === note.id}
                        onClick={() => openWorkspaceModal({ type: "note", note })}
                      >
                        Edit
                      </button>
                      {note.visibility === "client" ? (
                        <button
                          type="button"
                          className="text-link"
                          disabled={!online || noteBusyId === note.id}
                          onClick={() => void makeNotePrivate(note)}
                        >
                          Make private
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-link"
                        disabled={!online || noteBusyId === note.id}
                        onClick={() => setNotePendingDelete(note)}
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

      {notePendingDelete ? (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={() => setNotePendingDelete(null)}
        >
          <dialog
            className="modal-card"
            open
            aria-labelledby="delete-note-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-note-title">Delete this note?</h2>
            <p className="muted">This cannot be undone.</p>
            <div className="button-row">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setNotePendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!online}
                onClick={() => void confirmDeleteNote()}
              >
                Delete note
              </Button>
            </div>
          </dialog>
        </div>
      ) : null}

      {remindersOpen ? (
        <RemindersDrawer
          relationshipId={relationshipId}
          traineeName={header.traineeDisplayName}
          gender={header.traineeProfile.gender}
          clientWhatsappE164={header.clientWhatsappE164}
          timeZone={resolveTraineeTimezone(header).timezone}
          refreshEpoch={refreshEpoch}
          ended={ended}
          onClose={closeReminders}
        />
      ) : null}

      {drawerId ? (
        <ExceptionDrawer
          exceptionId={drawerId}
          onClose={() => setParams({})}
        />
      ) : null}
    </div>
  );
}

/* —— Frame 179: ended client's read-only Overview body (Z8-20) —— */

const MINUS = "−";

/** Civil date `days` after `date` (YYYY-MM-DD, negative goes back). */
function addCivilDays(date: string, days: number): string {
  const { y, m, d } = civilParts(date);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** "68.2 kg → 65.1 kg · −3.1 kg"; one weigh-in shows just that value. */
function weightLine(first: Measurement, last: Measurement): string {
  if (first.id === last.id) return formatWeight(first.value);
  const delta = Math.round((last.value - first.value) * 10) / 10;
  const sign = delta > 0 ? "+" : delta < 0 ? MINUS : "";
  return `${formatWeight(first.value)} → ${formatWeight(last.value)} · ${sign}${formatWeight(Math.abs(delta))}`;
}

const WORKOUT_DONE = new Set<WorkoutAdherenceItem["status"]>([
  "completed",
  "modified",
]);
/** Same "logged" rule as the week read model (a skip is a logged answer). */
const MEAL_LOGGED = new Set<MealComplianceItem["status"]>([
  "confirmed",
  "modified",
  "logged_later",
  "skipped",
]);
const CHECKIN_SUBMITTED = new Set<Checkin["status"]>(["submitted", "reviewed"]);

type EndedData = {
  weights: Measurement[];
  workouts: WorkoutAdherenceItem[];
  meals: MealComplianceItem[];
  checkins: Checkin[];
};

async function loadAllCheckins(
  relationshipId: string,
  fromDate: string,
  toDate: string,
): Promise<Checkin[]> {
  const items: Checkin[] = [];
  let cursor: string | undefined;
  // Bounded: a coaching period has at most a few dozen check-ins.
  for (let page = 0; page < 10; page += 1) {
    const res = await apiClient.listCheckins(relationshipId, {
      fromDate,
      toDate,
      cursor,
      limit: 100,
    });
    items.push(...res.items);
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return items;
}

const endedRowsStyle = {
  display: "grid",
  gap: "0.75rem",
  margin: 0,
  padding: "0.5rem 1.25rem 1.5rem 2rem",
} as const;
const endedRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(7rem, 11rem) minmax(0, 1fr)",
  gap: "1rem",
  alignItems: "baseline",
} as const;
const endedLabelStyle = {
  margin: 0,
  fontSize: "0.875rem",
  color: "var(--ink-500, #5b616b)",
} as const;
const endedValueStyle = {
  margin: 0,
  fontSize: "0.875rem",
  color: "var(--deep-navy, #1a1248)",
  fontVariantNumeric: "tabular-nums",
} as const;

function EndedRows({ label, rows }: { label: string; rows: Array<[string, string]> }) {
  return (
    <dl aria-label={label} style={endedRowsStyle}>
      {rows.map(([rowLabel, value]) => (
        <div key={rowLabel} style={endedRowStyle}>
          <dt style={endedLabelStyle}>{rowLabel}</dt>
          <dd style={endedValueStyle}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EndedOverviewBody({
  workspace,
  relationshipId,
  refreshEpoch,
  viewerTz,
  latestNote,
  notesLoadError,
  onRetryNotes,
}: {
  workspace: ClientWorkspace;
  relationshipId: string;
  refreshEpoch: number;
  viewerTz: string;
  latestNote: TrainerNote | null;
  notesLoadError: { message: string; requestId: string | null } | null;
  onRetryNotes: () => void;
}) {
  const { header, plan } = workspace;
  const traineeTz = resolveTraineeTimezone(header).timezone;
  const startedAt = header.startedAt ?? null;
  const endedAt = header.endedAt ?? null;
  const startDate = startedAt
    ? formatLocalDate(new Date(startedAt), traineeTz)
    : null;
  const endDate = endedAt ? formatLocalDate(new Date(endedAt), traineeTz) : null;
  const lastWeekStart = endDate ? addCivilDays(endDate, -6) : null;

  const [data, setData] = useState<EndedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!startedAt || !endedAt || !startDate || !endDate || !lastWeekStart) {
      return;
    }
    let cancelled = false;
    setLoadError(null);
    void Promise.all([
      apiClient.listMeasurements(relationshipId, { limit: 100 }),
      apiClient.getWorkoutAdherence(relationshipId, {
        fromDate: startDate,
        toDate: endDate,
      }),
      apiClient.getMealCompliance(relationshipId, {
        fromDate: lastWeekStart,
        toDate: endDate,
      }),
      loadAllCheckins(relationshipId, startDate, endDate),
    ])
      .then(([measurements, adherence, compliance, checkins]) => {
        if (cancelled) return;
        const fromMs = Date.parse(startedAt);
        const toMs = Date.parse(endedAt);
        const weights = measurements.items
          .filter((m) => m.type === "body_weight_kg")
          .filter((m) => {
            const at = Date.parse(m.observedAt);
            return at >= fromMs && at <= toMs;
          })
          .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
        setData({
          weights,
          workouts: adherence.items,
          meals: compliance.items,
          checkins,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setLoadError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load the coaching summary.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [
    relationshipId,
    refreshEpoch,
    attempt,
    startedAt,
    endedAt,
    startDate,
    endDate,
    lastWeekStart,
  ]);

  const range = (from: string, to: string) =>
    `${formatCivilDate(from)} — ${formatCivilDate(to)}`;

  const summaryRows: Array<[string, string]> = [];
  const lastWeekRows: Array<[string, string]> = [];
  if (data && lastWeekStart) {
    const firstWeight = data.weights[0];
    const lastWeight = data.weights[data.weights.length - 1];
    if (firstWeight && lastWeight) {
      summaryRows.push(["Weight", weightLine(firstWeight, lastWeight)]);
    }
    if (data.workouts.length > 0) {
      const done = data.workouts.filter((w) => WORKOUT_DONE.has(w.status)).length;
      summaryRows.push(["Workouts", `${done} of ${data.workouts.length}`]);
    }
    // A check-in still scheduled was never due, so it is not counted.
    const dueCheckins = data.checkins.filter((c) => c.status !== "scheduled");
    if (dueCheckins.length > 0) {
      const submitted = dueCheckins.filter((c) =>
        CHECKIN_SUBMITTED.has(c.status),
      ).length;
      summaryRows.push(["Check-ins", `${submitted} of ${dueCheckins.length}`]);
    }

    const weekWorkouts = data.workouts.filter(
      (w) => w.localDate >= lastWeekStart,
    );
    if (weekWorkouts.length > 0) {
      const done = weekWorkouts.filter((w) => WORKOUT_DONE.has(w.status)).length;
      lastWeekRows.push(["Workouts", `${done} of ${weekWorkouts.length}`]);
    }
    if (data.meals.length > 0) {
      const logged = data.meals.filter((m) => MEAL_LOGGED.has(m.status)).length;
      lastWeekRows.push(["Meals logged", `${logged} of ${data.meals.length}`]);
    }
    const lastCheckin = data.checkins
      .filter((c) => CHECKIN_SUBMITTED.has(c.status))
      .sort((a, b) => b.localDate.localeCompare(a.localDate))[0];
    if (lastCheckin) {
      // The check-in's own answer, else its linked weigh-in, else one logged that day.
      const kg =
        lastCheckin.answers?.bodyWeightKg ??
        data.weights.find((m) => m.checkinId === lastCheckin.id)?.value ??
        data.weights
          .filter(
            (m) =>
              formatLocalDate(new Date(m.observedAt), traineeTz) ===
              lastCheckin.localDate,
          )
          .at(-1)?.value ??
        null;
      lastWeekRows.push([
        "Last check-in",
        `${formatCivilDate(lastCheckin.localDate)}${
          kg != null ? ` · ${formatWeight(kg)}` : ""
        }`,
      ]);
    }
  }
  if (plan.plan && plan.version) {
    summaryRows.push([
      "Last plan",
      `${plan.plan.title} · v${plan.version.versionNumber}`,
    ]);
  } else if (header.effectivePlan) {
    summaryRows.push(["Last plan", header.effectivePlan.title]);
  }

  const loading = !data && !loadError && endDate != null && startDate != null;
  const errorLine = loadError ? (
    <p className="form-error ov-pad" role="alert">
      {loadError}{" "}
      <button
        type="button"
        className="text-link"
        onClick={() => setAttempt((n) => n + 1)}
      >
        Retry
      </button>
    </p>
  ) : null;

  return (
    <div
      className="overview-grid overview-ended"
      data-testid="screen-TW-09"
      data-state="ended"
    >
      <div className="overview-main">
        <section className="ov-card" aria-labelledby="ov-ended-summary">
          <div className="ov-card-h">
            <h2 className="t-h3" id="ov-ended-summary">
              Summary
              {startDate && endDate ? ` · ${range(startDate, endDate)}` : ""}
            </h2>
          </div>
          {errorLine}
          {loading ? <p className="muted ov-pad">Loading summary…</p> : null}
          {summaryRows.length > 0 ? (
            <EndedRows label="Summary" rows={summaryRows} />
          ) : null}
          {!loading && !loadError && summaryRows.length === 0 ? (
            <p className="muted ov-pad">Nothing was logged while coaching ran.</p>
          ) : null}
        </section>

        {endDate && lastWeekStart ? (
          <section className="ov-card" aria-labelledby="ov-ended-week">
            <div className="ov-card-h">
              <h2 className="t-h3" id="ov-ended-week">
                Last week · {range(lastWeekStart, endDate)}
              </h2>
              <span className="t-cap muted">Read-only</span>
            </div>
            {loadError ? null : loading ? (
              <p className="muted ov-pad">Loading last week…</p>
            ) : lastWeekRows.length > 0 ? (
              <EndedRows label="Last week" rows={lastWeekRows} />
            ) : (
              <p className="muted ov-pad">Nothing was logged in the last week.</p>
            )}
          </section>
        ) : null}
      </div>

      <aside className="overview-side">
        <section className="ov-card" aria-labelledby="ov-ended-notes">
          <div className="ov-card-h">
            <h2 className="t-h3" id="ov-ended-notes">
              Your notes
            </h2>
          </div>
          <div style={{ padding: "0 1.25rem 1.25rem" }}>
            {notesLoadError ? (
              <ErrorState
                kind="server"
                title="We couldn't load notes"
                message={notesLoadError.message}
                requestId={notesLoadError.requestId}
                onRetry={onRetryNotes}
                screenId="TW-09"
              />
            ) : latestNote ? (
              <div>
                <p
                  style={{
                    margin: "0.25rem 0 0.375rem",
                    fontSize: "0.875rem",
                    lineHeight: 1.5,
                    color: "var(--deep-navy, #1a1248)",
                    whiteSpace: "pre-line",
                  }}
                >
                  {latestNote.body}
                </p>
                <time
                  className="t-cap muted"
                  dateTime={latestNote.createdAt}
                  style={{ fontWeight: 600 }}
                >
                  {`${formatCivilDate(
                    formatLocalDate(new Date(latestNote.createdAt), viewerTz),
                  )}, ${formatClockTime(latestNote.createdAt, viewerTz)}`}
                </time>
              </div>
            ) : (
              <p className="muted">No notes yet</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
