import { useState, type FormEvent } from "react";
import { Copy, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Checkbox, Modal } from "../../components/ui";
import { useAuth } from "../../auth/AuthProvider";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { errorText, forkDefaultName } from "./shared";
import "./TemplatesModals.css";

export function ForkTemplateModal({
  templateId,
  templateTitle,
  hubSlug,
  kind = "plan",
  onClose,
  onForked,
}: {
  templateId: string;
  templateTitle: string;
  hubSlug: string;
  kind?: "plan" | "onboarding" | "checkin";
  onClose: () => void;
  onForked?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { me } = useAuth();
  const trainerName = me?.trainerProfile?.displayName ?? "";
  const [name, setName] = useState(
    forkDefaultName(templateTitle, trainerName),
  );
  const [openEditor, setOpenEditor] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    const title = name.trim();
    if (!title) {
      setError("Give your copy a name.");
      return;
    }
    setActing(true);
    setError(null);
    try {
      let newId: string;
      if (kind === "onboarding") {
        const detail = await apiClient.forkOnboardingFormTemplate(
          templateId,
          { name: title },
          createIdempotencyKey(),
        );
        newId = detail.id;
      } else if (kind === "checkin") {
        const detail = await apiClient.forkCheckinFormTemplate(
          templateId,
          { name: title },
          createIdempotencyKey(),
        );
        newId = detail.id;
      } else {
        const forked = await apiClient.forkPlanTemplate(
          templateId,
          { title },
          createIdempotencyKey(),
        );
        newId = forked.id;
      }
      onForked?.(newId);
      onClose();
      if (openEditor) navigate(`/templates/${hubSlug}/${newId}`);
    } catch (err) {
      setError(errorText(err, "Could not fork this template."));
    } finally {
      setActing(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Make a copy"
      subtitle={`From FitBud base · ${templateTitle}`}
      footer={
        <>
          <span className="ui-sp" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={acting}
            onClick={() => void onSubmit()}
          >
            <Copy className="ui-i" strokeWidth={1.75} aria-hidden="true" />
            {acting ? "Making copy…" : "Make a copy"}
          </Button>
        </>
      }
    >
      <form
        className="tpl-modal-body"
        data-testid="fork-template-modal"
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="ui-field">
          <label className="ui-lbl" htmlFor="fork-template-name">
            Name
          </label>
          <input
            id="fork-template-name"
            className="tpl-name-input"
            value={name}
            maxLength={160}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            required
          />
          <span className="ui-help">
            {kind === "plan"
              ? "Only you see this name. Clients see the plan name you publish."
              : "Only you see this name."}
          </span>
        </div>
        <div className="tpl-modal-opts">
          <Checkbox checked={openEditor} onChange={setOpenEditor}>
            Open the copy in the editor
          </Checkbox>
        </div>
        <p className="tpl-modal-banner">
          <Info size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>
            The copy is yours to change. The FitBud base stays as it is, and
            clients already using it aren&apos;t affected.
          </span>
        </p>
        {error ? (
          <p className="tpl-modal-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
