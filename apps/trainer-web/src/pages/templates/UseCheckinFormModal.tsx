import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../components/Button";
import { apiClient } from "../../lib/api";
import {
  clientInitials,
  clientStatusLabel,
  errorText,
  usableApplyClients,
  type ApplyClient,
} from "./shared";

export function UseCheckinFormModal({
  formVersionId,
  formTitle,
  clients,
  onClose,
  onAssigned,
}: {
  formVersionId: string;
  formTitle: string;
  clients: ApplyClient[];
  onClose: () => void;
  onAssigned?: (clientName: string) => void;
}) {
  const usable = useMemo(() => usableApplyClients(clients), [clients]);
  const [selectedId, setSelectedId] = useState(usable[0]?.relationshipId ?? "");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId && usable.some((c) => c.relationshipId === selectedId)) {
      return;
    }
    setSelectedId(usable[0]?.relationshipId ?? "");
  }, [usable, selectedId]);

  const selected =
    usable.find((client) => client.relationshipId === selectedId) ??
    usable[0] ??
    null;
  const clientName = selected?.traineeDisplayName ?? "this client";
  const firstName = clientName.split(/\s+/).filter(Boolean)[0] ?? clientName;

  async function onConfirm() {
    if (!selected) return;
    setActing(true);
    setError(null);
    try {
      await apiClient.assignPreferredCheckinForm(selected.relationshipId, {
        checkinFormVersionId: formVersionId,
      });
      onAssigned?.(clientName);
      onClose();
    } catch (err) {
      setError(
        errorText(err, "Could not assign this check-in form to the client."),
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        className="modal-card use-template-modal templates-modal-v3"
        role="dialog"
        aria-modal="true"
        aria-labelledby="use-checkin-form-title"
        data-testid="use-checkin-form-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="use-checkin-form-title">Use {formTitle} for…</h2>
          <button
            type="button"
            className="templates-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
        <label className="field">
          <span>Client</span>
          {usable.length === 0 ? (
            <p className="muted">No ready clients to use this with.</p>
          ) : (
            <div className="templates-client-select">
              <span className="templates-client-avatar" aria-hidden="true">
                {clientInitials(clientName)}
              </span>
              <select
                aria-label="Client"
                value={selected?.relationshipId ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {usable.map((client) => {
                  const name = client.traineeDisplayName ?? "Client";
                  const status = clientStatusLabel(client.status);
                  return (
                    <option
                      key={client.relationshipId}
                      value={client.relationshipId}
                    >
                      {name} · {status}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </label>
        {selected ? (
          <p className="templates-modal-copy use-template-copy">
            {firstName}&apos;s next scheduled check-in will use this form.
            Already-opened check-ins keep their pinned form.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!selected || acting}
            onClick={() => void onConfirm()}
          >
            {acting ? "Assigning…" : "Assign form"}
          </Button>
        </div>
      </div>
    </div>
  );
}
