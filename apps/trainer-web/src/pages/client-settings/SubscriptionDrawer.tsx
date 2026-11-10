import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from "react";
import { AlertCircle, CalendarDays, X } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  CLIENT_SETTINGS_MAX_AMOUNT_PAISE,
  type ClientSettingsSubscription,
  type CoachingMode,
  type PaymentFrequency,
  type PutClientSubscriptionRequest,
} from "@fitbud/contracts";
import { RENEWAL_UPCOMING_WINDOW_DAYS, formatCivilDate, labelFor } from "@fitbud/core";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { COACHING_MODE_LABELS } from "./clientSettingsFormat";

const PLAN_NAME_MAX = 120;

const FREQUENCIES: PaymentFrequency[] = ["weekly", "monthly", "quarterly", "yearly"];
const MODES: CoachingMode[] = ["online", "in_person", "hybrid"];

/** 409 codes after which the loaded subscription is stale: reload, never retry blind. */
const STALE_CODES = new Set(["SUBSCRIPTION_VERSION_CONFLICT", "RELATIONSHIP_ENDED"]);

type FieldKey = "planName" | "startsOn" | "renewsOn" | "amount";
type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELD_LABELS: Record<FieldKey, string> = {
  planName: "Plan name",
  startsOn: "Start date",
  renewsOn: "Renewal date",
  amount: "Amount",
};
const FIELD_ORDER: FieldKey[] = ["planName", "startsOn", "renewsOn", "amount"];

/** "18,000" or "18000.50" → paise; null when blank; "invalid" otherwise. */
export function parseRupeesInput(raw: string): number | null | "invalid" {
  const value = raw.replace(/[₹,\s]/g, "");
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return "invalid";
  const [whole, fraction = ""] = value.split(".") as [string, string?];
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise > CLIENT_SETTINGS_MAX_AMOUNT_PAISE) {
    return "invalid";
  }
  return paise;
}

function rupeesInputValue(paise: number | null): string {
  if (paise === null) return "";
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

type Draft = {
  planName: string;
  paymentFrequency: PaymentFrequency;
  startsOn: string;
  renewsOn: string;
  amount: string;
  coachingMode: CoachingMode | null;
};

/** Field errors for a draft. Mirrors the contract rules so the server never sees them. */
export function validateSubscriptionDraft(draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  const name = draft.planName.trim();
  if (!name) errors.planName = "Enter a plan name.";
  else if (name.length > PLAN_NAME_MAX) {
    errors.planName = `Use ${PLAN_NAME_MAX} characters or fewer.`;
  }
  if (!draft.startsOn) errors.startsOn = "Choose a start date.";
  if (!draft.renewsOn) errors.renewsOn = "Choose a renewal date.";
  else if (draft.startsOn && draft.renewsOn <= draft.startsOn) {
    errors.renewsOn = `Renewal date must be after the start date, ${formatCivilDate(draft.startsOn)}.`;
  }
  if (parseRupeesInput(draft.amount) === "invalid") {
    errors.amount = "Enter an amount in rupees, up to ₹1,00,00,000.";
  }
  return errors;
}

/**
 * A date input that reads like "Mon 7 Sep" (never ISO or a locale numeric
 * date). The native date input sits over the formatted text, so the browser
 * picker and keyboard entry still work and the value stays a civil date.
 */
function DateField({
  id,
  value,
  invalid,
  describedBy,
  onChange,
  onBlur,
  inputRef,
}: {
  id: string;
  value: string;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (value: string) => void;
  onBlur: () => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className={`cs-date${invalid ? " is-invalid" : ""}`}>
      <span className="cs-date-text" aria-hidden>
        {value ? formatCivilDate(value) : "Choose a date"}
      </span>
      <CalendarDays className="cs-date-icon" size={18} strokeWidth={1.75} aria-hidden />
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={value}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onClick={(e) => {
          // Open the picker from anywhere on the field, not only the icon.
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // showPicker is refused outside a user gesture; typing still works.
          }
        }}
      />
    </div>
  );
}

/**
 * Frames 211 / 211b: edit the client's subscription. Every save creates a new
 * subscription version (Z6-8); earlier versions never change. Tracking only
 * (D-W8-2, D-P2-12): no session packages, collection, gateway or invoices.
 * Payment records are added from the page (Z8-4), not here.
 */
export function SubscriptionDrawer({
  relationshipId,
  subscription,
  online,
  onClose,
  onSaved,
  onStale,
}: {
  relationshipId: string;
  subscription: ClientSettingsSubscription | null;
  online: boolean;
  onClose: () => void;
  onSaved: (next: ClientSettingsSubscription) => void;
  /** The loaded subscription is out of date (409): reload the page data. */
  onStale: () => void;
}) {
  const initial: Draft = {
    planName: subscription?.planName ?? "",
    paymentFrequency: subscription?.paymentFrequency ?? "monthly",
    startsOn: subscription?.startsOn ?? "",
    renewsOn: subscription?.renewsOn ?? "",
    amount: rupeesInputValue(subscription?.amountPaise ?? null),
    coachingMode: subscription?.coachingMode ?? null,
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const renewRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  // One key per logical save: a retry of the same change reuses it.
  const keyRef = useRef<{ body: string; key: string } | null>(null);
  const titleId = useId();
  const ids = {
    planName: useId(),
    startsOn: useId(),
    renewsOn: useId(),
    amount: useId(),
  };
  const helpIds = {
    planName: useId(),
    startsOn: useId(),
    renewsOn: useId(),
    amount: useId(),
  };
  const freqId = useId();
  const modeId = useId();

  const allErrors = validateSubscriptionDraft(draft);
  const shown: FieldErrors = {};
  for (const key of FIELD_ORDER) {
    if (allErrors[key] && (submitted || touched[key])) shown[key] = allErrors[key];
  }
  const shownKeys = FIELD_ORDER.filter((k) => shown[k]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

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

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaveError((e) => (e?.stale ? e : null));
  }

  function touch(key: FieldKey) {
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  }

  function buildBody(): PutClientSubscriptionRequest | "unchanged" {
    const amount = parseRupeesInput(draft.amount) as number | null;
    const unchanged =
      subscription !== null &&
      draft.planName.trim() === subscription.planName &&
      draft.paymentFrequency === subscription.paymentFrequency &&
      draft.startsOn === subscription.startsOn &&
      draft.renewsOn === subscription.renewsOn &&
      amount === subscription.amountPaise &&
      draft.coachingMode === subscription.coachingMode;
    if (unchanged) return "unchanged";
    return {
      expectedVersion: subscription?.versionNumber ?? 0,
      planName: draft.planName.trim(),
      paymentFrequency: draft.paymentFrequency,
      startsOn: draft.startsOn,
      renewsOn: draft.renewsOn,
      amountPaise: amount,
      // Not edited here: sent as stored so nothing changes silently.
      subscriptionType: subscription?.subscriptionType ?? null,
      coachingMode: draft.coachingMode,
    };
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (saving || !online || saveError?.stale) return;
    setSubmitted(true);
    setSaveError(null);
    const firstInvalid = FIELD_ORDER.find((k) => allErrors[k]);
    if (firstInvalid) {
      // The summary names every field; focus moves to the first one.
      const refs = { planName: nameRef, startsOn: startRef, renewsOn: renewRef, amount: amountRef };
      refs[firstInvalid].current?.focus();
      return;
    }
    const body = buildBody();
    if (body === "unchanged") {
      onClose();
      return;
    }
    const bodyKey = JSON.stringify(body);
    if (keyRef.current?.body !== bodyKey) {
      keyRef.current = { body: bodyKey, key: createIdempotencyKey() };
    }
    setSaving(true);
    savingRef.current = true;
    try {
      const next = await apiClient.saveClientSubscription(
        relationshipId,
        body,
        keyRef.current.key,
      );
      keyRef.current = null;
      onSaved(next);
    } catch (err) {
      // Only the API's own curated message is shown verbatim (AGENTS.md).
      if (err instanceof ApiClientError) {
        setSaveError({ message: err.message, stale: STALE_CODES.has(err.code) });
      } else {
        setSaveError({ message: "Couldn't save. Try again. (CS-SUB-SAVE)", stale: false });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const blocked = shownKeys.length > 0;

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
        data-testid="client-subscription-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cs-drawer-head">
          <h2 id={titleId}>Edit subscription & package</h2>
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

            <div className="cs-field">
              <label htmlFor={ids.planName}>Plan name</label>
              <input
                ref={nameRef}
                id={ids.planName}
                type="text"
                value={draft.planName}
                maxLength={PLAN_NAME_MAX + 20}
                autoComplete="off"
                aria-invalid={shown.planName ? true : undefined}
                aria-describedby={shown.planName ? helpIds.planName : undefined}
                onChange={(e) => set("planName", e.target.value)}
                onBlur={() => touch("planName")}
              />
              {shown.planName ? (
                <p id={helpIds.planName} className="cs-field-error">
                  <AlertCircle size={14} strokeWidth={1.75} aria-hidden />
                  {shown.planName}
                </p>
              ) : null}
            </div>

            <div className="cs-field">
              <span id={freqId} className="cs-field-label">
                Payment frequency
              </span>
              <div className="cs-segmented" role="radiogroup" aria-labelledby={freqId}>
                {FREQUENCIES.map((value) => (
                  <label
                    key={value}
                    className={`cs-segment${draft.paymentFrequency === value ? " is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="paymentFrequency"
                      value={value}
                      checked={draft.paymentFrequency === value}
                      onChange={() => set("paymentFrequency", value)}
                    />
                    {labelFor("payment_frequency", value)}
                  </label>
                ))}
              </div>
            </div>

            <div className="cs-field-pair">
              <div className="cs-field">
                <label htmlFor={ids.startsOn}>Start date</label>
                <DateField
                  id={ids.startsOn}
                  inputRef={startRef}
                  value={draft.startsOn}
                  invalid={Boolean(shown.startsOn)}
                  describedBy={shown.startsOn ? helpIds.startsOn : undefined}
                  onChange={(v) => {
                    set("startsOn", v);
                    touch("startsOn");
                  }}
                  onBlur={() => touch("startsOn")}
                />
                {shown.startsOn ? (
                  <p id={helpIds.startsOn} className="cs-field-error">
                    <AlertCircle size={14} strokeWidth={1.75} aria-hidden />
                    {shown.startsOn}
                  </p>
                ) : null}
              </div>
              <div className="cs-field">
                <label htmlFor={ids.renewsOn}>Renewal date</label>
                <DateField
                  id={ids.renewsOn}
                  inputRef={renewRef}
                  value={draft.renewsOn}
                  invalid={Boolean(shown.renewsOn)}
                  describedBy={helpIds.renewsOn}
                  onChange={(v) => {
                    set("renewsOn", v);
                    touch("renewsOn");
                  }}
                  onBlur={() => touch("renewsOn")}
                />
                {shown.renewsOn ? (
                  <p id={helpIds.renewsOn} className="cs-field-error">
                    <AlertCircle size={14} strokeWidth={1.75} aria-hidden />
                    {shown.renewsOn}
                  </p>
                ) : (
                  <p id={helpIds.renewsOn} className="cs-field-help">
                    Home shows a renewal reminder {RENEWAL_UPCOMING_WINDOW_DAYS} days before.
                  </p>
                )}
              </div>
            </div>

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
                {shown.amount ? (
                  <p id={helpIds.amount} className="cs-field-error">
                    <AlertCircle size={14} strokeWidth={1.75} aria-hidden />
                    {shown.amount}
                  </p>
                ) : null}
              </div>
              <div className="cs-field">
                <span id={modeId} className="cs-field-label">
                  Coaching mode
                </span>
                <div className="cs-segmented" role="radiogroup" aria-labelledby={modeId}>
                  {MODES.map((value) => (
                    <label
                      key={value}
                      className={`cs-segment${draft.coachingMode === value ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="coachingMode"
                        value={value}
                        checked={draft.coachingMode === value}
                        onChange={() => set("coachingMode", value)}
                      />
                      {COACHING_MODE_LABELS[value]}
                    </label>
                  ))}
                </div>
              </div>
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
              {saving ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
