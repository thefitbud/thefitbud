import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import type { TrainerNote, WeekReadModel } from "@fitbud/contracts";
import { ExceptionDrawer } from "../components/ExceptionDrawer";
import { ResponsivenessPanel } from "../components/workspace/ResponsivenessPanel";
import { MeasurementTrend } from "../components/MeasurementTrend";
import { apiClient } from "../lib/api";
import { formatIsoDateTime, formatLocalDate } from "../lib/format";
import { stage1Api } from "../lib/stage1-api";
import type { WorkspaceOutletContext } from "./workspaceContext";

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ClientOverviewPage() {
  const { relationshipId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const drawerId = params.get("exception");
  const { workspace, openWorkspaceModal } = useOutletContext<WorkspaceOutletContext>();
  const [week, setWeek] = useState<WeekReadModel | null>(null);
  const [notes, setNotes] = useState<TrainerNote[]>([]);

  useEffect(() => {
    if (!relationshipId) return;
    void stage1Api.getWorkspaceWeek(relationshipId).then(setWeek).catch(() => setWeek(null));
    void apiClient
      .listTrainerNotes(relationshipId)
      .then((res) => setNotes(res.items.slice(0, 3)))
      .catch(() => setNotes([]));
  }, [relationshipId]);

  if (!workspace) {
    return <p className="muted">Loading overview…</p>;
  }

  const { header, overview, plan } = workspace;
  const version = plan.version;
  const coachingReady =
    header.onboardingStatus === "active" ||
    header.onboardingStatus === "coaching_ready";

  if (!coachingReady) {
    return (
      <div className="overview-guided">
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

  return (
    <div className="overview-grid">
      <div className="overview-main">
        {overview.openException ? (
          <section className="overview-card priority-card">
            <h2>Needs attention</h2>
            <p>{overview.openException.summary}</p>
            <span className="severity-chip is-attention">Needs review</span>
            <button
              type="button"
              className="button-primary"
              onClick={() =>
                setParams({ exception: overview.openException!.id })
              }
            >
              Review
            </button>
          </section>
        ) : null}

        <section className="overview-card">
          <h2>This week</h2>
          {week ? (
            <>
              <p>
                {week.workouts.completed} of {week.workouts.assigned} workouts ·{" "}
                {week.meals.logged} of {week.meals.assigned} meals
                {overview.nextCheckin
                  ? ` · Check-in ${formatLocalDate(overview.nextCheckin.localDate)}`
                  : ""}
              </p>
              <div className="week-dots" aria-hidden="true">
                {week.days.map((day) => (
                  <span
                    key={day.date}
                    className={`week-dot is-${day.state}`}
                    title={day.date}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Weekly consistency loads separately.</p>
          )}
        </section>

        <section className="overview-card">
          <div className="section-head-inline">
            <h2>Recent activity</h2>
            <Link to={`/clients/${relationshipId}/activity`}>View all activity</Link>
          </div>
          {overview.recentActivity.length === 0 ? (
            <p className="muted">
              No activity logged yet. Activity appears once {header.traineeDisplayName.split(" ")[0]} starts logging.
            </p>
          ) : (
            <ul className="overview-activity-list">
              {overview.recentActivity.slice(0, 5).map((item) => (
                <li key={`${item.type}:${item.id}`}>
                  <span className={`status-pill status-${item.state}`}>
                    {item.state.replace(/_/g, " ")}
                  </span>
                  <span>{item.title}</span>
                  <span className="muted">{relativeTime(item.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="overview-side">
        {overview.nextCheckin ? (
          <section className="overview-card">
            <h2>Next check-in</h2>
            <p>{formatLocalDate(overview.nextCheckin.localDate)}</p>
            <Link to={`/clients/${relationshipId}/check-ins/${overview.nextCheckin.id}`}>
              Open
            </Link>
          </section>
        ) : null}

        {plan.plan && version ? (
          <section className="overview-card">
            <h2>Plan</h2>
            <p>{plan.plan.title}</p>
            <p className="muted">
              Effective since {formatLocalDate(version.effectiveFrom ?? "")} · v
              {version.versionNumber}
            </p>
            <Link to={`/clients/${relationshipId}/plan`}>Open plan</Link>
          </section>
        ) : (
          <section className="overview-card">
            <h2>Plan</h2>
            <p>No plan yet</p>
            <Link className="button-primary" to={`/clients/${relationshipId}/plan`}>
              Set up plan
            </Link>
          </section>
        )}

        <section className="overview-card">
          <div className="section-head-inline">
            <h2>Reminders</h2>
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

        <section className="overview-card">
          <h2>Progress</h2>
          {overview.progress.measurements.length >= 2 ? (
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
          <section className="overview-card">
            <h2>Renewal</h2>
            <p>{header.renewalState}</p>
          </section>
        ) : null}

        <section className="overview-card">
          <div className="section-head-inline">
            <h2>Coach notes</h2>
            <button
              type="button"
              className="text-link"
              onClick={() => openWorkspaceModal({ type: "note" })}
            >
              Add note
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="muted">No notes yet</p>
          ) : (
            <ul className="notes-preview">
              {notes.map((note) => (
                <li key={note.id}>
                  <p>{note.body}</p>
                  <span className="note-badge">
                    {note.visibility === "client" ? "Visible to client" : "Private"}
                  </span>
                  <time className="muted">{formatIsoDateTime(note.createdAt)}</time>
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
