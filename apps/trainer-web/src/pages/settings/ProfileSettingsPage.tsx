import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import { normalizeWhatsappE164 } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { stage1Api } from "../../lib/stage1-api";
import { ErrorState, LoadingBlock } from "../../components/StatePanels";
import { useOnlineStatus } from "../../components/OfflineBanner";
import {
  parsePhoneInput,
  phoneInputValue,
} from "../client-settings/clientSettingsFormat";
import "./settings.css";

/** Frame 176: "India (IST)" — never raw IANA in the control. */
function timezoneOptionLabel(iana: string): string {
  if (iana === "Asia/Kolkata" || iana === "Asia/Calcutta") return "India (IST)";
  return iana;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function ProfileSettingsPage() {
  const { me, refreshMe, loading: authLoading } = useAuth();
  const online = useOnlineStatus();
  const photoInputId = useId();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [whatsappLocal, setWhatsappLocal] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    setDisplayName(me.trainerProfile?.displayName ?? "");
    setWhatsappLocal(phoneInputValue(me.trainerProfile?.whatsappE164 ?? null));
    setTimezone(me.timezone ?? "Asia/Kolkata");
  }, [me]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const timezoneChoices = useMemo(() => {
    const set = new Set<string>(["Asia/Kolkata", timezone]);
    if (me?.timezone) set.add(me.timezone);
    return [...set];
  }, [me?.timezone, timezone]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!online) {
      setError("You're offline. Reconnect to save your profile.");
      return;
    }
    setSaving(true);
    setError(null);
    setFieldError(null);
    setToast(null);

    const parsed = parsePhoneInput(whatsappLocal);
    let whatsappE164: string | null = null;
    if (parsed.kind === "invalid") {
      setFieldError("Enter a valid 10-digit Indian mobile number.");
      setSaving(false);
      return;
    }
    if (parsed.kind === "ok") {
      const normalized = normalizeWhatsappE164(parsed.e164);
      if (!normalized) {
        setFieldError("Enter a valid 10-digit Indian mobile number.");
        setSaving(false);
        return;
      }
      whatsappE164 = `+${normalized}`;
    }

    try {
      await stage1Api.updateTrainerProfile({
        displayName: displayName.trim(),
        whatsappE164,
        timezone,
      });
      await refreshMe();
      setToast("Profile saved.");
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!online) {
      setError("You're offline. Reconnect to update your password.");
      return;
    }
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      await stage1Api.setPassword({
        currentPassword: currentPassword.trim() || undefined,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setToast("Password updated.");
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not update password.",
      );
    } finally {
      setSaving(false);
    }
  }

  function onPhotoPicked(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoNote("Choose an image file.");
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
    // No trainer photo upload API yet (D-W12b-1) — preview only.
    setPhotoNote("Photo preview only. Upload isn't available yet.");
  }

  if (authLoading && !me) {
    return <LoadingBlock label="Loading profile…" />;
  }

  if (!me) {
    return (
      <ErrorState
        kind="unauthorized"
        screenId="TW-28"
        message="Sign in to manage your profile."
      />
    );
  }

  const initials = initialsOf(displayName || me.trainerProfile?.displayName || "");

  return (
    <>
      <div className="settings-panel stack-lg" data-testid="screen-TW-28">
        {!online ? (
          <p className="form-error" role="status">
            You&apos;re offline. You can view settings but saves are disabled.
          </p>
        ) : null}

        <form className="stack-form" onSubmit={saveProfile}>
          <h2>Profile</h2>

          <div className="settings-profile-avatar-row">
            <span className="settings-profile-avatar" aria-hidden="true">
              {photoPreview ? (
                <img src={photoPreview} alt="" />
              ) : (
                initials
              )}
            </span>
            <div>
              <input
                ref={photoInputRef}
                id={photoInputId}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  onPhotoPicked(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="settings-change-photo"
                disabled={!online}
                onClick={() => photoInputRef.current?.click()}
              >
                Change photo
              </button>
              {photoNote ? (
                <p className="muted" role="status">
                  {photoNote}
                </p>
              ) : null}
            </div>
          </div>

          <label className="field">
            <span>Display name</span>
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
            <span className="muted">
              Clients see this in the app and in reminders.
            </span>
          </label>

          <label className="field">
            <span>Email</span>
            <input
              value={me.email ?? ""}
              readOnly
              aria-readonly="true"
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span>WhatsApp number</span>
            <span className="input-shell">
              <span className="phone-prefix" aria-hidden="true">
                +91
              </span>
              <input
                value={whatsappLocal}
                onChange={(e) => setWhatsappLocal(e.target.value)}
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98200 41736"
              />
            </span>
          </label>

          <label className="field">
            <span>Timezone</span>
            <select
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {timezoneChoices.map((z) => (
                <option key={z} value={z}>
                  {timezoneOptionLabel(z)}
                </option>
              ))}
            </select>
          </label>

          {fieldError ? (
            <p className="form-error" role="alert">
              {fieldError}
            </p>
          ) : null}

          <div className="settings-profile-actions">
            <button
              type="submit"
              className="button-primary"
              disabled={saving || !online}
            >
              Save changes
            </button>
          </div>
        </form>

        {toast ? (
          <p className="form-success" role="status">
            {toast}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="settings-panel stack-lg settings-password-panel">
        <form className="stack-form" onSubmit={changePassword}>
          <h2>Change password</h2>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <p className="muted">
            <Link className="profile-forgot-link" to="/forgot-password">
              Forgot it?
            </Link>{" "}
            Use the email code flow to set a new password.
          </p>
          <button
            type="submit"
            className="button-secondary"
            disabled={saving || !online}
          >
            Update password
          </button>
        </form>
      </div>
    </>
  );
}
