import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Button, Modal } from "../../components/ui";
import { ClientCombobox } from "./ClientCombobox";
import { apiClient } from "../../lib/api";
import {
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
    <Modal
      open
      onClose={onClose}
      title="Use form for a client"
      subtitle={formTitle}
      footer={
        <>
          <span className="ui-sp" />
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
        </>
      }
    >
      <div className="tpl-modal-body" data-testid="use-checkin-form-modal">
        <div className="ui-field">
          <span className="ui-lbl">Client</span>
          {usable.length === 0 ? (
            <p className="tpl-modal-empty">No ready clients to use this with.</p>
          ) : (
            <ClientCombobox
              clients={usable}
              value={selected?.relationshipId ?? ""}
              onChange={setSelectedId}
            />
          )}
        </div>
        {selected ? (
          <p className="tpl-modal-banner">
            <Info size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>
              {firstName}&apos;s next scheduled check-in will use this form.
              Already-opened check-ins keep their pinned form.
            </span>
          </p>
        ) : null}
        {error ? (
          <p className="tpl-modal-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
