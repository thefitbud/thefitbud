import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import {
  errorText,
  matchesName,
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
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(usable[0]?.relationshipId ?? "");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = usable.filter((client) =>
    matchesName(client.traineeDisplayName ?? "", query),
  );
  const selected =
    filtered.find((c) => c.relationshipId === selectedId) ??
    filtered[0] ??
    null;
  const clientName = selected?.traineeDisplayName ?? "this client";

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
        className="modal-card use-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="use-template-title"
        data-testid="use-template-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="use-template-title">Use for client</h2>
          <Button variant="tertiary" onClick={onClose}>
            Close
          </Button>
        </header>
        <label className="field">
          <span>Client</span>
          <input
            type="search"
            placeholder="Search clients"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div
          className="use-client-list"
          role="listbox"
          aria-label="Ready clients"
          tabIndex={0}
        >
          {filtered.length === 0 ? (
            <p className="muted">No ready clients match that search.</p>
          ) : (
            filtered.map((client) => (
              <button
                key={client.relationshipId}
                type="button"
                role="option"
                aria-selected={
                  (selected?.relationshipId ?? "") === client.relationshipId
                }
                className={
                  (selected?.relationshipId ?? "") === client.relationshipId
                    ? "use-client-row is-selected"
                    : "use-client-row"
                }
                onClick={() => setSelectedId(client.relationshipId)}
              >
                {client.traineeDisplayName}
              </button>
            ))
          )}
        </div>
        {selected ? (
          <p className="use-template-copy">
            Creates a draft plan for {clientName} from{" "}
            <em>{templateTitle}</em>. Nothing changes for {clientName} until you
            publish.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <Button
            variant="primary"
            disabled={!selected || acting}
            onClick={() => void onConfirm()}
          >
            {acting ? "Creating draft…" : "Create draft"}
          </Button>
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
