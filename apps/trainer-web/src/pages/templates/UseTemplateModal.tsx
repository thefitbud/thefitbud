import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import {
  clientInitials,
  clientStatusLabel,
  errorText,
  usableApplyClients,
  type ApplyClient,
} from "./shared";

export function UseTemplateModal({
  templateId,
  templateTitle,
  clients,
  onClose,
}: {
  templateId: string;
  templateTitle: string;
  clients: ApplyClient[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
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
      const result = await apiClient.applyPlanTemplate(
        selected.relationshipId,
        { templateId },
        createIdempotencyKey(),
      );
      onClose();
      navigate(
        `/clients/${selected.relationshipId}/plan/${result.plan.id}/versions/${result.version.id}/edit`,
      );
    } catch (err) {
      setError(errorText(err, "Could not create a draft from this template."));
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
        aria-labelledby="use-template-title"
        data-testid="use-template-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="use-template-title">Use {templateTitle} for…</h2>
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
            This opens a draft plan for {firstName}. Nothing changes for{" "}
            {firstName} until you publish. Your template stays as it is.
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
            {acting ? "Opening draft…" : "Open draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}
