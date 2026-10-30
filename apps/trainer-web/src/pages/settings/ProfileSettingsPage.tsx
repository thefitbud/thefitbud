import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import { useAuth } from "../../auth/AuthProvider";
import { stage1Api } from "../../lib/stage1-api";
import { ErrorState, LoadingBlock } from "../../components/StatePanels";
import { useOnlineStatus } from "../../components/OfflineBanner";

export function ProfileSettingsPage() {
  const { me, refreshMe, loading: authLoading } = useAuth();
  const online = useOnlineStatus();
  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    setDisplayName(me.trainerProfile?.displayName ?? "");
    setWhatsapp(me.trainerProfile?.whatsappE164 ?? "");
    setTimezone(me.timezone ?? "UTC");
  }, [me]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!online) {
      setError("You're offline. Reconnect to save your profile.");
      return;
    }
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      await stage1Api.updateTrainerProfile({
        displayName: displayName.trim(),
        whatsappE164: whatsapp.trim() || null,
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

  return (
    <div className="settings-panel stack-lg" data-testid="screen-TW-28">
      {!online ? (
        <p className="form-error" role="status">
          You&apos;re offline. You can view settings but saves are disabled.
        </p>
      ) : null}

      <form className="stack-form" onSubmit={saveProfile}>
        <h2>Profile</h2>
        <label className="field">
          <span>Display name</span>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Mobile / WhatsApp</span>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91…"
          />
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
          <span>Timezone</span>
          <input
            required
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </label>
        <p className="muted">
          Renewal dates are calculated in your timezone.
        </p>
        <button
          type="submit"
          className="button-primary"
          disabled={saving || !online}
        >
          Save profile
        </button>
      </form>

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
          Use the email code flow
          to set a new password.
        </p>
        <button
          type="submit"
          className="button-secondary"
          disabled={saving || !online}
        >
          Update password
        </button>
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
  );
}
