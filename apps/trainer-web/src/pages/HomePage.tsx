import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  AttentionItem,
  CoachingRelationship,
  ExceptionType,
  Invitation,
  TrainerCheckinInboxItem,
} from "@fitbud/contracts";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";
import { useRealtimeHints } from "../realtime/useRealtimeHints";

type HomeFilter = "all" | "attention" | "checkins";

const ACTIONABLE_CHECKIN_STATUSES = new Set(["due", "overdue", "submitted"]);

const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  missed_workout: "Missed workout",
  overdue_meal: "Meal gap",
  overdue_checkin: "Check-in",
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

function trainerName(email: string | null): string {
  const local = email?.split("@")[0]?.trim();
  if (!local) return "Trainer";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function statusLabel(status: string): string {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLocalDate(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return localDate;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function HomePage() {
  const { email } = useAuth();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [checkins, setCheckins] = useState<TrainerCheckinInboxItem[]>([]);
  const [relationships, setRelationships] = useState<CoachingRelationship[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HomeFilter>("all");
  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCheckinError(null);

    const [attentionOutcome, relationshipsOutcome, inboxOutcome, invitationOutcome] =
      await Promise.all([
        apiClient.getAttentionFeed({ limit: 50 }).then(
          (value) => ({ ok: true as const, value }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        apiClient.listRelationships({ limit: 50 }).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const }),
        ),
        apiClient.listTrainerCheckinInbox().then(
          (value) => ({ ok: true as const, value }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        apiClient.listInvitations().then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const }),
        ),
      ]);

    if (attentionOutcome.ok) {
      setItems(attentionOutcome.value.items);
    } else {
      setItems([]);
      setError(errorMessage(attentionOutcome.err, "Could not load attention feed."));
    }

    if (relationshipsOutcome.ok) {
      setRelationships(relationshipsOutcome.value.items);
    } else {
      setRelationships([]);
    }

    if (invitationOutcome.ok) {
      setInvitations(invitationOutcome.value.items);
    } else {
      setInvitations([]);
    }

    if (inboxOutcome.ok) {
      setCheckins(inboxOutcome.value.items);
    } else {
      setCheckins([]);
      setCheckinError(errorMessage(inboxOutcome.err, "Could not load check-ins."));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const relationshipIds = relationships.map((item) => item.id);
  useRealtimeHints(apiClient, relationshipIds, () => {
    void load();
  });

  const actionableCheckins = checkins.filter((item) =>
    ACTIONABLE_CHECKIN_STATUSES.has(item.checkin.status),
  );
  const coachingReady = relationships.filter(
    (item) => item.status === "coaching_ready",
  ).length;
  const pendingInvites = invitations.filter((item) => item.status === "pending");
  const clientTotal = relationships.length + pendingInvites.length;
  const name = trainerName(email);
  const showAttention = filter === "all" || filter === "attention";
  const showCheckins = filter === "all" || filter === "checkins";

  const nameByRelationship = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of items) {
      if (item.traineeDisplayName) {
        names.set(item.coachingRelationshipId, item.traineeDisplayName);
      }
    }
    return names;
  }, [items]);

  return (
    <div className="cockpit">
      <header className="cockpit-hero">
        <div className="cockpit-intro">
          <div className="cockpit-title-row">
            <h1>
              {greeting(now)}, {name}
            </h1>
            <p className={items.length > 0 ? "callout is-hot" : "callout"}>
              {items.length} items need intervention
              {actionableCheckins.length > 0
                ? ` · ${actionableCheckins.length} check-ins to review`
                : ""}
            </p>
          </div>
          <p className="cockpit-sub">
            Operational snapshot. Normal client activity stays quiet. Meaningful deviations are surfaced below.
          </p>
        </div>
        <dl className="kpi-cluster" aria-label="Coaching snapshot">
          <Kpi label="Clients" value={clientTotal} tone="neutral" />
          <Kpi label="Coaching ready" value={coachingReady} tone="success" />
          <Kpi label="Exceptions" value={error ? "—" : items.length} tone="warning" />
        </dl>
      </header>

      <div className="quick-row">
        <span className="section-kicker">Quick actions</span>
        <Link className="pill-btn is-solid" to="/clients/add">
          + Add Client
        </Link>
        <Link className="pill-btn" to="/templates">
          Create Plan Template
        </Link>
        <Link className="pill-btn" to="/clients">
          Open roster
        </Link>
        <Link className="pill-btn" to="/checkins">
          Review check-ins
        </Link>
      </div>

      <div className="filter-bar">
        <div className="segment" role="group" aria-label="Home sections">
          <Segment pressed={filter === "all"} onClick={() => setFilter("all")}>
            All overview
          </Segment>
          <Segment pressed={filter === "attention"} onClick={() => setFilter("attention")}>
            Needs attention
            <span className="segment-count">{items.length}</span>
          </Segment>
          <Segment pressed={filter === "checkins"} onClick={() => setFilter("checkins")}>
            Today&apos;s work
            <span className="segment-count">
              {actionableCheckins.length + pendingInvites.length}
            </span>
          </Segment>
        </div>
        <p className="filter-note">Showing the loaded cockpit</p>
      </div>

      {loading ? (
        <p className="muted" aria-busy="true">
          Loading the coaching snapshot…
        </p>
      ) : null}

      {showAttention ? (
        <section className="cockpit-section" aria-labelledby="attention-heading">
          <div className="section-head">
            <div>
              <h2 id="attention-heading">
                <span className="warn-mark" aria-hidden="true">!</span>
                Needs attention
                <span className="flag-pill">Action required ({items.length})</span>
              </h2>
              <p>Client deviations that need a coaching decision. On-track clients stay off this list.</p>
            </div>
            <p className="prioritized">Prioritized by urgency</p>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <div className="work-panel">
              <p className="panel-empty">No open exceptions. Invite a client to begin coaching.</p>
            </div>
          ) : null}
          {items.length > 0 ? (
            <ul className="attention-grid">
              {items.map((item) => (
                <AttentionCard key={item.exception.id} item={item} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {showCheckins ? (
        <section className="cockpit-section" aria-labelledby="work-heading">
          <div className="section-head">
            <div>
              <h2 id="work-heading">
                Today&apos;s work
                <span className="commit-pill">
                  {actionableCheckins.length + pendingInvites.length} commitments
                </span>
              </h2>
              <p>Due check-ins and invitations still waiting on the trainee.</p>
            </div>
            <Link className="text-link" to="/checkins">
              View all schedules
            </Link>
          </div>
          <div className="work-panel">
            {checkinError ? (
              <p className="form-error" role="alert">
                {checkinError}
              </p>
            ) : null}
            {pendingInvites.map((invite) => {
              const label =
                invite.recipientDisplayName?.trim() || invite.recipientEmail;
              return (
                <article key={invite.id} className="work-row">
                  <span className="work-icon" aria-hidden="true">
                    {initials(label)}
                  </span>
                  <div>
                    <p className="work-title">
                      Invitation waiting
                      <span className="person-chip">{label}</span>
                      <span className="person-chip">Invited</span>
                    </p>
                    <p className="work-copy">{invite.recipientEmail}</p>
                  </div>
                  <Link className="pill-btn" to="/clients">
                    Open roster
                  </Link>
                </article>
              );
            })}
            {!loading && !checkinError && actionableCheckins.length === 0 && pendingInvites.length === 0 ? (
              <p className="panel-empty">Nothing is due, overdue, or submitted right now.</p>
            ) : null}
            {actionableCheckins.map((item) => {
              const person =
                nameByRelationship.get(item.coachingRelationshipId) ??
                `Client ${item.coachingRelationshipId.slice(0, 8)}`;
              return (
                <article key={item.checkin.id} className="work-row">
                  <span className={`work-icon work-${item.checkin.status}`} aria-hidden="true">
                    {item.checkin.status === "submitted" ? "✓" : "!"}
                  </span>
                  <div>
                    <p className="work-title">
                      Check-in {statusLabel(item.checkin.status)}
                      <span className="person-chip">{person}</span>
                      <time dateTime={item.checkin.localDate}>
                        {formatLocalDate(item.checkin.localDate)}
                      </time>
                    </p>
                    <p className="work-copy">
                      Review this check-in in the client workspace.
                    </p>
                  </div>
                  <Link
                    className="pill-btn is-solid"
                    to={`/clients/${item.coachingRelationshipId}/check-ins/${item.checkin.id}`}
                  >
                    Review now
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const name = item.traineeDisplayName ?? "Trainee";
  const type = item.exception.type;
  return (
    <li className={`exception-card tone-${type}`}>
      <div className="exception-top">
        <span className="avatar" aria-hidden="true">
          {initials(name)}
        </span>
        <div className="exception-id">
          <p className="exception-name">{name}</p>
          <span className={`status-pill status-${item.exception.status}`}>
            {statusLabel(item.exception.status)}
          </span>
        </div>
        <span className="category-pill">{EXCEPTION_TYPE_LABEL[type]}</span>
      </div>
      <p className="exception-summary">{item.exception.summary}</p>
      <div className="exception-actions">
        <Link className="pill-btn" to={`/exceptions/${item.exception.id}`}>
          Open
        </Link>
        <Link
          className="pill-btn is-solid"
          to={
            type === "overdue_checkin"
              ? `/clients/${item.coachingRelationshipId}/check-ins`
              : `/clients/${item.coachingRelationshipId}/plan`
          }
        >
          {type === "overdue_checkin" ? "Review check-in" : "Open client"}
        </Link>
      </div>
    </li>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "warning" | "neutral" | "info" | "success";
}) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <dd>{value}</dd>
      <dt>{label}</dt>
    </div>
  );
}

function Segment({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={pressed ? "segment-btn is-on" : "segment-btn"}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
