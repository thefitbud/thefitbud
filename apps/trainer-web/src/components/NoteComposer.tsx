import { useState, type FormEvent } from "react";
import { ApiClientError } from "@fitbud/api-client";
type TrainerNoteVisibility = "private" | "client";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
export function NoteComposer({
  relationshipId,
  subjectType,
  subjectId,
  checkinId,
  onSaved,
  onClose,
}: {
  relationshipId: string;
  subjectType?: string;
  subjectId?: string;
  checkinId?: string;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] =
    useState<TrainerNoteVisibility>("private");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.createTrainerNote(
        relationshipId,
        {
          body: body.trim(),
          visibility,
          subjectType: subjectType ?? null,
          subjectId: subjectId ?? undefined,
          checkinId: checkinId ?? null,
        },
        createIdempotencyKey(),
      );
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save note.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="note-composer stack-form" onSubmit={onSubmit}>
      <label className="field">
        <span>Note</span>
        <textarea
          required
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={visibility === "client"}
          onChange={(e) =>
            setVisibility(e.target.checked ? "client" : "private")
          }
        />
        <span>Visible to client</span>
      </label>
      <p className="muted">
        {visibility === "client"
          ? "The client will see this in the app and get a push notification."
          : "Only you can see this note."}
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="button-row">
        {onClose ? (
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
}
