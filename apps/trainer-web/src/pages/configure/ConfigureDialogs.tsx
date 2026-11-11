import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  Bell,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  Scale,
  Target,
} from "lucide-react";
import type { ConfigurationSectionId } from "@fitbud/contracts";
import { Button } from "../../components/Button";
import type { VersionChange } from "./versionChanges";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * DS3 modal shell: scrim, title, body and a footer with the secondary action
 * on the left and the primary on the right. Keyboard: focus moves into the
 * dialog, Tab stays inside it, Escape closes it (not while saving), and focus
 * goes back to the button that opened it.
 */
function ConfigureDialog({
  title,
  lede,
  children,
  cancelLabel,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
  testId,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  testId: string;
}) {
  const titleId = useId();
  const ledeId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const node = ref.current;
    node?.querySelector<HTMLElement>(".cs-dialog-confirm")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          cancelRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div className="cs-dialog-scrim" role="presentation">
      <div
        ref={ref}
        className="cs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ledeId}
        data-testid={testId}
      >
        <div className="cs-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <p id={ledeId}>{lede}</p>
        </div>
        <div className="cs-dialog-body">
          {children}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="cs-dialog-foot">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            className="cs-dialog-confirm"
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
          >
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export type ActivateSummaryRow = { label: string; value: string };

/** DS3 Activate: everything that starts, then one atomic activate call. */
export function ActivateDialog({
  firstName,
  rows,
  notice,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  firstName: string;
  rows: ActivateSummaryRow[];
  notice: string | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfigureDialog
      testId="configure-activate-dialog"
      title={`Start coaching ${firstName}?`}
      lede={`${firstName} gets everything below from the start date. You can change any of it later with Save as v2.`}
      cancelLabel="Back to setup"
      confirmLabel="Activate coaching"
      busy={busy}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <dl className="cs-dialog-summary">
        {rows.map((row) => (
          <div key={row.label} className="cs-dialog-summary-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {notice ? (
        <p className="cs-dialog-notice">
          <Bell size={16} strokeWidth={2} aria-hidden="true" />
          <span>{notice}</span>
        </p>
      ) : null}
    </ConfigureDialog>
  );
}

const SECTION_ICON: Record<ConfigurationSectionId, typeof Target> = {
  goal: Target,
  expectations: Dumbbell,
  checkins: ClipboardCheck,
  tracking: Scale,
};

/** DS3 Save as vN+1: the changes only, and the day they apply from. */
export function SaveVersionDialog({
  firstName,
  currentVersion,
  nextVersion,
  changes,
  startsLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  firstName: string;
  /** The active version this replaces, or null when it is not known (a draft saved earlier). */
  currentVersion: number | null;
  nextVersion: number;
  /** Null when the draft was saved in an earlier visit and the diff is not known. */
  changes: VersionChange[] | null;
  startsLabel: string | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const previous = currentVersion ?? nextVersion - 1;
  return (
    <ConfigureDialog
      testId="configure-save-version-dialog"
      title={`Save as version ${nextVersion}?`}
      lede={`Version ${previous} is kept as it was. ${firstName} gets the new targets from tomorrow.`}
      cancelLabel="Keep editing"
      confirmLabel={`Save as version ${nextVersion}`}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {changes ? (
        <>
          <p className="cs-dialog-label">What changes · {changes.length}</p>
          <ul className="cs-dialog-diff" aria-label="What changes">
            {changes.map((change) => {
              const Icon = SECTION_ICON[change.section];
              return (
                <li key={change.key}>
                  <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  <span className="cs-dialog-diff-label">{change.label}</span>
                  {change.from != null ? (
                    <>
                      <s>
                        <span className="sr-only">from </span>
                        {change.from}
                      </s>
                      <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                    </>
                  ) : null}
                  <em>
                    {change.from != null ? (
                      <span className="sr-only">to </span>
                    ) : null}
                    {change.to}
                  </em>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="cs-dialog-label">
          {`Version ${nextVersion} was saved as a draft earlier. Its changes from version ${previous} aren't listed here.`}
        </p>
      )}
      <p className="cs-dialog-label">Starts</p>
      <div className="cs-dialog-starts" aria-label="Starts">
        <span className="cs-dialog-starts-mark" aria-hidden="true" />
        <div>
          <b>{startsLabel ? `Tomorrow · ${startsLabel}` : "Tomorrow"}</b>
          <span>Today&apos;s plan stays as it is.</span>
        </div>
      </div>
    </ConfigureDialog>
  );
}
