import { useState, type FormEvent } from "react";
import { ApiClientError } from "@fitbud/api-client";
import { useAuth } from "../../auth/AuthProvider";
import { stage1Api } from "../../lib/stage1-api";

export function ProfileSettingsPage() {
  const { me, refreshMe, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(
    me?.trainerProfile?.displayName ?? "",
  );
  const [whatsapp, setWhatsapp] = useState(
    me?.trainerProfile?.whatsappE164 ?? "",
  );
  const [timezone, setTimezone] = useState(me?.timezone ?? "UTC");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await stage1Api.updateTrainerProfile({
        displayName: displayName.trim(),
        whatsappE164: whatsapp.trim() || null,
        timezone,
      });
      await refreshMe();
      setMessage("Profile saved.");
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
    setSaving(true);
    setError(null);
    try {
      await stage1Api.setPassword({ newPassword: password });
      setPassword("");
      setMessage("Password updated.");
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not update password.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-panel stack-lg">
      <form className="stack-form" onSubmit={saveProfile}>
        <h2>Coaching profile</h2>
        <label className="field">
          <span>Display name</span>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>WhatsApp number</span>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
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
        <button type="submit" className="button-primary" disabled={saving}>
          Save profile
        </button>
      </form>

      <form className="stack-form" onSubmit={changePassword}>
        <h2>Password</h2>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="button-secondary" disabled={saving}>
          Update password
        </button>
      </form>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <button type="button" className="button-secondary" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}
