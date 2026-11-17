import { formatClockTime } from "@fitbud/core";

export function ConflictBanner({
  at,
  comparing,
  onCompare,
  onKeepMine,
  keepMineBusy,
}: {
  at: Date | null;
  comparing: boolean;
  onCompare: () => void;
  onKeepMine: () => void;
  keepMineBusy?: boolean;
}) {
  const when = at ? formatClockTime(at) : null;
  return (
    <div className="builder-conflict" role="alert" data-testid="builder-conflict">
      <div className="builder-conflict-copy">
        <span className="builder-conflict-icon" aria-hidden="true">
          ☁
        </span>
        <p>
          Couldn&apos;t save. This plan was changed on another device
          {when ? ` at ${when}` : ""}. Your edits are kept here.
        </p>
      </div>
      <div className="builder-conflict-actions">
        <button
          type="button"
          className="button-secondary"
          aria-pressed={comparing}
          onClick={onCompare}
        >
          Compare versions
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={keepMineBusy}
          onClick={onKeepMine}
        >
          {keepMineBusy ? "Saving…" : "Keep mine"}
        </button>
      </div>
    </div>
  );
}

export function CompareVersionsModal({
  localSummary,
  remoteSummary,
  onKeepMine,
  onTakeTheirs,
  onClose,
}: {
  localSummary: string[];
  remoteSummary: string[];
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  onClose: () => void;
}) {
  return (
    <div className="builder-compare-backdrop" role="presentation" onClick={onClose}>
      <div
        className="builder-compare"
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-compare-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="builder-compare-head">
          <h2 id="builder-compare-title">Compare versions</h2>
          <button type="button" className="button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="builder-compare-grid">
          <section>
            <h3>Your edits</h3>
            <ul>
              {localSummary.map((line) => (
                <li key={`local-${line}`}>{line}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Saved on the other device</h3>
            <ul>
              {remoteSummary.map((line) => (
                <li key={`remote-${line}`}>{line}</li>
              ))}
            </ul>
          </section>
        </div>
        <footer className="builder-compare-foot">
          <button type="button" className="button-secondary" onClick={onTakeTheirs}>
            Take theirs
          </button>
          <button type="button" className="button-primary" onClick={onKeepMine}>
            Keep mine
          </button>
        </footer>
      </div>
    </div>
  );
}
