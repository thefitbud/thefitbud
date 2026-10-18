import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import type { Checkin, ClientWorkspace } from "@fitbud/contracts";
import { formatCivilDate, labelFor } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../Button";
import { OverflowMenu } from "../OverflowMenu";
import { StatusChip } from "../StatusChip";
import { WhatsAppGlyph } from "../WhatsAppGlyph";
import { clientWhatsappHref } from "../../lib/whatsapp";
import { resolveTraineeTimezone } from "../../lib/trainee-timezone";
import { TimezoneBadge } from "./TimezoneBadge";
import { primaryActionFor } from "./primaryAction";
import type { WorkspaceModal } from "./WorkspaceModals";

const WEEK_MS = 7 * 86_400_000;

function relationshipWeek(startedAt: string | null | undefined): number | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  return Math.max(1, Math.floor((Date.now() - started) / WEEK_MS) + 1);
}

function titleCaseGender(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function WorkspaceHeader({
  workspace,
  relationshipId,
  submittedCheckinCount,
  onOpenModal,
  online = true,
}: {
  workspace: ClientWorkspace;
  relationshipId: string;
  submittedCheckinCount: number;
  onOpenModal: (modal: WorkspaceModal) => void;
  online?: boolean;
}) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const header = workspace.header;
  const ended = header.onboardingStatus === "ended";
  const configurationActive =
    workspace.configuration.configuration?.status === "active";
  const reviewCheckin =
    workspace.overview.pendingReviewCheckin ??
    (workspace.overview.nextCheckin?.status === "due" ||
    workspace.overview.nextCheckin?.status === "overdue"
      ? workspace.overview.nextCheckin
      : null);

  const primary = primaryActionFor({
    relationshipId,
    onboardingStatus: header.onboardingStatus,
    configurationActive,
    reviewCheckin: reviewCheckin as Checkin | null,
    openExceptionId: workspace.overview.openException?.id ?? null,
    ended,
  });

  const whatsappHrefValue = clientWhatsappHref({
    phoneE164: header.clientWhatsappE164,
    name: header.traineeDisplayName,
    onboardingStatus: header.onboardingStatus,
  });

  const initials = header.traineeDisplayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

  const metaNodes: Array<{ key: string; node: ReactNode }> = [];
  if (header.goalShort) {
    metaNodes.push({ key: "goal", node: <span>{header.goalShort}</span> });
  }
  if (header.effectivePlan?.title) {
    metaNodes.push({
      key: "plan",
      node: (
        <Link to={`/clients/${relationshipId}/plan`}>
          {header.effectivePlan.title}
        </Link>
      ),
    });
  }
  const weekNumber = ended ? null : relationshipWeek(header.startedAt);
  if (weekNumber != null) {
    metaNodes.push({ key: "week", node: <span>Week {weekNumber}</span> });
  }
  const nextScheduled = workspace.overview.nextCheckin;
  if (
    !ended &&
    nextScheduled &&
    nextScheduled.status !== "submitted" &&
    nextScheduled.status !== "reviewed"
  ) {
    metaNodes.push({
      key: "checkin",
      node: (
        <span>
          Next check-in {formatCivilDate(nextScheduled.localDate)}
        </span>
      ),
    });
  }
  const profileParts: string[] = [];
  if (header.traineeProfile.age != null) {
    profileParts.push(String(header.traineeProfile.age));
  }
  if (header.traineeProfile.gender) {
    profileParts.push(titleCaseGender(header.traineeProfile.gender));
  }
  if (profileParts.length) {
    metaNodes.push({
      key: "profile",
      node: <span>{profileParts.join(" · ")}</span>,
    });
  }
  if (header.renewalState && header.renewalState !== "current") {
    const renewsOn = header.renewsOn
      ? formatCivilDate(header.renewsOn)
      : null;
    const stateLabel = labelFor("renewal_state", header.renewalState);
    metaNodes.push({
      key: "renewal",
      node: (
        <StatusChip
          kind="renewal"
          value={header.renewalState}
          label={`Renewal ${stateLabel.toLowerCase()}${renewsOn ? ` · ${renewsOn}` : ""}`}
          className="status-chip-xs"
        />
      ),
    });
  }

  function runPrimary() {
    if (!primary) return;
    if (primary.kind === "reactivate") {
      onOpenModal({ type: "reactivate" });
      return;
    }
    if (primary.kind === "review_exception" && primary.exceptionId) {
      setParams({ exception: primary.exceptionId });
      navigate(`/clients/${relationshipId}/overview?exception=${primary.exceptionId}`);
      return;
    }
    navigate(primary.to);
  }

  const overflowItems = [
    {
      id: "configure",
      label: "Configure coaching",
      onSelect: () => navigate(`/clients/${relationshipId}/configure`),
    },
    {
      id: "onboarding",
      label: "Onboarding answers",
      onSelect: () => navigate(`/clients/${relationshipId}/onboarding`),
    },
    {
      id: "reminders",
      label: "Reminder settings for this client",
      onSelect: () => onOpenModal({ type: "responsiveness" }),
    },
    ...(!ended
      ? [
          {
            id: "note",
            label: "Add note",
            onSelect: () => onOpenModal({ type: "note" }),
            disabled: !online,
          },
          {
            id: "end",
            label: "End coaching",
            onSelect: () => onOpenModal({ type: "end" }),
            destructive: true,
            disabled: !online,
          },
        ]
      : []),
  ];

  return (
    <header className="wsh" data-testid="screen-TW-09a">
      {ended ? (
        <p className="banner-neutral" role="status" data-testid="screen-TW-30">
          Coaching ended. This workspace is read-only except reactivation.
        </p>
      ) : null}
      <div className="wsh-in">
        <nav className="wsh-crumb" aria-label="Breadcrumb">
          <Link to="/clients">Clients</Link>
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
          <span aria-current="page">{header.traineeDisplayName}</span>
        </nav>
        <div className="wsh-r1">
          <span className="avatar workspace-avatar lg" aria-hidden="true">
            {initials}
          </span>
          <div className="wsh-id">
            <div className="wsh-name-row">
              <h1 className="workspace-title">{header.traineeDisplayName}</h1>
              <StatusChip kind="lifecycle" value={header.onboardingStatus} />
              <StatusChip kind="adherence" value={header.adherenceState} />
            </div>
            {metaNodes.length > 0 ? (
              <div className="wsh-meta">
                {metaNodes.map((item) => (
                  <span key={item.key} className="wsh-meta-item">
                    {item.node}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="wsh-signals">
              {me?.timezone ? (
                <TimezoneBadge
                  traineeName={header.traineeDisplayName}
                  traineeTimezone={resolveTraineeTimezone(header).timezone}
                  trainerTimezone={me.timezone}
                />
              ) : null}
              {header.hasCustomMealTimes ? (
                <Link
                  className="chip-link"
                  to={`/clients/${relationshipId}/plan`}
                >
                  Custom meal times
                </Link>
              ) : null}
            </div>
          </div>
          <div className="wsh-acts">
            {whatsappHrefValue ? (
              <a
                className="button-secondary button-whatsapp"
                href={whatsappHrefValue}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsAppGlyph />
                Message on WhatsApp
              </a>
            ) : (
              <button
                type="button"
                className="button-secondary button-whatsapp"
                disabled
                title="No WhatsApp number on file for this client"
              >
                <WhatsAppGlyph />
                Message on WhatsApp
              </button>
            )}
            {ended ? (
              <Button
                variant="primary"
                disabled={!online}
                onClick={() => onOpenModal({ type: "reactivate" })}
              >
                Reactivate coaching
              </Button>
            ) : primary ? (
              <Button variant="primary" disabled={!online} onClick={runPrimary}>
                {primary.label}
              </Button>
            ) : null}
            <OverflowMenu items={overflowItems} />
          </div>
        </div>
        <nav className="wsh-tabs" aria-label="Client sections">
          <NavLink
            to={`/clients/${relationshipId}/overview`}
            className={tabClass}
            end
          >
            Overview
          </NavLink>
          <NavLink to={`/clients/${relationshipId}/plan`} className={tabClass}>
            Plan
          </NavLink>
          <NavLink
            to={`/clients/${relationshipId}/activity`}
            className={tabClass}
          >
            Activity
          </NavLink>
          <NavLink
            to={`/clients/${relationshipId}/progress`}
            className={tabClass}
          >
            Progress
          </NavLink>
          <NavLink
            to={`/clients/${relationshipId}/check-ins`}
            className={tabClass}
          >
            Check-ins
            {submittedCheckinCount > 0 ? (
              <span className="tab-badge">{submittedCheckinCount}</span>
            ) : null}
          </NavLink>
          <NavLink
            to={`/clients/${relationshipId}/history`}
            className={tabClass}
          >
            History
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function tabClass({ isActive }: { isActive: boolean }) {
  return isActive ? "wsh-tab is-active" : "wsh-tab";
}
