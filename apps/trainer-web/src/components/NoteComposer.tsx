import { useEffect, useMemo, useState, type FormEvent } from "react";
import { userFacingMessage } from "@fitbud/api-client";
import type { TrainerNote } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";
import { stage1Api } from "../lib/stage1-api";
import { createIdempotencyKey } from "../lib/idempotency";
import { Button } from "./Button";
import "./NoteComposer.css";

type TrainerNoteVisibility = "private" | "client";

type AboutOption = {
  value: string;
  label: string;
  subjectType: string | null;
  subjectId?: string;
};

const MAX_CHARS = 1000;

function noteCivilDay(iso: string, timeZone?: string | null): string {
  try {
    const civil = timeZone
      ? formatLocalDate(new Date(iso), timeZone)
      : iso.slice(0, 10);
    return formatCivilDate(civil);
  } catch {
    return formatCivilDate(iso.slice(0, 10));
  }
}

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
  /** Accepted for callers; the copy never words anything by gender. */
  traineeGender?: string | null;
  subjectType?: string;
  subjectId?: string;
  checkinId?: string;
  note?: TrainerNote;
  readOnly?: boolean;
  /**
   * Called with the confirmation copy ("Saved privately" / "Shared with Rohan")
   * once the note is saved. The parent shows it and closes the composer: the
   * composer itself may unmount when the workspace reloads, so it can't own
   * the confirmation.
   */
  onSaved?: (message: string) => void;
  onClose?: () => void;
}) {
  const { me } = useAuth();
  const isEdit = Boolean(note);
  const [body, setBody] = useState(note?.body ?? "");
  const [visibility, setVisibility] = useState<TrainerNoteVisibility>(
    note?.visibility === "client" ? "client" : "private",
  );
  const [aboutValue, setAboutValue] = useState("none");
  const [aboutOptions, setAboutOptions] = useState<AboutOption[]>([
    { value: "none", label: "None", subjectType: null },
  ]);
  const [earlierNotes, setEarlierNotes] = useState<TrainerNote[]>([]);
  const [editingNote, setEditingNote] = useState<TrainerNote | undefined>(note);
  const [pendingDelete, setPendingDelete] = useState<TrainerNote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const trainerTz = me?.timezone ?? null;

  useEffect(() => {
    setEditingNote(note);
    setBody(note?.body ?? "");
    setVisibility(note?.visibility === "client" ? "client" : "private");
  }, [note]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [notesResult, planResult] = await Promise.all([
          apiClient.listTrainerNotes(relationshipId).then(
            (value) => ({ ok: true as const, value }),
            () => ({ ok: false as const }),
          ),
          apiClient.getEffectivePlan(relationshipId).then(
            (value) => ({ ok: true as const, value }),
            () => ({ ok: false as const }),
          ),
        ]);
        if (cancelled) return;

        if (notesResult.ok) {
          const items = notesResult.value.items;
          setEarlierNotes(
            editingNote
              ? items.filter((item) => item.id !== editingNote.id)
              : items,
          );
        }

        const options: AboutOption[] = [
          { value: "none", label: "None", subjectType: null },
        ];
        const plan = planResult.ok ? planResult.value.plan : null;
        if (plan) {
          options.push({
            value: `plan:${plan.id}`,
            label: `Workout plan · ${plan.title}`,
            subjectType: "workout",
            subjectId: plan.id,
          });
        }
        if (subjectType === "checkin" && (subjectId || checkinId)) {
          options.push({
            value: `checkin:${subjectId ?? checkinId}`,
            label: "Check-in",
            subjectType: "checkin",
            subjectId: subjectId ?? checkinId ?? undefined,
          });
        }
        setAboutOptions(options);

        if (subjectType && (subjectId || checkinId)) {
          const match = options.find(
            (opt) =>
              opt.subjectType === subjectType &&
              (opt.subjectId === subjectId ||
                opt.subjectId === checkinId ||
                !opt.subjectId),
          );
          if (match) setAboutValue(match.value);
        } else if (plan && !note) {
          setAboutValue(`plan:${plan.id}`);
        }
      } catch {
        /* earlier notes / about are progressive enhancement */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    relationshipId,
    subjectType,
    subjectId,
    checkinId,
    note,
    editingNote?.id,
  ]);

  if (readOnly) {
    return (
      <p className="muted" role="status">
        Coaching has ended. Notes are read-only.
      </p>
    );
  }

  async function reloadEarlier() {
    try {
      const result = await apiClient.listTrainerNotes(relationshipId);
      setEarlierNotes(
        editingNote
          ? result.items.filter((item) => item.id !== editingNote.id)
          : result.items,
      );
    } catch {
      /* keep prior list */
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    const about = aboutOptions.find((opt) => opt.value === aboutValue);
    const resolvedType = about?.subjectType ?? subjectType ?? null;
    const resolvedId =
      about?.subjectId ?? subjectId ?? checkinId ?? undefined;
    try {
      if (editingNote) {
        await stage1Api.patchTrainerNote(
          relationshipId,
          editingNote.id,
          { body: trimmed, visibility },
          createIdempotencyKey(),
        );
      } else {
        await apiClient.createTrainerNote(
          relationshipId,
          {
            body: trimmed,
            visibility,
            subjectType: resolvedType,
            subjectId: resolvedId,
            checkinId: checkinId ?? null,
          },
          createIdempotencyKey(),
        );
      }
      const message =
        visibility === "client"
          ? `Shared with ${firstName}`
          : "Saved privately";
      if (!isEdit && !editingNote) {
        setBody("");
        setVisibility("private");
      }
      onSaved?.(message);
    } catch (err) {
      setError(
        userFacingMessage(err, { fallback: "Could not save note." }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(target: TrainerNote) {
    setEditingNote(target);
    setBody(target.body);
    setVisibility(target.visibility === "client" ? "client" : "private");
    setEarlierNotes((prev) => {
      const without = prev.filter((item) => item.id !== target.id);
      if (note && note.id !== target.id) {
        return [note, ...without.filter((item) => item.id !== note.id)];
      }
      if (editingNote && editingNote.id !== target.id && !note) {
        return [editingNote, ...without.filter((item) => item.id !== editingNote.id)];
      }
      return without;
    });
    setError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    setError(null);
    try {
      await apiClient.deleteTrainerNote(relationshipId, pendingDelete.id);
      setPendingDelete(null);
      if (editingNote?.id === pendingDelete.id) {
        setEditingNote(undefined);
        setBody("");
        setVisibility("private");
      }
      await reloadEarlier();
    } catch (err) {
      setError(
        userFacingMessage(err, { fallback: "Could not delete note." }),
      );
    } finally {
      setBusyId(null);
    }
  }

  const activeNote = editingNote;
  const counterLabel = `${body.length.toLocaleString("en-IN")} of ${MAX_CHARS.toLocaleString("en-IN")}`;

  return (
    <>
      <form className="note-composer" onSubmit={onSubmit}>
        <label className="field">
          <span>Note</span>
          <textarea
            required
            rows={5}
            maxLength={MAX_CHARS}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-describedby="note-char-count"
          />
          <span id="note-char-count" className="field-hint">
            {counterLabel}
          </span>
        </label>

        <label className="field">
          <span>About · optional</span>
          <select
            value={aboutValue}
            onChange={(e) => setAboutValue(e.target.value)}
            disabled={Boolean(activeNote)}
          >
            {aboutOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="note-vis-row">
          <div
            className="note-vis-seg"
            role="radiogroup"
            aria-label="Who can see this note"
            aria-describedby="note-vis-line"
          >
            <label
              className={`note-vis-opt${visibility === "private" ? " is-on" : ""}`}
            >
              <input
                type="radio"
                name="note-visibility"
                value="private"
                checked={visibility === "private"}
                onChange={() => setVisibility("private")}
              />
              <span>Only me</span>
            </label>
            <label
              className={`note-vis-opt${visibility === "client" ? " is-on" : ""}`}
            >
              <input
                type="radio"
                name="note-visibility"
                value="client"
                checked={visibility === "client"}
                onChange={() => setVisibility("client")}
              />
              <span>{firstName} too</span>
            </label>
          </div>
          <p id="note-vis-line" className="note-vis-line">
            {visibility === "client"
              ? `${firstName} sees it on Today and gets one notification.`
              : "Only you can see this note."}
          </p>
        </div>

        {visibility === "client" ? (
          <div className="note-visible-preview">
            <p className="muted">
              {activeNote && activeNote.visibility === "client"
                ? `${firstName} can see this on Today.`
                : `${firstName} will see this on Today.`}
            </p>
            <span className="note-preview-chip" aria-hidden="true">
              From {trainerFirstName} · just now
            </span>
          </div>
        ) : null}

        {earlierNotes.length > 0 ? (
          <section className="note-earlier" aria-label="Earlier notes">
            <h3 className="note-earlier-title">Earlier notes</h3>
            <ul className="note-earlier-list">
              {earlierNotes.map((item) => (
                <li key={item.id}>
                  <p>{item.body}</p>
                  <div className="note-earlier-meta">
                    <span>
                      {labelFor("trainer_note_visibility", item.visibility)}
                    </span>
                    <span aria-hidden>·</span>
                    <time dateTime={item.createdAt}>
                      {noteCivilDay(item.createdAt, trainerTz)}
                    </time>
                    <button
                      type="button"
                      className="text-link"
                      disabled={busyId === item.id}
                      onClick={() => startEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      disabled={busyId === item.id}
                      onClick={() => setPendingDelete(item)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="note-composer-actions">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting
              ? "Saving…"
              : activeNote
                ? "Save changes"
                : "Save note"}
          </Button>
          {onClose ? (
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          ) : null}
          <p className="note-composer-helper">
            {visibility === "client"
              ? `${firstName} will see this note on Today.`
              : "Private notes are only for you."}
          </p>
        </div>
      </form>

      {pendingDelete ? (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={() => setPendingDelete(null)}
        >
          <dialog
            className="modal-card note-delete-modal"
            open
            aria-labelledby="note-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="note-delete-title">Delete this note?</h2>
            <p>
              &ldquo;{pendingDelete.body}&rdquo; will be deleted. You can&apos;t
              undo this.
            </p>
            <div className="button-row">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busyId === pendingDelete.id}
                onClick={() => {
                  void confirmDelete();
                }}
              >
                Delete note
              </Button>
            </div>
          </dialog>
        </div>
      ) : null}
    </>
  );
}
