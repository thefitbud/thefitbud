import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ClientDirectoryItem } from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { CoachingLifecycleModals } from "../../components/coaching/CoachingLifecycleModals";
import { pageClientDirectory } from "../../lib/clients";

export function EndedClientsSettingsPage() {
  const [items, setItems] = useState<ClientDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reactivateId, setReactivateId] = useState<string | null>(null);
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const all = await pageClientDirectory((q) => apiClient.listClients(q));
      const ended = all.filter((item) => item.status === "ended" && item.relationshipId);
      setItems(ended);
      const names = new Map<string, string>();
      for (const item of ended) {
        if (item.relationshipId) {
          names.set(item.relationshipId, item.traineeDisplayName);
        }
      }
      setNameById(names);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="settings-panel">
      <h2>Ended clients</h2>
      <p className="muted">
        Coaching you ended stays read-only until you reactivate with the same client.
      </p>
      {loading ? <p className="muted">Loading…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="muted">No ended clients.</p>
      ) : (
        <ul className="ended-client-list">
          {items.map((item) => (
            <li key={item.relationshipId!}>
              <div>
                <strong>{item.traineeDisplayName}</strong>
                <span className="muted"> · Ended</span>
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
      )}
      {reactivateId ? (
        <CoachingLifecycleModals
          mode="reactivate"
          relationshipId={reactivateId}
          traineeName={nameById.get(reactivateId) ?? "Client"}
          onClose={() => setReactivateId(null)}
          onChanged={() => setReactivateId(null)}
        />
      ) : null}
    </div>
  );
}
