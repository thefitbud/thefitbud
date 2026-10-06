import { useCallback, useEffect, useMemo, useState, type ReactNode, type SVGProps } from "react";
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

function groupAttentionByClient(items: AttentionItem[]): Array<{
  item: AttentionItem;
  otherCount: number;
}> {
  const groups = new Map<string, AttentionItem[]>();
  const order: string[] = [];
  for (const item of items) {
    const key = item.coachingRelationshipId;
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
      order.push(key);
    }
  }
  return order.flatMap((key) => {
    const group = groups.get(key) ?? [];
    const item = group[0];
    if (!item) return [];
    return [
      {
        item,
        otherCount: Math.max(0, group.length - 1),
      },
    ];
  });
}

function checkinWorkTitle(status: string): string {
  if (status === "submitted") return "Check-in Awaiting Review";
  if (status === "due") return "Check-in Due";
  if (status === "overdue") return "Check-in Overdue";
  return `Check-in ${statusLabel(status)}`;
}

function SummaryText({
  text,
  omitDetails = false,
}: {
  text: string;
  omitDetails?: boolean;
}) {
  const idx = text.indexOf(":");
  if (omitDetails && idx > 0) {
    return <strong>{text.slice(0, idx)}</strong>;
  }
  if (idx <= 0 || idx > 56) return text;
  return (
    <>
      <strong>{text.slice(0, idx + 1)}</strong>
      {text.slice(idx + 1)}
    </>
  );
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
    (item) =>
      item.onboardingStatus === "coaching_ready" ||
      item.onboardingStatus === "active",
  ).length;
  const pendingInvites = invitations.filter((item) => item.status === "pending");
  const intakeReviews = relationships.filter(
    (item) => item.onboardingStatus === "onboarding_submitted",
  );
  const clientTotal = relationships.length + pendingInvites.length;
  const name = trainerName(email);
  const showAttention = filter === "all" || filter === "attention";
  const showCheckins = filter === "all" || filter === "checkins";
  const todayWorkCount =
    actionableCheckins.length + pendingInvites.length + intakeReviews.length;
  const kpiValue = (value: number) => (loading ? "—" : value);

  const attentionCards = useMemo(() => groupAttentionByClient(items), [items]);

  const nameByRelationship = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of items) {
      if (item.traineeDisplayName) {
        names.set(item.coachingRelationshipId, item.traineeDisplayName);
      }
    }
    return names;
  }, [items]);

  const calloutParts = [
    `${items.length} items need intervention`,
    actionableCheckins.length > 0
      ? `${actionableCheckins.length} scheduled tasks today`
      : null,
  ].filter(Boolean);

  return (
    <div className="cockpit">
      <header className="cockpit-hero">
        <div className="cockpit-hero-main">
          <div className="cockpit-intro">
            <div className="cockpit-title-row">
              <h1>
                {greeting(now)}, <span className="cockpit-name">{name}</span>
              </h1>
              <p className={items.length > 0 ? "callout is-hot" : "callout"}>
                {items.length > 0 ? <IconWarn /> : null}
                <span>{calloutParts.join(" • ")}</span>
              </p>
            </div>
          </div>
          <dl className="kpi-cluster" aria-label="Coaching snapshot">
            <Kpi label="Active Trainees" value={kpiValue(clientTotal)} tone="neutral" />
            <Kpi label="Quietly On Track" value={kpiValue(coachingReady)} tone="success" />
            <Kpi
              label="Exceptions Surfaced"
              value={loading || error ? "—" : items.length}
              tone="warning"
            />
          </dl>
        </div>
        <p className="cockpit-sub">
          Operational snapshot. Normal client activity remains silent. Meaningful
          deviations are surfaced below.
        </p>
      </header>

      <div className="quick-row">
        <span className="section-kicker">Quick actions</span>
        <Link className="pill-btn is-solid" to="/clients/add">
          <IconPlus />
          Add Client
        </Link>
        <Link className="pill-btn" to="/templates">
          <IconTemplates />
          Create Plan Template
        </Link>
        <Link className="pill-btn" to="/clients">
          <IconClients />
          Open roster
        </Link>
        <Link className="pill-btn" to="/checkins">
          <IconCalendar />
          Review check-ins
        </Link>
      </div>

      <div className="filter-bar">
        <div className="segment" role="group" aria-label="Home sections">
          <Segment pressed={filter === "all"} onClick={() => setFilter("all")}>
            <span className="chip-dot" aria-hidden="true" />
            All Overview
          </Segment>
          <Segment pressed={filter === "attention"} onClick={() => setFilter("attention")}>
            <IconWarn />
            Needs Attention
            <span className="segment-count is-attention">{items.length}</span>
          </Segment>
          <Segment pressed={filter === "checkins"} onClick={() => setFilter("checkins")}>
            <IconClock />
            Today&apos;s Work
            <span className="segment-count is-work">{todayWorkCount}</span>
          </Segment>
        </div>
        <p className="filter-note">
          <IconLayers />
          Showing the loaded cockpit
        </p>
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
                <span className="warn-mark" aria-hidden="true">
                  <IconWarn />
                </span>
                Needs Attention
                <span className="flag-pill">Action Required ({items.length})</span>
              </h2>
              <p>
                Client deviations requiring coach intervention. Silent clients remain
                unlisted.
              </p>
            </div>
            <p className="prioritized">Prioritized by Urgency</p>
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
              {attentionCards.map(({ item, otherCount }) => (
                <AttentionCard
                  key={item.coachingRelationshipId}
                  item={item}
                  otherCount={otherCount}
                />
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
                <span className="work-mark" aria-hidden="true">
                  <IconClock />
                </span>
                Today&apos;s Work
                <span className="commit-pill">{todayWorkCount} Commitments</span>
              </h2>
              <p>Due check-ins, invitations, and onboarding waiting for you.</p>
            </div>
            <Link className="text-link" to="/checkins">
              View all check-ins →
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
            {intakeReviews.map((relationship) => {
              const invite = invitations.find(
                (item) =>
                  item.coachingRelationshipId === relationship.id ||
                  item.id === relationship.invitationId,
              );
              const label =
                invite?.recipientDisplayName?.trim() ||
                invite?.recipientEmail ||
                `Client ${relationship.id.slice(0, 8)}`;
              return (
                <article key={relationship.id} className="work-row">
                  <span className="work-icon" aria-hidden="true">
                    {initials(label)}
                  </span>
                  <div>
                    <p className="work-title">
                      Onboarding ready to review
                      <span className="person-chip">{label}</span>
                      <span className="person-chip">Submitted</span>
                    </p>
                    <p className="work-copy">
                      Review the answers, then configure coaching.
                    </p>
                  </div>
                  <Link
                    className="pill-btn is-solid"
                    to={`/clients/${relationship.id}/onboarding`}
                  >
                    Review intake →
                  </Link>
                </article>
              );
            })}
            {!loading &&
            !checkinError &&
            actionableCheckins.length === 0 &&
            pendingInvites.length === 0 &&
            intakeReviews.length === 0 ? (
              <p className="panel-empty">Nothing is due, overdue, or submitted right now.</p>
            ) : null}
            {actionableCheckins.map((item) => {
              const person =
                nameByRelationship.get(item.coachingRelationshipId) ??
                `Client ${item.coachingRelationshipId.slice(0, 8)}`;
              return (
                <article key={item.checkin.id} className="work-row">
                  <span className={`work-icon work-${item.checkin.status}`} aria-hidden="true">
                    {item.checkin.status === "submitted" ? <IconDoc /> : <IconCalendar />}
                  </span>
                  <div>
                    <p className="work-title">
                      {checkinWorkTitle(item.checkin.status)}
                      <span className="person-chip">{person}</span>
                      <time
                        className={`date-chip date-${item.checkin.status}`}
                        dateTime={item.checkin.localDate}
                      >
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
                    Review now →
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

function AttentionCard({
  item,
  otherCount,
}: {
  item: AttentionItem;
  otherCount: number;
}) {
  const name = item.traineeDisplayName ?? "Trainee";
  const type = item.exception.type;
  return (
    <li className={`exception-card is-linked tone-${type}`}>
      <Link className="exception-card-link" to={`/exceptions/${item.exception.id}`}>
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
          <span className="exception-type-meta">
            <span className={`category-pill type-${type}`}>{EXCEPTION_TYPE_LABEL[type]}</span>
            {otherCount > 0 ? (
              <span className="exception-more">
                +{otherCount}
                <span className="sr-only"> other exceptions</span>
              </span>
            ) : null}
          </span>
        </div>
        <p className="exception-summary">
          <span className="exception-type-icon" aria-hidden="true">
            <TypeIcon type={type} />
          </span>
          <span>
            <SummaryText
              text={item.exception.summary}
              omitDetails={type === "overdue_meal"}
            />
          </span>
        </p>
      </Link>
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

function iconProps(): SVGProps<SVGSVGElement> {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
  };
}

function IconPlus() {
  return (
    <svg {...iconProps()}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconTemplates() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconClients() {
  return (
    <svg {...iconProps()}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 4.13a3 3 0 0 1 0 5.75" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  );
}

function IconWarn() {
  return (
    <svg {...iconProps()} width={14} height={14}>
      <path d="M12 3 3 20h18L12 3z" />
      <path d="M12 10v5M12 17h.01" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg {...iconProps()} width={14} height={14}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg {...iconProps()} width={14} height={14}>
      <path d="M7 4h7l4 4v12H7z" />
      <path d="M14 4v4h4M9 13h6M9 17h4" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg {...iconProps()} width={14} height={14}>
      <path d="M12 4 4 8l8 4 8-4-8-4z" />
      <path d="m4 12 8 4 8-4" />
    </svg>
  );
}

function TypeIcon({ type }: { type: ExceptionType }) {
  if (type === "overdue_meal") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="3" y="2" width="2" height="8" rx="1" fill="currentColor" />
        <rect x="6" y="2" width="2" height="8" rx="1" fill="currentColor" />
        <path fill="currentColor" d="M3 10h5v1.5A2.5 2.5 0 0 1 5.5 14h-1A2.5 2.5 0 0 1 2 11.5V10h1z" />
        <rect x="11" y="2" width="2.5" height="12" rx="1.2" fill="currentColor" />
      </svg>
    );
  }
  if (type === "overdue_checkin") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="3" y="2" width="10" height="12" rx="2" fill="currentColor" opacity="0.2" />
        <rect x="3" y="2" width="10" height="12" rx="2" stroke="currentColor" fill="none" strokeWidth="1.4" />
        <path stroke="currentColor" strokeWidth="1.4" d="M6 6h4M6 9h4M6 12h2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="4" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="4" cy="11" r="2" fill="currentColor" />
      <circle cx="12" cy="11" r="2" fill="currentColor" />
      <rect x="5.5" y="4.25" width="5" height="1.5" fill="currentColor" />
      <rect x="5.5" y="10.25" width="5" height="1.5" fill="currentColor" />
    </svg>
  );
}
