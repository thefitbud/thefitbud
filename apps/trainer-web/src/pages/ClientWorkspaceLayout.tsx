import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { useCallback, useState } from "react";
import { apiClient } from "../lib/api";
import { useRealtimeHints } from "../realtime/useRealtimeHints";

export function ClientWorkspaceLayout() {
  const { relationshipId = "" } = useParams();
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  const bump = useCallback(() => {
    setRefreshEpoch((value) => value + 1);
  }, []);

  useRealtimeHints(apiClient, relationshipId || null, bump);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/clients">Clients</Link> / Workspace
          </p>
          <h1>Client workspace</h1>
          <p className="lede">
            Plan and Activity share the same assignment and execution records.
          </p>
        </div>
        <Link
          to={`/clients/${relationshipId}/configure`}
          className="button-secondary"
        >
          Configuration
        </Link>
      </header>

      <nav className="workspace-nav" aria-label="Client sections">
        <NavLink
          to={`/clients/${relationshipId}/plan`}
          className={navClass}
          end
        >
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
        <NavLink
          to={`/clients/${relationshipId}/history`}
          className={navClass}
        >
          History
        </NavLink>
      </nav>

      <Outlet context={{ refreshEpoch }} />
    </section>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "workspace-link is-active" : "workspace-link";
}
