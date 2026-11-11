import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AlertCircle, X } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CreatePaymentRecordRequest,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  UpdatePaymentRecordRequest,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { ReadOnlyField } from "../../components/ReadOnlyField";
import { DateField, parseRupeesInput } from "./SubscriptionDrawer";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, formatRupees } from "./clientSettingsFormat";

/** Same bound as the contract's payment note. */
export const PAYMENT_NOTE_MAX = 500;

const STATUSES: PaymentStatus[] = ["paid", "unpaid"];
const METHODS: PaymentMethod[] = ["cash", "upi", "bank"];

/**
 * 409/404 codes after which the loaded records are stale: reload, never retry
 * blind. PAYMENT_CONFLICT and RELATIONSHIP_ENDED come from Z8-17.
 */
const STALE_CODES = new Set([
  "PAYMENT_CONFLICT",
  "PAYMENT_NOT_FOUND",
  "RELATIONSHIP_ENDED",
  "SUBSCRIPTION_REQUIRED",
]);

type FieldKey = "amount" | "dueOn" | "paidOn" | "method" | "note";
type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELD_LABELS: Record<FieldKey, string> = {
  amount: "Amount",
  dueOn: "Due date",
  paidOn: "Paid date",
  method: "Method",
  note: "Note",
};
const FIELD_ORDER: FieldKey[] = ["amount", "dueOn", "paidOn", "method", "note"];

export type PaymentDraft = {
  amount: string;
  dueOn: string;
  status: PaymentStatus;
  paidOn: string;
  method: PaymentMethod | null;
  note: string;
};

/**
 * Field errors for a draft. Mirrors the contract rules (amount above ₹0, a
 * paid record needs its paid date and method) so the server never sees them.
 * `editing` skips amount and due date, which an existing record never changes.
 */
export function validatePaymentDraft(draft: PaymentDraft, editing: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (!editing) {
    const amount = parseRupeesInput(draft.amount);
    if (amount === null) errors.amount = "Enter the amount.";
    else if (amount === "invalid" || amount < 1) {
      errors.amount = "Enter an amount in rupees, from ₹0.01 up to ₹1,00,00,000.";
    }
    if (!draft.dueOn) errors.dueOn = "Choose the due date.";
  }
  if (draft.status === "paid") {
    if (!draft.paidOn) errors.paidOn = "Choose the date it was paid.";
    if (!draft.method) errors.method = "Choose Cash, UPI or Bank.";
  }
  if (draft.note.trim().length > PAYMENT_NOTE_MAX) {
    errors.note = `Use ${PAYMENT_NOTE_MAX} characters or fewer.`;
  }
  return errors;
}

/** POST body for a new record. Unpaid records carry no paid date or method. */
export function buildCreateBody(draft: PaymentDraft): CreatePaymentRecordRequest {
  const note = draft.note.trim();
  const paid = draft.status === "paid";
  return {
    amountPaise: parseRupeesInput(draft.amount) as number,
    dueOn: draft.dueOn,
    status: draft.status,
    paidOn: paid ? draft.paidOn : null,
    method: paid ? draft.method : null,
    note: note ? note : null,
  };
}

/**
 * PATCH body with only the fields that changed (Z8-17 merges sent fields onto
 * the newest stored record, so an untouched field is never sent back stale).
 * Going back to unpaid sends only the status: the server clears the paid date
 * and method. Returns "unchanged" when nothing differs.
 */
export function buildUpdateBody(
  record: PaymentRecord,
  draft: PaymentDraft,
): UpdatePaymentRecordRequest | "unchanged" {
  const body: UpdatePaymentRecordRequest = {};
  if (draft.status !== record.status) body.status = draft.status;
  if (draft.status === "paid") {
    if (draft.paidOn !== (record.paidOn ?? "")) body.paidOn = draft.paidOn;
    if (draft.method !== record.method) body.method = draft.method;
  }
  const note = draft.note.trim() || null;
  if (note !== (record.note?.trim() || null)) body.note = note;
  return Object.keys(body).length === 0 ? "unchanged" : body;
}

/**
 * Add or edit one payment record (frames 209 / IP-08, payment-records part).
 * Tracking only (D-W8-2, D-P2-12): FitBud records what the trainer tells it;
 * nothing here collects money, sends an invoice or reminds the client to pay.
 * An existing record keeps its amount and due date (the API changes only
 * status, paid date, method and note).
 */
export function PaymentDrawer({
  relationshipId,
  record,
  today,
  online,
  onClose,
  onSaved,
  onStale,
}: {
  relationshipId: string;
  /** The record being edited; null adds a new one. */
  record: PaymentRecord | null;
  /** Today's civil date, the default for new due and paid dates. */
  today: string;
  online: boolean;
  onClose: () => void;
  onSaved: (next: PaymentRecord) => void;
  /** The loaded records are out of date (409/404): reload the page data. */
  onStale: () => void;
}) {
  const editing = record !== null;
  const [draft, setDraft] = useState<PaymentDraft>(() =>
    record
      ? {
          amount: "",
          dueOn: record.dueOn,
          status: record.status,
          paidOn: record.paidOn ?? "",
          method: record.method,
          note: record.note ?? "",
        }
      : { amount: "", dueOn: today, status: "paid", paidOn: today, method: null, note: "" },
  );
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);
  const methodRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const statusRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  // One key per logical save: a retry of the same change reuses it.
  const keyRef = useRef<{ body: string; key: string } | null>(null);
  const titleId = useId();
  const ids = {
    amount: useId(),
    dueOn: useId(),
    paidOn: useId(),
    note: useId(),
  };
  const helpIds = {
    amount: useId(),
    dueOn: useId(),
    paidOn: useId(),
    method: useId(),
    note: useId(),
  };
  const statusId = useId();
  const methodId = useId();

  const allErrors = validatePaymentDraft(draft, editing);
  const shown: FieldErrors = {};
  for (const key of FIELD_ORDER) {
    if (allErrors[key] && (submitted || touched[key])) shown[key] = allErrors[key];
  }
  const shownKeys = FIELD_ORDER.filter((k) => shown[k]);

  useEffect(() => {
    (editing ? statusRef : amountRef).current?.focus();
  }, [editing]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (!savingRef.current) onClose();
        return;
      }
      if (ev.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) {
        ev.preventDefault();
        first.focus();
      } else if (ev.shiftKey && active === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof PaymentDraft>(key: K, value: PaymentDraft[K]) {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      // Marking paid again starts from today unless a paid date is already set.
      if (key === "status" && value === "paid" && !next.paidOn) next.paidOn = today;
      return next;
    });
    setSaveError((e) => (e?.stale ? e : null));
  }

  function touch(key: FieldKey) {
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (saving || !online || saveError?.stale) return;
    setSubmitted(true);
    setSaveError(null);
    const firstInvalid = FIELD_ORDER.find((k) => allErrors[k]);
    if (firstInvalid) {
      const refs = {
        amount: amountRef,
        dueOn: dueRef,
        paidOn: paidRef,
        method: methodRef,
        note: noteRef,
      };
      refs[firstInvalid].current?.focus();
      return;
    }
    let body: CreatePaymentRecordRequest | UpdatePaymentRecordRequest;
    if (record) {
      const update = buildUpdateBody(record, draft);
      if (update === "unchanged") {
        onClose();
        return;
      }
      body = update;
    } else {
      body = buildCreateBody(draft);
    }
    const bodyKey = JSON.stringify(body);
    if (keyRef.current?.body !== bodyKey) {
      keyRef.current = { body: bodyKey, key: createIdempotencyKey() };
    }
    setSaving(true);
    savingRef.current = true;
    try {
      const next = record
        ? await apiClient.updatePaymentRecord(
            relationshipId,
            record.id,
            body as UpdatePaymentRecordRequest,
            keyRef.current.key,
          )
        : await apiClient.createPaymentRecord(
            relationshipId,
            body as CreatePaymentRecordRequest,
            keyRef.current.key,
          );
      keyRef.current = null;
      onSaved(next);
    } catch (err) {
      // Only the API's own curated message is shown verbatim (AGENTS.md).
      if (err instanceof ApiClientError) {
        setSaveError({ message: err.message, stale: STALE_CODES.has(err.code) });
      } else {
        setSaveError({ message: "Couldn't save. Try again. (CS-PAY-SAVE)", stale: false });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const blocked = shownKeys.length > 0;
  const paid = draft.status === "paid";

  function errorLine(key: FieldKey) {
    return shown[key] ? (
      <p id={helpIds[key]} className="cs-field-error">
        <AlertCircle size={14} strokeWidth={1.75} aria-hidden />
        {shown[key]}
      </p>
    ) : null;
  }

  return (
    <div
      className="drawer-backdrop cs-drawer-backdrop"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="drawer-panel cs-drawer cs-drawer-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="client-payment-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cs-drawer-head">
          <h2 id={titleId}>{editing ? "Edit payment record" : "Add payment record"}</h2>
          <button
            type="button"
            className="cs-icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <form className="cs-drawer-form" onSubmit={submit} noValidate>
          <div className="cs-drawer-body">
            {blocked ? (
              <div className="cs-error-summary" role="alert">
                <AlertCircle size={16} strokeWidth={1.75} aria-hidden />
                <span>
                  Fix {shownKeys.length} {shownKeys.length === 1 ? "field" : "fields"} to save:{" "}
                  {shownKeys.map((k) => FIELD_LABELS[k]).join(", ")}
                </span>
              </div>
            ) : null}

            {record ? (
              <dl className="cs-grid cs-pay-fixed">
                <ReadOnlyField
                  label="Amount"
                  value={<span className="cs-num">{formatRupees(record.amountPaise)}</span>}
                />
                <ReadOnlyField label="Due" value={formatCivilDate(record.dueOn)} />
              </dl>
            ) : (
              <div className="cs-field-pair">
                <div className="cs-field">
                  <label htmlFor={ids.amount}>Amount</label>
                  <div className={`cs-money-input${shown.amount ? " is-invalid" : ""}`}>
                    <span className="cs-phone-prefix" aria-hidden>
                      ₹
                    </span>
                    <input
                      ref={amountRef}
                      id={ids.amount}
                      type="text"
                      inputMode="decimal"
                      value={draft.amount}
                      autoComplete="off"
                      aria-invalid={shown.amount ? true : undefined}
                      aria-describedby={shown.amount ? helpIds.amount : undefined}
                      onChange={(e) => set("amount", e.target.value)}
                      onBlur={() => touch("amount")}
                    />
                  </div>
                  {errorLine("amount")}
                </div>
                <div className="cs-field">
                  <label htmlFor={ids.dueOn}>Due date</label>
                  <DateField
                    id={ids.dueOn}
                    inputRef={dueRef}
                    value={draft.dueOn}
                    invalid={Boolean(shown.dueOn)}
                    describedBy={shown.dueOn ? helpIds.dueOn : undefined}
                    onChange={(v) => {
                      set("dueOn", v);
                      touch("dueOn");
                    }}
                    onBlur={() => touch("dueOn")}
                  />
                  {errorLine("dueOn")}
                </div>
              </div>
            )}

            <div className="cs-field">
              <span id={statusId} className="cs-field-label">
                Status
              </span>
              <div className="cs-segmented" role="radiogroup" aria-labelledby={statusId}>
                {STATUSES.map((value, i) => (
                  <label
                    key={value}
                    className={`cs-segment${draft.status === value ? " is-selected" : ""}`}
                  >
                    <input
                      ref={i === 0 ? statusRef : undefined}
                      type="radio"
                      name="paymentStatus"
                      value={value}
                      checked={draft.status === value}
                      onChange={() => set("status", value)}
                    />
                    {PAYMENT_STATUS_LABELS[value]}
                  </label>
                ))}
              </div>
            </div>

            {paid ? (
              <div className="cs-field-pair">
                <div className="cs-field">
                  <label htmlFor={ids.paidOn}>Paid date</label>
                  <DateField
                    id={ids.paidOn}
                    inputRef={paidRef}
                    value={draft.paidOn}
                    invalid={Boolean(shown.paidOn)}
                    describedBy={shown.paidOn ? helpIds.paidOn : undefined}
                    onChange={(v) => {
                      set("paidOn", v);
                      touch("paidOn");
                    }}
                    onBlur={() => touch("paidOn")}
                  />
                  {errorLine("paidOn")}
                </div>
                <div className="cs-field">
                  <span id={methodId} className="cs-field-label">
                    Method
                  </span>
                  <div
                    className={`cs-segmented${shown.method ? " is-invalid" : ""}`}
                    role="radiogroup"
                    aria-labelledby={methodId}
                    aria-describedby={shown.method ? helpIds.method : undefined}
                    aria-invalid={shown.method ? true : undefined}
                  >
                    {METHODS.map((value, i) => (
                      <label
                        key={value}
                        className={`cs-segment${draft.method === value ? " is-selected" : ""}`}
                      >
                        <input
                          ref={i === 0 ? methodRef : undefined}
                          type="radio"
                          name="paymentMethod"
                          value={value}
                          checked={draft.method === value}
                          onChange={() => {
                            set("method", value);
                            touch("method");
                          }}
                        />
                        {PAYMENT_METHOD_LABELS[value]}
                      </label>
                    ))}
                  </div>
                  {errorLine("method")}
                </div>
              </div>
            ) : null}

            <div className="cs-field">
              <label htmlFor={ids.note}>Note (optional)</label>
              <textarea
                ref={noteRef}
                id={ids.note}
                className={`cs-textarea${shown.note ? " is-invalid" : ""}`}
                rows={3}
                value={draft.note}
                aria-invalid={shown.note ? true : undefined}
                aria-describedby={shown.note ? helpIds.note : undefined}
                onChange={(e) => set("note", e.target.value)}
                onBlur={() => touch("note")}
              />
              {errorLine("note")}
            </div>

            {saveError ? (
              <div className="cs-save-error" role="alert">
                <p className="form-error">{saveError.message}</p>
                {saveError.stale ? (
                  <button type="button" className="button-secondary" onClick={onStale}>
                    Reload latest
                  </button>
                ) : null}
              </div>
            ) : null}
            {!online ? (
              <p className="cs-field-help" role="status">
                You're offline. Reconnect to save.
              </p>
            ) : null}
          </div>
          <footer className="cs-drawer-foot cs-drawer-foot-note">
            <p className="cs-foot-note">Tracking only.</p>
            <button
              type="button"
              className="button-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button-primary"
              disabled={saving || !online || blocked || Boolean(saveError?.stale)}
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Add record"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
