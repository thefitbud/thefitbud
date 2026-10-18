import { useMemo, useState, type FormEvent } from "react";
import { ApiClientError } from "@fitbud/api-client";
import type { TrainerNote } from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";
import { stage1Api } from "../lib/stage1-api";
import { createIdempotencyKey } from "../lib/idempotency";
import { Button } from "./Button";

type TrainerNoteVisibility = "private" | "client";

const MAX_CHARS = 1000;
const COUNTER_FROM = 800;

export function NoteComposer({
  relationshipId,
  traineeName,
  subjectType,
  subjectId,
  checkinId,
  note,
  readOnly = false,
  onSaved,
  onClose,
}: {
  relationshipId: string;
  traineeName?: string;
  subjectType?: string;
  subjectId?: string;
  checkinId?: string;
  note?: TrainerNote;
  readOnly?: boolean;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const { me } = useAuth();
  const isEdit = Boolean(note);
  const [body, setBody] = useState(note?.body ?? "");
  const [visibility, setVisibility] = useState<TrainerNoteVisibility>(
    note?.visibility === "client" ? "client" : "private",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const firstName = useMemo(() => {
    const raw = (traineeName ?? "Client").trim().split(/\s+/)[0];
    return raw || "Client";
  }, [traineeName]);

  const trainerFirstName = useMemo(() => {
    const raw = (me?.trainerProfile?.displayName ?? "Coach")
      .trim()
      .split(/\s+/)[0];
    return (raw || "Coach").toLowerCase();
  }, [me?.trainerProfile?.displayName]);

  if (readOnly) {
    return (
      <p className="muted" role="status">
        Coaching has ended. Notes are read-only.
      </p>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      if (note) {
        await stage1Api.patchTrainerNote(
          relationshipId,
          note.id,
          { body: trimmed, visibility },
          createIdempotencyKey(),
        );
      } else {
        await apiClient.createTrainerNote(
          relationshipId,
          {
            body: trimmed,
            visibility,
            subjectType: subjectType ?? null,
            subjectId: subjectId ?? undefined,
            checkinId: checkinId ?? null,
          },
          createIdempotencyKey(),
        );
      }
      const message =
        visibility === "client"
          ? `Shared with ${firstName}`
          : "Saved privately";
      setToast(message);
      if (!isEdit) {
        setBody("");
        setVisibility("private");
      }
      onSaved?.();
      window.setTimeout(() => {
        setToast(null);
        onClose?.();
      }, 1200);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save note.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const showCounter = body.length >= COUNTER_FROM;

  return (
    <form className="note-composer stack-form" onSubmit={onSubmit}>
      <label className="field">
        <span>Note</span>
        <textarea
          required
          rows={5}
          maxLength={MAX_CHARS}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby={showCounter ? "note-char-count" : undefined}
        />
        {showCounter ? (
          <span id="note-char-count" className="field-hint">
            {body.length} / {MAX_CHARS}
          </span>
        ) : null}
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

      {visibility === "client" ? (
        <div className="note-visible-preview">
          <p className="muted">
            {isEdit && note?.visibility === "client"
              ? `${firstName} can see this on their Today screen.`
              : `${firstName} will see this on their Today screen and get a notification.`}
          </p>
          <span className="note-preview-chip" aria-hidden="true">
            From {trainerFirstName} · just now
          </span>
        </div>
      ) : (
        <p className="muted">
          Only you can see this note (
          {labelFor("trainer_note_visibility", "private")}).
        </p>
      )}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="banner-info" role="status">
          {toast}
        </p>
      ) : null}

      <div className="button-row">
        {onClose ? (
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Save note"}
        </Button>
      </div>
    </form>
  );
}
