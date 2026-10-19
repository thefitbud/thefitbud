import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ClientDirectoryItem } from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { ApiClientError } from "@fitbud/api-client";
import { apiClient } from "../../lib/api";
import { CoachingLifecycleModals } from "../../components/coaching/CoachingLifecycleModals";
import { pageClientDirectory } from "../../lib/clients";
import { ErrorState } from "../../components/StatePanels";

export function EndedClientsSettingsPage() {
  const [items, setItems] = useState<ClientDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reactivateId, setReactivateId] = useState<string | null>(null);
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());
  const [planById, setPlanById] = useState<Map<string, string | null>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await pageClientDirectory((q) => apiClient.listClients(q), {
        q: "",
        status: ["ended"],
        adherenceState: [],
        goal: [],
        renewal: [],
        segment: "ended",
      });
      const ended = all.filter(
        (item) => item.status === "ended" && item.relationshipId,
      );
      setItems(ended);
      const names = new Map<string, string>();
      const plans = new Map<string, string | null>();
      for (const item of ended) {
        if (item.relationshipId) {
          names.set(item.relationshipId, item.traineeDisplayName);
          plans.set(item.relationshipId, item.effectivePlan?.title ?? null);
        }
      }
      setNameById(names);
      setPlanById(plans);
    } catch (err) {
      setItems([]);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load ended clients.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="settings-panel" data-testid="screen-TW-30">
      <h2>Ended clients</h2>
      <p className="muted">
        Coaching you ended stays read-only until you reactivate with the same client.
      </p>
      {loading ? <p className="muted">Loading…</p> : null}
      {error ? (
        <ErrorState
          kind="server"
          title="Could not load ended clients"
          message={error}
          onRetry={() => void load()}
          screenId="TW-30"
        />
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="muted">No ended clients.</p>
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <ul className="ended-client-list">
          {items.map((item) => (
            <li key={item.relationshipId!}>
              <div>
                <strong>{item.traineeDisplayName}</strong>
                {item.endedAt ? (
                  <span className="status-chip status-chip-xs">
                    {" "}
                    Ended {formatCivilDate(item.endedAt.slice(0, 10))}
                  </span>
                ) : (
                  <span className="muted"> · Ended</span>
                )}
              </div>
              <div className="button-row">
                <Link
                  className="button-secondary"
                  to={`/clients/${item.relationshipId}/overview`}
                >
                  View history
                </Link>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => setReactivateId(item.relationshipId!)}
                >
                  Reactivate
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {reactivateId ? (
        <CoachingLifecycleModals
          mode="reactivate"
          relationshipId={reactivateId}
          traineeName={nameById.get(reactivateId) ?? "Client"}
          lastPlanTitle={planById.get(reactivateId) ?? null}
          onClose={() => setReactivateId(null)}
          onChanged={() => {
            setReactivateId(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
