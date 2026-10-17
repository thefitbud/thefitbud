import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { ClientWorkspace } from "@fitbud/contracts";
import { WorkspaceHeader } from "../components/workspace/WorkspaceHeader";
import {
  WorkspaceModals,
  type WorkspaceModal,
} from "../components/workspace/WorkspaceModals";
import { apiClient } from "../lib/api";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import type { WorkspaceOutletContext } from "./workspaceContext";

export function ClientWorkspaceLayout() {
  const { relationshipId = "" } = useParams();
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [workspace, setWorkspace] = useState<ClientWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [submittedCheckins, setSubmittedCheckins] = useState(0);
  const [modal, setModal] = useState<WorkspaceModal>(null);

  const reloadWorkspace = useCallback(() => {
    setRefreshEpoch((value) => value + 1);
  }, []);

  useRealtimeHints(apiClient, relationshipId || null, reloadWorkspace);

  useEffect(() => {
    if (!relationshipId) return;
    let cancelled = false;
    setWorkspace(null);
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    setNotFound(false);

    void (async () => {
      try {
        const nextWorkspace = await apiClient.getClientWorkspace(relationshipId);
        if (cancelled) return;
        setWorkspace(nextWorkspace);
        const inbox = await apiClient.listTrainerCheckinInbox();
        if (!cancelled) {
          setSubmittedCheckins(
            inbox.items.filter(
              (item) =>
                item.coachingRelationshipId === relationshipId &&
                item.checkin.status === "submitted",
            ).length,
          );
        }
      } catch (err) {
        if (cancelled) return;
        setWorkspace(null);
        if (err instanceof ApiClientError && err.status === 404) {
          setNotFound(true);
          setWorkspaceError(null);
        } else {
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

  if (notFound) {
    return (
      <section className="page centered-status">
        <h1>Client not found</h1>
        <p className="lede">This coaching relationship doesn&apos;t exist or you don&apos;t have access.</p>
        <Link className="button-primary" to="/clients">Back to clients</Link>
      </section>
    );
  }

  if (workspaceLoading && !workspace) {
    return (
      <section className="page workspace-shell" aria-busy="true">
        <p className="muted">Loading client workspace…</p>
      </section>
    );
  }

  const outletContext: WorkspaceOutletContext = {
    workspace,
    workspaceLoading,
    workspaceError,
    notFound,
    refreshEpoch,
    reloadWorkspace,
    openWorkspaceModal: setModal,
    relationshipId,
  };

  if (!workspace) {
    return (
      <section className="page workspace-shell workspace-shell-degraded">
        {workspaceError ? (
          <p className="form-error" role="alert">
            {workspaceError}
          </p>
        ) : (
          <p className="muted">Workspace summary unavailable.</p>
        )}
        <div className="workspace-degraded-actions">
          <Link className="workspace-back" to="/clients">← Clients</Link>
          <button type="button" className="button-secondary" onClick={reloadWorkspace}>
            Try again
          </button>
        </div>
        <Outlet context={outletContext} />
      </section>
    );
  }

  return (
    <section className="page workspace-shell">
      <Link className="workspace-back" to="/clients">← Clients</Link>
      <WorkspaceHeader
        workspace={workspace}
        relationshipId={relationshipId}
        submittedCheckinCount={submittedCheckins}
        onOpenModal={setModal}
      />
      <Outlet context={outletContext} />
      <WorkspaceModals
        relationshipId={relationshipId}
        traineeName={workspace.header.traineeDisplayName}
        modal={modal}
        onClose={() => setModal(null)}
        onChanged={reloadWorkspace}
      />
    </section>
  );
}
