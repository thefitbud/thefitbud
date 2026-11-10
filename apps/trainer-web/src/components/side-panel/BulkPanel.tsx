import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  Utensils,
  X,
} from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import { labelFor } from "@fitbud/core";
import type {
  BulkResolveItemResult,
  BulkResolveOutcome,
  Exception,
} from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { Button } from "../Button";
import { StatusChip } from "../StatusChip";
import { itemShortLabel } from "./AlsoOpenList";
import { ResolveForm, type ResolveOutcomeOption } from "./ResolveForm";
import {
  BULK_CONFIRM_ABOVE,
  BULK_UNDO_MS,
  bulkResultSummary,
  bulkRowSubline,
  compatibleIds,
  individualOnlyHint,
  isBulkCompatible,
  itemsLabel,
  stillOpenText,
} from "./bulkModel";

function SourceIcon({ type }: { type: Exception["sourceEntityType"] }) {
  const props = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (type === "workout_assignment") return <Dumbbell {...props} />;
  if (type === "meal_assignment") return <Utensils {...props} />;
  return <ClipboardCheck {...props} />;
}

type Phase =
  | { kind: "select" }
  /** Three or fewer selected: outcome and note inline in the panel. */
  | { kind: "form" }
  /** More than three selected: the confirm dialog (DS2). */
  | { kind: "confirm" }
  | {
      kind: "result";
      /** Items as they were when the trainer confirmed, in panel order. */
      snapshot: Exception[];
      results: BulkResolveItemResult[];
      bulkId: string | null;
      outcome: BulkResolveOutcome;
      /** The ids the trainer selected, restored by Undo. */
      selectedIds: string[];
    };

type Focus = "select-all" | "bar-resolve" | "undo" | "after";

/**
 * Z7-8 bulk side panel (DS2 frames): one client's compatible open items with
 * checkboxes, one outcome and note sent once, per-item results and a 5 s
 * Undo. Pain and other individual-only items keep an empty, disabled box.
 * Renders the panel body and footer; the drawer hides it for ended clients.
 */
export function BulkPanel<T extends BulkResolveOutcome>({
  relationshipId,
  firstName,
  items,
  initialSelectedId,
  outcomes,
  defaultOutcome,
  online,
  escapeRef,
  onExit,
  onOpenItem,
  onResolved,
  onRestored,
  onEnded,
  onClose,
}: {
  relationshipId: string;
  firstName: string;
  /** This client's open items, as the panel lists them. */
  items: readonly Exception[];
  /** Item on screen when bulk mode opened; preselected when compatible. */
  initialSelectedId: string | null;
  outcomes: readonly ResolveOutcomeOption<T>[];
  defaultOutcome: T;
  online: boolean;
  /** The drawer asks first on Escape; true when the dialog took it. */
  escapeRef: MutableRefObject<(() => boolean) | null>;
  /** Leave bulk mode back to the item view. */
  onExit: () => void;
  onOpenItem: (id: string) => void;
  /** After a bulk resolve answered: refresh the list and Home. */
  onResolved: () => void;
  /** After Undo restored the items. */
  onRestored: () => void;
  /** A write came back RELATIONSHIP_ENDED. */
  onEnded: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => {
    const first = items.find((item) => item.id === initialSelectedId);
    return new Set(first && isBulkCompatible(first) ? [first.id] : []);
  });
  const [phase, setPhase] = useState<Phase>({ kind: "select" });
  const [outcome, setOutcome] = useState<T>(defaultOutcome);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef<Focus | null>("select-all");
  /** One key per logical bulk action, reused on retry (AGENTS.md). */
  const resolveKeyRef = useRef<{ key: string; fingerprint: string } | null>(
    null,
  );
  const undoKeyRef = useRef<{ key: string; bulkId: string } | null>(null);
  const undoingRef = useRef(false);
  const mountedRef = useRef(true);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const compatible = useMemo(() => compatibleIds(items), [items]);
  // Keep only ids that are still open and compatible (the list refreshes).
  const selectedIds = useMemo(
    () => compatible.filter((id) => selected.has(id)),
    [compatible, selected],
  );
  const count = selectedIds.length;
  const allSelected = compatible.length > 0 && count === compatible.length;
  const hint = individualOnlyHint(items);

  useLayoutEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = count > 0 && !allSelected;
    }
  });

  // Move focus to the control the new state shows, never to <body>.
  useLayoutEffect(() => {
    const want = pendingFocusRef.current;
    const root = rootRef.current;
    if (!want || !root) return;
    const target =
      want === "select-all"
        ? selectAllRef.current
        : want === "bar-resolve"
          ? root.querySelector<HTMLElement>(".sp-bulk-bar .button-primary")
          : want === "undo"
            ? root.querySelector<HTMLElement>(".sp-bulk-undo")
            : root.querySelector<HTMLElement>(".sp-bulk-after .button-primary");
    if (target) {
      pendingFocusRef.current = null;
      target.focus();
    }
  });

  const cancelConfirm = useCallback(() => {
    pendingFocusRef.current = "bar-resolve";
    setPhase({ kind: "select" });
    setError(null);
  }, []);

  escapeRef.current = () => {
    if (phase.kind === "confirm" && !acting) {
      cancelConfirm();
      return true;
    }
    return phase.kind === "confirm";
  };
  useEffect(
    () => () => {
      escapeRef.current = null;
    },
    [escapeRef],
  );

  // Undo is offered for 5 s from the answer, then the button is gone.
  useEffect(() => {
    if (!undoOpen) return;
    const id = window.setTimeout(() => {
      if (undoingRef.current) return;
      if (
        rootRef.current?.contains(document.activeElement) &&
        document.activeElement?.classList.contains("sp-bulk-undo")
      ) {
        pendingFocusRef.current = "after";
      }
      setUndoOpen(false);
    }, BULK_UNDO_MS);
    return () => window.clearTimeout(id);
  }, [undoOpen]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(compatible));
  }

  function clear() {
    setSelected(new Set());
    pendingFocusRef.current = "select-all";
  }

  function startResolve() {
    if (count === 0) return;
    setError(null);
    setPhase({ kind: count > BULK_CONFIRM_ABOVE ? "confirm" : "form" });
  }

  function cancelForm() {
    setPhase({ kind: "select" });
    setError(null);
    pendingFocusRef.current = "bar-resolve";
  }

  async function submit() {
    if (count === 0 || acting) return;
    const ids = selectedIds;
    const noteText = note.trim() || null;
    const fingerprint = JSON.stringify({ ids, outcome, note: noteText });
    if (resolveKeyRef.current?.fingerprint !== fingerprint) {
      resolveKeyRef.current = { key: createIdempotencyKey(), fingerprint };
    }
    const key = resolveKeyRef.current.key;
    setActing(true);
    setError(null);
    try {
      const res = await apiClient.bulkResolveExceptions(
        {
          relationshipId,
          exceptionIds: ids,
          outcome,
          note: noteText,
        },
        key,
      );
      resolveKeyRef.current = null;
      if (!mountedRef.current) return;
      const canUndo = Boolean(res.bulkId && res.resolvedCount > 0);
      setPhase({
        kind: "result",
        snapshot: items.slice(),
        results: res.items,
        bulkId: res.bulkId,
        outcome,
        selectedIds: ids,
      });
      setUndoOpen(canUndo);
      pendingFocusRef.current = canUndo ? "undo" : "after";
      setNote("");
      onResolved();
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ApiClientError) {
        if (err.code === "RELATIONSHIP_ENDED") {
          onEnded();
          return;
        }
        // An expired key never replays: the next try needs a new one.
        if (err.code === "IDEMPOTENCY_KEY_EXPIRED")
          resolveKeyRef.current = null;
        setError(err.message);
      } else {
        // Nothing proves why it failed; the same key is reused on retry.
        setError("Could not resolve these items.");
      }
    } finally {
      if (mountedRef.current) setActing(false);
    }
  }

  async function undo() {
    if (phase.kind !== "result" || !phase.bulkId || undoingRef.current) return;
    const bulkId = phase.bulkId;
    if (undoKeyRef.current?.bulkId !== bulkId) {
      undoKeyRef.current = { key: createIdempotencyKey(), bulkId };
    }
    const restoredSelection = phase.selectedIds;
    undoingRef.current = true;
    setUndoing(true);
    setError(null);
    const restore = () => {
      setUndoOpen(false);
      setSelected(new Set(restoredSelection));
      setPhase({ kind: "select" });
      pendingFocusRef.current = "select-all";
      onRestored();
    };
    try {
      await apiClient.undoBulkResolveExceptions(bulkId, undoKeyRef.current.key);
      if (mountedRef.current) restore();
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ApiClientError) {
        if (err.code === "BULK_ALREADY_UNDONE") {
          restore();
          return;
        }
        if (err.code === "undo_expired") {
          setUndoOpen(false);
          pendingFocusRef.current = "after";
          setError("Too late to undo. These items stay resolved.");
          return;
        }
        if (err.code === "RELATIONSHIP_ENDED") {
          onEnded();
          return;
        }
        setError(err.message);
      } else {
        setError("Could not undo.");
      }
    } finally {
      undoingRef.current = false;
      if (mountedRef.current) setUndoing(false);
    }
  }

  if (phase.kind === "result") {
    const byId = new Map(phase.results.map((r) => [r.id, r]));
    const resolvedCount = phase.results.filter(
      (r) => r.status === "resolved",
    ).length;
    const summary = bulkResultSummary(phase.results, phase.snapshot);
    const doneIds = new Set(phase.results.map((r) => r.id));
    const stillOpen = items.filter((item) => !doneIds.has(item.id));
    const nextOpen = stillOpen[0] ?? null;
    const resultOutcome =
      outcomes.find((o) => o.id === phase.outcome)?.label ??
      labelFor("resolve_outcome", phase.outcome);
    return (
      <div ref={rootRef} className="sp-bulk">
        <div className="drawer-body sp-body">
          {summary ? (
            <p
              className="sp-notice sp-bulk-partial"
              role="status"
              data-testid="bulk-summary"
            >
              <AlertCircle size={18} strokeWidth={1.75} aria-hidden />
              <span>{summary}</span>
            </p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <section className="sp-section" aria-labelledby="sp-bulk-result">
            <h3 id="sp-bulk-result" className="sp-section-title">
              Result
            </h3>
            <ul className="sp-bulk-list" data-testid="bulk-result-list">
              {phase.snapshot.map((item) => {
                const r = byId.get(item.id);
                return (
                  <li key={item.id} className="sp-bulk-row sp-bulk-row-inner">
                    <span className="sp-bulk-mark" aria-hidden>
                      {r?.status === "resolved" ? (
                        <Check size={18} strokeWidth={2} className="is-ok" />
                      ) : r ? (
                        <X size={18} strokeWidth={1.75} className="is-skip" />
                      ) : (
                        <span className="sp-bulk-box is-off" />
                      )}
                    </span>
                    <span className="sp-bulk-icon">
                      <SourceIcon type={item.sourceEntityType} />
                    </span>
                    <span className="sp-bulk-text">
                      <span className="sp-bulk-title">
                        {itemShortLabel(item)}
                      </span>
                      <span className="sp-bulk-sub">
                        {bulkRowSubline(item)}
                      </span>
                    </span>
                    {r?.status === "resolved" ? (
                      <span className="status-chip status-chip-positive sp-bulk-chip">
                        <Check size={14} strokeWidth={2} aria-hidden />
                        Resolved
                      </span>
                    ) : r?.status === "skipped" ? (
                      <span className="status-chip status-chip-neutral sp-bulk-chip">
                        {r.reason === "already_resolved"
                          ? "Already resolved"
                          : r.reason === "not_found"
                            ? "No longer exists"
                            : "Resolve on its own"}
                      </span>
                    ) : (
                      <StatusChip kind="severity" value={item.severity} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
        {undoOpen && phase.bulkId ? (
          <div className="drawer-foot sp-foot sp-bulk-toast-foot">
            <div
              className="sp-bulk-toast"
              role="status"
              data-testid="bulk-undo-toast"
            >
              <span className="sp-bulk-countdown" aria-hidden />
              <span className="sp-bulk-toast-text">
                {itemsLabel(resolvedCount)} resolved · {resultOutcome}
              </span>
              <button
                type="button"
                className="sp-bulk-undo"
                disabled={undoing}
                onClick={() => void undo()}
              >
                Undo
              </button>
            </div>
          </div>
        ) : (
          <div className="drawer-foot sp-foot sp-foot-resolved sp-bulk-after">
            <p className="sp-foot-summary">{stillOpenText(stillOpen)}</p>
            {nextOpen ? (
              <Button variant="primary" onClick={() => onOpenItem(nextOpen.id)}>
                Review {labelFor("exception_type", nextOpen.type).toLowerCase()}{" "}
                item
                <ChevronRight size={16} strokeWidth={2} aria-hidden />
              </Button>
            ) : (
              <Button variant="primary" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  const selectedItems = items.filter(
    (item) => selected.has(item.id) && isBulkCompatible(item),
  );
  const formOpen = phase.kind === "form";

  return (
    <div ref={rootRef} className="sp-bulk">
      <div className="drawer-body sp-body">
        {error && phase.kind !== "confirm" ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {formOpen ? (
          <ResolveForm
            outcomes={outcomes}
            outcome={outcome}
            onOutcome={setOutcome}
            note={note}
            onNote={setNote}
            autoFocus
          />
        ) : null}
        <section className="sp-section" aria-labelledby="sp-bulk-open">
          <h3 id="sp-bulk-open" className="sp-section-title">
            Open items
          </h3>
          <div className="sp-bulk-all">
            <label className="sp-bulk-all-label">
              <input
                ref={selectAllRef}
                type="checkbox"
                className="sp-bulk-check"
                checked={allSelected}
                disabled={compatible.length === 0 || formOpen}
                aria-label="Select all items that can be resolved together"
                onChange={toggleAll}
              />
              <span aria-live="polite" data-testid="bulk-count">
                {count} of {compatible.length} selected
              </span>
            </label>
            {hint ? <span className="sp-bulk-hint">{hint}</span> : null}
          </div>
          <ul className="sp-bulk-list" data-testid="bulk-select-list">
            {items.map((item) => {
              const ok = isBulkCompatible(item);
              const on = ok && selected.has(item.id);
              const inner = (
                <>
                  <span className="sp-bulk-mark">
                    {ok ? (
                      <input
                        type="checkbox"
                        className="sp-bulk-check"
                        checked={on}
                        disabled={formOpen}
                        onChange={() => toggle(item.id)}
                      />
                    ) : (
                      <span className="sp-bulk-box is-off" aria-hidden />
                    )}
                  </span>
                  <span className="sp-bulk-icon">
                    <SourceIcon type={item.sourceEntityType} />
                  </span>
                  <span className="sp-bulk-text">
                    <span className="sp-bulk-title">
                      {itemShortLabel(item)}
                    </span>
                    <span className="sp-bulk-sub">{bulkRowSubline(item)}</span>
                  </span>
                  <StatusChip kind="severity" value={item.severity} />
                </>
              );
              return (
                <li
                  key={item.id}
                  className={on ? "sp-bulk-row is-on" : "sp-bulk-row"}
                >
                  {ok ? (
                    <label className="sp-bulk-row-inner">{inner}</label>
                  ) : (
                    <div className="sp-bulk-row-inner is-individual">
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {formOpen ? (
        <div className="drawer-foot sp-foot sp-foot-form">
          <div className="sp-actions">
            <Button
              variant="secondary"
              className="sp-cancel"
              onClick={cancelForm}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="sp-resolve-submit"
              disabled={acting || !online || count === 0}
              onClick={() => void submit()}
            >
              Resolve {itemsLabel(count)}
            </Button>
          </div>
          <p className="drawer-helper">
            The same outcome and note go on every item. You can undo for 5
            seconds after.
          </p>
        </div>
      ) : (
        <div className="drawer-foot sp-foot sp-bulk-foot">
          <div className="sp-bulk-bar" role="group" aria-label="Selected items">
            <span className="sp-bulk-bar-count">
              {count === 0 ? "Nothing selected" : `${count} selected`}
            </span>
            {count > 0 ? (
              <button type="button" className="sp-bulk-bar-btn" onClick={clear}>
                Clear
              </button>
            ) : (
              <button
                type="button"
                className="sp-bulk-bar-btn"
                onClick={onExit}
              >
                Back
              </button>
            )}
            <Button
              variant="primary"
              disabled={count === 0 || acting || !online}
              onClick={startResolve}
            >
              Resolve {itemsLabel(count)}…
            </Button>
          </div>
          <p className="drawer-helper">
            Only missed workouts, meals and check-ins can be resolved together.
            Mark reviewed still applies to {firstName} as a whole.
          </p>
        </div>
      )}

      {phase.kind === "confirm" ? (
        <div
          className="sp-bulk-scrim"
          onClick={() => !acting && cancelConfirm()}
        >
          <div
            className="sp-bulk-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={textId}
            data-testid="bulk-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sp-bulk-dialog-body">
              <h2 id={titleId} className="sp-bulk-dialog-title">
                Resolve {itemsLabel(count)} for {firstName}?
              </h2>
              <p id={textId} className="sp-bulk-dialog-text">
                The same outcome and note go on every item. {firstName} can't
                log these days late once they're resolved.
              </p>
              <ul className="sp-bulk-dialog-list">
                {selectedItems.map((item) => (
                  <li key={item.id}>
                    <SourceIcon type={item.sourceEntityType} />
                    <span>{itemShortLabel(item)}</span>
                  </li>
                ))}
              </ul>
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <ResolveForm
                outcomes={outcomes}
                outcome={outcome}
                onOutcome={setOutcome}
                note={note}
                onNote={setNote}
                outcomeLabel="Outcome"
                plain
                autoFocus
              />
            </div>
            <div className="sp-bulk-dialog-foot">
              <p className="sp-bulk-dialog-undo">
                You can undo for 5 seconds after.
              </p>
              <Button
                variant="secondary"
                disabled={acting}
                onClick={cancelConfirm}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={acting || !online}
                onClick={() => void submit()}
              >
                Resolve {itemsLabel(count)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
