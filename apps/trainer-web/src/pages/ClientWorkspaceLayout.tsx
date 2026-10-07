import { useCallback, useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { Link, NavLink, Outlet, useMatch, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  Checkin,
  ClientWorkspace,
  CoachingConfiguration,
  OnboardingStatus,
  RenewalState,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { clientWhatsappHref } from "../lib/whatsapp";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import type { WorkspaceOutletContext } from "./workspaceContext";

function shortRelationshipId(relationshipId: string): string {
  return relationshipId.slice(0, 8);
}

function clientHeading(relationshipId: string): string {
  const shortId = shortRelationshipId(relationshipId);
  return shortId ? `Client ${shortId}` : "Client";
}

function initialsFromLabel(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  const first = words[0];
  const second = words[1];
  if (first && second) {
    return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  }
  const compact = words[0] ?? label.replace(/[^A-Za-z0-9]/g, "");
  return (compact.slice(0, 2) || "CL").toUpperCase();
}

/** Readable label for the derived onboarding status, including ended. */
function clientStatusLabel(status: OnboardingStatus): string {
  switch (status) {
    case "invited":
      return "Invited";
    case "onboarding_pending":
      return "Onboarding";
    case "onboarding_submitted":
      return "Onboarding submitted";
    case "coaching_ready":
      return "Coaching ready";
    case "active":
      return "Active";
    case "ended":
      return "Ended";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function clientStatusClass(status: OnboardingStatus): string {
  if (status === "active") return "workspace-client-status is-active";
  if (status === "ended") return "workspace-client-status is-ended";
  return "workspace-client-status is-onboarding";
}

function renewalLabel(state: RenewalState): string {
  switch (state) {
    case "current":
      return "Renewal current";
    case "upcoming":
      return "Renewal upcoming";
    case "due":
      return "Renewal due";
    case "expired":
      return "Renewal expired";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** Coaching configuration, shown in the menu so it is not another status badge. */
function coachingStatusLabel(
  status: CoachingConfiguration["status"] | null,
): string {
  if (status === "active") return "Active";
  if (status === "configured") return "Configured";
  if (status === "draft") return "Configuring";
  if (status === "superseded") return "Superseded";
  return "Not configured";
}

function reviewableCheckin(checkin: Checkin | null): Checkin | null {
  if (!checkin) return null;
  if (
    checkin.status === "due" ||
    checkin.status === "overdue" ||
    checkin.status === "submitted"
  ) {
    return checkin;
  }
  return null;
}

export function ClientWorkspaceLayout() {
  const { relationshipId = "" } = useParams();
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [workspace, setWorkspace] = useState<ClientWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [whatsappE164, setWhatsappE164] = useState<string | null>(null);
  const [loadedRelationshipId, setLoadedRelationshipId] = useState(relationshipId);
  const menuRef = useRef<HTMLDetailsElement>(null);

  if (loadedRelationshipId !== relationshipId) {
    setLoadedRelationshipId(relationshipId);
    setWorkspace(null);
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    setWhatsappE164(null);
  }

  const onOverviewIndex = useMatch({
    path: "/clients/:relationshipId",
    end: true,
  });
  const onOverviewPath = useMatch({
    path: "/clients/:relationshipId/overview",
    end: true,
  });
  const onConfigure = useMatch({
    path: "/clients/:relationshipId/configure",
    end: true,
  });
  const onOnboarding = useMatch({
    path: "/clients/:relationshipId/onboarding",
    end: true,
  });
  const overviewActive = Boolean(onOverviewIndex || onOverviewPath);

  const reloadWorkspace = useCallback(() => {
    setRefreshEpoch((value) => value + 1);
  }, []);

  useRealtimeHints(apiClient, relationshipId || null, reloadWorkspace);

  useEffect(() => {
    if (!relationshipId) return;
    let cancelled = false;
    setWorkspace(null);
    setWhatsappE164(null);
    setWorkspaceLoading(true);
    setWorkspaceError(null);

    void (async () => {
      try {
        const [nextWorkspace, relationship] = await Promise.all([
          apiClient.getClientWorkspace(relationshipId),
          apiClient.getRelationship(relationshipId),
        ]);
        if (cancelled) return;
        setWorkspace(nextWorkspace);

        if (!relationship.invitationId) {
          setWhatsappE164(null);
          return;
        }
        try {
          const invitation = await apiClient.getInvitation(
            relationship.invitationId,
          );
          if (!cancelled) {
            setWhatsappE164(invitation.recipientWhatsappE164);
          }
        } catch {
          if (!cancelled) setWhatsappE164(null);
        }
      } catch (err) {
        if (!cancelled) {
          setWorkspace(null);
          setWhatsappE164(null);
          setWorkspaceError(
            err instanceof ApiClientError
              ? err.message
              : "Could not load this client.",
          );
        }
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [relationshipId, refreshEpoch]);

  const header = workspace?.header ?? null;
  const configurationStatus =
    workspace?.configuration.configuration?.status ?? null;
  const onboardingStatus = header?.onboardingStatus ?? null;
  const reviewCheckin = reviewableCheckin(
    workspace?.overview.nextCheckin ?? null,
  );
  const heading =
    header?.traineeDisplayName ??
    (workspaceLoading ? "Client" : clientHeading(relationshipId));
  const initials = initialsFromLabel(heading);
  const clientStatus = onboardingStatus
    ? clientStatusLabel(onboardingStatus)
    : null;
  const coachingLabel = coachingStatusLabel(configurationStatus);
  const needsReminder =
    onboardingStatus === "invited" || onboardingStatus === "onboarding_pending";
  const planTitle = header?.effectivePlan?.title ?? null;

  const whatsappHrefValue = clientWhatsappHref({
    phoneE164: whatsappE164,
    name: heading,
    onboardingStatus,
  });
  const messageLabel = needsReminder ? "Remind" : "Message";

  const primaryAction = useMemo(() => {
    if (!onboardingStatus) return null;
    if (onboardingStatus === "onboarding_submitted") {
      return {
        label: "Review intake",
        to: `/clients/${relationshipId}/onboarding`,
      };
    }
    if (onboardingStatus === "onboarding_pending" && !whatsappE164) {
      return {
        label: "View onboarding",
        to: `/clients/${relationshipId}/onboarding`,
      };
    }
    if (
      onboardingStatus === "coaching_ready" &&
      configurationStatus !== "active" &&
      !reviewCheckin
    ) {
      return {
        label: "Continue setup",
        to: `/clients/${relationshipId}/configure`,
      };
    }
    if (reviewCheckin) {
      return {
        label: "Review check-in",
        to: `/clients/${relationshipId}/check-ins/${reviewCheckin.id}`,
      };
    }
    if (planTitle) {
      return { label: "Adjust plan", to: `/clients/${relationshipId}/plan` };
    }
    if (onboardingStatus === "coaching_ready" || onboardingStatus === "active") {
      return { label: "Open plan", to: `/clients/${relationshipId}/plan` };
    }
    return null;
  }, [
    configurationStatus,
    onboardingStatus,
    planTitle,
    relationshipId,
    reviewCheckin,
    whatsappE164,
  ]);

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

  const showPrimary =
    primaryAction &&
    !(onConfigure && primaryAction.to.endsWith("/configure")) &&
    !(onOnboarding && primaryAction.to.endsWith("/onboarding"));

  const outletContext: WorkspaceOutletContext = {
    workspace,
    workspaceLoading,
    workspaceError,
    refreshEpoch,
    reloadWorkspace,
  };

  return (
    <section className="page workspace-shell">
      <div className="workspace-frame">
        <header className="workspace-identity">
          <div className="workspace-identity-main">
            <Link className="workspace-back" to="/clients">
              <IconChevronLeft />
              Clients
            </Link>
            <div className="workspace-identity-row">
              <span className="avatar workspace-avatar" aria-hidden="true">
                {initials}
              </span>
              <div className="workspace-identity-copy">
                <div className="workspace-name-row">
                  <h1 className="workspace-title">{heading}</h1>
                </div>
                <p className="workspace-meta">
                  {clientStatus && onboardingStatus ? (
                    <span className={clientStatusClass(onboardingStatus)}>
                      <span className="workspace-status-dot" aria-hidden="true" />
                      {clientStatus}
                    </span>
                  ) : (
                    <span>{workspaceLoading ? "Loading client…" : "Client workspace"}</span>
                  )}
                  {planTitle ? <span>{planTitle}</span> : null}
                  {header?.primaryGoal ? <span>{header.primaryGoal}</span> : null}
                  {header?.renewalState ? (
                    <span>{renewalLabel(header.renewalState)}</span>
                  ) : null}
                </p>
                {workspaceError ? (
                  <p className="form-error" role="alert">
                    {workspaceError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <div className="workspace-header-actions">
            {showPrimary && primaryAction ? (
              <Link
                to={primaryAction.to}
                className={
                  needsReminder && whatsappHrefValue
                    ? "button-secondary"
                    : "button-primary"
                }
              >
                {primaryAction.label}
              </Link>
            ) : null}
            {whatsappHrefValue ? (
              <a
                className={needsReminder ? "button-primary" : "button-secondary"}
                href={whatsappHrefValue}
                target="_blank"
                rel="noopener noreferrer"
              >
                {messageLabel}
              </a>
            ) : (
              <button
                type="button"
                className="button-secondary"
                disabled
                title="Add a WhatsApp number when inviting this client"
              >
                {messageLabel}
              </button>
            )}
            <details className="workspace-menu" ref={menuRef}>
              <summary className="workspace-icon-btn" aria-label="More client actions">
                <IconMore />
              </summary>
              <div className="workspace-menu-panel">
                {onConfigure ? (
                  <Link to={`/clients/${relationshipId}/overview`} onClick={closeMenu}>
                    Back to overview
                  </Link>
                ) : (
                  <Link to={`/clients/${relationshipId}/configure`} onClick={closeMenu}>
                    Client settings
                  </Link>
                )}
                <p className="workspace-menu-status">
                  <span>Coaching</span>
                  {coachingLabel}
                </p>
              </div>
            </details>
          </div>
        </header>

        <nav className="workspace-tabs" aria-label="Client sections">
          <Link
            to={`/clients/${relationshipId}/overview`}
            className={tabClass(overviewActive)}
            aria-current={overviewActive ? "page" : undefined}
          >
            Overview
          </Link>
          <NavLink to={`/clients/${relationshipId}/plan`} className={navClass}>
            Plan
          </NavLink>
          <NavLink to={`/clients/${relationshipId}/activity`} className={navClass}>
            Activity
          </NavLink>
          <NavLink to={`/clients/${relationshipId}/progress`} className={navClass}>
            Progress
          </NavLink>
          <NavLink to={`/clients/${relationshipId}/check-ins`} className={navClass}>
            Check-ins
          </NavLink>
          <NavLink to={`/clients/${relationshipId}/history`} className={navClass}>
            History
          </NavLink>
        </nav>
      </div>

      <Outlet context={outletContext} />
    </section>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return tabClass(isActive);
}

function tabClass(isActive: boolean): string {
  return isActive ? "workspace-tab is-active" : "workspace-tab";
}

function IconChevronLeft() {
  return (
    <svg {...iconProps()}>
      <path d="M15 6 9 12l6 6" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg {...iconProps(18)}>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function iconProps(size = 16): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
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
