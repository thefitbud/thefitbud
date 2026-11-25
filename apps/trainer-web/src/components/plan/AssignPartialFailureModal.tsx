import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { formatCivilDate } from "@fitbud/core";

/**
 * Frame 157: plan published successfully, workout reminders did not set.
 * The plan is live; only reminder setup needs a retry.
 */
export function AssignPartialFailureModal({
  planTitle,
  traineeFirstName,
  startLocalDate,
  acting = false,
  onLater,
  onRetry,
}: {
  planTitle: string;
  traineeFirstName: string;
  traineeGender?: string | null;
  /** Trainee-local civil start date (YYYY-MM-DD). */
  startLocalDate: string;
  acting?: boolean;
  onLater: () => void;
  onRetry: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !acting) onLater();
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [acting, onLater]);

  const startLabel = formatCivilDate(startLocalDate);

  return (
    <div className="modal-scrim" role="presentation">
      <div
        className="modal-card assign-modal assign-partial-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-partial-title"
        data-testid="screen-TW-16-partial"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="assign-head assign-head-row">
          <h2 id="assign-partial-title">Plan published, reminders not set</h2>
          <button
            type="button"
            className="assign-close"
            aria-label="Close"
            disabled={acting}
            onClick={onLater}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="assign-body">
          <p className="assign-partial-banner" role="status">
            <AlertTriangle size={16} strokeWidth={2} aria-hidden />
            <span>
              {planTitle} is live for {traineeFirstName} from {startLabel}. We couldn&apos;t set{" "}
              {traineeFirstName}&apos;s workout reminders.
            </span>
          </p>
          <p className="assign-partial-copy">
            {traineeFirstName} can still see and log the sessions. Try setting reminders again,
            or set them later from Configuration.
          </p>
        </div>

        <footer className="assign-actions">
          <button type="button" className="button-secondary" disabled={acting} onClick={onLater}>
            Later
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={acting}
            onClick={() => onRetry()}
          >
            {acting ? "Retrying…" : "Retry reminders"}
          </button>
        </footer>
      </div>
    </div>
  );
}
