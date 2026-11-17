import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { useAuth } from "../../auth/AuthProvider";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { errorText, forkDefaultName } from "./shared";

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
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
      navigate(`/templates/${hubSlug}/${newId}`);
    } catch (err) {
      setError(errorText(err, "Could not fork this template."));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        className="modal-card fork-template-modal templates-modal-v3"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fork-template-title"
        data-testid="fork-template-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="fork-template-title">Make your own copy</h2>
          <button
            type="button"
            className="templates-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <p className="templates-modal-copy use-template-copy">
            Your copy starts as a draft and is yours to edit. Clients on{" "}
            {templateTitle} keep it until you move them.
          </p>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="button-row">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={acting} type="submit">
              {acting ? "Making copy…" : "Make copy"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
