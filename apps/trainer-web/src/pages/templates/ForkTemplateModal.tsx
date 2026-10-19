import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { errorText } from "./shared";

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
  const [name, setName] = useState(`Copy of ${templateTitle}`);
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
        className="modal-card fork-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fork-template-title"
        data-testid="fork-template-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="fork-template-title">Fork to edit</h2>
          <Button variant="tertiary" onClick={onClose}>
            Close
          </Button>
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
          <p className="use-template-copy">
            Your copy is yours to edit. The FitBud base won&apos;t change.
          </p>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="button-row">
            <Button variant="primary" disabled={acting} type="submit">
              {acting ? "Forking…" : "Fork"}
            </Button>
            <Button variant="tertiary" type="button" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
