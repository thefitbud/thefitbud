import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  CLIENT_DISPLAY_NAME_MAX_LENGTH,
  type ClientSettingsResponse,
  type UpdateClientBasicsRequest,
} from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { parsePhoneInput, phoneInputValue } from "./clientSettingsFormat";

type FieldErrors = { name?: string; phone?: string };

/**
 * Frame 210: edit the trainer-owned client name and contact phone on this
 * coaching relationship (Z6-8b, D-W8-10). The client's own profile name and
 * sign-in phone never change, and the goal stays in Plan › Coaching setup.
 */
export function EditBasicsDrawer({
  relationshipId,
  settings,
  firstName,
  online,
  onClose,
  onSaved,
}: {
  relationshipId: string;
  settings: ClientSettingsResponse;
  firstName: string;
  online: boolean;
  onClose: () => void;
  onSaved: (next: ClientSettingsResponse) => void;
}) {
  const { basics } = settings;
  const initialName = basics.clientDisplayName ?? basics.displayName;
  const initialPhone = basics.contactPhoneE164 ?? basics.phoneE164;

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(phoneInputValue(initialPhone));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // One key per logical save: a retry of the same change reuses it.
  const keyRef = useRef<{ body: string; key: string } | null>(null);
  const titleId = useId();
  const nameId = useId();
  const phoneId = useId();
  const nameHelpId = useId();
  const phoneHelpId = useId();

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
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

  function buildBody():
    | { kind: "errors"; errors: FieldErrors }
    | { kind: "unchanged" }
    | { kind: "ok"; body: UpdateClientBasicsRequest } {
    const nextErrors: FieldErrors = {};
    const trimmedName = name.trim();
    if (!trimmedName) nextErrors.name = "Enter a name.";
    else if (trimmedName.length > CLIENT_DISPLAY_NAME_MAX_LENGTH) {
      nextErrors.name = `Use ${CLIENT_DISPLAY_NAME_MAX_LENGTH} characters or fewer.`;
    }
    const parsedPhone = parsePhoneInput(phone);
    if (parsedPhone.kind === "invalid") {
      nextErrors.phone =
        "Enter a 10-digit mobile number, or start with + and the country code.";
    }
    if (nextErrors.name || nextErrors.phone) {
      return { kind: "errors", errors: nextErrors };
    }

    const body: { displayName?: string; contactPhone?: string | null } = {};
    if (trimmedName !== initialName) body.displayName = trimmedName;
    if (parsedPhone.kind === "ok" && parsedPhone.e164 !== initialPhone) {
      body.contactPhone = parsedPhone.e164;
    }
    // Clearing the field clears only a contact phone the trainer saved; the
    // sign-in phone shown when none is saved cannot be removed here.
    if (parsedPhone.kind === "empty" && basics.contactPhoneE164 !== null) {
      body.contactPhone = null;
    }
    if (body.displayName === undefined && body.contactPhone === undefined) {
      return { kind: "unchanged" };
    }
    return { kind: "ok", body };
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (saving || !online) return;
    setSaveError(null);
    const result = buildBody();
    if (result.kind === "errors") {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (result.kind === "unchanged") {
      onClose();
      return;
    }
    const body = result.body;
    const bodyKey = JSON.stringify(body);
    if (keyRef.current?.body !== bodyKey) {
      keyRef.current = { body: bodyKey, key: createIdempotencyKey() };
    }
    setSaving(true);
    try {
      const next = await apiClient.updateClientBasics(
        relationshipId,
        body,
        keyRef.current.key,
      );
      keyRef.current = null;
      onSaved(next);
    } catch (err) {
      // Only the API's own curated message is shown verbatim (AGENTS.md).
      setSaveError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't save. Try again. (CS-SAVE)",
      );
    } finally {
      setSaving(false);
    }
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
        className="drawer-panel cs-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="client-basics-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cs-drawer-head">
          <h2 id={titleId}>Edit basic details</h2>
          <button
            type="button"
            className="cs-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <form className="cs-drawer-form" onSubmit={submit} noValidate>
          <div className="cs-drawer-body">
            <div className="cs-field">
              <label htmlFor={nameId}>Name</label>
              <input
                ref={nameRef}
                id={nameId}
                type="text"
                value={name}
                maxLength={CLIENT_DISPLAY_NAME_MAX_LENGTH + 20}
                autoComplete="off"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={nameHelpId}
                onChange={(e) => setName(e.target.value)}
              />
              <p id={nameHelpId} className={errors.name ? "cs-field-error" : "cs-field-help"}>
                {errors.name ??
                  `Only you see this name. ${firstName}'s own profile name doesn't change.`}
              </p>
            </div>
            <div className="cs-field">
              <label htmlFor={phoneId}>Contact phone</label>
              <div className="cs-phone-input">
                {phone.trim().startsWith("+") ? null : (
                  <span className="cs-phone-prefix" aria-hidden>
                    +91
                  </span>
                )}
                <input
                  id={phoneId}
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  autoComplete="off"
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={phoneHelpId}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <p id={phoneHelpId} className={errors.phone ? "cs-field-error" : "cs-field-help"}>
                {errors.phone ??
                  `A number you keep for ${firstName}. Their sign-in number doesn't change.`}
              </p>
            </div>
            <p className="cs-drawer-note">
              Goal, start weight and diet preference are coaching details: edit them in{" "}
              <Link to={`/clients/${relationshipId}/configure`}>Plan › Coaching setup</Link>.
            </p>
            {saveError ? (
              <p className="form-error" role="alert">
                {saveError}
              </p>
            ) : null}
            {!online ? (
              <p className="cs-field-help" role="status">
                You're offline. Reconnect to save.
              </p>
            ) : null}
          </div>
          <footer className="cs-drawer-foot">
            <button type="button" className="button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="button-primary"
              disabled={saving || !online}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
