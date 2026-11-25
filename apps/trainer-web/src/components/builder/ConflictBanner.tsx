import { CloudOff } from "lucide-react";
import { formatClockTime } from "@fitbud/core";
import { Button } from "../ui";

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
        <CloudOff className="builder-conflict-icon ui-i" strokeWidth={1.75} aria-hidden />
        <p>
          Couldn&apos;t save. This plan was changed on another device
          {when ? ` at ${when}` : ""}. Your edits are kept here.
        </p>
      </div>
      <div className="builder-conflict-actions">
        <Button variant="secondary" aria-pressed={comparing} onClick={onCompare}>
          Compare versions
        </Button>
        <Button variant="primary" disabled={keepMineBusy} onClick={onKeepMine}>
          {keepMineBusy ? "Saving…" : "Keep mine"}
        </Button>
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
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
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
          <Button variant="secondary" onClick={onTakeTheirs}>
            Take theirs
          </Button>
          <Button variant="primary" onClick={onKeepMine}>
            Keep mine
          </Button>
        </footer>
      </div>
    </div>
  );
}
