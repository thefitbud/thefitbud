import type { Ref } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ExceptionSeverity } from "@fitbud/contracts";
import { StatusChip } from "../StatusChip";
import { avatarToneClass, initials } from "./panelModel";

export type PanelNav = {
  /** Zero-based index of the item on screen. */
  index: number;
  total: number;
  /** Per-item state for the progress dashes, in list order. */
  resolved: readonly boolean[];
  resolvedCount: number;
  onPrev: () => void;
  onNext: () => void;
};

/**
 * Side panel v3 header (frame 02): avatar, name and meta, prev/next with
 * "n of m", close; progress dashes with the state chip on the right.
 */
export function PanelHeader({
  clientName,
  meta,
  nav,
  severity,
  currentResolved,
  closeRef,
  onClose,
}: {
  clientName: string;
  meta: string;
  nav: PanelNav | null;
  severity: ExceptionSeverity | null;
  currentResolved: boolean;
  closeRef: Ref<HTMLButtonElement>;
  onClose: () => void;
}) {
  const showResolvedChip = Boolean(nav && currentResolved);
  return (
    <header className="sp-head">
      <div className="sp-head-row">
        <span
          className={`${avatarToneClass(clientName)} sp-avatar`}
          aria-hidden="true"
        >
          {initials(clientName)}
        </span>
        <div className="sp-head-who">
          <h2 className="sp-name">{clientName}</h2>
          {meta ? <p className="sp-meta">{meta}</p> : null}
        </div>
        {nav ? (
          <div className="sp-nav" role="group" aria-label="Items for this client">
            <button
              type="button"
              className="sp-icon-btn"
              aria-label="Previous item"
              disabled={nav.index <= 0}
              onClick={nav.onPrev}
            >
              <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
            </button>
            <span className="sp-count" aria-live="polite">
              {nav.index + 1} of {nav.total}
            </span>
            <button
              type="button"
              className="sp-icon-btn"
              aria-label="Next item"
              disabled={nav.index >= nav.total - 1}
              onClick={nav.onNext}
            >
              <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ) : null}
        <button
          ref={closeRef}
          type="button"
          className="sp-icon-btn sp-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {nav || severity || showResolvedChip ? (
        <div className="sp-head-progress">
          {nav ? (
            <ol className="sp-dashes" aria-hidden="true">
              {nav.resolved.map((done, i) => (
                <li
                  key={i}
                  className={[
                    "sp-dash",
                    i === nav.index ? "is-current" : "",
                    done ? "is-resolved" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ))}
            </ol>
          ) : (
            <span />
          )}
          {showResolvedChip && nav ? (
            <span className="status-chip status-chip-positive sp-resolved-chip">
              <Check size={14} strokeWidth={2} aria-hidden="true" />
              <span>
                {nav.resolvedCount} of {nav.total} resolved
              </span>
            </span>
          ) : severity && !currentResolved ? (
            <StatusChip kind="severity" value={severity} />
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
