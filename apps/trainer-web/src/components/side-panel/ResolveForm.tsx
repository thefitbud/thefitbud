import { useEffect, useId, useRef } from "react";
import { Check } from "lucide-react";

export type ResolveOutcomeOption<T extends string> = {
  id: T;
  label: string;
};

/**
 * Frame 02 / RP-03 resolve form: outcome chips and a private, optional note.
 * The single item's outcome is optional with nothing preselected (D-W14-43);
 * the bulk form keeps one chosen. Save lives in the footer ("Resolve item").
 */
export function ResolveForm<T extends string>({
  outcomes,
  outcome,
  onOutcome,
  onClear,
  note,
  onNote,
  autoFocus,
  outcomeLabel = "Resolve · Outcome",
  plain = false,
}: {
  outcomes: readonly ResolveOutcomeOption<T>[];
  /** Null: nothing chosen yet (D-W14-43, the single item's outcome is optional). */
  outcome: T | null;
  onOutcome: (id: T) => void;
  /** Given: pressing the chosen outcome again clears it (optional outcome). */
  onClear?: () => void;
  note: string;
  onNote: (value: string) => void;
  /** Focus the chosen chip on open so the keyboard lands in the form. */
  autoFocus?: boolean;
  /** Label above the chips; the bulk dialog (DS2) reads just "Outcome". */
  outcomeLabel?: string;
  /** No card border (inside the bulk confirm dialog, DS2). */
  plain?: boolean;
}) {
  const outcomeLabelId = useId();
  const noteId = useId();
  const chosenRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Only on open: later chip clicks keep their own focus. With nothing
    // chosen, the first outcome takes focus.
    if (!autoFocus) return;
    const target =
      chosenRef.current ??
      rootRef.current?.querySelector<HTMLButtonElement>(".sp-outcome");
    target?.focus();
  }, []);

  return (
    <section
      ref={rootRef}
      className={plain ? "sp-resolve-form is-plain" : "sp-resolve-form"}
      aria-label="Resolve"
    >
      <p id={outcomeLabelId} className="sp-form-label">
        {outcomeLabel}
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
              onClick={() => (on && onClear ? onClear() : onOutcome(o.id))}
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
