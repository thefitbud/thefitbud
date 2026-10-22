import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { apiClient } from "../../lib/api";
import {
  errorText,
  matchesName,
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
  const listId = "use-checkin-form-client-list";

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
        className="modal-card use-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="use-checkin-form-title"
        data-testid="use-checkin-form-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="use-checkin-form-title">Use for client</h2>
          <Button variant="tertiary" onClick={onClose}>
            Close
          </Button>
        </header>
        <label className="field">
          <span>Client</span>
          <input
            type="search"
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            placeholder="Search clients"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div
          id={listId}
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
            {clientName}&apos;s next scheduled check-in will use{" "}
            <em>{formTitle}</em>. Already-opened check-ins keep their pinned
            form.
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
            {acting ? "Assigning…" : "Assign form"}
          </Button>
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
