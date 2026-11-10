import { useEffect, useId, useRef } from "react";
import { Check } from "lucide-react";

export type ResolveOutcomeOption<T extends string> = {
  id: T;
  label: string;
};

/**
 * Frame 02 resolve form: outcome chips (one always chosen) and a private,
 * optional note. Save lives in the panel footer ("Resolve item").
 */
export function ResolveForm<T extends string>({
  outcomes,
  outcome,
  onOutcome,
  note,
  onNote,
  autoFocus,
}: {
  outcomes: readonly ResolveOutcomeOption<T>[];
  outcome: T;
  onOutcome: (id: T) => void;
  note: string;
  onNote: (value: string) => void;
  /** Focus the chosen chip on open so the keyboard lands in the form. */
  autoFocus?: boolean;
}) {
  const outcomeLabelId = useId();
  const noteId = useId();
  const chosenRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Only on open: later chip clicks keep their own focus.
    if (autoFocus) chosenRef.current?.focus();
  }, []);

  return (
    <section className="sp-resolve-form" aria-label="Resolve">
      <p id={outcomeLabelId} className="sp-form-label">
        Resolve · Outcome
      </p>
      <div
        className="sp-outcomes"
        role="group"
        aria-labelledby={outcomeLabelId}
      >
        {outcomes.map((o) => {
          const on = outcome === o.id;
          return (
            <button
              key={o.id}
              ref={on ? chosenRef : undefined}
              type="button"
              className={on ? "sp-outcome is-on" : "sp-outcome"}
              aria-pressed={on}
              onClick={() => onOutcome(o.id)}
            >
              {on ? <Check size={16} strokeWidth={2} aria-hidden /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
      <label htmlFor={noteId} className="sp-form-label">
        Note · optional · only you see this
      </label>
      <textarea
        id={noteId}
        className="sp-note"
        rows={3}
        maxLength={2000}
        value={note}
        onChange={(e) => onNote(e.target.value)}
      />
    </section>
  );
}
