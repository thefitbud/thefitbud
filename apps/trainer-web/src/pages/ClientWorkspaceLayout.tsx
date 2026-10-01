import { useCallback, useEffect, useState, type SVGProps } from "react";
import { Link, NavLink, Outlet, useMatch, useParams } from "react-router-dom";
import type { OnboardingStatus } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { onboardingStatusLabel } from "../lib/clients";
import { useRealtimeHints } from "../realtime/useRealtimeHints";

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

export function ClientWorkspaceLayout() {
  const { relationshipId = "" } = useParams();
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);
  const onOverviewIndex = useMatch({
    path: "/clients/:relationshipId",
    end: true,
  });
  const onOverviewPath = useMatch({
    path: "/clients/:relationshipId/overview",
    end: true,
  });
  const overviewActive = Boolean(onOverviewIndex || onOverviewPath);

  const bump = useCallback(() => {
    setRefreshEpoch((value) => value + 1);
  }, []);

  useRealtimeHints(apiClient, relationshipId || null, bump);

  useEffect(() => {
    if (!relationshipId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [relationship, invitations] = await Promise.all([
          apiClient.getRelationship(relationshipId),
          apiClient.listInvitations(),
        ]);
        if (cancelled) return;
        const invitation =
          invitations.items.find((item) => item.id === relationship.invitationId) ??
          invitations.items.find(
            (item) => item.coachingRelationshipId === relationshipId,
          );
        const name =
          invitation?.recipientDisplayName?.trim() ||
          invitation?.recipientEmail ||
          null;
        setDisplayName(name);
        setOnboardingStatus(relationship.onboardingStatus);
      } catch {
        if (!cancelled) {
          setDisplayName(null);
          setOnboardingStatus(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relationshipId]);

  const heading = displayName ?? clientHeading(relationshipId);
  const initials = initialsFromLabel(heading);
  const status = onboardingStatus
    ? onboardingStatusLabel(onboardingStatus)
    : "Workspace";

  return (
    <section className="page workspace-shell">
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
            <div>
              <h1 className="workspace-title">{heading}</h1>
              <p className="workspace-status">{status}</p>
            </div>
          </div>
        </div>
        <Link
          to={`/clients/${relationshipId}/configure`}
          className="button-secondary"
        >
          Configuration
        </Link>
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
        <NavLink
          to={`/clients/${relationshipId}/activity`}
          className={navClass}
        >
          Activity
        </NavLink>
        <NavLink
          to={`/clients/${relationshipId}/progress`}
          className={navClass}
        >
          Progress
        </NavLink>
        <NavLink
          to={`/clients/${relationshipId}/check-ins`}
          className={navClass}
        >
          Check-ins
        </NavLink>
        <NavLink to={`/clients/${relationshipId}/history`} className={navClass}>
          History
        </NavLink>
      </nav>

      <Outlet context={{ refreshEpoch }} />
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
