import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { DietAdjustmentScope } from "@fitbud/core";
import { formatCivilDate } from "@fitbud/core";

export type TodayMealsPreview =
  | { status: "loading" }
  | { status: "error"; message: string; onRetry: () => void }
  | { status: "ready"; changing: string[]; protectedMeals: string[]; total: number };

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function PreviewLine({ preview }: { preview: TodayMealsPreview }) {
  if (preview.status === "loading") {
    return (
      <p className="muted" aria-busy="true">
        Checking today&apos;s meals…
      </p>
    );
  }
  if (preview.status === "error") {
    return (
      <p className="field-error" role="alert">
        Couldn&apos;t check today&apos;s meals.{" "}
        <button type="button" className="button-link" onClick={preview.onRetry}>
          Retry
        </button>
      </p>
    );
  }
  if (preview.total === 0) {
    return <p className="muted">No meals are scheduled for today.</p>;
  }
  if (preview.changing.length === 0) {
    return (
      <p className="diet-preview" data-testid="diet-preview">
        All of today&apos;s meals are already logged. Nothing will change today.
      </p>
    );
  }
  const count = preview.changing.length;
  return (
    <p className="diet-preview" data-testid="diet-preview">
      {count} {count === 1 ? "meal" : "meals"} will change today: {preview.changing.join(", ")}.
      {preview.protectedMeals.length > 0
        ? ` ${listNames(preview.protectedMeals)} ${
            preview.protectedMeals.length === 1 ? "is" : "are"
          } already logged and won't change.`
        : ""}
    </p>
  );
}

/**
 * Frame 156 / TW-15: diet change scope when a nutrition-only adjustment is published.
 * Values stay on the API's today_onward | today_only (frame's "Only Thursdays" is not in
 * DietAdjustmentScope — noted as a follow-up).
 */
export function DietScopePicker({
  value,
  onChange,
  preview,
  today,
  changeSummary,
  asModal = false,
  acting = false,
  onCancel,
  onApply,
}: {
  value: DietAdjustmentScope;
  onChange: (next: DietAdjustmentScope) => void;
  preview: TodayMealsPreview;
  /** Trainee-local civil today, for civil-date copy. */
  today?: string;
  /** Optional context line under the title (e.g. meal time change). */
  changeSummary?: string;
  /** When true, render as the frame-156 modal shell with Cancel / Apply. */
  asModal?: boolean;
  acting?: boolean;
  onCancel?: () => void;
  onApply?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const todayLabel = today ? formatCivilDate(today) : null;

  const options: Array<{ value: DietAdjustmentScope; title: string; body: string }> = [
    {
      value: "today_onward",
      title: todayLabel ? `From today, ${todayLabel}` : "From today onward",
      body: "Updates the plan from today. Today's and future meals that aren't logged yet will change.",
    },
    {
      value: "today_only",
      title: "Today only",
      body: "Changes only today's meals that aren't logged yet. The plan stays the same from tomorrow.",
    },
  ];

  useEffect(() => {
    if (asModal) dialogRef.current?.focus();
  }, [asModal]);

  useEffect(() => {
    if (!asModal || !onCancel) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !acting) onCancel?.();
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [asModal, acting, onCancel]);

  const body = (
    <fieldset className="diet-scope" data-testid="screen-TW-15" disabled={acting}>
      {!asModal ? <legend>When should the diet change apply?</legend> : null}
      <div className="radio-cards" role="radiogroup" aria-label="Diet change scope">
        {options.map((option) => (
          <label
            key={option.value}
            className={value === option.value ? "radio-card is-selected" : "radio-card"}
          >
            <input
              type="radio"
              name="diet-scope"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="radio-card-copy">
              <span className="radio-card-title">{option.title}</span>
              <span className="radio-card-detail">{option.body}</span>
            </span>
          </label>
        ))}
      </div>
      <PreviewLine preview={preview} />
      <p className="muted">Workouts aren&apos;t affected. Logged meals are protected.</p>
    </fieldset>
  );

  if (!asModal) return body;

  return (
    <div className="modal-scrim" role="presentation">
      <div
        className="modal-card assign-modal diet-scope-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diet-scope-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="assign-head assign-head-row">
          <div>
            <h2 id="diet-scope-title">Apply this change to…</h2>
            {changeSummary ? <p className="muted assign-sub">{changeSummary}</p> : null}
          </div>
          <button
            type="button"
            className="assign-close"
            aria-label="Close"
            disabled={acting}
            onClick={onCancel}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </header>
        <div className="assign-body">{body}</div>
        <footer className="assign-actions">
          <button type="button" className="button-secondary" disabled={acting} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={acting}
            onClick={() => onApply?.()}
          >
            {acting ? "Applying…" : "Apply change"}
          </button>
        </footer>
      </div>
    </div>
  );
}
