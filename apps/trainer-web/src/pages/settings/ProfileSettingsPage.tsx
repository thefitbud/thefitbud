import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Upload } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import { formatCivilDate, normalizeWhatsappE164 } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { stage1Api } from "../../lib/stage1-api";
import { Button } from "../../components/ui/Button";
import { ErrorState, LoadingBlock } from "../../components/StatePanels";
import { useOnlineStatus } from "../../components/OfflineBanner";
import {
  parsePhoneInput,
  phoneInputValue,
} from "../client-settings/clientSettingsFormat";
import { SettingsCard, SettingsRow } from "./SettingsLayout";
import "./settings.css";

/** Frame W-176: "India Standard Time (IST)" — never raw IANA in the control. */
function timezoneOptionLabel(iana: string): string {
  if (iana === "Asia/Kolkata" || iana === "Asia/Calcutta") {
    return "India Standard Time (IST)";
  }
  return iana;
}

function todayCivil(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
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
  const [savedOn, setSavedOn] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
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
      setSavedOn(todayCivil());
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

  function resetProfile() {
    if (!me) return;
    setDisplayName(me.trainerProfile?.displayName ?? "");
    setWhatsappLocal(phoneInputValue(me.trainerProfile?.whatsappE164 ?? null));
    setTimezone(me.timezone ?? "Asia/Kolkata");
    setFieldError(null);
    setError(null);
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPhotoNote(null);
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
  const reminderName = displayName.trim().split(/\s+/)[0] || "Your name";

  return (
    <div className="settings-stack" data-testid="screen-TW-28">
      {!online ? (
        <p className="form-error settings-banner" role="status">
          You&apos;re offline. You can view settings but saves are disabled.
        </p>
      ) : null}

      <SettingsCard
        title="Profile"
        aside="Clients see your name and photo in the FitBud app"
        footer={
          <>
            <span className="settings-saved">
              {savedOn ? `Last saved ${formatCivilDate(savedOn)}` : ""}
            </span>
            <span className="sp" />
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={resetProfile}
            >
              Cancel
            </Button>
            <Button type="submit" form="profile-settings-form" disabled={saving || !online}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="profile-settings-form" onSubmit={saveProfile}>
          <SettingsRow label="Photo" help="Square, at least 400 px" inline>
            <div className="settings-photo">
              <span className="settings-avatar" aria-hidden="true">
                {photoPreview ? <img src={photoPreview} alt="" /> : initials}
              </span>
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!online}
                onClick={() => photoInputRef.current?.click()}
              >
                <Upload className="ui-i" aria-hidden />
                Change photo
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={removePhoto}>
                Remove
              </Button>
            </div>
          </SettingsRow>
          {photoNote ? (
            <p className="settings-note" role="status" style={{ padding: "0 20px 8px" }}>
              {photoNote}
            </p>
          ) : null}

          <SettingsRow
            label="Display name"
            help={`Used in reminders: “${reminderName} nudged you”`}
          >
            <label className="ui-input">
              <input
                required
                aria-label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </label>
          </SettingsRow>

          <SettingsRow label="Email" help="For sign-in and receipts">
            <label className="ui-input">
              <input
                aria-label="Email"
                value={me.email ?? ""}
                readOnly
                aria-readonly="true"
                autoComplete="email"
              />
            </label>
          </SettingsRow>

          <SettingsRow
            label="WhatsApp number"
            help="Clients tap WhatsApp to reach you here"
          >
            <div className="settings-phone">
              <div className="ui-select settings-phone-code">
                <span>+91</span>
              </div>
              <label className="ui-input">
                <input
                  aria-label="WhatsApp number"
                  value={whatsappLocal}
                  onChange={(e) => setWhatsappLocal(e.target.value)}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98200 41736"
                />
              </label>
            </div>
          </SettingsRow>

          <SettingsRow label="Time zone" help="Your day and quiet hours follow this">
            <div className="ui-select settings-select">
              <select
                className="settings-native-select"
                required
                aria-label="Time zone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {timezoneChoices.map((z) => (
                  <option key={z} value={z}>
                    {timezoneOptionLabel(z)}
                  </option>
                ))}
              </select>
              <ChevronDown className="ui-i" strokeWidth={1.75} aria-hidden />
            </div>
          </SettingsRow>

          {fieldError ? (
            <p className="form-error settings-banner" role="alert">
              {fieldError}
            </p>
          ) : null}
          {toast ? (
            <p className="form-success settings-banner" role="status">
              {toast}
            </p>
          ) : null}
          {error ? (
            <p className="form-error settings-banner" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </SettingsCard>

      <SettingsCard>
        <form onSubmit={changePassword}>
          <SettingsRow
            label="Password"
            help="At least 8 characters. Use the email code if you forgot it."
            inline={!passwordOpen}
          >
            {passwordOpen ? (
              <>
                <label className="ui-input">
                  <input
                    type="password"
                    aria-label="Current password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
                <label className="ui-input">
                  <input
                    type="password"
                    aria-label="New password"
                    minLength={8}
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <p className="settings-note">
                  <Link className="profile-forgot-link" to="/forgot-password">
                    Forgot it?
                  </Link>{" "}
                  Use the email code
                  flow to set a new password.
                </p>
                <Button type="submit" variant="secondary" disabled={saving || !online}>
                  Update password
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPasswordOpen(true)}
              >
                Change password…
              </Button>
            )}
          </SettingsRow>
        </form>
      </SettingsCard>
    </div>
  );
}
