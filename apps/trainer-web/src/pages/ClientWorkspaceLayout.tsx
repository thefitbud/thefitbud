import { Link, NavLink, Outlet, useMatch, useParams } from "react-router-dom";
import { useCallback, useState } from "react";
import { apiClient } from "../lib/api";
import { useRealtimeHints } from "../realtime/useRealtimeHints";

function shortRelationshipId(relationshipId: string): string {
  return relationshipId.slice(0, 8);
}

function clientHeading(relationshipId: string): string {
  const shortId = shortRelationshipId(relationshipId);
  return shortId ? `Client ${shortId}` : "Client";
}

function clientInitials(relationshipId: string): string {
  const initials = shortRelationshipId(relationshipId).slice(0, 2).toUpperCase();
  return initials || "—";
}

export function ClientWorkspaceLayout() {
  const { relationshipId = "" } = useParams();
  const [refreshEpoch, setRefreshEpoch] = useState(0);
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

  return (
    <section className="page workspace-shell">
      <header className="workspace-identity">
        <div className="workspace-identity-main">
          <Link className="workspace-back" to="/clients">
            Clients
          </Link>
          <div className="workspace-identity-row">
            <span className="avatar workspace-avatar" aria-hidden="true">
              {clientInitials(relationshipId)}
            </span>
            <div>
              <h1 className="workspace-title">{clientHeading(relationshipId)}</h1>
              <p className="workspace-status">Workspace</p>
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
