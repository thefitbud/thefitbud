import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Modal } from "../../components/ui";
import { ClientCombobox } from "./ClientCombobox";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import {
  errorText,
  usableApplyClients,
  type ApplyClient,
} from "./shared";

export function UseTemplateModal({
  templateId,
  templateTitle,
  templateMeta,
  clients,
  onClose,
}: {
  templateId: string;
  templateTitle: string;
  templateMeta?: string;
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

  const subtitle = templateMeta
    ? `${templateTitle} · ${templateMeta}`
    : templateTitle;

  return (
    <Modal
      open
      onClose={onClose}
      title="Use template for a client"
      subtitle={subtitle}
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
            {acting ? "Opening draft…" : "Open draft"}
          </Button>
        </>
      }
    >
      <div className="tpl-modal-body" data-testid="use-template-modal">
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
              This opens a <b>draft plan</b> for {firstName}. Nothing changes
              for {firstName} until you publish, and your template stays as it
              is.
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
