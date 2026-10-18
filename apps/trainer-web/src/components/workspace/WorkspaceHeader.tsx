import { Link, NavLink } from "react-router-dom";
import type { Checkin, ClientWorkspace } from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { clientWhatsappHref } from "../../lib/whatsapp";
import { resolveTraineeTimezone } from "../../lib/trainee-timezone";
import { TimezoneBadge } from "./TimezoneBadge";
import { primaryActionFor } from "./primaryAction";
import type { WorkspaceModal } from "./WorkspaceModals";

function adherenceLabel(state: string): string {
  switch (state) {
    case "on_track":
      return "On track";
    case "needs_attention":
      return "Needs attention";
    case "no_recent_data":
      return "No recent data";
    default:
      return "Not available";
  }
}

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function WorkspaceHeader({
  workspace,
  relationshipId,
  submittedCheckinCount,
  onOpenModal,
}: {
  workspace: ClientWorkspace;
  relationshipId: string;
  submittedCheckinCount: number;
  onOpenModal: (modal: WorkspaceModal) => void;
}) {
  const { me } = useAuth();
  const header = workspace.header;
  const ended = header.onboardingStatus === "ended";
  const configurationActive =
    workspace.configuration.configuration?.status === "active";
  const reviewCheckin =
    workspace.overview.nextCheckin?.status === "submitted" ||
    workspace.overview.nextCheckin?.status === "due" ||
    workspace.overview.nextCheckin?.status === "overdue"
      ? workspace.overview.nextCheckin
      : null;

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

  const meta: string[] = [];
  if (header.goalShort) meta.push(header.goalShort);
  if (header.effectivePlan?.title) {
    meta.push(header.effectivePlan.title);
  }
  if (workspace.overview.nextCheckin) {
    meta.push(
      `Next check-in ${formatCivilDate(workspace.overview.nextCheckin.localDate)}`,
    );
  }
  const profileParts: string[] = [];
  if (header.traineeProfile.age != null) {
    profileParts.push(String(header.traineeProfile.age));
  }
  if (header.traineeProfile.gender) {
    profileParts.push(header.traineeProfile.gender);
  }
  if (profileParts.length) meta.push(profileParts.join(" · "));

  return (
    <header className="workspace-identity workspace-header-v2">
      {ended ? (
        <p className="banner-neutral" role="status" data-testid="screen-TW-30">
          Coaching ended. This workspace is read-only except reactivation.
        </p>
      ) : null}
      <div className="workspace-identity-row workspace-header-row1">
        <span className="avatar workspace-avatar" aria-hidden="true">{initials}</span>
        <div>
          <h1 className="workspace-title">{header.traineeDisplayName}</h1>
          <div className="workspace-chips">
            <span className="workspace-client-status">{statusLabel(header.onboardingStatus)}</span>
            <span className={`workspace-adherence is-${header.adherenceState.replaceAll("_", "-")}`}>
              {adherenceLabel(header.adherenceState)}
            </span>
            {header.renewalState && header.renewalState !== "current" ? (
              <span className="renewal-chip">{header.renewalState}</span>
            ) : null}
          </div>
        </div>
      </div>
      <p className="workspace-meta-v2">
        {meta.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </p>
      <div className="workspace-signals">
        {me?.timezone ? (
          <TimezoneBadge
            traineeName={header.traineeDisplayName}
            traineeTimezone={resolveTraineeTimezone(header).timezone}
            trainerTimezone={me.timezone}
          />
        ) : null}
        {header.hasCustomMealTimes ? (
          <Link className="chip-link" to={`/clients/${relationshipId}/plan`}>
            Custom meal times
          </Link>
        ) : null}
      </div>
      <div className="workspace-header-actions">
        {primary && !ended ? (
          primary.kind === "reactivate" ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => onOpenModal({ type: "reactivate" })}
            >
              {primary.label}
            </button>
          ) : (
            <Link className="button-primary" to={primary.to}>
              {primary.label}
            </Link>
          )
        ) : ended ? (
          <button
            type="button"
            className="button-primary"
            onClick={() => onOpenModal({ type: "reactivate" })}
          >
            Reactivate coaching
          </button>
        ) : null}
        {whatsappHrefValue ? (
          <a
            className="button-secondary"
            href={whatsappHrefValue}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        ) : (
          <button type="button" className="button-secondary" disabled title="No WhatsApp number on file">
            WhatsApp
          </button>
        )}
        <details className="workspace-menu">
          <summary className="workspace-icon-btn" aria-label="More actions">⋯</summary>
          <div className="workspace-menu-panel">
            <Link to={`/clients/${relationshipId}/configure`}>Configure coaching</Link>
            <Link to={`/clients/${relationshipId}/onboarding`}>Onboarding answers</Link>
            <button type="button" onClick={() => onOpenModal({ type: "responsiveness" })}>
              Reminder settings for this client
            </button>
            <button type="button" onClick={() => onOpenModal({ type: "note" })}>
              Add note
            </button>
            {!ended ? (
              <button type="button" onClick={() => onOpenModal({ type: "end" })}>
                End coaching
              </button>
            ) : null}
          </div>
        </details>
      </div>
      <nav className="workspace-tabs" aria-label="Client sections">
        <NavLink to={`/clients/${relationshipId}/overview`} className={tabClass} end>
          Overview
        </NavLink>
        <NavLink to={`/clients/${relationshipId}/plan`} className={tabClass}>
          Plan
        </NavLink>
        <NavLink to={`/clients/${relationshipId}/activity`} className={tabClass}>
          Activity
        </NavLink>
        <NavLink to={`/clients/${relationshipId}/progress`} className={tabClass}>
          Progress
        </NavLink>
        <NavLink to={`/clients/${relationshipId}/check-ins`} className={tabClass}>
          Check-ins
          {submittedCheckinCount > 0 ? (
            <span className="tab-badge">{submittedCheckinCount}</span>
          ) : null}
        </NavLink>
        <NavLink to={`/clients/${relationshipId}/history`} className={tabClass}>
          History
        </NavLink>
      </nav>
    </header>
  );
}

function tabClass({ isActive }: { isActive: boolean }) {
  return isActive ? "workspace-tab is-active" : "workspace-tab";
}
