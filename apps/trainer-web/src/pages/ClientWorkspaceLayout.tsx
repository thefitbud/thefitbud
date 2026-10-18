import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { ClientWorkspace } from "@fitbud/contracts";
import {
  ErrorState,
  ForbiddenState,
  errorKindFromFailure,
  type ErrorKind,
} from "../components/StatePanels";
import { useOnlineStatus } from "../components/OfflineBanner";
import { WorkspaceHeader } from "../components/workspace/WorkspaceHeader";
import {
  WorkspaceModals,
  type WorkspaceModal,
} from "../components/workspace/WorkspaceModals";
import { apiClient } from "../lib/api";
import { setShellClientTitle } from "../lib/shell-title";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import type { WorkspaceOutletContext } from "./workspaceContext";

export function ClientWorkspaceLayout() {
  const { relationshipId = "" } = useParams();
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [workspace, setWorkspace] = useState<ClientWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceErrorRequestId, setWorkspaceErrorRequestId] = useState<
    string | null
  >(null);
  const [workspaceErrorKind, setWorkspaceErrorKind] =
    useState<ErrorKind>("server");
  const [notFound, setNotFound] = useState(false);
  const online = useOnlineStatus();
  const [forbidden, setForbidden] = useState(false);
  const [submittedCheckins, setSubmittedCheckins] = useState(0);
  const [modal, setModal] = useState<WorkspaceModal>(null);

  const reloadWorkspace = useCallback(() => {
    setRefreshEpoch((value) => value + 1);
  }, []);

  useRealtimeHints(apiClient, relationshipId || null, reloadWorkspace);

  useEffect(() => {
    const name = workspace?.header.traineeDisplayName ?? null;
    setShellClientTitle(name);
    return () => setShellClientTitle(null);
  }, [workspace?.header.traineeDisplayName]);

  useEffect(() => {
    if (!relationshipId) return;
    let cancelled = false;
    setWorkspace(null);
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    setWorkspaceErrorRequestId(null);
    setNotFound(false);
    setForbidden(false);

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
        if (err instanceof ApiClientError && err.status === 403) {
          setForbidden(true);
          setWorkspaceError(null);
        } else if (err instanceof ApiClientError && err.status === 404) {
          setNotFound(true);
          setWorkspaceError(null);
        } else {
          const apiError = err instanceof ApiClientError ? err : null;
          setWorkspaceError(apiError?.message ?? "Could not load this client.");
          setWorkspaceErrorKind(
            errorKindFromFailure({
              status: apiError?.status,
              code: apiError?.code,
              message: err instanceof Error ? err.message : undefined,
            }),
          );
          const rid = apiError?.requestId;
          setWorkspaceErrorRequestId(rid && rid !== "unknown" ? rid : null);
        }
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [relationshipId, refreshEpoch]);

  if (forbidden) {
    return (
      <section className="page centered-status" data-testid="screen-TW-33">
        <ForbiddenState />
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="page centered-status" data-testid="screen-TW-33">
        <h1>Client not found</h1>
        <p className="lede">
          This coaching relationship doesn&apos;t exist or you don&apos;t have
          access.
        </p>
        <Link className="button-primary" to="/clients">
          Back to clients
        </Link>
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

  if (!workspace) {
    return (
      <section className="page workspace-shell" data-testid="screen-TW-33">
        <ErrorState
          kind={workspaceErrorKind}
          title="We couldn't load this client"
          message={workspaceError ?? undefined}
          requestId={workspaceErrorRequestId}
          onRetry={reloadWorkspace}
          screenId="TW-09"
        />
      </section>
    );
  }

  const ended = workspace.header.onboardingStatus === "ended";
  const outletContext: WorkspaceOutletContext = {
    workspace,
    workspaceLoading,
    workspaceError,
    notFound,
    refreshEpoch,
    reloadWorkspace,
    openWorkspaceModal: setModal,
    relationshipId,
    online,
    ended,
  };

  return (
    <section className="page workspace-shell">
      <WorkspaceHeader
        workspace={workspace}
        relationshipId={relationshipId}
        submittedCheckinCount={submittedCheckins}
        onOpenModal={setModal}
        online={online}
      />
      <Outlet context={outletContext} />
      <WorkspaceModals
        relationshipId={relationshipId}
        traineeName={workspace.header.traineeDisplayName}
        traineeGender={workspace.header.traineeProfile.gender}
        ended={ended}
        modal={modal}
        onClose={() => setModal(null)}
        onChanged={reloadWorkspace}
      />
    </section>
  );
}
